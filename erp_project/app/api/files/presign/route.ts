import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getPresignedDownloadUrl, getPresignedViewUrl } from "@/lib/s3"

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const key = req.nextUrl.searchParams.get("key")
  if (!key?.trim()) {
    return NextResponse.json({ error: "key is required" }, { status: 400 })
  }
  if (key.includes("..")) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 })
  }

  const expiresInParam = req.nextUrl.searchParams.get("expiresIn")
  const expiresIn = expiresInParam ? Math.min(Math.max(parseInt(expiresInParam), 60), 3600) : 300

  const view = req.nextUrl.searchParams.get("view") === "1"

  try {
    const url = view
      ? await getPresignedViewUrl(key, expiresIn)
      : await getPresignedDownloadUrl(key, expiresIn)
    return NextResponse.json({ url, expiresIn })
  } catch (err: any) {
    console.error("[presign] failed key=%s", key, err)
    return NextResponse.json({ error: "Could not generate URL" }, { status: 500 })
  }
}
