import { z } from "zod"

// Shared banking/tax field formats, used by both Manufacturer and Vendor
// master validation schemas (lib/validation/manufacturers.ts, vendors.ts).

/** Standard 15-char GSTIN: 2-digit state code + 10-char PAN + 1-digit entity
 *  number + 'Z' + 1 checksum char. e.g. 27AAEPM1234C1Z5
 *  The PAN's 4th char is constrained to the real entity-type codes (not any
 *  letter) and the state code is constrained to the valid 01-38 range —
 *  both catch typos a bare `[A-Z]`/`[0-9]{2}` pattern would let through. */
export const GST_REGEX = /^(0[1-9]|[12][0-9]|3[0-8])[A-Z]{3}[CPHFATBLJG][A-Z][0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

/** Standard 11-char IFSC: 4-letter bank code + '0' + 6-char branch code. */
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/

/** Bank account numbers are 9–18 digits across Indian banks. */
export const ACCOUNT_NUMBER_REGEX = /^[0-9]{9,18}$/

/** Standard email shape — deliberately loose, just catches obvious typos. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const gstNumberField = z.string().trim().toUpperCase().optional()
  .refine((v) => !v || GST_REGEX.test(v), {
    message: "Invalid GST number — expected format like 27AAEPM1234C1Z5",
  })

export const ifscNumberField = z.string().trim().toUpperCase().optional()
  .refine((v) => !v || IFSC_REGEX.test(v), {
    message: "Invalid IFSC code — expected format like HDFC0001234",
  })

export const accountNumberField = z.string().trim().optional()
  .refine((v) => !v || ACCOUNT_NUMBER_REGEX.test(v), {
    message: "Invalid account number — expected 9 to 18 digits",
  })

export const emailField = z.string().trim().optional()
  .refine((v) => !v || EMAIL_REGEX.test(v), {
    message: "Invalid email address",
  })
