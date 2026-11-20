# Contributing to FUNBOX

Спасибо, что помогаете проекту. Ниже — короткий рабочий процесс.

## Локальная подготовка

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/bot/.env.example apps/bot/.env
cp apps/web/.env.example apps/web/.env
pnpm doctor
pnpm db:start     # отдельный терминал
pnpm db:push
pnpm db:seed
pnpm dev
```

Подробно: [README.md](README.md).

## Перед коммитом

```bash
pnpm typecheck
pnpm test
pnpm --filter @funbox/web build
pnpm doctor
```

Если менялись миграции:

```bash
pnpm --filter @funbox/api exec prisma migrate diff \
  --from-migrations apps/api/prisma/migrations \
  --to-schema-datamodel apps/api/prisma/schema.prisma \
  --shadow-database-url "$DATABASE_URL" \
  --script
```

## Стиль кода

- TypeScript strict, без `any` в новом коде.
- Валидация входа — Zod на backend.
- Все проверки прав — только на backend.
- Новые награды/транзакции должны иметь уникальный `reference`.
- Новые игровые действия проверяются на сервере; клиент — не источник истины.
- Секреты и токены — только в `.env`, не в коде и не в тестах.

## Ветки и коммиты

```bash
git checkout -b feat/short-description
```

Формат сообщения:

```text
type(scope): короткое описание

- что изменено
- зачем
- как проверено
```

Типы: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `ci`.

Пример:

```text
fix(api): reject unsafe image URLs

- added shared imageUrlSchema
- applied to profile, posts, chat and admin questions
- added 4 unit tests
```

## Pull request

- Один PR — одна логическая задача.
- Приложите шаги проверки и скриншот UI, если менялся интерфейс.
- Не коммитьте `node_modules`, `.data`, `dist`, `.env` и тестовые скриншоты.
- Перед загрузкой можно выполнить:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/prepare-github.ps1
```

## Миграции

Схема — `apps/api/prisma/schema.prisma`. Не редактируйте применённые миграции задним числом: создавайте новую. Production применяет `prisma migrate deploy` в Docker entrypoint.
