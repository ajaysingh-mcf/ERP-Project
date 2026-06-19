import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { query, execute } from "@/lib/db"
import { permissions } from "@/lib/queries/permissions"

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.roles?.includes("developer")) return null
  return session
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const userId = req.nextUrl.searchParams.get("user_id")
  const rows = userId
    ? await query(permissions.selectUserPagePermissionsByUserId, [parseInt(userId)])
    : await query(permissions.selectUserPagePermissions)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { user_id, page_slug, access_level } = await req.json()
  if (!user_id || !page_slug || !access_level) {
    return NextResponse.json({ error: "user_id, page_slug and access_level are required" }, { status: 400 })
  }
  try {
    await execute(permissions.upsertUserPagePermission, [user_id, page_slug, access_level])
    const rows = await query(permissions.selectUserPagePermissionByUserAndPage, [user_id, page_slug])
    return NextResponse.json(rows[0])
  } catch (error) {
    console.error("Error upserting user_page_permissions:", error)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { user_id, page_slug } = await req.json()
  await execute(permissions.deleteUserPagePermission, [user_id, page_slug])
  return NextResponse.json({ ok: true })
}
