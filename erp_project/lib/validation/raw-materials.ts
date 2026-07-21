import { z } from "zod"

// RM/PM rate objects are loosely typed on purpose — the numeric-ish fields
// (curr_rate, moq, mfg_id, vendor_id, ...) arrive as either strings or
// numbers from different callers, and rm-handler.ts already does its own
// Number()/trim() coercion and business-rule validation (required fields,
// duplicate checks, etc.). This schema's job is a structural safety net
// (catch garbage types early) — not to replace those existing checks or
// their error messages.
const numericish = z.union([z.string(), z.number()])
const looseRecord = z.record(z.string(), z.unknown())
const looseArray = z.array(looseRecord)

const rmRateFields = {
  vendor_id: numericish.optional(),
  vendor_code: z.string().optional(),
  mfg_id: numericish.optional(),
  mfg_code: z.string().optional(),
  curr_rate: numericish.optional(),
  moq: numericish.optional(),
  rate_uom: z.string().optional(),
  effective_from: z.string().optional(),
  effective_to: z.string().nullable().optional(),
  approved_vendor_id: numericish.optional(),
  approved_vendor_code: z.string().optional(),
}

export const rmCreateSchema = z.object({
  action: z.literal("create"),
  rm_code: z.string().optional(),
  name: z.string().optional(),
  make: z.string().optional(),
  type: z.string().optional(),
  uom: z.string().optional(),
  hsn_code: z.string().optional(),
  inci_name: z.string().optional(),
  ...rmRateFields,
}).passthrough()

export const rmCheckDuplicateSchema = z.object({
  action: z.literal("check-RM"),
  name: z.string().optional(),
  make: z.string().optional(),
  inci_name: z.string().optional(),
}).passthrough()

export const rmCheckVendorSchema = z.object({
  action: z.literal("check-vendor"),
  name: z.string().optional(),
  make: z.string().optional(),
  inci_name: z.string().optional(),
  vendor_id: numericish.optional(),
}).passthrough()

export const rmCreateFullSchema = z.object({
  action: z.literal("create-full"),
  rm: looseRecord.optional(),
  vendors: looseArray.optional(),
  manufacturers: looseArray.optional(),
}).passthrough()

export const rmAddRatesSchema = z.object({
  action: z.literal("add-rates"),
  rm_id: numericish.optional(),
  name: z.string().optional(),
  make: z.string().optional(),
  inci_name: z.string().optional(),
  vendors: looseArray.optional(),
  manufacturers: looseArray.optional(),
}).passthrough()

export const rmBulkSchema = z.object({
  action: z.literal("bulk"),
  rows: looseArray.optional(),
}).passthrough()

export const rmBulkFromS3Schema = z.object({
  action: z.literal("bulk_from_s3"),
  key: z.string().optional(),
}).passthrough()

export const rmCheckMakeFuzzySchema = z.object({
  action: z.literal("check-make-fuzzy"),
  name: z.string().optional(),
  type: z.string().optional(),
  make: z.string().optional(),
}).passthrough()

export const rmCheckDuplicatesBulkSchema = z.object({
  action: z.literal("check_duplicates"),
  rows: looseArray.optional(),
}).passthrough()

export const rmGetMakesSchema = z.object({
  action: z.literal("get-makes"),
}).passthrough()

export const rmGetMaterialsSchema = z.object({
  action: z.literal("get-materials"),
}).passthrough()

export const rmGetInciNamesSchema = z.object({
  action: z.literal("get-inci-names"),
}).passthrough()

export const rmMaterialImpactSchema = z.object({
  action: z.literal("material-impact"),
  rm_id: numericish.optional(),
  scope: z.enum(["vendor", "mfg"]).optional(),
  mfg_id: numericish.optional(),
}).passthrough()

export const rmActionSchema = z.discriminatedUnion("action", [
  rmCreateSchema,
  rmCheckDuplicateSchema,
  rmCheckVendorSchema,
  rmCreateFullSchema,
  rmAddRatesSchema,
  rmBulkSchema,
  rmBulkFromS3Schema,
  rmCheckMakeFuzzySchema,
  rmCheckDuplicatesBulkSchema,
  rmGetMakesSchema,
  rmGetMaterialsSchema,
  rmGetInciNamesSchema,
  rmMaterialImpactSchema,
])

export type RmAction = z.infer<typeof rmActionSchema>
