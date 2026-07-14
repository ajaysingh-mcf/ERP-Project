import mysql from "mysql2/promise";
import "dotenv/config";

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME_TEST,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 20000,
  });
  const [roleCols] = await conn.query("DESCRIBE user_roles");
  console.log("user_roles cols:", roleCols.map(c => c.Field));
  const [roles] = await conn.query("SELECT * FROM user_roles WHERE user_id = 2");
  console.log("roles for ajay:", roles);
  const [allRoles] = await conn.query("SELECT COUNT(*) AS total FROM user_roles");
  console.log("total user_roles rows:", allRoles);
  const [perms] = await conn.query("SELECT COUNT(*) AS total FROM page_permissions");
  console.log("total page_permissions rows:", perms);
  const [sessCols] = await conn.query("DESCRIBE sessions");
  console.log("sessions cols:", sessCols.map(c => c.Field));
  await conn.end();
}
main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
