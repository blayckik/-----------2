# Amvera Cloud deployment

Ниже — production-схема FUNBOX: **одно приложение** (API + Mini App + бот в одном контейнере) и **managed PostgreSQL** в Amvera. Демо-пользователи не создаются.

## 1. Выбор тарифа

По [актуальным тарифам Amvera](https://docs.amvera.ru/general/price.html):

| Сервис | Тариф | Ресурсы | Цена/30 дней |
|---|---|---|---|
| FUNBOX app | Стандартный | 1 CPU, 2.5 ГБ RAM, 15 ГБ SSD | 1 450 ₽ |
| PostgreSQL | Начальный | 0.25 CPU, 500 МБ RAM, 5 ГБ SSD | 290 ₽ |

Итого около **1 740 ₽/мес**. «Стандартный» для app нужен, чтобы Docker-сборка Vite + Prisma не упиралась в память. БД можно начать с «Начального»; при росте данных — «Начальный Плюс».

Оба проекта создавайте **в одном регионе**, иначе внутренний домен PostgreSQL не будет доступен приложению.

## 2. PostgreSQL

В [cloud.amvera.ru/projects](https://cloud.amvera.ru/projects):

1. Создать **PostgreSQL**.
2. Имя проекта — `funbox-db`.
3. База — `funbox`, пользователь — `funbox`, пароль — сгенерировать ≥ 24 символов.
4. Дождаться статуса «PostgreSQL запущен».
5. Открыть «Инфо» → скопировать внутренний домен вида `cnpg-funbox-db-rw`.

`DATABASE_URL` для приложения:

```text
postgresql://funbox:<PASSWORD>@cnpg-funbox-db-rw:5432/funbox?schema=public&sslmode=disable
```

Внутренняя сеть Amvera не использует TLS, поэтому `sslmode=disable`. Пароль с `@`, `:`, `/` нужно URL-кодировать.

## 3. Приложение

1. Создать приложение → тип **Docker**.
2. Название — `funbox`.
3. Подключить GitHub-репозиторий `blayckik/-----------2`, ветка `main`.
4. Amvera найдёт [`amvera.yml`](../amvera.yml) и [`Dockerfile`](../Dockerfile):

```yaml
run:
  containerPort: 4000
  persistenceMount: /data
```

5. Контейнер слушает **4000**, постоянный диск — `/data`.

### Переменные приложения

Добавить в разделе «Переменные»:

```env
NODE_ENV=production
PORT=4000

DATABASE_URL=postgresql://funbox:PASSWORD@cnpg-funbox-db-rw:5432/funbox?schema=public&sslmode=disable

JWT_SECRET=<openssl rand -hex 32>
JWT_EXPIRES_IN=7d
TELEGRAM_INIT_TTL_SECONDS=86400

APP_URL=https://<ваш-домен>
PUBLIC_API_URL=https://<ваш-домен>
CORS_ORIGINS=https://<ваш-домен>
TELEGRAM_WEBAPP_URL=https://<ваш-домен>

DEMO_AUTH_ENABLED=false
BOT_TOKEN=<токен BotFather>
BOT_USERNAME=funboxktk_bot
BOT_SECRET=<openssl rand -hex 24>
ADMIN_TELEGRAM_IDS=<ваш Telegram ID>

UPLOAD_DIR=/data/uploads
MAX_UPLOAD_MB=8
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=180

RUN_MIGRATIONS=true
SEED_ON_START=true
RUN_BOT=true
API_URL=http://127.0.0.1:4000
WEBAPP_URL=https://<ваш-домен>
```

`PORT=4000` обязателен: Amvera по умолчанию подставляет другой `PORT`.

`RUN_BOT=true` запускает Telegraf в том же контейнере. `SEED_ON_START=true` применяет миграции и создаёт **только контент** (игры, вопросы, достижения, квесты, магазин); пользователей, постов и чатов не будет.

После первого успешного запуска `SEED_ON_START` можно поставить `false`.

### Домен

1. «Домены» → «Добавить доменное имя».
2. Бесплатный `*.amvera.tech` или свой домен.
3. Дождаться HTTPS-сертификата.
4. Скопировать URL в `APP_URL`, `PUBLIC_API_URL`, `CORS_ORIGINS`, `TELEGRAM_WEBAPP_URL`, `WEBAPP_URL`.
5. Перезапустить контейнер.

Frontend получает `BOT_USERNAME` и `DEMO_AUTH_ENABLED` из runtime `/config.js`, поэтому пересборка при смене домена не нужна.

## 4. Первый администратор

1. Открыть бота и отправить `/id`.
2. Скопировать Telegram ID.
3. Вписать в `ADMIN_TELEGRAM_IDS`.
4. Перезапустить приложение.
5. Открыть Mini App — при первом входе аккаунт создастся с ролью `ADMIN`.

Если пользователь уже был создан до добавления ID, роль нужно назначить через админку другого администратора или SQL; в production seed пользователей нет, поэтому достаточно сделать это до первого входа.

## 5. BotFather

- `/setmenubutton` → `https://<домен>`
- `/setdomain` → `<домен>`
- Проверить username: `funboxktk_bot`

## 6. Проверка после деплоя

```bash
curl https://<домен>/api/health
# {"data":{"status":"ok","database":true,...}}

curl https://<домен>/config.js
# window.__FUNBOX_CONFIG__ = {"botUsername":"funboxktk_bot","demoAuthEnabled":false,...}
```

Проверить:

- [ ] `/api/health` → `ok`
- [ ] на главной нет демо-игроков;
- [ ] рейтинг пуст до регистрации реальных людей;
- [ ] `/start` бота открывает Mini App;
- [ ] первый пользователь из `ADMIN_TELEGRAM_IDS` видит `/admin`;
- [ ] Quiz Battle требует второго реального игрока;
- [ ] Word Duel требует второго реального игрока;
- [ ] загрузка аватара сохраняется в `/data/uploads`;
- [ ] после рестарта данные на месте.

## 7. Очистка от демо-данных

В production seed демо-данных нет. Если нужно очистить уже существующую БД:

```bash
pnpm --filter @funbox/api db:reset:prod
```

**Команда удаляет всех пользователей, посты, чаты, игры и транзакции.** Использовать только осознанно.

## 8. Backup

Включить ежедневные бэкапы PostgreSQL в Amvera («Бэкапы»). Перед обновлением схемы — ручной бэкап. Amvera хранит последние 5 ежедневных копий.

## 9. Ограничения

- Один контейнер запускает API и бота; при падении бота API продолжает работать. Для большого трафика разделите их и включите Redis adapter.
- Быстрый туннель `trycloudflare.com` — только для теста, не для production.
- Telegram Bot API должен быть доступен из Amvera; при блокировке используйте зарубежный хостинг/VPN.
