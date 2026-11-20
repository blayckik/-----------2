# Testing FUNBOX

## 1. Preflight

```bash
pnpm doctor
```

Проверяет `.env`, секреты, совпадение `BOT_SECRET`, миграции, 24 изображения и 12 SVG-аватаров. Без `node_modules` выдаёт предупреждение, а не падение.

## 2. Статические проверки

```bash
pnpm typecheck
```

- API: Express, Prisma, Socket.IO, Zod.
- Web: React, Vite, Telegram-типы.
- Bot: Telegraf.

## 3. Unit-тесты

```bash
pnpm test
```

| Файл | Что проверяет |
|---|---|
| `tests/progress.test.ts` | уровни, XP, периоды daily/weekly, ограничения букв Word Duel |
| `tests/telegram.test.ts` | подпись initData, подмена, TTL, отсутствие hash |
| `tests/validation.test.ts` | политика image URL, `http://`/`javascript:`/`data:`, парсинг `fresh=false` |

Ожидаемый результат: **12/12**.

## 4. Smoke-тесты API + Socket.IO

Требуют запущенных PostgreSQL, API и seed:

```bash
node scripts/smoke.mjs
```

Покрытие: **92 сценария**:

- demo-auth и отказ без токена;
- RBAC: пользователь не попадает в admin API;
- dashboard, ежедневная награда, повторная выдача;
- задания и идемпотентность claim;
- посты, лайки, комментарии, репосты, лента;
- друзья, заявки, подписки;
- чат и Socket.IO delivery;
- полный Quiz Battle на двух клиентах;
- Word Duel со словарём;
- WYR голосование и защита от повтора;
- Guess the Image: 3 попытки;
- admin: блокировки, баланс, вопросы, жалобы, транзакции;
- bot API и проверка `x-bot-secret`;
- отказ невалидному Telegram initData.

## 5. UI-тесты

Требуют Chrome и `puppeteer-core`:

```bash
node scripts/ui-test.mjs
```

Сценарии: Quiz setup → вопрос → ответ → reveal, WYR голос, Guess Image, создание поста, чат, редактирование профиля, admin users/questions. Скриншоты — в `screens/` (не коммитятся).

## 6. Миграции на чистой БД

```bash
node scripts/migrate-test.mjs
```

Поднимает свежий PGlite, применяет все миграции через `prisma migrate deploy` и проверяет 39 таблиц.

## 7. Production build

```bash
pnpm build
```

Проверяет сборку API, бота и Mini App. Vite обязан собрать `apps/web/dist`.

## 8. CI

GitHub Actions workflow `.github/workflows/ci.yml` выполняет install → prisma generate → typecheck → tests → build на каждый push и PR в `main`.

## Ручной чек-лист перед релизом

- [ ] `/api/health` возвращает `status=ok`.
- [ ] Вход через Telegram работает на HTTPS-домене.
- [ ] `/start` бота открывает Mini App.
- [ ] Quiz Battle с другом и с ботом завершается.
- [ ] Ежедневная награда начисляется один раз.
- [ ] Жалоба и блокировка работают из UI.
- [ ] `/admin` недоступен обычному пользователю.
- [ ] Миграции применены на production PostgreSQL.
