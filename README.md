# Wind Petition (Next.js + Vercel)

Проект переведён на Next.js и готов для деплоя в Vercel из GitHub-репозитория.

## Реализовано

- Вход и регистрация только через Discord OAuth.
- При входе создаётся профиль с ником и аватаром из Discord.
- Если ник `nertin0`, пользователь автоматически получает роль `admin`.
- Общая база данных PostgreSQL (данные видны всем, не локально в браузере).
- Публичные голосования: создаёт админ, голосуют все авторизованные.
- Голосования министров: отдельный раздел, доступ только для `minister` и `admin`.
- Варианты голоса: `За`, `Против`, `Воздержаться`.
- Для пользователей голосование анонимно; админ видит, кто как проголосовал.
- После дедлайна статус выставляется автоматически:
  - `За > 50%` от всех голосов => `Отправлено на рассмотрение`.
  - иначе => `Отклонено`.
- Реестр решений: добавлять могут админ и министры.
- Админка для назначения роли `министр`.

## Структура Next.js

- Страницы: `pages/`
- API-роуты: `pages/api/`
- Клиентский скрипт UI: `public/app.js`
- Стили: `styles/globals.css`
- HTML-шаблоны дизайна: `templates/*.html`

## Переменные окружения

Скопируйте `.env.example` и заполните значения:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`
- `POSTGRES_HOST`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`

## Discord OAuth

В Discord Developer Portal добавьте Redirect URL:

- `https://YOUR_DOMAIN.vercel.app/api/auth/callback`

## Локальный запуск

```bash
npm install
npm run dev
```

## Деплой в Vercel

1. Загрузите проект в GitHub (без `node_modules`).
2. Импортируйте репозиторий в Vercel.
3. Подключите Vercel Postgres.
4. Добавьте env-переменные.
5. Deploy.

Таблицы БД создаются автоматически при первом обращении к API.
