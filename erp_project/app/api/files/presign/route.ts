import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getPresignedDownloadUrl } from "@/lib/s3"

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

  try {
    const url = await getPresignedDownloadUrl(key, 3600)
    return NextResponse.json({ url })
  } catch (err: any) {
    console.error("[presign] failed key=%s", key, err)
    return NextResponse.json({ error: "Could not generate URL" }, { status: 500 })
  }
}
