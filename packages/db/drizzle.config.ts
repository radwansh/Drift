import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/saas_salary_compare",
  },
});
