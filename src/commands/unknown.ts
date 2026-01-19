import type { AiCommandHandler } from "./types.js";

export const handleUnknownCommand: AiCommandHandler = async (reply) => {
  const text = reply.responseText.trim();
  return text || "???";
};

