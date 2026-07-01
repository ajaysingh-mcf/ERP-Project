import { z } from "zod"

// Route param shared by /api/purchase-orders/[id]/* endpoints.
export const poIdParamSchema = z.object({
  id: z.coerce.number().int().positive("Invalid PO id"),
})

export const poSplitRowSchema = z.object({
  mfg_id: z.coerce.number().int().positive("Each split row must have a manufacturer selected."),
  destination: z.string().trim().optional().nullable(),
  qty: z.coerce.number().positive("Each split must have a quantity greater than 0."),
})

export const poSplitSchema = z.object({
  splits: z.array(poSplitRowSchema).min(2, "At least 2 split rows are required."),
})

export type PoIdParam = z.infer<typeof poIdParamSchema>
export type PoSplit = z.infer<typeof poSplitSchema>
