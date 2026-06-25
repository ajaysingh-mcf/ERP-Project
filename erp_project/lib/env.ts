/**
 * Central environment configuration.
 *
 * All required env vars are validated here at module load time.
 * If any required var is missing the process throws immediately with a clear
 * message — misconfigured deployments fail at cold start, not silently during
 * the first request that happens to hit the affected code path.
 *
 * Usage:
 *   import { DB_HOST, AWS_REGION, GMAIL_USER } from "@/lib/env"
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
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

export const AWS_REGION            = required("AWS_REGION")
export const AWS_ACCESS_KEY_ID     = required("AWS_ACCESS_KEY_ID")
export const AWS_SECRET_ACCESS_KEY = required("AWS_SECRET_ACCESS_KEY")
export const AWS_S3_BUCKET_FILES   = required("AWS_S3_BUCKET_FILES")
export const AWS_S3_BUCKET_EVENTS  = required("AWS_S3_BUCKET_EVENTS")

// ── Gmail SMTP ───────────────────────────────────────────────────────────────

export const GMAIL_USER         = required("GMAIL_USER")
export const GMAIL_APP_PASSWORD = required("GMAIL_APP_PASSWORD")

// ── Google OAuth ─────────────────────────────────────────────────────────────

export const GOOGLE_CLIENT_ID     = required("GOOGLE_CLIENT_ID")
export const GOOGLE_CLIENT_SECRET = required("GOOGLE_CLIENT_SECRET")

// ── Runtime ──────────────────────────────────────────────────────────────────

export const NODE_ENV = process.env.NODE_ENV ?? "development"
