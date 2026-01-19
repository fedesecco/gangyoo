import type { Context } from "grammy";
import type { DbClient } from "../db.js";
import type { AiCommandHandler } from "./types.js";
import { ensureChatAndMember, formatMemberLabel, formatUserName } from "./utils.js";

const PLACEHOLDER_REGEX = /\[random_user\]/gi;
const PLACEHOLDER_TEST_REGEX = /\[random_user\]/i;

export const handleNominateCommand: AiCommandHandler = async (
  reply,
  { ctx, db }
) => {
  const rawText = reply.responseText.trim();
  const needsPick =
    rawText.length === 0 || PLACEHOLDER_TEST_REGEX.test(rawText);

  if (!needsPick) return rawText;

  const replacement = await pickRandomMemberLabel(ctx, db);
  const baseText = rawText.length > 0 ? rawText : "[random_user]";
  return baseText.replace(PLACEHOLDER_REGEX, replacement);
};

async function pickRandomMemberLabel(
  ctx: Context,
  db: DbClient | null
): Promise<string> {
  const fallback = formatUserName(ctx.from) || "someone";
  const chatId = ctx.chat?.id;
  if (!db || !chatId) return fallback;

  try {
    await ensureChatAndMember(db, ctx);
  } catch (err) {
    console.error("Nomination sync error", err);
    return fallback;
  }
  try {
    const members = await db.listMembers(chatId);
    if (!members.length) return fallback;

    const selected = members[Math.floor(Math.random() * members.length)];
    return formatMemberLabel(selected);
  } catch (err) {
    console.error("Nomination lookup failed", err);
    return fallback;
  }
}
