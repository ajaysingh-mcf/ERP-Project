import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { query, execute } from "@/lib/db"
import { permissions } from "@/lib/queries/permissions"

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.roles?.includes("developer")) return null
  return session
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const rows = await query(permissions.selectPagePermissions)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { role, page_slug, access_level } = await req.json()
  if (!role || !page_slug || !access_level) {
    return NextResponse.json({ error: "role, page_slug and access_level are required" }, { status: 400 })
  }
  await execute(permissions.upsertPagePermission, [role, page_slug, access_level])
  const rows = await query(permissions.selectPagePermissionByRoleAndPage, [role, page_slug])
  return NextResponse.json(rows[0])
}