import { SYSTEM_PROMPT } from "./prompt.js";

type OpenAiConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  presencePenalty: number;
  frequencyPenalty: number;
};

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TEMPERATURE = 1.1;
const DEFAULT_MAX_TOKENS = 250;
const DEFAULT_PRESENCE_PENALTY = 0.6;
const DEFAULT_FREQUENCY_PENALTY = 0.2;

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getOpenAiConfig(): OpenAiConfig {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in environment.");
  }

  return {
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
    temperature: parseNumber(process.env.OPENAI_TEMPERATURE, DEFAULT_TEMPERATURE),
    maxTokens: parseNumber(process.env.OPENAI_MAX_TOKENS, DEFAULT_MAX_TOKENS),
    presencePenalty: parseNumber(
      process.env.OPENAI_PRESENCE_PENALTY,
      DEFAULT_PRESENCE_PENALTY
    ),
    frequencyPenalty: parseNumber(
      process.env.OPENAI_FREQUENCY_PENALTY,
      DEFAULT_FREQUENCY_PENALTY
    )
  };
}

export async function generateCompletion(userInput: string): Promise<string> {
  const config = getOpenAiConfig();

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      presence_penalty: config.presencePenalty,
      frequency_penalty: config.frequencyPenalty,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userInput }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenAI request failed (${response.status}): ${errorBody}`
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI response was empty.");
  }

  return content;
}
