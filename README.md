# Gangyoo

Gangyoo is a Telegram group bot that generates replies via OpenAI when it is
mentioned. The prompt and command catalog live inside this repo so they can be
versioned and updated alongside the code.

## How it works

- The bot responds only when mentioned and only if the chat ID is whitelisted.
- The system prompt lives in `src/ai/prompt.ts`.
- Command keywords and example replies live in `src/ai/commands.ts`.
- The AI returns JSON with `inferredCommand` and `responseText`, then the
  backend can alter the message before sending it.
- Cron jobs can call `generateCronReply` from `src/ai/index.ts` to get an
  `{ inferredCommand, responseText }` object from structured payloads.

## Setup

1. Copy `.env.example` to `.env`.
2. Set these required values:
   - `TELEGRAM_BOT_TOKEN`
   - `OPENAI_API_KEY`
   - `ALLOWED_CHAT_IDS` (comma-separated chat IDs, e.g. `-100123, -100456`)
3. Optional:
   - `OPENAI_MODEL` (defaults to `gpt-4o-mini`)
   - `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (to resolve [random_user] using
     stored chat members)

## Usage

Mention the bot in a whitelisted group chat:

- `@Gangyoo can you register me?`
- `@Gangyoo nominate someone for today`

## Scripts

- `npm run dev` start the bot in watch mode
- `npm run build` compile TypeScript
- `npm run start` run the compiled bot
