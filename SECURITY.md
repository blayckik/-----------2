# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| `main` | ✅ |
| older commits | ❌ |

## Reporting a vulnerability

Не создавайте публичный issue для уязвимостей. Напишите владельцу репозитория в Telegram или на e-mail, указанный в профиле GitHub. Укажите:

- затронутый endpoint / экран;
- шаги воспроизведения;
- ожидаемое и фактическое поведение;
- возможный уровень риска.

Ответ — в течение 72 часов. Публичное раскрытие — только после исправления.

## Security model

- Telegram `initData` проверяется на backend по HMAC-SHA256, TTL и constant-time сравнению.
- JWT подписывается сервером; клиент не может выдать себе роль.
- `USER` / `MODERATOR` / `ADMIN` проверяются middleware на каждом защищённом маршруте.
- Все входные данные проходят Zod-валидацию.
- Prisma исключает SQL-инъекции; raw SQL — только seed.
- Загружаются только JPEG/PNG/WebP/GIF размером до 8 МБ; SVG и исполняемые файлы запрещены.
- Внешние изображения разрешены только по HTTPS; `javascript:`, `data:` и `file:` отклоняются.
- Награды идемпотентны по уникальному `Transaction.reference`.
- Игровые ответы и слова проверяются на сервере; клиентские очки не принимаются.
- Rate limiting: общий API, auth и write-операции.
- Секреты хранятся только в ENV, `.env` исключён из git.
- Demo-auth принудительно отключён при `NODE_ENV=production`.

## Production checklist

- [ ] `JWT_SECRET` ≥ 32 случайных байт.
- [ ] `BOT_SECRET` ≥ 24 случайных байт, одинаковый в API и боте.
- [ ] `DEMO_AUTH_ENABLED=false`.
- [ ] HTTPS и корректный `APP_URL` / `CORS_ORIGINS`.
- [ ] `ADMIN_TELEGRAM_IDS` содержит только доверенные аккаунты.
- [ ] PostgreSQL доступен только внутри private network.
- [ ] Настроены backups и мониторинг.
- [ ] Проверены роли модераторов после релиза.

## Out of scope

- FUN Coins не являются финансовым инструментом.
- Социальная инженерия и компрометация Telegram-аккаунта пользователя.
- Уязвимости сторонних сервисов (Telegram, PostgreSQL, Docker).
