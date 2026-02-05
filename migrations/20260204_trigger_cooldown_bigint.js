export const up = async (knex) => {
  const hasCooldownColumn = await knex.schema.hasColumn("chats", "trigger_cooldown_at");
  if (!hasCooldownColumn) return;

  if (knex.client.config.client === "pg") {
    await knex.schema.table("chats", (table) => {
      table.bigInteger("trigger_cooldown_at").alter();
    });
  }
};

export const down = async (knex) => {
  const hasCooldownColumn = await knex.schema.hasColumn("chats", "trigger_cooldown_at");
  if (!hasCooldownColumn) return;

  if (knex.client.config.client === "pg") {
    await knex.schema.table("chats", (table) => {
      table.integer("trigger_cooldown_at").alter();
    });
  }
};
