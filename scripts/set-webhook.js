import { config } from "dotenv";

config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const webhook = process.env.WEBHOOK_URL;

if (!token) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN in .env.");
}

if (!webhook) {
  throw new Error("Missing WEBHOOK_URL in .env.");
}

const url = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(
  webhook
)}`;

const response = await fetch(url, { method: "POST" });
const payload = await response.json().catch(() => null);

if (!response.ok) {
  throw new Error(`setWebhook failed (${response.status}): ${JSON.stringify(payload)}`);
}

console.log("Webhook set:", payload);
