import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { createStorage } from "../src/storage.js";

const createTempPath = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "raffle-bot-"));
  return path.join(dir, "registry.sqlite");
};

describe("storage", () => {
  it("initializes chat defaults", async () => {
    const dbPath = await createTempPath();
    const storage = await createStorage({ dbPath });
    const chat = await storage.ensureChat(123);
    expect(chat.jarUrl).toBeNull();
  });

  it("persists data to disk", async () => {
    const dbPath = await createTempPath();
    const storage = await createStorage({ dbPath });
    await storage.setJarUrl(456, "https://example.com");
    await storage.upsertUser(456, { id: 1, name: "Test", username: null, wins: 1, donated: 10 });
    await storage.save();

    const reopened = await createStorage({ dbPath });
    const users = await reopened.getUsers(456);
    expect(users[0].name).toBe("Test");
    expect(await reopened.getJarUrl(456)).toBe("https://example.com");
  });

  it("stores trigger words and cooldown", async () => {
    const dbPath = await createTempPath();
    const storage = await createStorage({ dbPath });
    const added = await storage.addTriggerWord(789, "донат");
    await storage.setTriggerCooldownAt(789, 1234567890);
    await storage.save();

    const reopened = await createStorage({ dbPath });
    expect(added).toBe(true);
    expect(await reopened.getTriggerWords(789)).toEqual(["донат"]);
    expect(await reopened.getTriggerCooldownAt(789)).toBe(1234567890);
  });

  it("stores auto-register setting", async () => {
    const dbPath = await createTempPath();
    const storage = await createStorage({ dbPath });
    expect(await storage.getAutoRegister(321)).toBe(true);
    await storage.setAutoRegister(321, false);
    await storage.save();

    const reopened = await createStorage({ dbPath });
    expect(await reopened.getAutoRegister(321)).toBe(false);
  });

  it("keeps opted-out users for totals but excludes active list", async () => {
    const dbPath = await createTempPath();
    const storage = await createStorage({ dbPath });
    await storage.upsertUser(500, { id: 1, name: "A", username: null, wins: 3, donated: 90 });
    await storage.upsertUser(500, { id: 2, name: "B", username: null, wins: 1, donated: 20 });
    const removed = await storage.removeUser(500, 1);
    await storage.save();

    const reopened = await createStorage({ dbPath });
    const activeUsers = await reopened.getUsers(500);
    const allUsers = await reopened.getUsers(500, { includeOptedOut: true });

    expect(removed).toBe(true);
    expect(activeUsers.map((user) => user.id)).toEqual([2]);
    expect(allUsers.map((user) => user.id).sort((a, b) => a - b)).toEqual([1, 2]);
  });

});
