import path from "path";
import knex from "knex";
import { runMigrations } from "./migrations.js";

const buildDbConfig = ({ dbPath, databaseUrl }) => {
  if (databaseUrl) {
    return {
      client: "pg",
      connection: databaseUrl
    };
  }

  return {
    client: "better-sqlite3",
    connection: {
      filename: path.resolve(dbPath)
    },
    useNullAsDefault: true
  };
};

export const createStorage = async ({ dbPath, databaseUrl }) => {
  await runMigrations({ dbPath, databaseUrl });

  const db = knex(buildDbConfig({ dbPath, databaseUrl }));

  const ensureChat = async (chatId) => {
    const id = String(chatId);
    await db("chats").insert({ chat_id: id }).onConflict("chat_id").ignore();
    return { chatId: id, jarUrl: await getJarUrl(id) };
  };

  const getJarUrl = async (chatId) => {
    const row = await db("chats").select("jar_url").where({ chat_id: String(chatId) }).first();
    return row?.jar_url ?? null;
  };

  const setJarUrl = async (chatId, jarUrl) => {
    await ensureChat(chatId);
    await db("chats")
      .update({ jar_url: jarUrl })
      .where({ chat_id: String(chatId) });
  };

  const getDonationLimits = async (chatId) => {
    const row = await db("chats")
      .select("min_donation", "max_donation")
      .where({ chat_id: String(chatId) })
      .first();
    const min = row?.min_donation ?? 10;
    const max = row?.max_donation ?? 100;
    return { min, max };
  };

  const getAutoRegister = async (chatId) => {
    const row = await db("chats")
      .select("auto_register")
      .where({ chat_id: String(chatId) })
      .first();
    if (row?.auto_register === 0 || row?.auto_register === false) return false;
    return true;
  };

  const setAutoRegister = async (chatId, enabled) => {
    await ensureChat(chatId);
    await db("chats")
      .update({ auto_register: enabled ? 1 : 0 })
      .where({ chat_id: String(chatId) });
  };

  const getSchedule = async (chatId) => {
    const row = await db("chats")
      .select("raffle_schedule")
      .where({ chat_id: String(chatId) })
      .first();
    return row?.raffle_schedule ?? null;
  };

  const setSchedule = async (chatId, schedule) => {
    await ensureChat(chatId);
    await db("chats")
      .update({ raffle_schedule: schedule ?? null })
      .where({ chat_id: String(chatId) });
    if (!schedule) {
      await db("chats")
        .update({ schedule_last_run_key: null })
        .where({ chat_id: String(chatId) });
    }
  };

  const getScheduleTimezone = async (chatId) => {
    const row = await db("chats")
      .select("schedule_timezone")
      .where({ chat_id: String(chatId) })
      .first();
    return row?.schedule_timezone ?? null;
  };

  const setScheduleTimezone = async (chatId, timezone) => {
    await ensureChat(chatId);
    await db("chats")
      .update({ schedule_timezone: timezone ?? null })
      .where({ chat_id: String(chatId) });
  };

  const getScheduleLastRunKey = async (chatId) => {
    const row = await db("chats")
      .select("schedule_last_run_key")
      .where({ chat_id: String(chatId) })
      .first();
    return row?.schedule_last_run_key ?? null;
  };

  const setScheduleLastRunKey = async (chatId, key) => {
    await ensureChat(chatId);
    await db("chats")
      .update({ schedule_last_run_key: key ?? null })
      .where({ chat_id: String(chatId) });
  };

  const getScheduledChats = async () => {
    const rows = await db("chats")
      .select(
        "chat_id",
        "raffle_schedule",
        "schedule_timezone",
        "schedule_last_run_key"
      )
      .whereNotNull("raffle_schedule");

    return rows.map((row) => ({
      chatId: row.chat_id,
      schedule: row.raffle_schedule,
      timezone: row.schedule_timezone,
      lastRunKey: row.schedule_last_run_key
    }));
  };

  const setDonationLimits = async (chatId, min, max) => {
    await ensureChat(chatId);
    await db("chats")
      .update({ min_donation: Number(min), max_donation: Number(max) })
      .where({ chat_id: String(chatId) });
  };

  const getTriggerWords = async (chatId) => {
    const row = await db("chats")
      .select("trigger_words")
      .where({ chat_id: String(chatId) })
      .first();
    if (!row?.trigger_words) return [];
    try {
      const parsed = JSON.parse(row.trigger_words);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const setTriggerWords = async (chatId, words) => {
    await ensureChat(chatId);
    await db("chats")
      .update({ trigger_words: JSON.stringify(words) })
      .where({ chat_id: String(chatId) });
  };

  const addTriggerWord = async (chatId, word) => {
    const normalized = String(word).trim().toLowerCase();
    if (!normalized) return false;
    const current = await getTriggerWords(chatId);
    if (current.includes(normalized)) return false;
    const updated = [...current, normalized].sort();
    await setTriggerWords(chatId, updated);
    return true;
  };

  const removeTriggerWord = async (chatId, word) => {
    const normalized = String(word).trim().toLowerCase();
    if (!normalized) return false;
    const current = await getTriggerWords(chatId);
    const updated = current.filter((entry) => entry !== normalized);
    if (updated.length === current.length) return false;
    await setTriggerWords(chatId, updated);
    return true;
  };

  const getTriggerCooldownAt = async (chatId) => {
    const row = await db("chats")
      .select("trigger_cooldown_at")
      .where({ chat_id: String(chatId) })
      .first();
    return row?.trigger_cooldown_at ?? null;
  };

  const setTriggerCooldownAt = async (chatId, timestamp) => {
    await ensureChat(chatId);
    await db("chats")
      .update({ trigger_cooldown_at: timestamp })
      .where({ chat_id: String(chatId) });
  };

  const getUsers = async (chatId, { includeOptedOut = false } = {}) => {
    const query = db("users")
      .select("user_id", "name", "username", "wins", "donated")
      .where({ chat_id: String(chatId) });

    if (!includeOptedOut) {
      query.whereNotExists(
        db("opt_outs")
          .select(1)
          .whereRaw("opt_outs.chat_id = users.chat_id")
          .whereRaw("opt_outs.user_id = users.user_id")
      );
    }

    const rows = await query;
    return rows.map((row) => ({
      id: Number(row.user_id),
      name: row.name,
      username: row.username,
      wins: row.wins,
      donated: row.donated
    }));
  };

  const getChatIds = async () => {
    const rows = await db("chats").select("chat_id");
    return rows.map((row) => row.chat_id);
  };

  const getUser = async (chatId, userId) => {
    const row = await db("users")
      .select("user_id", "name", "username", "wins", "donated")
      .where({ chat_id: String(chatId), user_id: String(userId) })
      .first();
    if (!row) return null;
    return {
      id: Number(row.user_id),
      name: row.name,
      username: row.username,
      wins: row.wins,
      donated: row.donated
    };
  };

  const upsertUser = async (chatId, user) => {
    await ensureChat(chatId);
    await db("users")
      .insert({
        chat_id: String(chatId),
        user_id: String(user.id),
        name: user.name ?? null,
        username: user.username ?? null,
        wins: user.wins ?? 0,
        donated: user.donated ?? 0
      })
      .onConflict(["chat_id", "user_id"])
      .merge();
  };

  const removeUser = async (chatId, userId) => {
    const existing = await getUser(chatId, userId);
    const alreadyOptedOut = await isOptedOut(chatId, userId);
    await db("opt_outs")
      .insert({ chat_id: String(chatId), user_id: String(userId) })
      .onConflict(["chat_id", "user_id"])
      .ignore();
    return Boolean(existing) && !alreadyOptedOut;
  };

  const isOptedOut = async (chatId, userId) => {
    const row = await db("opt_outs")
      .select("chat_id")
      .where({ chat_id: String(chatId), user_id: String(userId) })
      .first();
    return Boolean(row);
  };

  const clearOptOut = async (chatId, userId) => {
    await db("opt_outs")
      .where({ chat_id: String(chatId), user_id: String(userId) })
      .del();
  };

  return {
    ensureChat,
    getUsers,
    getChatIds,
    getUser,
    upsertUser,
    removeUser,
    isOptedOut,
    clearOptOut,
    setJarUrl,
    getDonationLimits,
    setDonationLimits,
    getAutoRegister,
    setAutoRegister,
    getSchedule,
    setSchedule,
    getScheduleTimezone,
    setScheduleTimezone,
    getScheduleLastRunKey,
    setScheduleLastRunKey,
    getScheduledChats,
    getJarUrl,
    addTriggerWord,
    removeTriggerWord,
    getTriggerWords,
    getTriggerCooldownAt,
    setTriggerCooldownAt,
    save: async () => {},
    destroy: async () => db.destroy()
  };
};
