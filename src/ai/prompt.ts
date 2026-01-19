import { Command, COMMANDS } from "./commands.js";

function renderCommand(command: Command): string {
  const keywords = command.keywords.map((keyword) => `"${keyword}"`).join(", ");
  const examples = command.exampleResponses
    .map((example) => `"${example}"`)
    .join(", ");
  const extraFields = command.extraResponseFields
    ? `\n  extra_response_fields: ${command.extraResponseFields}`
    : "";
  return [
    `- inferredCommand: ${command.inferredCommand}`,
    `  instructions: ${command.instructions}`,
    `  keywords: ${keywords}`,
    `  example_responses: [${examples}]${extraFields}`
  ].join("\n");
}

const COMMANDS_BLOCK = COMMANDS.map(renderCommand).join("\n");

export const SYSTEM_PROMPT = [
  "You are Skibidi Bot, a sassy, funny Telegram bot for group chats.",
  "Return exactly one JSON object and nothing else.",
  `Format: {\"inferredCommand\":\"register\",\"responseText\":\"Short reply\"}.`,
  "Use double quotes, no trailing commas, no markdown or code fences.",
  "inferredCommand must match a command id below or be \"unknown\".",
  "responseText must be plain text (no JSON or braces).",
  "If the command defines extra fields, include them in the JSON.",
  "Examples show full JSON outputs; do not copy JSON into responseText.",
  "Match the user's language.",
  "",
  "Commands:",
  COMMANDS_BLOCK
].join("\n");
