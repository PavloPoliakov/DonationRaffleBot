export const up = async (knex) => {
  const hasTriggerWordsColumn = await knex.schema.hasColumn("chats", "trigger_words");
  if (!hasTriggerWordsColumn) {
    await knex.schema.table("chats", (table) => {
      table.text("trigger_words");
    });
  }

  const hasCooldownColumn = await knex.schema.hasColumn("chats", "trigger_cooldown_at");
  if (!hasCooldownColumn) {
    await knex.schema.table("chats", (table) => {
      table.integer("trigger_cooldown_at");
    });
  }

};

export const down = async (knex) => {
  const hasTriggerWordsColumn = await knex.schema.hasColumn("chats", "trigger_words");
  if (hasTriggerWordsColumn) {
    await knex.schema.table("chats", (table) => {
      table.dropColumn("trigger_words");
    });
  }

  const hasCooldownColumn = await knex.schema.hasColumn("chats", "trigger_cooldown_at");
  if (hasCooldownColumn) {
    await knex.schema.table("chats", (table) => {
      table.dropColumn("trigger_cooldown_at");
    });
  }
};
