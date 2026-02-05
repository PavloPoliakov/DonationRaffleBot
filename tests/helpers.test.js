import { describe, expect, it } from "vitest";
import {
  displayName,
  buildJarUrl,
  formatUserLine,
  getRandomDonation,
  isGroupChat,
  pickRandomItem,
  pickRandomUser
} from "../src/helpers.js";

describe("helpers", () => {
  it("returns group chat types", () => {
    expect(isGroupChat({ type: "group" })).toBe(true);
    expect(isGroupChat({ type: "supergroup" })).toBe(true);
    expect(isGroupChat({ type: "private" })).toBe(false);
    expect(isGroupChat(null)).toBe(false);
  });

  it("formats display names", () => {
    expect(displayName({ name: "Stored Name" })).toBe("Stored Name");
    expect(displayName({ first_name: "Ivan", last_name: "Bondar" })).toBe("Ivan Bondar");
    expect(displayName({ username: "ivan" })).toBe("ivan");
    expect(displayName({})).toBe("Користувач");
    expect(displayName(null)).toBe("Невідомо");
  });

  it("formats user lines", () => {
    expect(formatUserLine({ first_name: "Oksana", username: "oks" })).toBe("Oksana (@oks)");
    expect(formatUserLine({ first_name: "Oksana" })).toBe("Oksana");
  });

  it("picks random users", () => {
    const users = [{ id: 1 }, { id: 2 }];
    expect(pickRandomUser(users, () => 0)).toEqual({ id: 1 });
    expect(pickRandomUser(users, () => 0.6)).toEqual({ id: 2 });
    expect(pickRandomUser([], () => 0.4)).toBeNull();
  });

  it("picks random items", () => {
    const items = ["a", "b", "c"];
    expect(pickRandomItem(items, () => 0)).toBe("a");
    expect(pickRandomItem(items, () => 0.8)).toBe("c");
    expect(pickRandomItem([], () => 0.2)).toBeNull();
  });

  it("generates donation amounts", () => {
    expect(getRandomDonation(10, 100, () => 0)).toBe(10);
    expect(getRandomDonation(10, 100, () => 0.999)).toBe(100);
    expect(getRandomDonation(5, 7, () => 0.5)).toBe(6);
  });

  it("builds monobank jar links", () => {
    const jar = "https://send.monobank.ua/jar/abc123";
    expect(buildJarUrl(jar, 50)).toBe("https://send.monobank.ua/jar/abc123?a=50");
    expect(buildJarUrl("https://example.com", 50)).toBe("https://example.com");
    expect(buildJarUrl("not-a-url", 50)).toBe("not-a-url");
  });
});
