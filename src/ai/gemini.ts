import { SYSTEM_PROMPT } from "./prompt.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1";
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_TEMPERATURE = 0.4;
const GEMINI_MAX_OUTPUT_TOKENS = 250;
const GEMINI_TOP_P = 0.70;
const GEMINI_TOP_K = 40;

function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in environment.");
  }
  return apiKey;
}

export async function generateCompletion(userInput: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  const endpoint = `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;
  const prompt = `${SYSTEM_PROMPT}\n\nUser message:\n${userInput}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({

      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: GEMINI_TEMPERATURE,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        topP: GEMINI_TOP_P,
        topK: GEMINI_TOP_K
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Gemini request failed (${response.status}) for ${GEMINI_MODEL}: ${errorBody}`
    );
  }

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const content = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!content) {
    throw new Error("Gemini response was empty.");
  }

  return content;
}


