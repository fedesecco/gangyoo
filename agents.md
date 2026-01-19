# Skibidi Bot architecture (agent notes)

This file is for fast onboarding and low-token edits. It describes where the bot
decides responses (tag-based AI, regular commands, and cron jobs), how i18n and
Supabase are wired, and where to extend behavior.

## Runtime entry points

- `src/index.ts` is the main entry. It boots the bot, i18n, conversations, and
  the webhook server (or long-polling in dev).
- Webhook mode is enabled when `WEBHOOK_URL` is set. The HTTP server handles:
  - Telegram webhook requests on the webhook path.
  - Cron triggers on `/cron/<jobId>` (see "Cron jobs").
- Dev mode starts long-polling with `bot.start()`.

## Message handling (tag-based AI flow)

Tag-based responses only run when the bot is mentioned in a message.

Flow in `src/index.ts`:
1. Ignore bots, missing chat IDs, and non-whitelisted chats
   (hardcoded `allowedChatIds`).
2. Ignore messages without `@botname` mention.
3. Strip the mention, normalize the text, and call `generateChatReply()`.
4. Parse the JSON-ish AI reply into `AiReply`.
5. Route to `executeAiCommand()` in `src/commands/index.ts`.
6. Reply with the returned text (or fallback error string).

Key files:
- `src/ai/commands.ts`: list of AI command ids and intent hints.
- `src/ai/prompt.ts`: system prompt that forces a JSON object output.
- `src/ai/index.ts`: parsing logic and AI reply normalization.
- `src/commands/*.ts`: business logic for inferred commands.

Notes:
- The model is asked to "match the user's language" in the system prompt, but
  the AI flow does not read chat language from Supabase.
- If the model returns JSON in `responseText`, `parseAiReply()` strips it to
  avoid echoing JSON back to users.
- The `nominate` command supports `[random_user]` placeholder replacement.

## Regular commands (non-AI)

These are direct `bot.command(...)` handlers and are localized via i18n.

- `/event` in `src/index.ts` uses a conversation in `src/event.ts`.
- The conversation uses `ctx.t(...)` to pick translations.
- The locale is resolved via Supabase chat language (see "Localization").

There are localization strings for `/language` and `/birthday` in
`locales/*.ftl`, and a stub `src/commands/language.ts`, but `/language` is not
registered in `src/index.ts` yet.

## Cron jobs

Cron jobs are HTTP-triggered and do not use the AI flow.

- Entry: `/cron/<jobId>` handled in `src/index.ts`.
- Security: optional `CRON_SECRET` verified against `x-cron-secret` header.
- Job registry: `src/jobs/index.ts`.
- Current job:
  - `loser-of-day` in `src/jobs/loserOfDay.ts` (10% chance per chat per run).
  - Uses `i18n` and chat language stored in Supabase.

## Localization

- i18n setup is in `src/i18n.ts` using Fluent bundles from `locales/*.ftl`.
- Locale negotiator in `src/index.ts` loads chat language via Supabase.
- Default language is `en` (`DEFAULT_LANG`).
- AI replies are not localized via i18n; only manual commands and cron jobs are.

## Database (Supabase)

The DB is optional. If `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are missing,
DB features degrade gracefully.

Schema: `supabase/schema.sql`
- `chats(chat_id, language, created_at)`
- `chat_members(chat_id, user_id, first_name, last_name, username, birthday)`

Data access: `src/db.ts`
- `ensureChat(chatId, language)`
- `getChatLanguage(chatId)`
- `setChatLanguage(chatId, language)`
- `upsertMember(chatId, user)`
- `setBirthday(chatId, userId, birthday)`
- `listMembers(chatId)`
- `listChats()`

DB usage points:
- AI commands `register`, `birthday`, `nominate` in `src/commands/*.ts`.
- i18n locale negotiation for manual commands and cron jobs.

## Environment variables

Required:
- `TELEGRAM_BOT_TOKEN`
- `GEMINI_API_KEY`

Optional:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `WEBHOOK_URL` (enables webhook server)
- `WEBHOOK_SECRET` (Telegram webhook secret token)
- `CRON_SECRET` (protects `/cron/<jobId>`)
- `PORT` (HTTP server port, default 3000)

## Adding a new AI command (fast path)

1. Add a new enum value in `src/ai/commands.ts` (`InferredCommand`).
2. Add a new `Command` entry in `src/ai/commands.ts`:
   - Minimal keywords, short examples, and include any extra fields.
3. Implement a handler in `src/commands/<name>.ts`.
4. Wire it in `src/commands/index.ts`.
5. If you need DB/i18n, use `ensureChatAndMember` or read chat language via DB.

Token-saving tips for AI commands:
- Keep `exampleResponses` short and consistent with the required JSON format.
- Prefer backend logic for heavy lifting (e.g., placeholders, DB lookups).
- Add only the extra fields that the handler truly needs.

## Adding a new manual command (localized)

1. Add `bot.command("yourcmd", ...)` in `src/index.ts`.
2. Use `ctx.t(...)` with keys from `locales/*.ftl`.
3. If it needs DB data, rely on `createDbIfConfigured` and guard for `null`.

