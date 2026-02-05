import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlitePath = process.env.SQLITE_PATH || "./data/registry.sqlite";

export default {
  client: "better-sqlite3",
  connection: {
    filename: path.resolve(sqlitePath)
  },
  useNullAsDefault: true,
  migrations: {
    directory: path.join(__dirname, "migrations")
  }
};
