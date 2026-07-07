import { z } from "zod"

export const mfgLineStatusSchema = z.enum(["active", "on_hold", "tech_transfer"])

export const createMfgLineSchema = z.object({
  action: z.literal("create"),
  bom_id: z.coerce.number().int().positive(),
  mfg_id: z.coerce.number().int().positive(),
  status: mfgLineStatusSchema,
  effective_from: z.string().trim().min(1, "effective_from is required"),
  monthly_capacity: z.coerce.number().int().nonnegative().nullable().optional(),
  this_month_plan: z.coerce.number().int().nonnegative().nullable().optional(),
  last_batch_date: z.string().trim().nullable().optional(),
  remarks: z.string().trim().max(255).nullable().optional(),
})

export const updateMfgLineSchema = z.object({
  action: z.literal("update"),
  id: z.coerce.number().int().positive(),
  status: mfgLineStatusSchema,
  monthly_capacity: z.coerce.number().int().nonnegative().nullable().optional(),
  this_month_plan: z.coerce.number().int().nonnegative().nullable().optional(),
  last_batch_date: z.string().trim().nullable().optional(),
  remarks: z.string().trim().max(255).nullable().optional(),
})

export const mfgLineActionSchema = z.discriminatedUnion("action", [
  createMfgLineSchema,
  updateMfgLineSchema,
])

export type CreateMfgLine = z.infer<typeof createMfgLineSchema>
export type UpdateMfgLine = z.infer<typeof updateMfgLineSchema>
export type MfgLineAction = z.infer<typeof mfgLineActionSchema>
