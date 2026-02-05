export const up = async (knex) => {
  const hasChats = await knex.schema.hasTable("chats");
  if (!hasChats) {
    await knex.schema.createTable("chats", (table) => {
      table.text("chat_id").primary();
      table.text("jar_url");
      table.integer("min_donation");
      table.integer("max_donation");
    });
  }

  const hasUsers = await knex.schema.hasTable("users");
  if (!hasUsers) {
    await knex.schema.createTable("users", (table) => {
      table.text("chat_id").notNullable();
      table.text("user_id").notNullable();
      table.text("name");
      table.text("username");
      table.integer("wins").notNullable().defaultTo(0);
      table.integer("donated").notNullable().defaultTo(0);
      table.primary(["chat_id", "user_id"]);
    });
  }

  const hasOptOuts = await knex.schema.hasTable("opt_outs");
  if (!hasOptOuts) {
    await knex.schema.createTable("opt_outs", (table) => {
      table.text("chat_id").notNullable();
      table.text("user_id").notNullable();
      table.primary(["chat_id", "user_id"]);
    });
  }
};

export const down = async (knex) => {
  const hasOptOuts = await knex.schema.hasTable("opt_outs");
  if (hasOptOuts) {
    await knex.schema.dropTable("opt_outs");
  }

  const hasUsers = await knex.schema.hasTable("users");
  if (hasUsers) {
    await knex.schema.dropTable("users");
  }

  const hasChats = await knex.schema.hasTable("chats");
  if (hasChats) {
    await knex.schema.dropTable("chats");
  }
};
