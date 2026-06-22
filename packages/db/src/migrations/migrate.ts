import { db } from "../client";

async function main() {
  console.log("Running migrations...");
  await db.execute(
    `CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  );
  const { sql } = await import("drizzle-orm");
  const { migrate } = await import("drizzle-orm/neon-http/migrator");
  await migrate(db, { migrationsFolder: "./src/migrations" });
  console.log("Migrations complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
