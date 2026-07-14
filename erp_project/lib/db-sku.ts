import mysql from "mysql2/promise";
import { DB_HOST, DB_PORT, DB_USER_SKU, DB_USER_SKU_PASSWORD, DB_NAME_SKU, DB_POOL_SIZE, NODE_ENV } from "@/lib/env";
import { withRetry } from "@/lib/db";

const globalForSkuPool = globalThis as unknown as { skuDwhPool?: mysql.Pool };

export const skuDwhPool =
  globalForSkuPool.skuDwhPool ??
  mysql.createPool({
    host:     DB_HOST,
    port:     DB_PORT,
    user:     DB_USER_SKU,
    password: DB_USER_SKU_PASSWORD,
    database: DB_NAME_SKU,
    connectionLimit: DB_POOL_SIZE,
    waitForConnections: true,
    queueLimit: 0,
    ssl: { rejectUnauthorized: false },
    timezone: "+00:00",
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 10000,
  });

if (NODE_ENV !== "production") {
  globalForSkuPool.skuDwhPool = skuDwhPool;
}

/** Read-only query helper for the SKU data warehouse (mcaff_dwh). */
export async function queryDwh<T = Record<string, unknown>>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  return withRetry(async () => {
    const [rows] = await skuDwhPool.query(sql, params);
    return rows as T[];
  });
}
