import { Bot, type Context, webhookCallback } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { config } from "dotenv";
import http from "node:http";
import { createDb } from "./db.js";
import {
  DEFAULT_LANG,
  createI18n,
  languageLabel,
  normalizeLang,
  type Lang
} from "./i18n.js";
import type { BotContext, ConversationContext, UserInput } from "./types.js";
import { registerBirthdayCommand } from "./commands/birthday.js";
import {
  createLanguageConversation,
  registerLanguageCommand
} from "./commands/language.js";
import { registerNominateCommand } from "./commands/nominate.js";
import { registerRegisterCommand } from "./commands/register.js";

config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!token || !supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing TELEGRAM_BOT_TOKEN, SUPABASE_URL, or SUPABASE_SERVICE_KEY in .env."
  );
}

const db = createDb(supabaseUrl, supabaseKey);
const bot = new Bot<BotContext>(token);

const langCache = new Map<number, Lang>();
const ensuredChats = new Set<number>();

function initialLangFromUser(user?: UserInput): Lang {
  const code = user?.language_code?.toLowerCase() ?? "";
  if (code.startsWith("it")) return "it";
  return DEFAULT_LANG;
}

async function ensureChat(chatId: number, preferredLang: Lang) {
  await db.ensureChat(chatId, preferredLang);
  if (!langCache.has(chatId)) {
    const stored = await db.getChatLanguage(chatId);
    langCache.set(chatId, stored);
  }
}

async function ensureChatOnce(chatId: number, preferredLang: Lang) {
  if (ensuredChats.has(chatId)) return;
  await ensureChat(chatId, preferredLang);
  ensuredChats.add(chatId);
}

async function getLang(chatId: number): Promise<Lang> {
  const cached = langCache.get(chatId);
  if (cached) return cached;
  const stored = await db.getChatLanguage(chatId);
  langCache.set(chatId, stored);
  return stored;
}

async function setLang(chatId: number, lang: Lang) {
  await db.setChatLanguage(chatId, lang);
  langCache.set(chatId, lang);
}

async function useChatLocale(
  ctx: ConversationContext,
  chatId: number
): Promise<Lang> {
  const lang = await getLang(chatId);
  ctx.i18n.useLocale(lang);
  return lang;
}

const i18n = createI18n<Context>(async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return DEFAULT_LANG;
  return getLang(chatId);
});

const i18nMiddleware = i18n.middleware();

bot.use(
  conversations<BotContext, ConversationContext>({
    plugins: [i18nMiddleware]
  })
);

const languageDeps = {
  db,
  ensureChatOnce,
  initialLangFromUser,
  useChatLocale,
  setLang,
  normalizeLang,
  languageLabel
};

bot.use(createConversation(createLanguageConversation(languageDeps), "language"));
bot.use(i18nMiddleware);

bot.use(async (ctx, next) => {
  const chatId = ctx.chat?.id;
  const from = ctx.from as UserInput | undefined;

  if (chatId && from && !from.is_bot) {
    const preferredLang = initialLangFromUser(from);
    await ensureChatOnce(chatId, preferredLang);
  }

  await next();
});

bot.on("message", async (ctx, next) => {
  const chatId = ctx.chat?.id;
  const from = ctx.from as UserInput | undefined;

  if (chatId && from && !from.is_bot) {
    const preferredLang = initialLangFromUser(from);
    await ensureChatOnce(chatId, preferredLang);
    await db.upsertMember(chatId, from);
  }

  await next();
});

registerRegisterCommand(bot, {
  db,
  ensureChatOnce,
  initialLangFromUser,
  useChatLocale
});

registerLanguageCommand(bot, languageDeps);

registerBirthdayCommand(bot, {
  db,
  ensureChatOnce,
  initialLangFromUser,
  useChatLocale
});

registerNominateCommand(bot, {
  db,
  ensureChatOnce,
  initialLangFromUser,
  useChatLocale
});

bot.on("message:new_chat_members", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const preferredLang = initialLangFromUser(ctx.from as UserInput);
  await ensureChatOnce(chatId, preferredLang);

  const members = ctx.message?.new_chat_members ?? [];
  for (const member of members) {
    if (member.is_bot) continue;
    await db.upsertMember(chatId, member as UserInput);
  }
});

bot.on("my_chat_member", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const status = ctx.myChatMember?.new_chat_member?.status;
  if (status === "member" || status === "administrator") {
    const preferredLang = initialLangFromUser(ctx.from as UserInput | undefined);
    await ensureChatOnce(chatId, preferredLang);
  }
});

bot.catch((err) => {
  console.error("Bot error", err.error);
});

async function startWebhookServer(webhookUrl: string, webhookSecret?: string) {
  const url = new URL(webhookUrl);
  const webhookPath = url.pathname === "" ? "/" : url.pathname;
  const port = Number(process.env.PORT ?? "3000");

  const handler = webhookCallback(
    bot,
    "http",
    webhookSecret ? { secretToken: webhookSecret } : undefined
  );

  await bot.api.setWebhook(
    webhookUrl,
    webhookSecret ? { secret_token: webhookSecret } : undefined
  );

  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === webhookPath) {
      void handler(req, res).catch((err) => {
        console.error("Webhook error", err);
      });
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

  if (webhookUrl) {
    await startWebhookServer(webhookUrl, webhookSecret);
  } else {
    bot.start();
  }
}

main().catch((err) => {
  console.error("Startup error", err);
  process.exit(1);
});
