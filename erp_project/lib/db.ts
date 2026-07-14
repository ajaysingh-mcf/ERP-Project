import mysql from "mysql2/promise";
import { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_POOL_SIZE, NODE_ENV } from "@/lib/env";

const globalForPool = globalThis as unknown as { dbPool?: mysql.Pool };

export const pool =
  globalForPool.dbPool ??
  mysql.createPool({
    host:     DB_HOST,
    port:     DB_PORT,
    user:     DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    connectionLimit: DB_POOL_SIZE,
    waitForConnections: true,
    queueLimit: 0,
    ssl: { rejectUnauthorized: false },
    // The RDS session/global time_zone is UTC (confirmed via `SELECT
    // @@session.time_zone`), but mysql2's default `timezone: 'local'` parses
    // DATETIME columns using the Node process's OS timezone (IST in prod/dev
    // here). That mismatch made every DATETIME/TIMESTAMP value round-trip
    // through toLocaleString() as if it were already IST, displaying raw UTC
    // digits as if they were local time (5.5h behind real IST). Pinning this
    // to UTC makes mysql2 parse the raw value correctly, producing a Date
    // object with the true UTC instant — the process's local formatting then
    // converts it to IST correctly.
    timezone: "+00:00",
    // Keep TCP connections alive so the DB server doesn't drop idle pool
    // connections after its wait_timeout, which causes ECONNRESET.
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 10000,
  });

if (NODE_ENV !== "production") {
  globalForPool.dbPool = pool;
}

// Retry once on fatal connection errors (ECONNRESET, PROTOCOL_CONNECTION_LOST).
// The first call hits a dead pooled connection; the pool removes it and the
// retry gets a fresh one.
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (err.fatal || err.code === "ECONNRESET" || err.code === "PROTOCOL_CONNECTION_LOST") {
      return fn();
    }
    throw err;
  }
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  return withRetry(async () => {
    // pool.query uses client-side parameter interpolation (text protocol).
    // pool.execute (server-side prepared statements) rejects null params in
    // MariaDB when used with the `? IS NULL` pattern (ER_WRONG_ARGUMENTS).
    // All paginated queries pass null to short-circuit WHERE clauses, so
    // pool.query is required here. DML statements (INSERT/UPDATE/DELETE) keep
    // pool.execute via the separate execute() function below.
    const [rows] = await pool.query(sql, params);
    return rows as T[];
  });
}

export async function execute(
  sql: string,
  params?: any[]
): Promise<mysql.ResultSetHeader> {
  return withRetry(async () => {
    const [result] = await pool.execute(sql, params);
    return result as mysql.ResultSetHeader;
  });
}
