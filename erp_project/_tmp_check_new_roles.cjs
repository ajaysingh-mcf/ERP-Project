require("dotenv").config()
const mysql = require("mysql2/promise")

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL)

  const [permRows] = await conn.execute(
    `SELECT role, page_slug, access_level FROM page_permissions WHERE role IN ('production executive', 'cost creator') ORDER BY role, page_slug`
  )
  console.log("page_permissions for new roles:")
  console.log(JSON.stringify(permRows, null, 2))

  const [userRows] = await conn.execute(
    `SELECT id, name, email FROM users WHERE email = ?`,
    ["ajay.singh@mcaffeine.com"]
  )
  console.log("\nYour user:", userRows[0])

  const [myRoles] = await conn.execute(
    `SELECT role FROM user_roles WHERE user_id = ?`,
    [userRows[0]?.id]
  )
  console.log("Your current roles:", myRoles.map(r => r.role))

  const [allRoles] = await conn.execute(
    `SELECT DISTINCT role FROM page_permissions ORDER BY role`
  )
  console.log("\nAll roles known to page_permissions:", allRoles.map(r => r.role))

  await conn.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
