import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_FILES, AWS_S3_BUCKET_EVENTS } from "@/lib/env"

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId:     AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
})

const FILES_BUCKET  = AWS_S3_BUCKET_FILES
const EVENTS_BUCKET = AWS_S3_BUCKET_EVENTS

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

export async function getPresignedDownloadUrl(key: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: FILES_BUCKET, Key: key }),
    { expiresIn }
  )
}

/** Presigned URL that forces inline display in the browser (text/plain) instead of triggering a download. */
export async function getPresignedViewUrl(key: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket:                     FILES_BUCKET,
      Key:                        key,
      ResponseContentType:        "text/plain",
      ResponseContentDisposition: "inline",
    }),
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
