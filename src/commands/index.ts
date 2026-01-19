import { InferredCommand } from "../ai/commands.js";
import type { AiReply } from "../ai/index.js";
import type { AiCommandContext } from "./types.js";
import { handleBirthdayCommand } from "./birthday.js";
import { handleNominateCommand } from "./nominate.js";
import { handleRegisterCommand } from "./register.js";
import { handleUnknownCommand } from "./unknown.js";

export async function executeAiCommand(
  reply: AiReply,
  context: AiCommandContext
): Promise<string> {
  switch (reply.inferredCommand) {
    case InferredCommand.Register:
      return handleRegisterCommand(reply, context);
    case InferredCommand.Birthday:
      return handleBirthdayCommand(reply, context);
    case InferredCommand.Nominate:
      return handleNominateCommand(reply, context);
    case InferredCommand.Unknown:
    default:
      return handleUnknownCommand(reply, context);
  }
}
