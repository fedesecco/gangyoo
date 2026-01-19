import type { AiCommandHandler } from "./types.js";
import { ensureChatAndMember } from "./utils.js";

function parseBirthday(input: string): string | null {
  const trimmed = input.trim();
  let year: number;
  let month: number;
  let day: number;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    const eu = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
    if (!eu) return null;
    day = Number(eu[1]);
    month = Number(eu[2]);
    year = Number(eu[3]);
  }

  if (!isValidDate(year, month, day)) return null;

  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function extractBirthday(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return parseBirthday(value);
}

export const handleBirthdayCommand: AiCommandHandler = async (
  reply,
  { ctx, db }
) => {
  const birthday =
    "birthday" in reply ? extractBirthday(reply.birthday) : null;
  if (db && ctx.chat?.id && ctx.from && birthday) {
    try {
      await ensureChatAndMember(db, ctx);
      await db.setBirthday(ctx.chat.id, ctx.from.id, birthday);
    } catch (err) {
      console.error("Birthday sync error", err);
    }
  }
  return reply.responseText;
};
