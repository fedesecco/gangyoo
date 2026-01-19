import { config } from "dotenv";

config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN in .env.");
}

const url = `https://api.telegram.org/bot${token}/deleteWebhook`;

const response = await fetch(url, { method: "POST" });
const payload = await response.json().catch(() => null);

if (!response.ok) {
  throw new Error(
    `deleteWebhook failed (${response.status}): ${JSON.stringify(payload)}`
  );
}

console.log("Webhook deleted:", payload);
