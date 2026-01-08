import { Bot } from "grammy";
import type { Context } from "grammy";
import type { I18nFlavor } from "@grammyjs/i18n";
import { config } from "dotenv";
import { createDb } from "./db.js";
import {
  DEFAULT_LANG,
  createI18n,
  languageLabel,
  normalizeLang,
  type Lang
} from "./i18n.js";

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

type BotContext = Context & I18nFlavor;

const bot = new Bot<BotContext>(token);

type UserInput = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  is_bot?: boolean;
  language_code?: string;
};

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

async function useChatLocale(ctx: BotContext, chatId: number): Promise<Lang> {
  const lang = await getLang(chatId);
  ctx.i18n.useLocale(lang);
  return lang;
}

bot.use(async (ctx, next) => {
  const chatId = ctx.chat?.id;
  const from = ctx.from as UserInput | undefined;

  if (chatId && from && !from.is_bot) {
    const preferredLang = initialLangFromUser(from);
    await ensureChatOnce(chatId, preferredLang);
  }

  await next();
});

const i18n = createI18n<BotContext>(async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return DEFAULT_LANG;
  return getLang(chatId);
});

bot.use(i18n.middleware());

bot.on("message", async (ctx) => {
  const chatId = ctx.chat?.id;
  const from = ctx.from as UserInput | undefined;

  if (!chatId || !from || from.is_bot) return;

  const preferredLang = initialLangFromUser(from);
  await ensureChatOnce(chatId, preferredLang);
  await db.upsertMember(chatId, from);
});

function parseBirthday(input: string): string | null {
  const trimmed = input.trim();
  let year: number;
  let month: number;
  let day: number;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    const eu = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
    if (!eu) return null;
    day = Number(eu[1]);
    month = Number(eu[2]);
    year = Number(eu[3]);
  }

  if (!isValidDate(year, month, day)) return null;

  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

bot.command("start", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const preferredLang = initialLangFromUser(ctx.from as UserInput);
  await ensureChat(chatId, preferredLang);

  if (ctx.from) {
    await db.upsertMember(chatId, ctx.from as UserInput);
  }

  await useChatLocale(ctx, chatId);
  await ctx.reply(ctx.t("welcome"));
});

bot.command(["language", "lang"], async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const preferredLang = initialLangFromUser(ctx.from as UserInput);
  await ensureChat(chatId, preferredLang);

  if (ctx.from) {
    await db.upsertMember(chatId, ctx.from as UserInput);
  }

  await useChatLocale(ctx, chatId);
  const raw = ctx.match?.trim();

  if (!raw) {
    await ctx.reply(ctx.t("language_help"));
    return;
  }

  const selected = normalizeLang(raw);
  if (!selected) {
    await ctx.reply(ctx.t("language_invalid"));
    return;
  }

  await setLang(chatId, selected);
  ctx.i18n.useLocale(selected);
  await ctx.reply(ctx.t("language_set", { language: languageLabel(selected) }));
});

bot.command(["birthday", "bday"], async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId || !ctx.from) return;

  const preferredLang = initialLangFromUser(ctx.from as UserInput);
  await ensureChat(chatId, preferredLang);

  await useChatLocale(ctx, chatId);
  const arg = ctx.match?.trim();

  if (!arg) {
    await ctx.reply(ctx.t("birthday_help"));
    return;
  }

  const birthday = parseBirthday(arg);
  if (!birthday) {
    await ctx.reply(ctx.t("birthday_invalid"));
    return;
  }

  await db.upsertMember(chatId, ctx.from as UserInput);
  await db.setBirthday(chatId, ctx.from.id, birthday);
  await ctx.reply(ctx.t("birthday_saved", { date: birthday }));
});

bot.on("message:new_chat_members", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const preferredLang = initialLangFromUser(ctx.from as UserInput);
  await ensureChat(chatId, preferredLang);

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
    const preferredLang = initialLangFromUser(ctx.from as UserInput);
    await ensureChat(chatId, preferredLang);
  }
});

bot.catch((err) => {
  console.error("Bot error", err.error);
});

bot.start();
