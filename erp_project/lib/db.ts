import mysql from "mysql2/promise";
const globalForPool = globalThis as unknown as { dbPool?: mysql.Pool };

export const pool =
  globalForPool.dbPool ??
  mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
    ssl: { rejectUnauthorized: false },
    // Keep TCP connections alive so the DB server doesn't drop idle pool
    // connections after its wait_timeout, which causes ECONNRESET.
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 10000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPool.dbPool = pool;
}

// Retry once on fatal connection errors (ECONNRESET, PROTOCOL_CONNECTION_LOST).
// The first call hits a dead pooled connection; the pool removes it and the
// retry gets a fresh one.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
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
