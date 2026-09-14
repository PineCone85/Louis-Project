import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

/**
 * The pool is created lazily on first use and cached on the global object so
 * that hot reloads in development and warm serverless invocations reuse
 * connections instead of exhausting the database's connection limit. Lazy
 * creation also lets pure modules be imported (for tests and tooling) without
 * a configured database.
 */
declare global {
  var __foyerDb: Database | undefined;
}

function createDatabase(): Database {
  const pool = new Pool({
    connectionString: env.databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return drizzle(pool, { schema });
}

function getDatabase(): Database {
  if (!globalThis.__foyerDb) globalThis.__foyerDb = createDatabase();
  return globalThis.__foyerDb;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, property, receiver) {
    const instance = getDatabase();
    const value = Reflect.get(instance, property, receiver === undefined ? instance : instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export { schema };
