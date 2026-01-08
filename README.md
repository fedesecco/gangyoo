# Gangyoo Telegram Bot

Telegram bot built with grammy and Supabase.

## Setup

1. Create the Supabase tables using `supabase/schema.sql`.
2. Copy `.env.example` to `.env` and set values.
3. Install deps: `npm install`
4. Run locally: `npm run dev`

## Commands

- `/start` start the bot and store your profile
- `/language <en|it|eng|ita>` set chat language
- `/birthday <DD/MM/YYYY or YYYY-MM-DD>` store your birthday

## Notes

Telegram does not expose birthdays, so users must send them with `/birthday`.
