export const up = async (knex) => {
  const hasAutoRegisterColumn = await knex.schema.hasColumn("chats", "auto_register");
  if (!hasAutoRegisterColumn) {
    await knex.schema.table("chats", (table) => {
      table.integer("auto_register").defaultTo(1);
    });
  }
};

export const down = async (knex) => {
  const hasAutoRegisterColumn = await knex.schema.hasColumn("chats", "auto_register");
  if (hasAutoRegisterColumn) {
    await knex.schema.table("chats", (table) => {
      table.dropColumn("auto_register");
    });
  }
};
