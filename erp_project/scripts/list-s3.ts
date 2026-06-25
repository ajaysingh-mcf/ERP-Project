import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3"
import { config } from "dotenv"
import path from "path"
import fs from "fs"

config({ path: path.resolve(process.cwd(), ".env") })

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

async function listBucket(bucket: string, label: string) {
  console.log(`\n── ${label} (${bucket}) ──`)
  let token: string | undefined
  let total = 0

  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: token,
    }))

    if (!res.Contents?.length) {
      console.log("  (empty)")
      break
    }

    for (const obj of res.Contents) {
      const kb = ((obj.Size ?? 0) / 1024).toFixed(1)
      console.log(`  ${obj.Key}  (${kb} KB)  ${obj.LastModified?.toISOString()}`)
      total++
    }

    token = res.NextContinuationToken
  } while (token)

  console.log(`  Total: ${total} object(s)`)
}

async function downloadObject(bucket: string, key: string, outPath: string) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const buffer = Buffer.from(await res.Body!.transformToByteArray())
  fs.writeFileSync(outPath, buffer)
  console.log(`Downloaded: ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`)
}

async function main() {
  await listBucket(process.env.AWS_S3_BUCKET_EVENTS!, "Events Bucket")
}

main().catch(console.error)
