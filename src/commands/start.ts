import type { Bot } from "grammy";
import type { BotContext, UserInput } from "../types.js";
import type { BaseCommandDeps } from "./types.js";

export function registerStartCommand(
  bot: Bot<BotContext>,
  deps: BaseCommandDeps
) {
  bot.command("register", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const preferredLang = deps.initialLangFromUser(ctx.from as UserInput);
    await deps.ensureChatOnce(chatId, preferredLang);

    if (ctx.from) {
      await deps.db.upsertMember(chatId, ctx.from as UserInput);
    }

    await deps.useChatLocale(ctx, chatId);
    await ctx.reply(ctx.t("welcome"));
  });
}
