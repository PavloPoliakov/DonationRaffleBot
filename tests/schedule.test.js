import fs from "fs/promises";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it } from "vitest";
import { createBot } from "../src/bot.js";
import { createStorage } from "../src/storage.js";

const createTempPath = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "raffle-bot-"));
  return path.join(dir, "registry.sqlite");
};

const createMockApi = (bot, handlers = {}) => {
  const calls = [];
  bot.api.config.use(async (prev, method, payload) => {
    calls.push({ method, payload });
    if (handlers[method]) {
      return handlers[method](payload);
    }
    return { ok: true, result: { ok: true } };
  });
  return calls;
};

const createUpdate = ({ text, chatId = 100, userId = 200, chatType = "supergroup" }) => {
  const isCommand = text?.startsWith("/");
  const commandLength = isCommand ? text.indexOf(" ") : -1;
  const entityLength = isCommand ? (commandLength === -1 ? text.length : commandLength) : 0;

  return {
    update_id: Math.floor(Math.random() * 100000),
    message: {
      message_id: 1,
      text,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: chatType },
      from: { id: userId, is_bot: false, first_name: "Test" },
      entities: isCommand ? [{ type: "bot_command", offset: 0, length: entityLength }] : []
    }
  };
};

describe("schedule", () => {
  let storage;
  let bot;

  beforeEach(async () => {
    const filePath = await createTempPath();
    storage = await createStorage({ dbPath: filePath });
    ({ bot } = createBot({
      botToken: "TEST",
      storage,
      logger: { log: () => {}, error: () => {} },
      defaultJarUrl: "https://example.com/default",
      rafflePhrases: ["Тестова фраза"]
    }));
    bot.botInfo = { id: 1, is_bot: true, username: "DonationRaffleBot" };
  });

  it("stores schedule settings", async () => {
    const dbPath = await createTempPath();
    const localStorage = await createStorage({ dbPath });
    await localStorage.setSchedule(555, "daily 09:00");
    await localStorage.setScheduleTimezone(555, "Europe/Kyiv");
    await localStorage.setScheduleLastRunKey(555, "2026-02-01-09:00");
    await localStorage.save();

    const reopened = await createStorage({ dbPath });
    expect(await reopened.getSchedule(555)).toBe("daily 09:00");
    expect(await reopened.getScheduleTimezone(555)).toBe("Europe/Kyiv");
    expect(await reopened.getScheduleLastRunKey(555)).toBe("2026-02-01-09:00");
  });

  it("stores schedule via configure", async () => {
    const calls = createMockApi(bot, {
      getChatMember: () => ({ ok: true, result: { status: "administrator" } }),
      sendMessage: (payload) => ({
        ok: true,
        result: { message_id: 18, chat: { id: payload.chat_id }, text: payload.text }
      })
    });

    await bot.handleUpdate(
      createUpdate({ text: "/configure schedule daily 09:00", userId: 201 })
    );

    expect(await storage.getSchedule(100)).toBe("daily 09:00");
    expect(calls.find((call) => call.payload.text?.includes("Розклад збережено"))).toBeDefined();
  });

  it("shows schedule help", async () => {
    const calls = createMockApi(bot, {
      sendMessage: (payload) => ({
        ok: true,
        result: { message_id: 19, chat: { id: payload.chat_id }, text: payload.text }
      })
    });

    await bot.handleUpdate(createUpdate({ text: "/help schedule", userId: 210 }));

    expect(calls.find((call) => call.payload.text?.includes("Розклад розіграшів"))).toBeDefined();
  });
});
