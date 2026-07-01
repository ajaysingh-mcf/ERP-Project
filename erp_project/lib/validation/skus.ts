import { z } from "zod"

export const skuCreateSchema = z.object({
  action: z.literal("create"),
  sku_code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  brand: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
})

export const skuBulkSchema = z.object({
  action: z.literal("bulk"),
  rows: z.array(z.record(z.string(), z.any())).min(1),
})

export const skuUpdateSchema = z.object({
  action: z.literal("update"),
  id: z.union([z.number(), z.string()]),
  name: z.string().trim().min(1),
  brand: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
})

export const skuBulkFromS3Schema = z.object({
  action: z.literal("bulk_from_s3"),
  key: z.string().trim().min(1),
})

export const skuActionSchema = z.discriminatedUnion("action", [
  skuCreateSchema,
  skuBulkSchema,
  skuUpdateSchema,
  skuBulkFromS3Schema,
])

export type SkuAction = z.infer<typeof skuActionSchema>
