import { createClient } from "@supabase/supabase-js";
import { DEFAULT_LANG, isLang, type Lang } from "./i18n.js";

type UserInput = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export function createDb(url: string, serviceKey: string) {
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  async function ensureChat(chatId: number, language: Lang) {
    const { data, error } = await supabase
      .from("chats")
      .select("chat_id")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const { error: insertError } = await supabase
        .from("chats")
        .insert({ chat_id: chatId, language });
      if (insertError) throw insertError;
    }
  }

  async function getChatLanguage(chatId: number): Promise<Lang> {
    const { data, error } = await supabase
      .from("chats")
      .select("language")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (error) throw error;

    const lang = data?.language;
    return isLang(lang) ? lang : DEFAULT_LANG;
  }

  async function setChatLanguage(chatId: number, language: Lang) {
    const { error } = await supabase
      .from("chats")
      .upsert({ chat_id: chatId, language }, { onConflict: "chat_id" });

    if (error) throw error;
  }

  async function upsertMember(chatId: number, user: UserInput) {
    const { error } = await supabase
      .from("chat_members")
      .upsert(
        {
          chat_id: chatId,
          user_id: user.id,
          first_name: user.first_name ?? null,
          last_name: user.last_name ?? null,
          username: user.username ?? null
        },
        { onConflict: "chat_id,user_id" }
      );

    if (error) throw error;
  }

  async function setBirthday(chatId: number, userId: number, birthday: string) {
    const { error } = await supabase
      .from("chat_members")
      .update({ birthday })
      .eq("chat_id", chatId)
      .eq("user_id", userId);

    if (error) throw error;
  }

  return { ensureChat, getChatLanguage, setChatLanguage, upsertMember, setBirthday };
}
