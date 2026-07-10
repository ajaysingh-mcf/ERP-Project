import { NextResponse } from "next/server"
import { z } from "zod"
import { query, execute } from "@/lib/db"
import { permissions } from "@/lib/queries/permissions"
import { withGateway } from "@/lib/gateway/with-gateway"

const upsertPagePermissionSchema = z.object({
  role: z.string().trim().min(1),
  page_slug: z.string().trim().min(1),
  access_level: z.enum(["none", "viewer", "editor"]),
})

export const GET = withGateway({
  access: { pageSlug: "/settings", level: "editor" },
  handler: async () => {
    const rows = await query(permissions.selectPagePermissions)
    return NextResponse.json(rows)
  },
})

export const POST = withGateway({
  schema: upsertPagePermissionSchema,
  access: { pageSlug: "/settings", level: "editor" },
  handler: async ({ body }) => {
    const { role, page_slug, access_level } = body
    await execute(permissions.upsertPagePermission, [role, page_slug, access_level])
    const rows = await query(permissions.selectPagePermissionByRoleAndPage, [role, page_slug])
    return NextResponse.json(rows[0])
  },
})
