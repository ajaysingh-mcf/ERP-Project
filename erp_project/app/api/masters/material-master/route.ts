import { NextResponse } from "next/server"
import { query, pool } from "@/lib/db"
import { rawMaterials } from "@/lib/queries/raw-materials"
import { packingMaterials as PMMaterials } from "@/lib/queries/packing-materials"
import { approvalsSql } from "@/lib/queries/approvals"
import logger from "@/lib/logger"
import { recordRawEvent, recordFailedEvent, recordProcessedEvent } from "@/lib/events"
import { withGateway } from "@/lib/gateway/with-gateway"
import { ApiError } from "@/lib/gateway/errors"
import { materialMasterCreateSchema, materialMasterUpdateSchema } from "@/lib/validation/material-master"

// ─── POST: create a base material record (no vendor / manufacturer rates) ────
// Body: { action: "create", material: "rm" | "pm", ...fields }
// Auth + body validation handled by withGateway (see lib/gateway/with-gateway.ts).

export const POST = withGateway({
  schema: materialMasterCreateSchema,
  handler: async ({ body, session, ctx }) => {
    const userId = Number(session.user.id)

    if (body.material === "rm") {
      const name = body.name.trim()
      const make = body.make.trim()
      const inci_name = body.inci_name.trim()
      const { type, uom, hsn_code } = body

      const eventId = `rm-create-${Date.now()}`
      const logCtx = { ...ctx, eventId, module: "RM_CREATE" }
      logger.info({ ...logCtx, name, make, inci_name, message: "Raw material create started" })
      recordRawEvent("RM_CREATE", eventId, { name, make, inci_name })
      const dupRows = await query<{ id: number }>(rawMaterials.checkDuplicate, [name, make, inci_name])

      if (dupRows.length > 0) {
        logger.warn({ ...logCtx, name, make, inci_name, message: "Duplicate raw material found" })
        throw new ApiError(409, "duplicate", "A raw material with this code already exists.")
      }
      const conn = await pool.getConnection()
      await conn.beginTransaction()
      try {
        const [rmResult] = await conn.execute(rawMaterials.insert, [
          null,
          name,
          make,
          type?.trim() || null,
          uom?.trim() || null,
          "in_review",
          hsn_code?.trim() || null,
          inci_name,
        ])
        const rmId = (rmResult as any).insertId
        const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_MAT", rmId])
        const approvalId = (ar as any).insertId
        const newFields: [string, string][] = [
          ["name", name],
          ["make", make],
          ["inci_name", inci_name],
          ["type", type?.trim() || ""],
          ["uom", uom?.trim() || ""],
          ["hsn_code", hsn_code?.trim() || ""],
        ]
        for (const [field, newVal] of newFields) {
          if (newVal) {
            await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, "", newVal])
          }
        }
        await conn.commit()
        recordProcessedEvent("RM_CREATE", eventId, { rmId, approvalId })
        logger.info({ ...logCtx, rmId, approvalId, message: "Raw material created successfully" })
        return NextResponse.json({ ok: true, approval_id: approvalId })
      } catch (err: any) {
        await conn.rollback()
        recordFailedEvent("RM_CREATE", eventId, { name }, err.message)
        logger.error({ ...logCtx, err: err.message, stack: err.stack, message: "Raw material create failed" })
        throw new ApiError(500, "internal", "Database error: " + err.message)
      } finally {
        conn.release()
      }
    }

    // material === "pm"
    if(body.material === "pm") {
      const name = body.name.trim()
      const type = body.type.trim()
      const { uom, hsn_code } = body

      const eventId = `pm-create-${Date.now()}`
      const logCtx = { ...ctx, eventId, module: "PM_CREATE" }

      logger.info({ ...logCtx, name, type, message: "Packing material create started" })
      recordRawEvent("PM_CREATE", eventId, { name, type })

      const dupRows = await query<{ id: number }>(PMMaterials.checkDuplicate, [name, type])

      if (dupRows.length > 0) {
        logger.warn({ ...logCtx, name, type, message: "Duplicate packing material found" })
        throw new ApiError(409, "duplicate", "A packing material with this code already exists.")
      }

      const conn = await pool.getConnection()
      await conn.beginTransaction()

      try {
        const [pmResult] = await conn.execute(PMMaterials.insert, [
          null,
          name,
          type,
          hsn_code?.trim() || null,
          uom?.trim() || null,
          "in_review",
        ])

        const pmId = (pmResult as any).insertId

        const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "PM_MAT", pmId])

        const approvalId = (ar as any).insertId

        const newFields: [string, string][] = [
          ["name", name],
          ["type", type],
          ["uom", uom?.trim() || ""],
          ["hsn_code", hsn_code?.trim() || ""],
        ]

        for (const [field, newVal] of newFields) {
          if (newVal) {
            await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, "", newVal])
          }
        }

        await conn.commit()
        recordProcessedEvent("PM_CREATE", eventId, { pmId, approvalId })
        logger.info({ ...logCtx, pmId, approvalId, message: "Packing material created successfully" })

        return NextResponse.json({ ok: true, approval_id: approvalId })
      } catch (err: any) {
        await conn.rollback()
        recordFailedEvent("PM_CREATE", eventId, { name, type }, err.message)
        logger.error({ ...logCtx, err: err.message, stack: err.stack, message: "Packing material create failed" })
        throw new ApiError(500, "internal", "Database error: " + err.message)
      } finally {
        conn.release()
      }
    }

    return NextResponse.json({ error: "Invalid material type" }, { status: 400 })
  },
})

