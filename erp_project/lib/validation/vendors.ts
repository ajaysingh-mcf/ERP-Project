import { z } from "zod"

// `code` is intentionally absent here — it's auto-generated server-side on create.
export const vendorCreateSchema = z.object({
  action: z.literal("create"),
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  location: z.string().optional(),
  zone: z.string().optional(),
  registered_name: z.string().optional(),
})

export const vendorBulkSchema = z.object({
  action: z.literal("bulk"),
  rows: z.array(z.record(z.string(), z.any())).min(1),
})

export const vendorUpdateSchema = z.object({
  action: z.literal("update"),
  vendor_id: z.union([z.number(), z.string()]),
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  location: z.string().optional(),
  zone: z.string().optional(),
  registered_name: z.string().optional(),
  status: z.string().optional(),
})

export const vendorBulkFromS3Schema = z.object({
  action: z.literal("bulk_from_s3"),
  key: z.string().trim().min(1),
})

export const vendorActionSchema = z.discriminatedUnion("action", [
  vendorCreateSchema,
  vendorBulkSchema,
  vendorUpdateSchema,
  vendorBulkFromS3Schema,
])

export type VendorAction = z.infer<typeof vendorActionSchema>
