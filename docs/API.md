# FUNBOX API

Базовый URL: `http://localhost:4000/api`.

Все защищённые запросы передают `Authorization: Bearer <JWT>`. Ошибки имеют формат:

```json
{ "error": { "code": "BAD_REQUEST", "message": "Понятное сообщение", "details": {} } }
```

## Auth

| Метод | Путь | Описание |
|---|---|---|
| POST | `/auth/telegram` | Вход по Telegram `initData`; проверка HMAC на сервере |
| POST | `/auth/dev` | Demo-вход (выключен в production) |
| GET | `/auth/me` | Текущий пользователь, профиль, настройки, счётчики |

## Профиль, поиск, уведомления

| Метод | Путь | Описание |
|---|---|---|
| GET | `/dashboard` | Агрегированный dashboard |
| PATCH | `/me` | Профиль и приватность |
| PATCH | `/me/settings` | Тема, язык, уведомления |
| GET | `/me/activity` | История действий |
| GET | `/me/friends` | Друзья |
| GET | `/me/:id` | Публичный профиль, достижения, посты |
| GET | `/search?q=` | Поиск по пользователям, играм, постам, темам |
| GET | `/notifications` | Уведомления |
| POST | `/notifications/:id/read` | Отметить прочитанным |
| POST | `/notifications/read-all` | Прочитать все |
| POST | `/upload` | Загрузка изображения (`multipart/form-data`, поле `file`) |

## Игры

| Метод | Путь | Описание |
|---|---|---|
| GET | `/games` | Каталог, активные комнаты, статистика |
| GET | `/games/categories?game=` | Категории и количество вопросов |
| GET | `/games/history` | История результатов |
| GET | `/games/quiz/rooms` | Публичные лобби |
| GET | `/games/room/:code` | Комната по коду |
| POST | `/games/room/:code/invite` | Приглашения друзьям |
| GET | `/games/wyr/questions` | Дилеммы + статистика голосов |
| POST | `/games/wyr/:id/vote` | Голос (один раз) |
| POST | `/games/wyr/questions` | Пользовательский вопрос на модерацию |
| GET | `/games/wyr/mine` | Свои вопросы и статус |
| GET | `/games/image/round` | Случайное изображение, подсказка, попытки |
| POST | `/games/image/:id/guess` | Проверка ответа (до 3 попыток) |

### Socket.IO

Подключение: `io(API_ORIGIN, { auth: { token } })`, path `/socket.io`.

| Событие | Направление | Payload |
|---|---|---|
| `quiz:create` | client → server | `{ categoryId?, isPrivate, botCount, questionCount }` |
| `quiz:join` | client → server | `{ code }` |
| `quiz:start` | client → server | `{ code }` |
| `quiz:answer` | client → server | `{ code, questionIndex, choice }` |
| `quiz:question` | server → client | Вопрос без правильного ответа + `endsAt` |
| `quiz:reveal` | server → client | Правильный вариант, распределение, табло |
| `quiz:finished` | server → client | Leaderboard и награды |
| `duel:create` | client → server | `{ withBot, isPrivate }` |
| `duel:join` / `duel:start` | client → server | `{ code }` |
| `duel:submit` | client → server | `{ code, word }` |
| `duel:word` | server → client | Принятое слово, очки, счёт |
| `duel:finished` | server → client | Итоги |
| `chat:send` | client → server | `{ conversationId, content, type, imageUrl }` |
| `chat:new` | server → client | Сообщение (доставка в real-time) |
| `chat:read` | server → client | Прочтение |
| `chat:typing` | both | Индикатор набора |

## Social / friends / chat

| Метод | Путь | Описание |
|---|---|---|
| GET | `/social/feed?tab=&topic=&page=` | Лента (`latest`, `popular`, `friends`, `following`, `mine`) |
| POST | `/social/posts` | Создать пост |
| DELETE | `/social/posts/:id` | Удалить свой / модерация |
| POST | `/social/posts/:id/like` | Лайк / снять |
| GET | `/social/posts/:id/comments` | Комментарии |
| POST | `/social/posts/:id/comments` | Комментарий |
| DELETE | `/social/comments/:id` | Удалить комментарий |
| POST | `/social/posts/:id/repost` | Репост |
| POST | `/social/users/:id/follow` / DELETE | Подписка / отписка |
| POST | `/social/users/:id/block` / DELETE | Блокировка |
| POST | `/social/reports` | Жалоба |
| GET | `/friends` | Друзья |
| GET | `/friends/requests` | Входящие/исходящие |
| GET | `/friends/suggestions` | Рекомендации |
| GET | `/friends/invite` | Реферальная ссылка |
| GET | `/friends/search?q=` | Поиск игроков |
| POST | `/friends/request` | Заявка |
| POST | `/friends/requests/:id/accept` | Принять |
| POST | `/friends/requests/:id/decline` | Отклонить |
| DELETE | `/friends/requests/:id` | Отменить |
| DELETE | `/friends/:id` | Удалить из друзей |
| GET | `/chat/conversations` | Диалоги |
| POST | `/chat/conversations` | Создать/открыть direct-диалог |
| GET | `/chat/conversations/:id/messages` | Сообщения (cursor `before`) |
| POST | `/chat/conversations/:id/messages` | Отправить сообщение |
| POST | `/chat/conversations/:id/read` | Отметить прочитанным |
| GET | `/chat/unread` | Общее число непрочитанных |

## Прогресс и экономика

| Метод | Путь | Описание |
|---|---|---|
| GET | `/quests` | Задания по периодам |
| POST | `/quests/:id/claim` | Забрать награду (идемпотентно) |
| GET | `/achievements` | Все достижения со статусом |
| GET | `/leaderboard?type=&period=` | Рейтинг (`players`, `wins`, `xp`, `active`, `popular`) |
| GET | `/wallet` | Баланс, история, коллекция, daily |
| POST | `/wallet/daily` | Ежедневная награда |
| GET | `/wallet/shop` | Магазин |
| POST | `/wallet/shop/:id/buy` | Покупка |

## Admin

Требуют роль `MODERATOR` или `ADMIN` (проверка на backend).

| Метод | Путь | Описание |
|---|---|---|
| GET | `/admin/stats` | Метрики и график |
| GET | `/admin/users` | Пользователи |
| POST | `/admin/users/:id/ban` | Блокировка/разблокировка |
| PATCH | `/admin/users/:id/role` | Роль (только ADMIN) |
| POST | `/admin/users/:id/balance` | Ручная корректировка (только ADMIN) |
| GET | `/admin/posts` | Публикации |
| DELETE | `/admin/posts/:id` | Модерация |
| GET | `/admin/reports` | Жалобы |
| POST | `/admin/reports/:id/resolve` | Решение |
| GET/POST/PATCH/DELETE | `/admin/questions` | Управление вопросами |
| GET/POST/PATCH/DELETE | `/admin/categories` | Категории |
| GET/POST/PATCH/DELETE | `/admin/quests` | Задания |
| GET/POST/PATCH/DELETE | `/admin/achievements` | Достижения |
| GET/POST/DELETE | `/admin/events` | События |
| GET | `/admin/transactions` | Транзакции |
| GET | `/admin/activity` | Аудит-лог |
| GET/POST | `/admin/shop` | Магазин |

## Bot (internal)

Требуют заголовок `x-bot-secret`, не доступны клиенту.

`GET /bot/user/:telegramId`, `POST /bot/daily`, `GET /bot/leaderboard`, `GET /bot/games`, `GET /bot/invite/:telegramId`, `GET/POST /bot/settings/:telegramId`, `GET /bot/daily-reminders`, `GET /bot/stats`.
