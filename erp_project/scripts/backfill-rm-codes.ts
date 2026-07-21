import 'dotenv/config'
import { query, execute, pool } from "../lib/db"

// One-off backfill: fixes RM codes generated before toRmParams passed
// name/make into generateMaterialCode, which produced "RM---0198" (empty
// name/make segments). Keeps the existing serial, only rebuilds the
// name/make segments from the row's current name/make.

function buildCode(name: string, make: string | null, serial: string): string {
  const namePart = (name ?? "").replace(/[^a-zA-Z]/g, "").slice(0, 4).toUpperCase()
  const makePart = (make ?? "").replace(/[^a-zA-Z]/g, "").slice(0, 4).toUpperCase()
  return `RM-${namePart}-${makePart}-${serial}`
}

async function main() {
  const broken = await query<{ id: number; rm_code: string; name: string; make: string | null }>(
    `SELECT id, rm_code, name, make FROM master_rm WHERE rm_code LIKE 'RM---%'`
  )

  if (broken.length === 0) {
    console.log("No broken RM codes found.")
    return
  }

  console.log(`Found ${broken.length} broken RM code(s).`)
  for (const row of broken) {
    const match = row.rm_code.match(/^RM---(\d+)$/)
    if (!match) {
      console.warn(`Skipping ${row.rm_code} (id ${row.id}) — unexpected format`)
      continue
    }
    const newCode = buildCode(row.name, row.make, match[1])
    await execute(`UPDATE master_rm SET rm_code = ? WHERE id = ?`, [newCode, row.id])
    console.log(`id ${row.id}: ${row.rm_code} -> ${newCode}`)
  }
}

main()
  .catch((e) => { console.error("FAILED:", e.message); process.exit(1) })
  .finally(() => pool.end())
