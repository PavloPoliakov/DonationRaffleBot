import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import knex from "knex";

const ensureDirectory = async (filePath) => {
  const dir = path.dirname(path.resolve(filePath));
  await fs.mkdir(dir, { recursive: true });
};

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations"
);

const buildKnexConfig = ({ dbPath, databaseUrl }) => {
  if (databaseUrl) {
    return {
      client: "pg",
      connection: databaseUrl,
      migrations: {
        directory: migrationsDir
      }
    };
  }

  return {
    client: "better-sqlite3",
    connection: {
      filename: path.resolve(dbPath)
    },
    useNullAsDefault: true,
    migrations: {
      directory: migrationsDir
    }
  };
};

export const runMigrations = async ({ dbPath, databaseUrl }) => {
  if (!databaseUrl) {
    await ensureDirectory(dbPath);
  }

  const db = knex(buildKnexConfig({ dbPath, databaseUrl }));

  try {
    await db.migrate.latest();
  } finally {
    await db.destroy();
  }
};
