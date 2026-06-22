import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const connectionString = process.env.DATABASE_URL;

function createDbClient() {
  if (!connectionString) {
    console.warn(
      "\n⚠️  DATABASE_URL not configured.\n" +
      "   Set it in C:\\SAAS\\.env or create a free Neon DB at https://neon.tech\n" +
       "   Example: DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/drift?sslmode=require\n"
    );
    return null;
  }

  try {
    const sql = neon(connectionString);
    return drizzle(sql, { schema });
  } catch (err) {
    console.error("Failed to connect to database:", err);
    return null;
  }
}

export const db = createDbClient();
export type DbClient = NonNullable<ReturnType<typeof createDbClient>>;

export function requireDb(): NonNullable<typeof db> {
  if (!db) {
    throw new Error(
      "DATABASE_URL is not configured. " +
      "Set it in your .env file to use this feature.\n" +
      "Get a free Neon PostgreSQL database at https://neon.tech"
    );
  }
  return db;
}
