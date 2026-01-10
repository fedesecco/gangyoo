import { Bot, type Context, webhookCallback } from "grammy";
import { config } from "dotenv";
import http from "node:http";
import { generateChatReply, type AiReply } from "./ai/index.js";
import { InferredCommand } from "./ai/commands.js";
import { createDb, type ChatMemberRecord, type DbClient } from "./db.js";
import type { BotContext } from "./types.js";

config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const openAiKey = process.env.OPENAI_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!token || !openAiKey) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN or OPENAI_API_KEY in .env.");
}

const allowedChatIds = parseChatIdWhitelist(process.env.ALLOWED_CHAT_IDS);
if (allowedChatIds.size === 0) {
  console.warn(
    "ALLOWED_CHAT_IDS is empty. The bot will ignore all incoming messages."
  );
}

const bot = new Bot<BotContext>(token);
const db = createDbIfConfigured(supabaseUrl, supabaseKey);
const ensuredChats = new Set<number>();

bot.on("message", async (ctx) => {
  const chatId = ctx.chat?.id;
  const from = ctx.from;
  if (!chatId || !from || from.is_bot) return;
  if (!allowedChatIds.has(chatId)) return;

  const text = getMessageText(ctx);
  if (!text) return;

  const botUsername = ctx.me?.username ?? bot.botInfo?.username;
  if (!botUsername) return;
  if (!isBotMentioned(text, botUsername)) return;

  const cleaned = stripBotMention(text, botUsername);
  const normalized =
    cleaned.trim().length > 0
      ? cleaned.trim()
      : "(user mentioned the bot without extra text)";

  try {
    if (db) {
      try {
        await ensureChatOnce(db, chatId);
        await db.upsertMember(chatId, from);
      } catch (err) {
        console.error("DB sync error", err);
      }
    }

    const reply = await generateChatReply({
      text: normalized,
      chatId,
      chatTitle: ctx.chat?.title,
      userId: from.id,
      userName: formatUserName(from),
      botUsername
    });

    const responseText = (await applyCommandTransform(reply, ctx, db)).trim();
    if (!responseText) {
      await ctx.reply("Sorry, I couldn't generate a response for that.");
      return;
    }

    await ctx.reply(responseText, {
      reply_to_message_id: ctx.message?.message_id
    });
  } catch (err) {
    console.error("OpenAI error", err);
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

  await bot.init();

  if (webhookUrl) {
    await startWebhookServer(webhookUrl, webhookSecret);
  } else {
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

async function ensureChatOnce(dbClient: DbClient, chatId: number) {
  if (ensuredChats.has(chatId)) return;
  await dbClient.ensureChat(chatId, "en");
  ensuredChats.add(chatId);
}

async function applyCommandTransform(
  reply: AiReply,
  ctx: Context,
  dbClient: DbClient | null
): Promise<string> {
  switch (reply.inferredCommand) {
    case InferredCommand.Nominate:
      return resolveNomination(reply.responseText, ctx, dbClient);
    default:
      return reply.responseText;
  }
}

async function resolveNomination(
  responseText: string,
  ctx: Context,
  dbClient: DbClient | null
): Promise<string> {
  if (!responseText) return responseText;
  const placeholderRegex = /\[random_user\]/gi;
  if (!placeholderRegex.test(responseText)) return responseText;

  const replacement = await pickRandomMemberLabel(ctx, dbClient);
  return responseText.replace(placeholderRegex, replacement);
}

async function pickRandomMemberLabel(
  ctx: Context,
  dbClient: DbClient | null
): Promise<string> {
  const chatId = ctx.chat?.id;
  if (!chatId || !dbClient) {
    return formatUserName(ctx.from) || "someone";
  }

  try {
    const members = await dbClient.listMembers(chatId);
    if (!members.length) {
      return formatUserName(ctx.from) || "someone";
    }

    const selected = members[Math.floor(Math.random() * members.length)];
    return formatMemberLabel(selected);
  } catch (err) {
    console.error("Nomination lookup failed", err);
    return formatUserName(ctx.from) || "someone";
  }
}

function formatMemberLabel(member: ChatMemberRecord): string {
  if (member.username) return `@${member.username}`;
  const fullName = [member.first_name, member.last_name]
    .filter(Boolean)
    .join(" ");
  return fullName || "someone";
}

function parseChatIdWhitelist(raw?: string): Set<number> {
  if (!raw) return new Set();
  const ids = raw
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));
  return new Set(ids);
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

function formatUserName(user?: Context["from"]): string {
  if (!user) return "";
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  if (fullName) return fullName;
  return user.username ?? "";
}

main().catch((err) => {
  console.error("Startup error", err);
  process.exit(1);
});
