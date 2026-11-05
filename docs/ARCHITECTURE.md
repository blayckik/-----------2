# FUNBOX — архитектура

## 1. Общая схема

```text
Telegram
├── Bot (Telegraf) ─────────────┐
│   /start, /games, /rating …   │  REST + x-bot-secret
│   inline WebApp keyboard      │
└── Mini App (React SPA) ───────┤
    initData → JWT              │
    REST /api/*                 ├── API (Express + TypeScript)
    Socket.IO /quiz, /duel      │   ├── Auth / RBAC
                                │   ├── Game Engine (in-memory runtime + DB persist)
                                │   ├── Social / Friends / Chat
                                │   ├── Quests / Achievements / Economy
                                │   ├── Admin API
                                │   └── Telegram notifications
                                │
                                ├── Prisma ORM ── PostgreSQL
                                └── /uploads (local media; S3-ready interface)
```

Монорепозиторий pnpm:

```text
apps/
  api/        Express + Prisma + Socket.IO + REST + admin API
  bot/        Telegraf, long polling, команды и уведомления
  web/        React + TypeScript + Vite + Tailwind + Framer Motion
scripts/      локальный PostgreSQL (PGlite), smoke-тесты, загрузка медиа
docs/         архитектура, API
```

## 2. Поток авторизации

1. Mini App получает `Telegram.WebApp.initData` и отправляет `POST /api/auth/telegram`.
2. API валидирует подпись по алгоритму Telegram: `HMAC-SHA256(bot_token, "WebAppData")`, сверяет `auth_date` (TTL 24 ч) и constant-time подпись.
3. Пользователь upsert-ится по `telegramId`; выдаётся короткоживущий JWT (7 дней) с `sub`, `role`.
4. Socket.IO использует тот же JWT в `auth.token`.
5. В dev/demo режиме без Telegram доступен `POST /api/auth/dev`; в production он выключен.
6. Бот обращается к `/api/bot/*` только с `x-bot-secret`; этот секрет не попадает в клиент.

## 3. Уровни доступа

| Роль | Доступ |
|---|---|
| USER | профиль, игры, соцсеть, чат, задания |
| MODERATOR | + жалобы, удаление постов, блокировка |
| ADMIN | + пользователи/роли, вопросы, квесты, достижения, экономика, статистика |

Проверка роли выполняется только на backend middleware. UI скрывает разделы, но не является защитой.

## 4. Игровой движок

REST создаёт комнату и сохраняет её в PostgreSQL. Socket.IO ведёт live-состояние:

- Quiz: лобби → вопрос (15 с) → reveal → следующий → финиш. Ответы принимаются один раз, проверяются на сервере, очки зависят от правильности и скорости.
- Word Duel: 16 букв, 90 секунд, слова проверяются серверным словарём (97k слов), буквы расходуются по частоте.
- Would You Rather: голосование и агрегированная статистика, пользовательские вопросы проходят модерацию.
- Guess the Image: серверные подсказки, ограниченные попытки, XP только за серверно проверенный результат.

Результаты (очки, победа, XP, монеты) рассчитываются на сервере. Начисления идемпотентны по `reference` транзакции. Runtime-состояние комнат не доверяет клиенту; клиент получает вопросы без правильных ответов.

## 5. Экономика и прогресс

- FUN Coins — только виртуальная валюта, без вывода и денежной стоимости.
- Каждая операция — строка `Transaction` с уникальным `reference`.
- XP повышает уровень (`level = floor(sqrt(xp / 50)) + 1`, максимум 100).
- Квесты имеют periodKey (`daily:2026-05-11`, `weekly:2026-W20`), прогресс обновляется через единый `progressService`.
- Достижения проверяются после значимых действий, выдача уникальна (`userId + achievementId`).
- Ежедневная награда — уникальная запись `DailyClaim(userId, dateKey)`.

## 6. Реальное время и уведомления

- Socket.IO: `/quiz`, `/duel`, `/chat`; JWT в handshake.
- Чат: сообщения сохраняются, затем broadcast; receipts обновляют статус прочтения.
- Telegram-уведомления отправляются API через Bot API (если задан `BOT_TOKEN`); бот отвечает на команды и открывает Mini App.
- Redis не обязателен: runtime комнат в памяти, БД — источник результатов. При горизонтальном масштабировании подключается Redis adapter и sticky sessions (точка расширения описана в README).

## 7. Безопасность

- Helmet, CORS allowlist, rate limit на API и auth.
- Zod-валидация body/query/params.
- Prisma — параметризованные запросы (защита от SQL injection).
- Upload: MIME/размер, случайное имя, запрет исполняемых файлов.
- Идемпотентность наград, проверка владельца ресурсов, серверная валидация результатов.
- Секреты только в ENV, `.env` в `.gitignore`.
- Ограничение частоты сообщений и публикаций.

## 8. Схема БД

Основные связи (полная схема — `apps/api/prisma/schema.prisma`):

```text
User 1─1 UserProfile / UserStat / Wallet
User 1─N Post, Comment, Like, Transaction, Notification, ActivityLog
User N─N User (Friendship, FriendRequest, Block)
User N─N Conversation N─N Message
Game 1─N GameRoom 1─N GameParticipant 1─N GameAnswer
GameRoom 1─N GameResult
Category 1─N GameQuestion / Post / GameRoom
Quest 1─N UserQuest
Achievement 1─N UserAchievement
ShopItem 1─N Purchase
Report N─1 User (reporter), N─1 Post/User (target)
```

Ключевые индексы: `telegramId`, `username`, `referralCode`, `Post(createdAt)`, `Message(conversationId, createdAt)`, `GameRoom(status, createdAt)`, `Transaction(userId, createdAt)`, `UserQuest(periodKey)`, уникальные пары друзей/лайков/участников.

## 9. Этапы

1. Архитектура и схема — этот документ + Prisma schema.
2. API/auth/бот — рабочий Telegram initData + dev fallback.
3. Mini App — все разделы, dark premium UI, адаптив.
4. PostgreSQL — миграции, seed, реальные запросы.
5. Соцсеть/друзья/чат — REST + Socket.IO.
6. Игры — 4 режима, серверная логика и сохранение.
7. Квесты, достижения, лидерборды, экономика.
8. Админ-панель — CRUD + роль-проверки.
9. Smoke-тесты основных сценариев.
10. Docker, production build, README.
