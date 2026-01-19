import { Bot, type Context, webhookCallback } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { config } from "dotenv";
import http from "node:http";
import { generateChatReply } from "./ai/index.js";
import { executeAiCommand } from "./commands/index.js";
import { createDb, type DbClient } from "./db.js";
import { createEventConversation } from "./event.js";
import { createI18n, DEFAULT_LANG } from "./i18n.js";
import type { BotContext, ConversationContext } from "./types.js";
import { getCronJob } from "./jobs/index.js";

config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const geminiKey = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!token || !geminiKey) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN or GEMINI_API_KEY in .env.");
}

const allowedChatIds = new Set<number>([
  -5052100473
]);
if (allowedChatIds.size === 0) {
  console.warn(
    "ALLOWED_CHAT_IDS is empty. The bot will ignore all incoming messages."
  );
}

const bot = new Bot<BotContext>(token);
const db = createDbIfConfigured(supabaseUrl, supabaseKey);
const localeNegotiator = async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  if (!db || !chatId) return DEFAULT_LANG;
  try {
    return await db.getChatLanguage(chatId);
  } catch (err) {
    console.error("Failed to resolve chat language", err);
    return DEFAULT_LANG;
  }
};
const i18n = createI18n<BotContext>(localeNegotiator);
const i18nConversation = createI18n<ConversationContext>(localeNegotiator);

bot.use(i18n.middleware());
bot.use(conversations());
bot.use(
  createConversation<BotContext, ConversationContext>(createEventConversation(db), {
    id: "event",
    plugins: [i18nConversation.middleware()]
  })
);

bot.command("event", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!isAllowedChat(chatId)) return;
  if (!ctx.from || ctx.from.is_bot) return;
  if (ctx.conversation.active("event") > 0) {
    await ctx.reply(ctx.t("event_setup_running"));
    return;
  }

  try {
    await ctx.conversation.enter("event");
  } catch (err) {
    console.error("Event conversation error", err);
    await ctx.reply(ctx.t("event_setup_error"));
  }
});

bot.on("message", async (ctx) => {
  console.log("onMessage");
  const chatId = ctx.chat?.id;
  const from = ctx.from;
  if (!chatId || !from || from.is_bot) return;
  if (!isAllowedChat(chatId)) return;

  const text = getMessageText(ctx);
  if (!text) return;

  const botUsername = ctx.me?.username ?? bot.botInfo?.username;
  if (!botUsername) return;
  if (!isBotMentioned(text, botUsername)) {
    console.log("Ignoring a message because it does not mention the bot");
    return
  }

  const cleaned = stripBotMention(text, botUsername);
  const normalized =
    cleaned.trim().length > 0
      ? cleaned.trim()
      : "(user mentioned the bot without extra text)";

  try {
    console.log("Sending message to LLM:", normalized);
    const reply = await generateChatReply(normalized);

    console.log("LLM output:", reply);

    const responseText = (
      await executeAiCommand(reply, { ctx, db })
    ).trim();
    if (!responseText) {
      await ctx.reply("Sorry, I couldn't generate a response for that.");
      return;
    }

    await ctx.reply(responseText, {
      reply_to_message_id: ctx.message?.message_id
    });
  } catch (err) {
    console.error("Gemini error", err);
    await ctx.reply("Sorry, I ran into a problem while generating that.");
  }
});

bot.catch((err) => {
  console.error("Bot error", err.error);
});

async function startWebhookServer(webhookUrl: string, webhookSecret?: string) {
  const url = new URL(webhookUrl);
  const webhookPath = url.pathname === "" ? "/" : url.pathname;
  const port = Number(process.env.PORT ?? "3000");
  const cronSecret = process.env.CRON_SECRET;
  const cronPrefix = "/cron/";

  const handler = webhookCallback(
    bot,
    "http",
    webhookSecret ? { secretToken: webhookSecret } : undefined
  );

  await bot.api.setWebhook(
    webhookUrl,
    webhookSecret ? { secret_token: webhookSecret } : undefined
  );

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`
    );
    const pathname = requestUrl.pathname;

    if (req.method === "POST" && pathname === webhookPath) {
      void handler(req, res).catch((err) => {
        console.error("Webhook error", err);
      });
      return;
    }

    if (pathname.startsWith(cronPrefix)) {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("Method Not Allowed");
        return;
      }

      const rawSecret = req.headers["x-cron-secret"];
      const providedSecret = Array.isArray(rawSecret) ? rawSecret[0] : rawSecret;

      if (cronSecret && providedSecret !== cronSecret) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }

      const jobId = pathname.slice(cronPrefix.length);
      const job = getCronJob(jobId);
      if (!job) {
        res.statusCode = 404;
        res.end("Not Found");
        return;
      }

      if (!db) {
        res.statusCode = 503;
        res.end("Database not configured");
        return;
      }

      try {
        await job.run({ bot, db, i18n });
        res.statusCode = 204;
        res.end();
      } catch (error) {
        console.error("Cron job error", error);
        res.statusCode = 500;
        res.end("Cron failed");
      }

      return;
    }

    res.statusCode = 200;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("ok");
  });

  server.listen(port, () => {
    console.log(`Webhook listening on ${port}${webhookPath}`);
  });
}

async function main() {
  const webhookUrl = process.env.WEBHOOK_URL;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  await bot.init();

  if (webhookUrl) {
    await startWebhookServer(webhookUrl, webhookSecret);
  } else {
    console.log("Deploying in dev mode.");
    bot.start();
  }
}

function createDbIfConfigured(
  url?: string,
  serviceKey?: string
): DbClient | null {
  if (!url || !serviceKey) return null;
  return createDb(url, serviceKey);
}

function isAllowedChat(chatId?: number): boolean {
  if (!chatId) return false;
  return allowedChatIds.has(chatId);
}

function getMessageText(ctx: Context): string | null {
  return ctx.message?.text ?? ctx.message?.caption ?? null;
}

function isBotMentioned(text: string, username: string): boolean {
  const handle = `@${username}`.toLowerCase();
  return text.toLowerCase().includes(handle);
}

function stripBotMention(text: string, username: string): string {
  const escaped = escapeRegex(username);
  const pattern = new RegExp(`@${escaped}`, "gi");
  return text.replace(pattern, " ").replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main().catch((err) => {
  console.error("Startup error", err);
  process.exit(1);
});
