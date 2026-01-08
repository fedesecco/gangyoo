import type { Bot } from "grammy";
import type { ChatMemberRecord } from "../db.js";
import type { BotContext, UserInput } from "../types.js";
import type { BaseCommandDeps } from "./types.js";

function formatMemberName(member: ChatMemberRecord): string {
  const parts = [member.first_name, member.last_name].filter(
    (value): value is string => Boolean(value)
  );

  if (parts.length > 0) return parts.join(" ");
  if (member.username) return `@${member.username}`;
  return `user ${member.user_id}`;
}

export function registerNominateCommand(
  bot: Bot<BotContext>,
  deps: BaseCommandDeps
) {
  bot.command("nominate", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const from = ctx.from as UserInput | undefined;
    const preferredLang = deps.initialLangFromUser(from);
    await deps.ensureChatOnce(chatId, preferredLang);

    await deps.useChatLocale(ctx, chatId);
    const members = await deps.db.listMembers(chatId);

    if (members.length === 0) {
      await ctx.reply(ctx.t("nominate_no_candidates"));
      return;
    }

    const chosen = members[Math.floor(Math.random() * members.length)];
    await ctx.reply(ctx.t("nominate_result", { name: formatMemberName(chosen) }));
  });
}
