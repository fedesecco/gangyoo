import type { Context } from "grammy";
import type { DbClient, ChatMemberRecord } from "../db.js";

export async function ensureChatAndMember(
  db: DbClient | null,
  ctx: Context
): Promise<void> {
  if (!db) return;
  const chatId = ctx.chat?.id;
  const from = ctx.from;
  if (!chatId || !from) return;
  await db.ensureChat(chatId, "en");
  await db.upsertMember(chatId, from);
}

export function formatMemberLabel(member: ChatMemberRecord): string {
  if (member.username) return `@${member.username}`;
  const fullName = [member.first_name, member.last_name]
    .filter(Boolean)
    .join(" ");
  return fullName || "someone";
}

export function formatUserName(user?: Context["from"]): string {
  if (!user) return "";
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  if (fullName) return fullName;
  return user.username ?? "";
}
