import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { pool, query } from "@/lib/db"
import { bom } from "@/lib/queries/bom_master"
import { bomType } from "@/types/masters" 
function toParams(r: any) {
  return {
    bom: [
      r.bom_code?.trim(),
      r.sku_code?.trim(),
      parseInt(r.mfg_id),
      r.status || "draft",
    ],
    detail: [
      r.mtrl_type?.trim(),
      parseInt(r.mtrl_id),
      parseFloat(r.amount),
      r.uom?.trim() || null,
      r.mtrl_cost ? parseFloat(r.mtrl_cost) : null,
      r.effective_from || null,
      r.effective_till || null,
    ],
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { action } = body

  if (action === "create") {
    const { bom_code, sku_code, mfg_id, mtrl_type, mtrl_id, amount } = body
    if (!bom_code?.trim() || !sku_code?.trim() || !mfg_id || !mtrl_type?.trim() || !mtrl_id || !amount) {
      return NextResponse.json(
        { error: "bom_code, sku_code, mfg_id, mtrl_type, mtrl_id and amount are required" },
        { status: 400 }
      )
    }
    /* Check if the bom already exixst for the entered bom id and sku code. */
    const exists = await query<bomType>(
      bom.selectByIdBOMId,
      [bom_code , sku_code ]
    );
    if(exists) {
      return NextResponse.json(
        { error: "bom_code and sku_code are already exixts." },
        { status: 400 }
      )
    }
    const conn = await pool.getConnection()
    await conn.beginTransaction()
    try {
      const params = toParams(body)
      const [bomResult] = await conn.execute(bom.insertBom, params.bom)
      const bomId = (bomResult as { insertId: number }).insertId
      await conn.execute(bom.insertBomDetail, [bomId, ...params.detail])
      await conn.commit()
      return NextResponse.json({ id: bomId })
    } catch (err: any) {
      await conn.rollback()
      console.error("BOM create error:", err)
      if (err.code === "ER_NO_REFERENCED_ROW_2") {
        return NextResponse.json({ error: "Invalid sku_code or mfg_id — no matching record found" }, { status: 400 })
      }
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  if (action === "bulk") {
    const { rows } = body
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 })
    }

    const conn = await pool.getConnection()
    await conn.beginTransaction()
    let inserted = 0
    let skipped = 0
    let alredy_exits = 0;

    try {
      for (const row of rows) {
        if (!row.bom_code?.trim() || !row.sku_code?.trim() || !row.mfg_id || !row.mtrl_type?.trim() || !row.mtrl_id || !row.amount) {
          skipped++
          continue
        }
        const exists = await query<bomType>(
          bom.selectByIdBOMId,
          [row.bom_code , row.sku_code ]
        );
        if(exists) {
          alredy_exits++
          continue
        }
        try {
          const params = toParams(row)
          const [bomResult] = await conn.execute(bom.insertBom, params.bom)
          const bomId = (bomResult as { insertId: number }).insertId
          await conn.execute(bom.insertBomDetail, [bomId, ...params.detail])
          inserted++
        } catch (err: any) {
          if (err.code === "ER_DUP_ENTRY") {
            skipped++
          } else {
            throw err
          }
        }
      }
      await conn.commit()
      return NextResponse.json({ inserted, skipped , alredy_exits })
    } catch (err: any) {
      await conn.rollback()
      console.error("BOM bulk insert error:", err)
      return NextResponse.json({ error: "Bulk insert failed: " + err.message }, { status: 500 })
    } finally {
      conn.release()
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
