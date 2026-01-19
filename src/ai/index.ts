import { COMMANDS, InferredCommand } from "./commands.js";
import { generateCompletion } from "./gemini.js";

export type AiReply = {
  inferredCommand: InferredCommand;
  responseText: string;
  [key: string]: unknown;
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
  const candidates = [stripped];
  const extracted = extractFirstJsonObject(stripped);
  if (extracted && extracted !== stripped) {
    candidates.unshift(extracted);
  }

  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate);
    if (!parsed) continue;

    const reply = coerceAiReply(parsed);
    const nested = parseNestedReply(reply);
    const resolved = nested ?? reply;
    return sanitizeResponseText(resolved);
  }

  return { inferredCommand: InferredCommand.Unknown, responseText: stripped };
}

function tryParseJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    const normalized = normalizeJsonLike(value);
    if (normalized === value) return null;
    try {
      return JSON.parse(normalized) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function normalizeJsonLike(value: string): string {
  let normalized = value.trim();
  const extracted = extractFirstJsonObject(normalized);
  if (extracted) normalized = extracted;

  normalized = normalized.replace(
    /'([^'\\]*(?:\\.[^'\\]*)*)'/g,
    (_, inner: string) => `"${inner.replace(/"/g, '\\"')}"`
  );
  normalized = normalized.replace(
    /([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g,
    '$1"$2":'
  );
  normalized = normalized.replace(/,(\s*[}\]])/g, "$1");
  return normalized;
}

function coerceAiReply(parsed: Record<string, unknown>): AiReply {
  const inferredValue = parsed.inferredCommand;
  const normalizedCommand =
    typeof inferredValue === "string"
      ? inferredValue.trim().toLowerCase()
      : "";
  const inferredCommand = COMMAND_IDS.has(normalizedCommand as InferredCommand)
    ? (normalizedCommand as InferredCommand)
    : InferredCommand.Unknown;
  const responseValue = parsed.responseText;
  const responseText =
    typeof responseValue === "string" ? responseValue.trim() : "";

  const reply: AiReply = { inferredCommand, responseText };
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "inferredCommand" || key === "responseText") continue;
    reply[key] = value;
  }

  return reply;
}

function parseNestedReply(reply: AiReply): AiReply | null {
  const nestedText = reply.responseText.trim();
  if (!nestedText.startsWith("{")) return null;
  const parsed = tryParseJson(nestedText);
  if (!parsed) return null;
  const nestedReply = coerceAiReply(parsed);
  if (!nestedReply.responseText && nestedReply.inferredCommand === reply.inferredCommand) {
    return null;
  }
  return nestedReply;
}

function sanitizeResponseText(reply: AiReply): AiReply {
  if (!looksLikeJsonEcho(reply.responseText)) return reply;
  return { ...reply, responseText: "" };
}

function looksLikeJsonEcho(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("{") && trimmed.includes("inferredCommand")) return true;
  if (trimmed.includes("\"inferredCommand\"") || trimmed.includes("'inferredCommand'")) {
    return true;
  }
  if (trimmed.includes("\"responseText\"") || trimmed.includes("'responseText'")) {
    return true;
  }
  return false;
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
  userMessage: string
): Promise<AiReply> {
  const raw = await generateCompletion(userMessage);
  return parseAiReply(raw);
}

export async function generateCronReply(
  request: CronRequest
): Promise<AiReply> {
  const raw = await generateCompletion(buildCronInput(request));
  return parseAiReply(raw);
}

