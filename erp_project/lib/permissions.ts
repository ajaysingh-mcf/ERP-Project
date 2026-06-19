import { query } from "@/lib/db"
import { permissions as permissionsSql } from "@/lib/queries/permissions"

export type AccessLevel = "none" | "viewer" | "editor"

const ACCESS_RANK: Record<AccessLevel, number> = {
  none: 0,
  viewer: 1,
  editor: 2,
}

function bestAccess(levels: AccessLevel[]): AccessLevel {
  if (levels.length === 0) return "none"
  return levels.reduce((best, current) =>
    ACCESS_RANK[current] > ACCESS_RANK[best] ? current : best
  , "none")
}

export async function resolveAccess(
  userId: number,
  roles: string[],
  pageSlug: string
): Promise<AccessLevel> {
  const overrides = await query<{ access_level: string }>(
    permissionsSql.selectUserPagePermissionByUserAndPage,
    [userId, pageSlug]
  )
  if (overrides[0]) return overrides[0].access_level as AccessLevel

  if (roles.length === 0) return "none"
  const placeholders = roles.map(() => "?").join(", ")
  const rolePerms = await query<{ access_level: string }>(
    `SELECT access_level FROM page_permissions WHERE role IN (${placeholders}) AND page_slug = ?`,
    [...roles, pageSlug]
  )
  return bestAccess(rolePerms.map((p) => p.access_level as AccessLevel))
}
