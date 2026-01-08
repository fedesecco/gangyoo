import type { ConversationContext, UserInput } from "../types.js";
import type { DbClient } from "../db.js";
import type { Lang } from "../i18n.js";

export type BaseCommandDeps = {
  db: DbClient;
  ensureChatOnce: (chatId: number, preferredLang: Lang) => Promise<void>;
  initialLangFromUser: (user?: UserInput) => Lang;
  useChatLocale: (ctx: ConversationContext, chatId: number) => Promise<Lang>;
};

export type LanguageCommandDeps = BaseCommandDeps & {
  setLang: (chatId: number, lang: Lang) => Promise<void>;
  normalizeLang: (input?: string) => Lang | null;
  languageLabel: (lang: Lang) => string;
};
