import type { AiCommandHandler } from "./types.js";
import { ensureChatAndMember } from "./utils.js";

export const handleRegisterCommand: AiCommandHandler = async (
  reply,
  { ctx, db }
) => {
  try {
    await ensureChatAndMember(db, ctx);
  } catch (err) {
    console.error("Register sync error", err);
  }
  return reply.responseText;
};
