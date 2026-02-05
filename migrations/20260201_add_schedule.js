export const up = async (knex) => {
  const hasScheduleColumn = await knex.schema.hasColumn("chats", "raffle_schedule");
  if (!hasScheduleColumn) {
    await knex.schema.table("chats", (table) => {
      table.text("raffle_schedule");
    });
  }

  const hasTimezoneColumn = await knex.schema.hasColumn("chats", "schedule_timezone");
  if (!hasTimezoneColumn) {
    await knex.schema.table("chats", (table) => {
      table.text("schedule_timezone");
    });
  }

  const hasLastRunColumn = await knex.schema.hasColumn("chats", "schedule_last_run_key");
  if (!hasLastRunColumn) {
    await knex.schema.table("chats", (table) => {
      table.text("schedule_last_run_key");
    });
  }
};

export const down = async (knex) => {
  const hasScheduleColumn = await knex.schema.hasColumn("chats", "raffle_schedule");
  if (hasScheduleColumn) {
    await knex.schema.table("chats", (table) => {
      table.dropColumn("raffle_schedule");
    });
  }

  const hasTimezoneColumn = await knex.schema.hasColumn("chats", "schedule_timezone");
  if (hasTimezoneColumn) {
    await knex.schema.table("chats", (table) => {
      table.dropColumn("schedule_timezone");
    });
  }

  const hasLastRunColumn = await knex.schema.hasColumn("chats", "schedule_last_run_key");
  if (hasLastRunColumn) {
    await knex.schema.table("chats", (table) => {
      table.dropColumn("schedule_last_run_key");
    });
  }
};
