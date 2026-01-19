import type { AiCommandHandler } from "./types.js";

export const handleLanguageCommand: AiCommandHandler = async (reply) => {
  return reply.responseText;
};
