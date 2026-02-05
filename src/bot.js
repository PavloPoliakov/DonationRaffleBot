import { Bot, GrammyError, HttpError } from "grammy";
import {
  displayName,
  buildJarUrl,
  formatUserLine,
  getRandomDonation,
  isGroupChat,
  pickRandomItem,
  pickRandomUser
} from "./helpers.js";
import {
  scheduleHelp,
  scheduleTimezoneDefault,
  parseScheduleInput,
  formatSchedule,
  getZonedParts,
  isScheduleDue,
  buildScheduleRunKey
} from "./schedule.js";

export const botCommands = [
  { command: "start", description: "Як користуватися" },
  { command: "register", description: "Зареєструватися" },
  { command: "eject", description: "Видалити себе" },
  { command: "list", description: "Показати зареєстрованих" },
  { command: "configure", description: "Налаштувати банку, тригери, автореєстрацію" },
  { command: "raffle", description: "Запустити розіграш" },
  { command: "cancel", description: "Скасувати активний розіграш" },
  { command: "stats", description: "Топ переможців" },
  { command: "info", description: "Про бота" },
  { command: "help", description: "Показати довідку" }
];

const commandHelp = [
  "*Основне*",
  "/register — Зареєструватися",
  "/eject — Видалити себе",
  "/list — Показати зареєстрованих",
  "/raffle — Запустити розіграш",
  "/cancel — Скасувати активний розіграш",
  "/stats — Топ переможців",
  "/info — Про бота",
  "/help — Показати довідку",
  "/help schedule — Довідка по розкладу",
  "",
  "*Налаштування (/configure, лише адміністратор)*",
  "/configure `https://...` — Банка для групи",
  "/configure `<мін>` `<макс>` — Ліміти донату",
  "/configure auto-register `on|off` — Автореєстрація",
  "/configure schedule ... — Розклад розіграшів",
  "/configure trigger — Список тригерів",
  "/configure trigger + `<слово>` — Додати тригер",
  "/configure trigger - `<слово>` — Видалити тригер"
].join("\n");


const isAdminStatus = (status) => status === "administrator" || status === "creator";

