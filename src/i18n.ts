import { I18n } from "@grammyjs/i18n";
import type { Context } from "grammy";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Lang = "en" | "it";

export const DEFAULT_LANG: Lang = "en";

const localesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "locales"
);

export function createI18n<C extends Context>(
  localeNegotiator?: (ctx: C) => Promise<Lang | undefined> | Lang | undefined
) {
  return new I18n<C>({
    defaultLocale: DEFAULT_LANG,
    directory: localesDir,
    useSession: false,
    localeNegotiator
  });
}

export function isLang(value: string | null | undefined): value is Lang {
  return value === "en" || value === "it";
}

export function normalizeLang(input?: string): Lang | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  if (value === "it" || value === "ita") return "it";
  if (value === "en" || value === "eng") return "en";
  return null;
}

export function languageLabel(lang: Lang): string {
  return lang === "it" ? "Italiano" : "English";
}
