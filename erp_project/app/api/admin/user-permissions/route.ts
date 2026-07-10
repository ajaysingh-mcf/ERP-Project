import { NextResponse } from "next/server"
import { z } from "zod"
import { query, execute } from "@/lib/db"
import { permissions } from "@/lib/queries/permissions"
import { withGateway } from "@/lib/gateway/with-gateway"

const userIdQuerySchema = z.object({
  user_id: z.coerce.number().int().positive().optional(),
})

const upsertUserPagePermissionSchema = z.object({
  user_id: z.union([z.number(), z.string()]),
  page_slug: z.string().trim().min(1),
  access_level: z.enum(["none", "viewer", "editor"]),
})

const deleteUserPagePermissionSchema = z.object({
  user_id: z.union([z.number(), z.string()]),
  page_slug: z.string().trim().min(1),
})

export const GET = withGateway({
  access: { pageSlug: "/settings", level: "editor" },
  handler: async ({ req }) => {
    const parsed = userIdQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    const userId = parsed.success ? parsed.data.user_id : undefined
    const rows = userId
      ? await query(permissions.selectUserPagePermissionsByUserId, [userId])
      : await query(permissions.selectUserPagePermissions)
    return NextResponse.json(rows)
  },
})

export const POST = withGateway({
  schema: upsertUserPagePermissionSchema,
  access: { pageSlug: "/settings", level: "editor" },
  handler: async ({ body }) => {
    const { user_id, page_slug, access_level } = body
    await execute(permissions.upsertUserPagePermission, [user_id, page_slug, access_level])
    const rows = await query(permissions.selectUserPagePermissionByUserAndPage, [user_id, page_slug])
    return NextResponse.json(rows[0])
  },
})

export const DELETE = withGateway({
  schema: deleteUserPagePermissionSchema,
  access: { pageSlug: "/settings", level: "editor" },
  handler: async ({ body }) => {
    const { user_id, page_slug } = body
    await execute(permissions.deleteUserPagePermission, [user_id, page_slug])
    return NextResponse.json({ ok: true })
  },
})
