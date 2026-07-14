import mysql from "mysql2/promise";
import "dotenv/config";

async function main() {
  console.log("connecting...");
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME_TEST,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 8000,
  });
  console.log("connected");
  const [roles] = await conn.query("SELECT * FROM user_roles WHERE user_id = 2");
  console.log("roles for ajay:", roles);
  const [allRoles] = await conn.query("SELECT COUNT(*) AS total FROM user_roles");
  console.log("total user_roles rows:", allRoles);
  const [perms] = await conn.query("SELECT COUNT(*) AS total FROM page_permissions");
  console.log("total page_permissions rows:", perms);
  await conn.end();
  console.log("done");
}
main().catch(e => { console.error("FAILED:", e.message); process.exitCode = 1; });
