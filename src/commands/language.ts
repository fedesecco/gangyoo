import type { Conversation } from "@grammyjs/conversations";
import { Keyboard, type Bot } from "grammy";
import type { BotContext, ConversationContext, UserInput } from "../types.js";
import type { LanguageCommandDeps } from "./types.js";

const languageKeyboard = new Keyboard()
  .text("ITA")
  .row()
  .text("ENG")
  .resized()
  .oneTime();

export function registerLanguageCommand(
  bot: Bot<BotContext>,
  deps: LanguageCommandDeps
) {
  bot.command(["language", "lang"], async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const preferredLang = deps.initialLangFromUser(ctx.from as UserInput);
    await deps.ensureChatOnce(chatId, preferredLang);

    if (ctx.from) {
      await deps.db.upsertMember(chatId, ctx.from as UserInput);
    }

    await ctx.conversation.exit("language");
    await ctx.conversation.enter("language");
  });
}

export function createLanguageConversation(deps: LanguageCommandDeps) {
  return async function languageConversation(
    conversation: Conversation<BotContext, ConversationContext>,
    ctx: ConversationContext
  ) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const from = ctx.from as UserInput | undefined;
    const preferredLang = deps.initialLangFromUser(from);
    await deps.ensureChatOnce(chatId, preferredLang);

    await deps.useChatLocale(ctx, chatId);
    await ctx.reply(ctx.t("language_prompt"), {
      reply_markup: languageKeyboard
    });

    while (true) {
      const response = await conversation.waitFor("message:text");
      const selected = deps.normalizeLang(response.message.text);

      if (!selected) {
        await response.reply(response.t("language_invalid"), {
          reply_markup: languageKeyboard
        });
        continue;
      }

      await deps.setLang(chatId, selected);
      response.i18n.useLocale(selected);
      await response.reply(
        response.t("language_set", { language: deps.languageLabel(selected) }),
        { reply_markup: { remove_keyboard: true } }
      );
      break;
    }
  };
}
