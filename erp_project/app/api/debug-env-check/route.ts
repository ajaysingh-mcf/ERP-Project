import { NextResponse } from "next/server"

const CHECK = [
  "DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME",
  "REGION_AWS", "ACCESS_KEY_ID_AWS", "SECRET_ACCESS_KEY_AWS",
  "S3_BUCKET_FILES_AWS", "S3_BUCKET_EVENTS_AWS",
  "GMAIL_USER", "GMAIL_APP_PASSWORD",
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
  "AUTH_SECRET",
]

export async function GET() {
  const present = Object.fromEntries(CHECK.map((k) => [k, process.env[k] !== undefined]))
  return NextResponse.json(present)
}
