import { z } from "zod"

export const poBulkCsvSchema = z.object({
  action: z.literal("bulk_csv"),
  key: z.string().trim().min(1),
  filename: z.string().trim().min(1),
})

// No `action` field on the default create path — the client never sends one.
// (Unlike Zod v3, `z.undefined()` in v4 rejects a missing key outright, so the
// field is simply omitted here — an incoming "bulk_csv" body still fails this
// schema on its other required fields and falls through to poBulkCsvSchema.)
export const poCreateSchema = z
  .object({
    mfg_id: z.union([z.number(), z.string()]).refine((v) => String(v).trim().length > 0, {
      message: "Manufacturer is required.",
    }),
    sku_code: z.string().trim().min(1, "SKU is required."),
    qty: z.union([z.number(), z.string()]),
    expected_on: z.string().trim().optional().nullable(),
    destination: z.string().trim().optional().nullable(),
    reason: z.string().trim().optional().nullable(),
    po_type: z.enum(["normal", "impromptu"]).optional().default("impromptu"),
  })
  .refine((v) => Number(v.qty) > 0, {
    message: "Quantity must be greater than 0.",
    path: ["qty"],
  })

export const poActionSchema = z.union([poBulkCsvSchema, poCreateSchema])

export type PoBulkCsv = z.infer<typeof poBulkCsvSchema>
export type PoCreate = z.infer<typeof poCreateSchema>
