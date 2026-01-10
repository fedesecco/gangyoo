import type { I18n } from "@grammyjs/i18n";
import type { Bot } from "grammy";
import type { ChatMemberRecord, ChatRecord, DbClient } from "../db.js";
import { DEFAULT_LANG, isLang, type Lang } from "../i18n.js";
import type { BotContext } from "../types.js";

type JobDeps = {
  bot: Bot<BotContext>;
  db: DbClient;
  i18n: I18n;
};

function formatMemberName(member: ChatMemberRecord): string {
  const parts = [member.first_name, member.last_name].filter(
    (value): value is string => Boolean(value)
  );

  if (parts.length > 0) return parts.join(" ");
  if (member.username) return `@${member.username}`;
  return `user ${member.user_id}`;
}

function resolveLang(chat: ChatRecord): Lang {
  return isLang(chat.language) ? chat.language : DEFAULT_LANG;
}

export async function runLoserOfDayJob({ bot, db, i18n }: JobDeps) {
  const chats = await db.listChats();

  for (const chat of chats) {
    if (Math.random() >= 0.1) continue;

    const members = await db.listMembers(chat.chat_id);
    if (members.length === 0) continue;

    const chosen = members[Math.floor(Math.random() * members.length)];
    const text = i18n.t(resolveLang(chat), "loser_of_day", {
      name: formatMemberName(chosen)
    });

    try {
      await bot.api.sendMessage(chat.chat_id, text);
    } catch (error) {
      console.error("Failed to send loser-of-day message", error);
    }
  }
}
