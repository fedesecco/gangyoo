import { COMMANDS, InferredCommand } from "./commands.js";
import { generateCompletion } from "./openai.js";

export type AiReply = {
  inferredCommand: InferredCommand;
  responseText: string;
};

export type ChatRequest = {
  text: string;
  chatId: number;
  chatTitle?: string;
  userId?: number;
  userName?: string;
  botUsername?: string;
};

export type CronRequest = {
  commandId: string;
  payload: unknown;
};

function buildChatInput(request: ChatRequest): string {
  return request.text;
}

function buildCronInput(request: CronRequest): string {
  const variationHint = Math.random().toString(36).slice(2, 8);
  const payload =
    request.payload === undefined
      ? "{}"
      : JSON.stringify(request.payload, null, 2);

  return [
    "MODE: cron",
    `command: ${request.commandId}`,
    `variation: ${variationHint}`,
    "message:",
    payload
  ].join("\n");
}

const COMMAND_IDS = new Set(COMMANDS.map((command) => command.inferredCommand));

function parseAiReply(raw: string): AiReply {
  const trimmed = raw.trim();
  const stripped = stripCodeFences(trimmed);
  const jsonCandidate = extractFirstJsonObject(stripped) ?? stripped;

  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<AiReply>;
    const normalizedCommand =
      typeof parsed.inferredCommand === "string"
        ? parsed.inferredCommand.trim().toLowerCase()
        : "";
    const inferredCommand = COMMAND_IDS.has(
      normalizedCommand as InferredCommand
    )
      ? (normalizedCommand as InferredCommand)
      : InferredCommand.Unknown;
    const responseText =
      typeof parsed.responseText === "string" ? parsed.responseText.trim() : "";

    return { inferredCommand, responseText };
  } catch {
    return { inferredCommand: InferredCommand.Unknown, responseText: stripped };
  }
}

function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const lines = trimmed.split("\n");
  lines.shift();
  if (lines.length > 0 && lines[lines.length - 1].trim().startsWith("```")) {
    lines.pop();
  }
  return lines.join("\n").trim();
}

function extractFirstJsonObject(value: string): string | null {
  const start = value.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < value.length; i += 1) {
    const char = value[i];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return value.slice(start, i + 1);
  }
  return null;
}

export async function generateChatReply(
  request: ChatRequest
): Promise<AiReply> {
  const raw = await generateCompletion(buildChatInput(request));
  return parseAiReply(raw);
}

export async function generateCronReply(
  request: CronRequest
): Promise<AiReply> {
  const raw = await generateCompletion(buildCronInput(request));
  return parseAiReply(raw);
}