// ─── PUT: submit an edit for approval ────────────────────────────────────────
//
// Instead of writing directly to the DB, this creates an approval record with
// a field-level diff and locks the row to "in_review". The approver then
// applies or rejects the change via POST /api/approvals/[id].

export const PUT = withGateway({
  schema: materialMasterUpdateSchema,
  handler: async ({ body, session, ctx }) => {
    const userId = Number(session.user.id)
    const { id } = body

    if (body.material === "rm") {
      const name = body.name.trim()
      const make = body.make.trim()
      const inci_name = body.inci_name.trim()
      const { type, uom, status, hsn_code } = body

      const eventId = `rm-update-${Date.now()}`
      const logCtx = { ...ctx, eventId, module: "RM_UPDATE" }
      logger.info({ ...logCtx, id, name, make, inci_name, message: "Raw material update started" })
      const curRows = await query<any>(rawMaterials.selectBaseById, [id])
      const cur = curRows[0]
      if (!cur) {
        logger.warn({ ...logCtx, id, message: "Raw material not found" })
        throw new ApiError(404, "not_found", "Record not found.")
      }
      if (cur.status === "in_review") {
        logger.warn({ ...logCtx, id, message: "Raw material already pending approval" })
        throw new ApiError(409, "pending_approval", "This record is already pending approval.")
      }
      // For draft rows, only the original submitter may re-edit.
      if (cur.status === "draft") {
        const rejRows = await query<{ raised_by: number }>(approvalsSql.selectLatestRejection, ["RM_MAT", id])
        if (rejRows[0] && rejRows[0].raised_by !== userId) {
          logger.warn({ ...logCtx, id, userId, message: "Unauthorized draft edit attempt" })
          throw new ApiError(403, "forbidden", "Only the original submitter can re-edit a rejected record.")
        }
      }
      const pending = await query(approvalsSql.hasPending, ["RM_MAT", id])
      if (pending.length > 0) {
        logger.warn({ ...logCtx, id, message: "Approval already pending for raw material" })
        throw new ApiError(409, "pending_approval", "An approval is already pending for this record.")
      }
      recordRawEvent("RM_UPDATE", eventId, { id, name })
      const proposed: Record<string, string | null> = {
        name,
        make,
        inci_name,
        type: type?.trim() || null,
        uom: uom?.trim() || null,
        hsn_code: hsn_code?.trim() || null,
        status: status || "active",
      }
      const diff = Object.entries(proposed).filter(
        ([k, v]) => String(cur[k] ?? "") !== String(v ?? "")
      )
      if (diff.length === 0) {
        logger.warn({ ...logCtx, message: "No changes detected." })
        return NextResponse.json({ ok: true, message: "No changes detected." })
      }
      const conn = await pool.getConnection()
      await conn.beginTransaction()
      try {
        const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "RM_MAT", id])
        const approvalId = (ar as any).insertId
        for (const [field, newVal] of diff) {
          await conn.execute(approvalsSql.insertApprovalItem, [approvalId, field, String(cur[field] ?? ""), String(newVal ?? "")])
        }
        await conn.execute(rawMaterials.setBaseStatus, ["in_review", id])
        await conn.commit()
        recordProcessedEvent("RM_UPDATE", eventId, { id, approvalId })
        logger.info({ ...logCtx, id, approvalId, message: "Raw material update submitted for approval" })
        return NextResponse.json({ ok: true, approval_id: approvalId })
      } catch (err: any) {
        await conn.rollback()
        recordFailedEvent("RM_UPDATE", eventId, { id, name }, err.message)
        logger.error({ ...logCtx, id, err: err.message, stack: err.stack, message: "Raw material update failed" })
        throw new ApiError(500, "internal", "Database error: " + err.message)
      } finally {
        conn.release()
      }
    }

    // material === "pm"
    if (body.material === "pm") {
      const name = body.name.trim()
      const type = body.type.trim()
      const { uom, status, hsn_code } = body

      const eventId = `pm-update-${Date.now()}`
      const logCtx = { ...ctx, eventId, module: "PM_UPDATE" }
      logger.info({ ...logCtx, id, name, type, message: "Packing material update started" })
      const curRows = await query<any>(PMMaterials.selectBaseById, [id])
      const cur = curRows[0]
      if (!cur) {
        logger.warn({ ...logCtx, id, message: "Packing material not found" })
        throw new ApiError(404, "not_found", "Record not found.")
      }
      if (cur.status === "in_review") {
        logger.warn({ ...logCtx, id, message: "Packing material already pending approval" })
        throw new ApiError(409, "pending_approval", "This record is already pending approval.")
      }
      if (cur.status === "draft") {
        const rejRows = await query<{ raised_by: number }>(approvalsSql.selectLatestRejection, ["PM_MAT", id])
        logger.info({ ...logCtx, id, userId, message: "Draft saved in approval table." })
        if (rejRows[0] && rejRows[0].raised_by !== userId) {
          logger.warn({ ...logCtx, id, userId, message: "Unauthorized draft edit attempt" })
          throw new ApiError(403, "forbidden", "Only the original submitter can re-edit a rejected record.")
        }
      }
      const pending = await query(approvalsSql.hasPending, ["PM_MAT", id])
      if (pending.length > 0) {
        logger.warn({ ...logCtx, id, message: "Approval already pending for packing material" })
        throw new ApiError(409, "pending_approval", "An approval is already pending for this record.")
      }
      recordRawEvent("PM_UPDATE", eventId, { id, name, type })
      const proposed: Record<string, string | null> = {
        name,
        type,
        uom: uom?.trim() || null,
        hsn_code: hsn_code?.trim() || null,
        status: status || "active",
      }
      const diff = Object.entries(proposed).filter(
        ([k, v]) => String(cur[k] ?? "") !== String(v ?? "")
      )
      if (diff.length === 0) {
        logger.warn({ ...logCtx, id, userId, message: "No changes detected." })
        return NextResponse.json({ ok: true, message: "No changes detected." })
      }

      const conn = await pool.getConnection()
      await conn.beginTransaction()

      try {
        const [ar] = await conn.execute(approvalsSql.insertApproval, [userId, "PM_MAT", id])
        const approvalId = (ar as any).insertId
        for (const [field, newVal] of diff) {
          await conn.execute(approvalsSql.insertApprovalItem, [
            approvalId,
            field,
            String(cur[field] ?? ""),
            String(newVal ?? ""),
          ])
        }
        await conn.execute(PMMaterials.setBaseStatus, ["in_review", id])
        await conn.commit()
        recordProcessedEvent("PM_UPDATE", eventId, { id, approvalId })
        logger.info({ ...logCtx, id, approvalId, message: "Packing material update submitted for approval" })
        return NextResponse.json({ ok: true, approval_id: approvalId })
      } catch (err: any) {
        await conn.rollback()
        recordFailedEvent("PM_UPDATE", eventId, { id, name, type }, err.message)
        logger.error({ ...logCtx, id, err: err.message, stack: err.stack, message: "Packing material update failed" })
        throw new ApiError(500, "internal", "Database error: " + err.message)
      } finally {
        conn.release()
      }
    }

    return NextResponse.json({ ok: false, message: "Invalid material type." }, { status: 400 })
  }
})
