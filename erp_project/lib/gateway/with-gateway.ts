import { NextRequest, NextResponse } from "next/server"
import type { Session } from "next-auth"
import type { z } from "zod"
import { auth } from "@/lib/auth"
import { resolveAccess, type AccessLevel } from "@/lib/permissions"
import { createRequestContext } from "@/lib/request-context"
import logger from "@/lib/logger"
import { ApiError, toErrorResponse } from "./errors"

type AccessRule = { pageSlug: string; level: Exclude<AccessLevel, "none"> }

export function withGateway<TBody = unknown, TParams = Record<string, string>>(opts: {
  schema?: z.ZodType<TBody>
  paramsSchema?: z.ZodType<TParams>
  access?: AccessRule
  handler: (args: {
    req: NextRequest
    body: TBody
    params: TParams
    session: Session
    ctx: ReturnType<typeof createRequestContext>
  }) => Promise<Response>
}) {
  return async (req: NextRequest, routeCtx?: { params: Promise<Record<string, string>> }) => {
    const started = Date.now()
    const ctx = createRequestContext(req)

    try {
      const session = await auth()
      if (!session) throw new ApiError(401, "unauthorized", "Unauthorized")
      ctx.userId = Number(session.user.id)

      if (opts.access) {
        const roles = session.user.roles ?? []
        const level = await resolveAccess(ctx.userId, roles, opts.access.pageSlug)
        const ok = opts.access.level === "viewer" ? level !== "none" : level === "editor"
        if (!ok) throw new ApiError(403, "forbidden", "Insufficient access")
      }

      let params = {} as TParams
      if (opts.paramsSchema) {
        const rawParams = routeCtx?.params ? await routeCtx.params : {}
        const parsed = opts.paramsSchema.safeParse(rawParams)
        if (!parsed.success) {
          throw new ApiError(400, "validation_error", "Invalid route parameters", parsed.error.flatten())
        }
        params = parsed.data
      }

      let body = {} as TBody
      if (opts.schema) {
        const json = await req.json().catch(() => ({}))
        const parsed = opts.schema.safeParse(json)
        if (!parsed.success) {
          throw new ApiError(400, "validation_error", "Invalid request", parsed.error.flatten())
        }
        body = parsed.data
      }

      const res = await opts.handler({ req, body, params, session, ctx })
      logger.info({ ...ctx, ms: Date.now() - started, ok: true, message: "Request completed" })
      return res
    } catch (err: any) {
      logger.error({ ...ctx, ms: Date.now() - started, ok: false, error: err?.message, code: err?.code, message: "Request failed" })
      return toErrorResponse(err, ctx.requestId)
    }
  }
}
