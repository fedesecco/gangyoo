# Gangyoo Telegram Bot

Telegram bot built with grammy and Supabase.

## Setup

1. Create the Supabase tables using `supabase/schema.sql`.
2. Copy `.env.example` to `.env` and set values.
3. Install deps: `npm install`
4. Run locally: `npm run dev`

## Commands

- `/register` register the bot and store your profile
- `/language <en|it|eng|ita>` set chat language
- `/birthday <DD/MM/YYYY or YYYY-MM-DD>` store your birthday
- `/nominate` pick a random member

## Cloud Run (webhook)

1. Deploy the container and set env vars:
   - `TELEGRAM_BOT_TOKEN`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `WEBHOOK_URL` (your Cloud Run URL + a path, e.g. `https://.../webhook`)
   - `WEBHOOK_SECRET` (optional, must match the webhook secret token)
2. Cloud Run provides `PORT` automatically.
3. The bot uses webhooks whenever `WEBHOOK_URL` is set; otherwise it uses long polling.
