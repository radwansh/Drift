import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, email, status, zoho_lead_id, trial_link, created_at FROM trial_requests ORDER BY created_at DESC`;
console.log(JSON.stringify(rows, null, 2));