export const createBot = ({
  botToken,
  storage,
  logger = console,
  defaultJarUrl,
  rafflePhrases = []
}) => {
  const bot = new Bot(botToken);
  const raffleSessions = new Map();
  const triggerCooldownMs = 5 * 60 * 1000;

  bot.use(async (ctx, next) => {
    const text = ctx.message?.text || ctx.update?.message?.text || "";
    if (text?.startsWith("/")) {
      const chat = ctx.chat;
      const from = ctx.from;
      logger?.log?.("Update:", {
        chatId: chat?.id,
        chatType: chat?.type,
        fromId: from?.id,
        fromBot: from?.is_bot,
        text
      });
    }
    await next();
  });

  const ensureUser = async (chatId, user) => {
    const existing = await storage.getUser(chatId, user.id);
    const payload = {
      id: user.id,
      name: displayName(user),
      username: user.username || null,
      wins: existing?.wins ?? 0,
      donated: existing?.donated ?? 0
    };
    await storage.upsertUser(chatId, payload);
    await storage.clearOptOut(chatId, user.id);
    return payload;
  };

  const removeUser = (chatId, userId) => storage.removeUser(chatId, userId);

  const getUsers = (chatId) => storage.getUsers(chatId);

  const clearRaffle = (chatId) => {
    const session = raffleSessions.get(chatId);
    if (!session) return;
    session.timeouts.forEach(clearTimeout);
    raffleSessions.delete(chatId);
  };

  const startRaffle = async (
    ctx,
    { enforceCooldown, silent, triggerWord, skipChatTypeCheck } = {}
  ) => {
    const chat = ctx.chat;
    if (!skipChatTypeCheck && !isGroupChat(chat)) {
      if (!silent) {
        await ctx.reply("Використайте /raffle у груповому чаті. 👥");
      }
      return false;
    }

    const chatId = chat.id;
    if (raffleSessions.has(chatId)) {
      if (!silent) {
        await ctx.reply("Розіграш уже триває. ⏳");
      }
      return false;
    }

    if (enforceCooldown) {
      const lastTriggered = await storage.getTriggerCooldownAt(chatId);
      if (lastTriggered && Date.now() - Number(lastTriggered) < triggerCooldownMs) {
        return false;
      }
    }

    const users = await getUsers(chatId);
    if (users.length === 0) {
      if (!silent) {
        await ctx.reply("Немає зареєстрованих користувачів. Попросіть /register. 📣");
      }
      return false;
    }

    if (enforceCooldown) {
      await storage.setTriggerCooldownAt(chatId, Date.now());
      await storage.save();
    }

    const session = { timeouts: [] };
    raffleSessions.set(chatId, session);

    const schedule = (delay, action) => {
      const timer = setTimeout(action, delay);
      session.timeouts.push(timer);
    };

    const sendRafflePhrase = () => {
      const phrase = pickRandomItem(rafflePhrases) || "Обираю...";
      return ctx.reply(phrase);
    };

    if (triggerWord) {
      await ctx.reply(`Тригер \`${triggerWord}\` спрацював. Розіграш стартує! 🎲`, {
        parse_mode: "Markdown"
      });
    } else {
      await ctx.reply("Розіграш стартує! Тримайтеся... 🎲");
    }
    schedule(1200, sendRafflePhrase);
    schedule(2400, sendRafflePhrase);
    schedule(3600, sendRafflePhrase);
    schedule(4800, () => ctx.reply("Обираю... 🔍"));
    schedule(6000, async () => {
      const picked = pickRandomUser(users);
      if (!picked) {
        await ctx.reply("Немає доступних учасників для вибору.");
        clearRaffle(chatId);
        return;
      }
      const winnerEntry = await ensureUser(chatId, picked);
      winnerEntry.wins = (winnerEntry.wins ?? 0) + 1;
      const winner = picked.username ? `${picked.name} (@${picked.username})` : picked.name;
      const { min, max } = await storage.getDonationLimits(chatId);
      const donationAmount = getRandomDonation(min, max);
      winnerEntry.donated = (winnerEntry.donated ?? 0) + donationAmount;
      await storage.upsertUser(chatId, winnerEntry);
      await storage.save();
      const jarUrl = buildJarUrl((await storage.getJarUrl(chatId)) || defaultJarUrl, donationAmount);
      await ctx.reply(
        `Переможець: ${winner}! 🎉\nДонат ${donationAmount} грн на цю банку: ${jarUrl} 💛`
      );
      clearRaffle(chatId);
    });

    return true;
  };

  const scheduleCheckIntervalMs = 60 * 1000;

  const runScheduledRaffles = async () => {
    const scheduledChats = storage.getScheduledChats ? await storage.getScheduledChats() : [];
    if (scheduledChats.length === 0) return;
    const now = new Date();

    for (const entry of scheduledChats) {
      const schedule = parseScheduleInput(entry.schedule);
      if (!schedule || schedule.type === "off") continue;
      const chatId = Number(entry.chatId) || entry.chatId;
      const timeZone = entry.timezone || scheduleTimezoneDefault;
      let parts;
      try {
        parts = getZonedParts(now, timeZone);
      } catch (error) {
        parts = getZonedParts(now, scheduleTimezoneDefault);
      }
      if (!isScheduleDue(schedule, parts)) continue;
      const runKey = buildScheduleRunKey(schedule, parts);
      if (runKey && runKey === entry.lastRunKey) continue;

      const ctx = {
        chat: { id: chatId, type: "supergroup" },
        reply: (text, options) => bot.api.sendMessage(chatId, text, options)
      };

      await startRaffle(ctx, { enforceCooldown: false, silent: true, skipChatTypeCheck: true });
      await storage.setScheduleLastRunKey(chatId, runKey);
      await storage.save();
    }
  };

  setInterval(() => {
    runScheduledRaffles().catch((error) => {
      logger?.error?.("Schedule error:", error);
    });
  }, scheduleCheckIntervalMs);

  bot.on("message:new_chat_members", async (ctx) => {
    const chat = ctx.chat;
    if (!isGroupChat(chat)) return;
    const newMembers = ctx.message?.new_chat_members || [];
    if (!newMembers.some((member) => member.id === ctx.me.id)) return;

    const botName = ctx.me?.username ? `@${ctx.me.username}` : "";
    await ctx.reply(
      `Привіт!\n\nДякую, що додали мене. Я${botName ? ` ${botName}` : ""} — Telegram-бот, що допомагає донатити регулярно.\nЩоб дізнатися більше, викличіть /info.`
    );
  });

  bot.on("message", async (ctx, next) => {
    try {
      const chat = ctx.chat;
      if (!isGroupChat(chat)) return;
      const user = ctx.from;
      if (!user || user.is_bot) return;
      const text = ctx.message?.text?.trim();
      if (text?.startsWith("/")) return;
      const chatId = chat.id;
      const triggerWords = await storage.getTriggerWords(chatId);
      if (text && triggerWords.length > 0) {
        const normalizedText = text.toLowerCase();
        const matched = triggerWords.find((word) => normalizedText.includes(word));
        if (matched) {
          await startRaffle(ctx, { enforceCooldown: true, silent: true, triggerWord: matched });
        }
      }

      if (!(await storage.getAutoRegister(chatId))) return;

      if (await storage.isOptedOut(chatId, user.id)) return;

      const users = await getUsers(chatId);
      const existing = users.find((entry) => String(entry.id) === String(user.id));
      if (existing) return;

      await ensureUser(chatId, user);
      await storage.save();
      await ctx.reply(
        `Додано до списку: ${formatUserLine(user)}. Якщо не хочеш брати участь — /eject.`
      );
    } finally {
      await next();
    }
  });

  bot.command("register", async (ctx) => {
    const user = ctx.from;
    if (!user) {
      await ctx.reply("Потрібен користувач. Використайте /register у приватному або груповому чаті. 👤");
      return;
    }
    if (user.is_bot) {
      await ctx.reply("Боти не можуть реєструватися. 🤖");
      return;
    }
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const users = await getUsers(chatId);
    const existing = users.find((entry) => String(entry.id) === String(user.id));
    if (existing) {
      await ctx.reply("Ви вже зареєстровані. ✅");
      return;
    }

    await ensureUser(chatId, user);
    await storage.save();
    await ctx.reply(`Зареєстровано: ${formatUserLine(user)}. ✅`);
  });

  bot.command("eject", async (ctx) => {
    const user = ctx.from;
    if (!user) return;
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const removed = await removeUser(chatId, user.id);
    if (!removed) {
      await ctx.reply("Ви не зареєстровані. ℹ️");
      return;
    }

    await storage.save();
    await ctx.reply("Вас видалено зі списку. 🧹");
  });

  bot.command("list", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const users = await getUsers(chatId);
    if (users.length === 0) {
      await ctx.reply("Поки немає зареєстрованих користувачів. 📭");
      return;
    }

    const lines = users
      .map((entry, index) => {
        const line = entry.username ? `${entry.name} (@${entry.username})` : entry.name;
        return `${index + 1}. ${line}`;
      })
      .join("\n");

    await ctx.reply(`Зареєстровані користувачі (${users.length}):\n${lines}`);
  });

  const handleConfigure = async (ctx) => {
    const chat = ctx.chat;
    if (!isGroupChat(chat)) {
      await ctx.reply("Використайте /configure у груповому чаті.");
      return;
    }
    const requester = ctx.from;
    if (!requester) return;
    const member = await ctx.api.getChatMember(chat.id, requester.id);
    if (!isAdminStatus(member.status)) {
      await ctx.reply("Налаштовувати може лише адміністратор групи.");
      return;
    }
    const chatId = chat.id;
    const args = ctx.message?.text?.split(" ").slice(1).filter(Boolean) ?? [];
    if (args.length === 0) {
      await ctx.reply(
        "Використайте /configure `https://...`, /configure `<мін>` `<макс>`, /configure auto-register `on|off`, /configure schedule ... або /configure trigger + `<слово>`.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (args[0] === "auto-register") {
      const action = args[1];
      if (action !== "on" && action !== "off") {
        const status = (await storage.getAutoRegister(chatId)) ? "увімкнено" : "вимкнено";
        await ctx.reply(
          `Поточний стан: ${status}. Використайте /configure auto-register \`on|off\`.`,
          { parse_mode: "Markdown" }
        );
        return;
      }
      const enabled = action === "on";
      await storage.setAutoRegister(chatId, enabled);
      await storage.save();
      await ctx.reply(`Автореєстрацію ${enabled ? "увімкнено" : "вимкнено"}.`);
      return;
    }

    if (args[0] === "schedule") {
      const scheduleInput = args.slice(1).join(" ").trim();
      if (!scheduleInput) {
        const currentSchedule = await storage.getSchedule(chatId);
        const formatted = currentSchedule ? `\`${currentSchedule}\`` : "(не налаштовано)";
        await ctx.reply(
          `Поточний розклад: ${formatted}.\nВикористайте /help schedule для формату.`,
          { parse_mode: "Markdown" }
        );
        return;
      }
      const parsed = parseScheduleInput(scheduleInput);
      if (!parsed) {
        await ctx.reply(scheduleHelp, { parse_mode: "Markdown" });
        return;
      }
      if (parsed.type === "off") {
        await storage.setSchedule(chatId, null);
        await storage.save();
        await ctx.reply("Розклад вимкнено.");
        return;
      }
      const normalized = formatSchedule(parsed);
      await storage.setSchedule(chatId, normalized);
      if (!(await storage.getScheduleTimezone(chatId))) {
        await storage.setScheduleTimezone(chatId, scheduleTimezoneDefault);
      }
      await storage.save();
      await ctx.reply(`Розклад збережено: \`${normalized}\`.`, { parse_mode: "Markdown" });
      return;
    }

    if (args[0] === "trigger") {
      if (args.length === 1) {
        const triggers = await storage.getTriggerWords(chatId);
        if (triggers.length === 0) {
          await ctx.reply("Поки немає тригерів. Додайте: /configure trigger + `<слово>`.", {
            parse_mode: "Markdown"
          });
          return;
        }
        const formatted = triggers.map((trigger) => `\`${trigger}\``).join(", ");
        await ctx.reply(`Тригери (${triggers.length}): ${formatted}`, { parse_mode: "Markdown" });
        return;
      }
      const action = args[1];
      const triggerWord = args.slice(2).join(" ").trim();
      if ((action !== "+" && action !== "-") || !triggerWord) {
        await ctx.reply("Використайте /configure trigger + `<слово>` або /configure trigger - `<слово>`.", {
          parse_mode: "Markdown"
        });
        return;
      }
      if (action === "+") {
        const added = await storage.addTriggerWord(chatId, triggerWord);
        await storage.save();
        if (!added) {
          await ctx.reply(`Тригер вже існує: ${triggerWord}`);
          return;
        }
        await ctx.reply(`Тригер додано: ${triggerWord}`);
        return;
      }

      const removed = await storage.removeTriggerWord(chatId, triggerWord);
      await storage.save();
      if (!removed) {
        await ctx.reply(`Тригера немає: ${triggerWord}`);
        return;
      }
      await ctx.reply(`Тригер видалено: ${triggerWord}`);
      return;
    }

    if (args.length === 2 && args.every((value) => /^\d+$/.test(value))) {
      const min = Number(args[0]);
      const max = Number(args[1]);
      if (min <= 0 || max <= 0 || min > max) {
        await ctx.reply("Ліміти мають бути додатніми числами, де мін не більший за макс.");
        return;
      }
      await storage.setDonationLimits(chatId, min, max);
      await storage.save();
      await ctx.reply(`Ліміти донату оновлено: від ${min} до ${max} грн.`);
      return;
    }

    if (args.length === 1) {
      const jarUrl = args[0];
      try {
        new URL(jarUrl);
      } catch (error) {
        await ctx.reply("Невірне посилання. Використайте /configure `https://...`");
        return;
      }
      await storage.setJarUrl(chatId, jarUrl);
      await storage.save();
      await ctx.reply(`Посилання на банку збережено: ${jarUrl}`);
      return;
    }

    await ctx.reply(
      "Невірний формат. Використайте /configure `https://...`, /configure `<мін>` `<макс>`, /configure auto-register `on|off`, /configure schedule ... або /configure trigger + `<слово>`.",
      { parse_mode: "Markdown" }
    );
  };

  bot.command("configure", handleConfigure);

  const buildStatsMessage = (users) => {
    const ranked = users
      .filter((entry) => Number(entry.wins) > 0)
      .sort((a, b) => {
        const winsDiff = (b.wins ?? 0) - (a.wins ?? 0);
        if (winsDiff !== 0) return winsDiff;
        return (b.donated ?? 0) - (a.donated ?? 0);
      })
      .slice(0, 10);

    if (ranked.length === 0) {
      return "Ще немає переможців.";
    }

    const lines = ranked
      .map((entry, index) => {
        const line = entry.username ? `${entry.name} (@${entry.username})` : entry.name;
        const donated = Number(entry.donated ?? 0);
        return `${index + 1}. ${line} — ${entry.wins} / ${donated} грн`;
      })
      .join("\n");

    const totalDonated = users.reduce(
      (sum, entry) => sum + Number(entry.donated ?? 0),
      0
    );

    return `Топ переможців:\n${lines}\n\nВсього донатів: ${totalDonated} грн 💛`;
  };

  bot.command("stats", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const users = await getUsers(chatId);
    await ctx.reply(buildStatsMessage(users));
  });

  bot.command("info", async (ctx) => {
    await ctx.reply(
      "Привіт! Я @DonationRaffleBot 🎲\n\nЯ тут, щоб робити донати було трішки веселіше 🎉.\n\n1️⃣ *Спочатку реєстрація*.\nУчасники можуть зареєструватися командою /register або просто написати будь-що в чат, і я автоматично додам їх до списку.\nЯкщо не хочеш брати участь, завжди можна вийти командою /eject.\n\n2️⃣ *Потім гра*.\nКоли хтось пише /raffle, починається магія ✨\nЯ випадково обираю одного учасника, якому випадає\n💸 задонатити від 10 до 100 грн на банку для допомоги ЗСУ.\n\n🎯 Все прозоро, випадково і без зайвого пафосу\n🇺🇦 Маленькі донати, але регулярно і разом\n\nГотові?\n👉 /register і нехай вирішує доля 😉",
      { parse_mode: "Markdown" }
    );
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Привіт! Я @DonationRaffleBot 🎲\n\n1️⃣ Додайте мене в групу.\n2️⃣ Адмін налаштовує банку: /configure `https://...`\n3️⃣ За потреби задайте ліміти: /configure `<мін>` `<макс>`\n4️⃣ Учасники реєструються /register (або пишуть у чат, якщо ввімкнена автореєстрація).\n\nДалі запускайте /raffle або налаштуйте розклад. Маленькі донати регулярно — і разом. 🇺🇦",
      { parse_mode: "Markdown" }
    );
  });

  bot.command("help", async (ctx) => {
    const args = ctx.message?.text?.split(" ").slice(1).filter(Boolean) ?? [];
    if (args[0] === "schedule") {
      await ctx.reply(scheduleHelp, { parse_mode: "Markdown" });
      return;
    }
    await ctx.reply(commandHelp, { parse_mode: "Markdown" });
  });

  bot.command("cancel", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    if (!raffleSessions.has(chatId)) {
      await ctx.reply("Зараз немає активного розіграшу. ℹ️");
      return;
    }
    clearRaffle(chatId);
    await ctx.reply("Розіграш скасовано. 🛑");
  });

  bot.command("raffle", async (ctx) => {
    await startRaffle(ctx, { enforceCooldown: false, silent: false });
  });

  bot.catch((error) => {
    const ctx = error.ctx;
    logger?.error?.(`Bot error while handling update ${ctx.update.update_id}:`);
    if (error.error instanceof GrammyError) {
      logger?.error?.("Grammy error:", error.error.description);
    } else if (error.error instanceof HttpError) {
      logger?.error?.("HTTP error:", error.error);
    } else {
      logger?.error?.("Unknown error:", error.error);
    }
  });

  return { bot, raffleSessions };
};
