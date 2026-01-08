import type { ConversationFlavor } from "@grammyjs/conversations";
import type { I18nFlavor } from "@grammyjs/i18n";
import type { Context } from "grammy";

export type BotContext = Context & ConversationFlavor<Context> & I18nFlavor;
export type ConversationContext = Context & I18nFlavor;

export type UserInput = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  is_bot?: boolean;
  language_code?: string;
};
