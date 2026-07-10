import { z } from "zod"

export const entityEmailCreateSchema = z.object({
  entity_type: z.enum(["vendor", "mfg"]),
  entity_code: z.string().trim().min(1),
  emails: z.array(z.object({
    email: z.string().trim().email(),
    purpose: z.string().trim().optional(),
  })).min(1),
})
