import { NextResponse } from "next/server"
import { withGateway } from "@/lib/gateway/with-gateway"
import { uploadFile } from "@/lib/s3"

const ALLOWED_SET = new Set([
  "image/jpeg", "image/png", "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
])

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg":   "jpg",
  "image/png":    "png",
  "image/webp":   "webp",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv":     "csv",
}

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export const POST = withGateway({
  handler: async ({ req }) => {
  const form = await req.formData()
  const file   = form.get("file")
  const folder = form.get("folder")
  const field  = form.get("field")

  if (typeof folder !== "string" || !folder.trim()) {
    return NextResponse.json({ error: "folder is required" }, { status: 400 })
  }
  if (typeof field !== "string" || !field.trim()) {
    return NextResponse.json({ error: "field is required" }, { status: 400 })
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 })
  }
  if (!ALLOWED_SET.has(file.type)) {
    return NextResponse.json({ error: `File type "${file.type}" is not allowed` }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 10 MB limit" }, { status: 400 })
  }

  const ext = MIME_TO_EXT[file.type]
  const key = `${folder.trim()}/${field.trim()}.${ext}`

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    await uploadFile(buffer, key, file.type)
    return NextResponse.json({ key })
  } catch (err: any) {
    console.error("[upload] S3 upload failed:", err)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
  },
})
