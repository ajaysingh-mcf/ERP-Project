import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const FILES_BUCKET  = process.env.AWS_S3_BUCKET_FILES!
const EVENTS_BUCKET = process.env.AWS_S3_BUCKET_EVENTS!

// ── Files bucket (CSV/Excel/PDF uploads, PO attachments) ─────────────────────

export async function uploadFile(buffer: Buffer, key: string, mimeType: string): Promise<string> {
  await s3.send(new PutObjectCommand({
    Bucket:      FILES_BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: mimeType,
  }))
  console.log(`[s3:files] uploaded key=${key} size=${buffer.length}`)
  return key
}

export async function deleteFile(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: FILES_BUCKET, Key: key }))
  console.log(`[s3:files] deleted key=${key}`)
}

export async function getPresignedUploadUrl(key: string, mimeType: string, expiresIn = 300): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: FILES_BUCKET, Key: key, ContentType: mimeType }),
    { expiresIn }
  )
}

export async function getPresignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: FILES_BUCKET, Key: key }),
    { expiresIn }
  )
}

export async function getFileBuffer(key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: FILES_BUCKET, Key: key }))
  const chunks: Uint8Array[] = []
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

// ── Events bucket (raw-events, processed-events, failed-events) ──────────────

export async function putEvent(key: string, payload: unknown): Promise<void> {
  try {
    await s3.send(new PutObjectCommand({
      Bucket:      EVENTS_BUCKET,
      Key:         key,
      Body:        JSON.stringify(payload),
      ContentType: "application/json",
    }))
    console.log(`[s3:events] recorded key=${key}`)
  } catch (err) {
    // Fire-and-forget — never let event logging block the main request
    console.error(`[s3:events] failed to record key=${key}`, err)
  }
}

export async function getEvent(key: string): Promise<unknown> {
  const res = await s3.send(new GetObjectCommand({ Bucket: EVENTS_BUCKET, Key: key }))
  const chunks: Uint8Array[] = []
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"))
}
