# Changelog

Все заметные изменения проекта FUNBOX. Формат — по датам, с указанием проверок.

## 2026-11-13

### Added

- Telegram Mini App: Home, Games, Social, Friends, Chat, Profile, Leaderboard, Quests, Wallet, Achievements, Settings, Notifications, Search и отдельная Admin-панель.
- 4 игровых режима: Quiz Battle, Word Duel, Would You Rather, Guess the Image.
- Socket.IO real-time: игровые комнаты, ответы, таймеры, чат, typing и read receipts.
- Express API + Prisma + PostgreSQL: 39 таблиц, миграции, seed, RBAC, rate limiting, Zod-валидация и загрузка изображений.
- Telegraf-бот: команды `/start`, `/profile`, `/games`, `/rating`, `/daily`, `/help`, `/settings`, уведомления и daily-напоминания.
- Админ-панель: пользователи, роли, блокировки, балансы, публикации, жалобы, вопросы, категории, задания, достижения, события, экономика и аудит.
- Docker Compose и multi-stage Dockerfile для API, бота и PostgreSQL.
- Локальный PostgreSQL через PGlite (`pnpm db:start`) для запуска без Docker.
- 24 фотографии для Guess the Image с атрибуцией Wikimedia Commons (`CREDITS.md`).
- Локальные SVG-аватары вместо внешнего CDN.
- `docs/ARCHITECTURE.md`, `docs/API.md`, smoke-тесты и UI-тесты Puppeteer.
- `scripts/doctor.mjs` и команда `pnpm doctor`: preflight-проверка `.env`, секретов, миграций, изображений и зависимостей.
- Экран «Как играть» (`/about`): гид по 4 режимам, XP/Coins, безопасности, FAQ и приглашению друзей.
- Скрипт `scripts/prepare-github.ps1` для безопасной очистки регенерируемых файлов перед загрузкой на GitHub.

### Changed

- UI переведён на CSS-токены: исправлены светлая/тёмная темы, glassmorphism и контраст бейджей.
- Telegram SDK загружается только внутри Telegram, браузерный demo-режим работает без внешнего скрипта.
- Улучшены экраны Quiz, Word Duel, WYR и Guess the Image: safe-area, таймеры, аватары ботов, обработка состояний.
- Реферальный `startParam` передаётся и в Telegram-auth, и в demo-auth.
- Сообщения о новых сообщениях отправляются в Telegram, только если получатель неактивен.
- Репозиторий очищен от `node_modules`, `.data`, `dist` и тестовых скриншотов: 2,6 ГБ → 18,7 МБ.

### Fixed

- Падение API при завершении игровой комнаты после очистки/рестарта БД: добавлены проверки существования комнаты, `updateMany` и обработка ошибок таймеров.
- Ошибка `startParam: null` при demo-авторизации.
- Дублирование аватаров в чате и наложение заголовков на игровых экранах.
- Некорректная подпись репоста и дублирование изображения в ленте.
- Отображение чужих категорий в настройках Quiz Battle.

### Verified

- TypeScript: `api`, `web`, `bot` — без ошибок.
- Unit-тесты: 8/8.
- Интеграционные smoke-тесты: 92/92.
- Browser UI-сценарии: без `pageerror` и console errors.
- Миграции на чистой PostgreSQL: 2 миграции, 39 таблиц.
- Production-сборка Mini App раздаётся API и проверена в браузере.
- Web typecheck и production build с новым экраном `/about` — успешно.
- `pnpm doctor`: 24 OK, 0 ошибок; предупреждения только про demo-режим и отсутствие `node_modules` после очистки.

### Repository

Перед отправкой на GitHub удалены только восстанавливаемые артефакты:

```text
node_modules/
apps/*/node_modules/
apps/*/dist/
.data/
screens/
```

Исходники, `.env`, миграции, документация и изображения сохранены.
Восстановление: `pnpm install && pnpm db:start && pnpm db:push && pnpm db:seed && pnpm dev`.
