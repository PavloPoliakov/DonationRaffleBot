import fs from "fs/promises";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const createMyChatMemberUpdate = ({
  chatId = 100,
  chatType = "channel",
  fromId = 200,
  oldStatus = "left",
  newStatus = "member"
}) => ({
  update_id: Math.floor(Math.random() * 100000),
  my_chat_member: {
    chat: { id: chatId, type: chatType, title: "Test Channel" },
    from: { id: fromId, is_bot: false, first_name: "Admin" },
    old_chat_member: {
      status: oldStatus,
      user: { id: 1, is_bot: true, username: "DonationRaffleBot" }
    },
    new_chat_member: {
      status: newStatus,
      user: { id: 1, is_bot: true, username: "DonationRaffleBot" }
    }
  }
});

describe("bot integration", () => {
  let storage;
  let bot;
  let logger;

  beforeEach(async () => {
    const filePath = await createTempPath();
    storage = await createStorage({ dbPath: filePath });
    logger = { log: vi.fn(), error: vi.fn() };
    ({ bot } = createBot({
      botToken: "TEST",
      storage,
      logger,
      defaultJarUrl: "https://example.com/default",
      rafflePhrases: ["Тестова фраза"]
    }));
    bot.botInfo = { id: 1, is_bot: true, username: "DonationRaffleBot" };
  });

  it("auto-registers on group messages", async () => {
    const calls = createMockApi(bot, {
      sendMessage: (payload) => ({
        ok: true,
        result: { message_id: 10, chat: { id: payload.chat_id }, text: payload.text }
      })
    });

    await bot.handleUpdate(createUpdate({ text: "Привіт" }));

    const users = await storage.getUsers(100);
    expect(users.find((user) => user.id === 200)).toBeDefined();
    expect(calls.find((call) => call.method === "sendMessage")?.payload.text).toContain(
      "Додано до списку"
    );
  });

  it("toggles auto-register via configure", async () => {
    const calls = createMockApi(bot, {
      getChatMember: () => ({ ok: true, result: { status: "administrator" } }),
      sendMessage: (payload) => ({
        ok: true,
        result: { message_id: 17, chat: { id: payload.chat_id }, text: payload.text }
      })
    });

    await bot.handleUpdate(
      createUpdate({ text: "/configure auto-register off", userId: 201 })
    );

    await bot.handleUpdate(createUpdate({ text: "Привіт", userId: 200 }));

    expect((await storage.getUsers(100)).length).toBe(0);
    expect(calls.find((call) => call.payload.text?.includes("Автореєстрацію вимкнено"))).toBeDefined();

    await bot.handleUpdate(
      createUpdate({ text: "/configure auto-register on", userId: 201 })
    );

    await bot.handleUpdate(createUpdate({ text: "Привіт знову", userId: 200 }));

    expect((await storage.getUsers(100)).length).toBe(1);
  });

  it("introduces itself when added to a channel", async () => {
    const calls = createMockApi(bot, {
      sendMessage: (payload) => ({
        ok: true,
        result: { message_id: 20, chat: { id: payload.chat_id }, text: payload.text }
      })
    });

    await bot.handleUpdate(createMyChatMemberUpdate({ chatId: 500 }));

    const introCall = calls.find((call) => call.method === "sendMessage");
    expect(introCall?.payload.chat_id).toBe(500);
    expect(introCall?.payload.text).toContain("Дякую, що додали мене");
    expect(introCall?.payload.text).toContain("/info");
  });


  it("registers users with /register", async () => {
    const calls = createMockApi(bot, {
      sendMessage: (payload) => ({
        ok: true,
        result: { message_id: 15, chat: { id: payload.chat_id }, text: payload.text }
      })
    });

    await bot.handleUpdate(createUpdate({ text: "/register", userId: 210 }));

    const users = await storage.getUsers(100);
    expect(users.find((user) => user.id === 210)).toBeDefined();
    const registerCall = calls.find((call) => call.payload.text?.includes("Зареєстровано"));
    expect(registerCall).toBeDefined();
  });

  it("ejects users and prevents auto-register", async () => {
    const calls = createMockApi(bot, {
      sendMessage: (payload) => ({
        ok: true,
        result: { message_id: 16, chat: { id: payload.chat_id }, text: payload.text }
      })
    });

    await storage.upsertUser(100, { id: 220, name: "Ihor", username: null, wins: 0, donated: 0 });

    await bot.handleUpdate(createUpdate({ text: "/eject", userId: 220 }));
    await bot.handleUpdate(createUpdate({ text: "Повернувся", userId: 220 }));

    expect(await storage.getUser(100, 220)).toBeNull();
    expect(await storage.isOptedOut(100, 220)).toBe(true);

    const addedCall = calls.find((call) => call.payload.text?.includes("Додано до списку"));
    expect(addedCall).toBeUndefined();
  });

  it("lets admins configure jar link", async () => {
    createMockApi(bot, {
      getChatMember: () => ({ ok: true, result: { status: "administrator" } }),
      sendMessage: (payload) => ({
        ok: true,
        result: { message_id: 11, chat: { id: payload.chat_id }, text: payload.text }
      })
    });

    await bot.handleUpdate(
      createUpdate({ text: "/configure https://example.com/jar", userId: 201 })
    );

    expect(await storage.getJarUrl(100)).toBe("https://example.com/jar");
  });

  it("blocks non-admins from configuring jar link", async () => {
    const calls = createMockApi(bot, {
      getChatMember: () => ({ ok: true, result: { status: "member" } }),
      sendMessage: (payload) => ({
        ok: true,
        result: { message_id: 12, chat: { id: payload.chat_id }, text: payload.text }
      })
    });

    await bot.handleUpdate(
      createUpdate({ text: "/configure https://example.com/jar", userId: 203 })
    );

    expect(await storage.getJarUrl(100)).toBeNull();
    const replyCall = calls.find((call) => call.payload.text?.includes("адміністратор"));
    expect(replyCall).toBeDefined();
  });

  it("triggers raffles from configured words with cooldown", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const calls = createMockApi(bot, {
      getChatMember: () => ({ ok: true, result: { status: "administrator" } }),
      sendMessage: (payload) => ({
        ok: true,
        result: { message_id: Math.floor(Math.random() * 1000), chat: { id: payload.chat_id }, text: payload.text }
      })
    });

    await storage.upsertUser(100, { id: 300, name: "Winner", username: null, wins: 0, donated: 0 });

    await bot.handleUpdate(
      createUpdate({ text: "/configure trigger + донат", userId: 201 })
    );

    await bot.handleUpdate(createUpdate({ text: "донат будь ласка", userId: 300 }));
    await vi.advanceTimersByTimeAsync(7000);

    const startMessages = calls.filter((call) => call.payload.text?.includes("Розіграш стартує"));
    expect(startMessages.length).toBe(1);

    const winner = await storage.getUser(100, 300);
    expect(winner?.wins).toBe(1);

    await bot.handleUpdate(createUpdate({ text: "донат знову", userId: 300 }));
    await vi.advanceTimersByTimeAsync(7000);

    const startMessagesAfter = calls.filter((call) => call.payload.text?.includes("Розіграш стартує"));
    expect(startMessagesAfter.length).toBe(1);

    await bot.handleUpdate(
      createUpdate({ text: "/configure trigger - донат", userId: 201 })
    );

    await bot.handleUpdate(createUpdate({ text: "донат", userId: 300 }));
    await vi.advanceTimersByTimeAsync(7000);

    const startMessagesAfterRemoval = calls.filter((call) =>
      call.payload.text?.includes("Розіграш стартує")
    );
    expect(startMessagesAfterRemoval.length).toBe(1);

    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("runs a raffle and announces a winner", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const calls = createMockApi(bot, {
      sendMessage: (payload) => ({
        ok: true,
        result: { message_id: Math.floor(Math.random() * 1000), chat: { id: payload.chat_id }, text: payload.text }
      })
    });

    await storage.upsertUser(100, { id: 300, name: "Winner", username: null, wins: 0, donated: 0 });

    await bot.handleUpdate(createUpdate({ text: "/raffle", userId: 202 }));
    await vi.advanceTimersByTimeAsync(7000);

    const winner = await storage.getUser(100, 300);
    expect(winner?.wins).toBe(1);
    expect(winner?.donated).toBe(10);
    const sendMessages = calls.filter((call) => call.method === "sendMessage");
    expect(sendMessages.length).toBeGreaterThan(0);

    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("lists registered users", async () => {
    const calls = createMockApi(bot, {
      sendMessage: (payload) => ({
        ok: true,
        result: { message_id: 13, chat: { id: payload.chat_id }, text: payload.text }
      })
    });

    await storage.upsertUser(100, { id: 301, name: "Anna", username: "anna", wins: 0, donated: 0 });
    await storage.upsertUser(100, { id: 302, name: "Oleh", username: null, wins: 0, donated: 0 });

    await bot.handleUpdate(createUpdate({ text: "/list", userId: 204 }));

    const listCall = calls.find((call) => call.payload.text?.includes("Зареєстровані користувачі"));
    expect(listCall).toBeDefined();
    expect(listCall.payload.text).toContain("1. Anna (@anna)");
    expect(listCall.payload.text).toContain("2. Oleh");
  });

  it("shows stats for winners", async () => {
    const calls = createMockApi(bot, {
      sendMessage: (payload) => ({
        ok: true,
        result: { message_id: 14, chat: { id: payload.chat_id }, text: payload.text }
      })
    });

    await storage.upsertUser(100, { id: 303, name: "Max", username: "max", wins: 2, donated: 70 });
    await storage.upsertUser(100, { id: 304, name: "Ira", username: null, wins: 1, donated: 20 });

    await bot.handleUpdate(createUpdate({ text: "/stats", userId: 205 }));

    const statsCall = calls.find((call) => call.payload.text?.includes("Топ переможців"));
    expect(statsCall).toBeDefined();
    expect(statsCall.payload.text).toContain("1. Max (@max) — 2 / 70 грн");
    expect(statsCall.payload.text).toContain("2. Ira — 1 / 20 грн");
  });

  it("sorts stats by donated amount when wins tie", async () => {
    const calls = createMockApi(bot, {
      sendMessage: (payload) => ({
        ok: true,
        result: { message_id: 18, chat: { id: payload.chat_id }, text: payload.text }
      })
    });

    await storage.upsertUser(100, { id: 305, name: "Dmytro", username: "dmytro", wins: 3, donated: 90 });
    await storage.upsertUser(100, { id: 306, name: "Oksana", username: "oksana", wins: 3, donated: 140 });
    await storage.upsertUser(100, { id: 307, name: "Bohdan", username: null, wins: 2, donated: 200 });

    await bot.handleUpdate(createUpdate({ text: "/stats", userId: 206 }));

    const statsCall = calls.find((call) => call.payload.text?.includes("Топ переможців"));
    expect(statsCall).toBeDefined();
    const text = statsCall.payload.text;
    const oksanaLine = "1. Oksana (@oksana) — 3 / 140 грн";
    const dmytroLine = "2. Dmytro (@dmytro) — 3 / 90 грн";
    expect(text).toContain(oksanaLine);
    expect(text).toContain(dmytroLine);
    expect(text.indexOf(oksanaLine)).toBeLessThan(text.indexOf(dmytroLine));
  });
});
