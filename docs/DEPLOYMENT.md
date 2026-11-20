# Production deployment

## Требования

- Linux-сервер с Docker Compose v2;
- домен с HTTPS-сертификатом;
- Telegram-бот, созданный через @BotFather;
- исходящий доступ к `api.telegram.org`.

Telegram Mini App работает только по HTTPS. `http://localhost` подходит только для браузерной разработки.

## 1. Подготовка окружения

```bash
cp .env.docker.example .env
```

Заполните `.env`:

```dotenv
APP_URL=https://funbox.example.com
PUBLIC_API_URL=https://funbox.example.com
CORS_ORIGINS=https://funbox.example.com
POSTGRES_PASSWORD=<random>
JWT_SECRET=<openssl rand -hex 32>
BOT_TOKEN=<BotFather token>
BOT_USERNAME=your_funbox_bot
BOT_SECRET=<openssl rand -hex 24>
ADMIN_TELEGRAM_IDS=<your telegram id>
```

Проверка:

```bash
docker compose config
```

## 2. Запуск

```bash
docker compose up -d --build
docker compose ps
curl https://funbox.example.com/api/health
```

API-контейнер при старте выполняет `prisma migrate deploy`. Бот запускается с long polling и ждёт healthy API.

## 3. Telegram

В @BotFather:

1. `/setmenubutton` → `https://funbox.example.com`.
2. `/setdomain` → `funbox.example.com`.
3. Проверить, что username бота совпадает с `BOT_USERNAME`.
4. Отправить `/start` боту и открыть Mini App.

`initData` проверяется на сервере. Если API отвечает `BOT_NOT_CONFIGURED`, проверьте `BOT_TOKEN` именно в контейнере API.

## 4. Reverse proxy

Compose публикует API на `127.0.0.1:4000` (или `API_PORT`). Наружу — только TLS proxy.

Caddy:

```caddyfile
funbox.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:4000
}
```

Nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name funbox.example.com;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
```

WebSocket (`/socket.io`) должен проксироваться с Upgrade-заголовками.

## 5. Демо-данные

Только для стенда/проверки преподавателем:

```bash
docker compose exec api pnpm --filter @funbox/api db:seed
```

**Команда очищает таблицы.** На production с реальными пользователями не запускать.

## 6. Backup и обновление

```bash
docker compose exec -T postgres pg_dump -U funbox funbox > backup-$(date +%F).sql
docker compose pull
docker compose up -d --build
docker compose ps
```

Миграции применяются автоматически. Перед обновлением проверьте миграции на staging.

## 7. Мониторинг

- `/api/health` — проверка API + PostgreSQL.
- `docker compose logs -f api bot`.
- Метрики: `docker stats`.
- Ошибки: логи контейнеров / Sentry (точка расширения).

## 8. Масштабирование

Текущая конфигурация — один API-инстанс. Для нескольких:

- Socket.IO Redis adapter + sticky sessions;
- вынести runtime-состояние игр в Redis;
- заменить локальные uploads на S3;
- вынести push-уведомления в очередь;
- перейти на webhook вместо long polling бота.

## 9. Откат

Приложение: `git checkout <previous-tag> && docker compose up -d --build`.

База данных: destructive-миграции не откатываются автоматически. Восстановление — из `pg_dump`. Перед релизом всегда делайте backup.
