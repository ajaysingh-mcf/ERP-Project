// CLI to browse the two S3 buckets this app uses, without going through the
// app's own upload/download flows.
//
//   npx tsx scripts/list-s3.ts list [files|events] [prefix]
//   npx tsx scripts/list-s3.ts get  [files|events] <key> [outPath]
//
// Examples:
//   npx tsx scripts/list-s3.ts list files vendors/
//   npx tsx scripts/list-s3.ts get files vendors/123/gst.pdf ./gst.pdf
//   npx tsx scripts/list-s3.ts get events raw/PO-2026-07-09.json   (prints to stdout)

import "dotenv/config"
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3"
import fs from "fs"
import {
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_S3_BUCKET_FILES,
  AWS_S3_BUCKET_EVENTS,
} from "@/lib/env"

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId:     AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
})

function resolveBucket(label: string): string {
  if (label === "files")  return AWS_S3_BUCKET_FILES
  if (label === "events") return AWS_S3_BUCKET_EVENTS
  throw new Error(`Unknown bucket "${label}" — use "files" or "events"`)
}

async function listBucket(bucket: string, prefix?: string) {
  console.log(`\n── ${bucket}${prefix ? ` (prefix: ${prefix})` : ""} ──`)
  let token: string | undefined
  let total = 0

  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket:             bucket,
      Prefix:             prefix,
      ContinuationToken:  token,
    }))

    if (!res.Contents?.length && total === 0) {
      console.log("  (empty)")
      break
    }

    for (const obj of res.Contents ?? []) {
      const kb = ((obj.Size ?? 0) / 1024).toFixed(1)
      console.log(`  ${obj.Key}  (${kb} KB)  ${obj.LastModified?.toISOString()}`)
      total++
    }

    token = res.NextContinuationToken
  } while (token)

  console.log(`  Total: ${total} object(s)`)
}

async function getObject(bucket: string, key: string, outPath?: string) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const buffer = Buffer.from(await res.Body!.transformToByteArray())

  if (outPath) {
    fs.writeFileSync(outPath, buffer)
    console.log(`Downloaded: ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`)
  } else {
    process.stdout.write(buffer)
  }
}

async function main() {
  const [cmd, bucketLabel, ...rest] = process.argv.slice(2)

  if (cmd === "list") {
    const bucket = resolveBucket(bucketLabel ?? "files")
    await listBucket(bucket, rest[0])
    return
  }

  if (cmd === "get") {
    const bucket = resolveBucket(bucketLabel)
    const [key, outPath] = rest
    if (!key) throw new Error("Usage: get <files|events> <key> [outPath]")
    await getObject(bucket, key, outPath)
    return
  }

  console.log("Usage:")
  console.log("  npx tsx scripts/list-s3.ts list [files|events] [prefix]")
  console.log("  npx tsx scripts/list-s3.ts get  [files|events] <key> [outPath]")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
