/**
 * Central environment configuration.
 *
 * Env vars are read here at module load time. On Amplify Hosting Compute the
 * whole app runs as one shared Lambda across all routes, so throwing here
 * would crash cold start for every route -- including ones that never touch
 * the missing var. Instead we warn and fall back to an empty string, so a
 * single misconfigured var only breaks the feature that actually uses it.
 *
 * Usage:
 *   import { DB_HOST, AWS_REGION, GMAIL_USER } from "@/lib/env"
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`[env] Missing environment variable: ${name}`)
    return ""
  }
  return value
}

// ── Database (MariaDB / AWS RDS) ─────────────────────────────────────────────

export const DB_HOST      = required("DB_HOST")
export const DB_PORT      = Number(process.env.DB_PORT ?? 3306)
export const DB_USER      = required("DB_USER")
export const DB_PASSWORD  = required("DB_PASSWORD")
export const DB_NAME      = required("DB_NAME")
export const DB_POOL_SIZE = Number(process.env.DB_POOL_SIZE ?? 10)

// ── AWS S3 ───────────────────────────────────────────────────────────────────

export const AWS_REGION            = required("REGION_AWS")
export const AWS_ACCESS_KEY_ID     = required("ACCESS_KEY_ID_AWS")
export const AWS_SECRET_ACCESS_KEY = required("SECRET_ACCESS_KEY_AWS")
export const AWS_S3_BUCKET_FILES   = required("S3_BUCKET_FILES_AWS")
export const AWS_S3_BUCKET_EVENTS  = required("S3_BUCKET_EVENTS_AWS")

// ── Gmail SMTP ───────────────────────────────────────────────────────────────

export const GMAIL_USER         = required("GMAIL_USER")
export const GMAIL_APP_PASSWORD = required("GMAIL_APP_PASSWORD")

// ── Google OAuth ─────────────────────────────────────────────────────────────

export const GOOGLE_CLIENT_ID     = required("GOOGLE_CLIENT_ID")
export const GOOGLE_CLIENT_SECRET = required("GOOGLE_CLIENT_SECRET")

// ── Runtime ──────────────────────────────────────────────────────────────────

export const NODE_ENV = process.env.NODE_ENV ?? "development"
