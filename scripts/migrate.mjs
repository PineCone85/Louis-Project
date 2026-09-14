/**
 * Applies pending SQL migrations from ./drizzle to the database in DATABASE_URL.
 * Runs as part of `npm run build` so that Vercel deployments migrate
 * automatically. Skips with a warning when DATABASE_URL is not set so that
 * builds without a database (for example a preview without secrets) still work.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("[migrate] DATABASE_URL is not set; skipping database migrations.");
  process.exit(0);
}

const pool = new Pool({ connectionString: url, max: 1 });
const db = drizzle(pool);

try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] Database is up to date.");
} catch (error) {
  console.error("[migrate] Migration failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
