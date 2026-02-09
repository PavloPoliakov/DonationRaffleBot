import "dotenv/config";
import fs from "fs/promises";
import Fastify from "fastify";
import { webhookCallback } from "grammy";
import { createBot, botCommands } from "./bot.js";
import { createStorage } from "./storage.js";

const botToken = process.env.BOT_TOKEN;
if (!botToken) {
  console.error("BOT_TOKEN is required.");
  process.exit(1);
}

const port = Number(process.env.PORT || 3000);
const publicUrl = process.env.PUBLIC_URL;
const webhookPath = process.env.WEBHOOK_PATH || "/telegram-webhook";
const sqlitePath = process.env.SQLITE_PATH || "./data/registry.sqlite";
const databaseUrl = process.env.DATABASE_URL;
const defaultJarUrl = process.env.JAR_URL;

if (!publicUrl) {
  console.error("PUBLIC_URL is required for webhook mode.");
  process.exit(1);
}

if (!defaultJarUrl) {
  console.error("JAR_URL is required.");
  process.exit(1);
}

const normalizedPublicUrl = publicUrl.endsWith("/")
  ? publicUrl.slice(0, -1)
  : publicUrl;

if (!webhookPath.startsWith("/")) {
  console.error("WEBHOOK_PATH must start with '/'.");
  process.exit(1);
}

const storage = await createStorage({
  dbPath: sqlitePath,
  databaseUrl
});
const rafflePhrases = JSON.parse(
  await fs.readFile(new URL("./raffle-phrases.json", import.meta.url), "utf-8")
);

const { bot } = createBot({
  botToken,
  storage,
  logger: console,
  defaultJarUrl,
  rafflePhrases
});

const server = Fastify({ logger: true });

server.get("/", async () => ({ ok: true }));
server.post(webhookPath, webhookCallback(bot, "fastify"));

await server.listen({ port, host: "0.0.0.0" });
await bot.api.setWebhook(`${normalizedPublicUrl}${webhookPath}`);
await bot.api.setMyCommands(botCommands);

console.log(`Webhook set to ${normalizedPublicUrl}${webhookPath}`);
console.log(`Server listening on port ${port}`);
