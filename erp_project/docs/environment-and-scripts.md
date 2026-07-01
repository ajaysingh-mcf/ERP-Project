# Environment Variables and Scripts

> **Related docs:** [Getting Started](./getting-started.md) · [Architecture](./architecture.md)

## Environment Variables

All variables are read at server startup. Changes require a server restart.

### Core

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DB_HOST` | Yes | — | MariaDB hostname (AWS RDS endpoint) |
| `DB_PORT` | No | `3306` | MariaDB port |
| `DB_USER` | Yes | — | Database username |
| `DB_PASSWORD` | Yes | — | Database password |
| `DB_NAME` | Yes | — | Database / schema name |
| `AUTH_SECRET` | Yes | — | Signs and verifies NextAuth JWT cookies. Changing this invalidates all active sessions. |
| `GOOGLE_CLIENT_ID` | Yes | — | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | — | Google OAuth 2.0 client secret |

### AWS S3

Required for file uploads, bulk Excel imports, PO PDF storage, and event logging.

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `AWS_REGION` | Yes | — | AWS region (e.g. `ap-south-1`) |
| `AWS_ACCESS_KEY_ID` | Yes | — | IAM access key |
| `AWS_SECRET_ACCESS_KEY` | Yes | — | IAM secret key |
| `AWS_S3_BUCKET_FILES` | Yes | — | Bucket for file uploads and PO attachments (e.g. `mcaffeine-erp-files`) |
| `AWS_S3_BUCKET_EVENTS` | Yes | — | Bucket for raw/processed/failed event logs (e.g. `mcaffeine-erp-events`) |

See [S3 Integration](./s3-integration.md) for the full key/prefix conventions.

### Email (PO dispatch)

Required to send PO PDFs to manufacturers via Gmail SMTP.

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `GMAIL_USER` | Yes | — | Gmail address used as the sender (e.g. `procurement@mcaffeine.com`) |
| `GMAIL_APP_PASSWORD` | Yes | — | [Gmail App Password](https://support.google.com/accounts/answer/185833) — not the account password. 2FA must be enabled on the account. |

### Observability

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `LOG_LEVEL` | No | `info` | Winston log level: `error`, `warn`, `info`, `debug`. Set to `debug` for verbose query/request tracing in development. |

### Database connection pool settings

These are hardcoded in `lib/db.ts`. Change them there if your environment requires different values.

| Setting | Value | Notes |
|---------|-------|-------|
| `connectionLimit` | `10` | Max concurrent DB connections |
| `ssl.rejectUnauthorized` | `false` | Allows self-signed RDS certificates |
| `enableKeepAlive` | `true` | Prevents idle connection drops |
| `keepAliveInitialDelay` | `10000 ms` | Delay before first keep-alive probe |
| `connectTimeout` | `10000 ms` | Timeout for establishing a connection |
| Auto-retry | 1 attempt | Retries once on `ECONNRESET` / `PROTOCOL_CONNECTION_LOST` |

## npm Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Next.js development server on port 3000 with hot reload |
| `npm run build` | Compile a production build — run before every merge to catch type errors |
| `npm run start` | Serve the production build (requires `npm run build` first) |
| `npm run lint` | Run ESLint — must pass before committing |
| `npm run db:seed` | Upsert the role × page_slug × access_level matrix into `page_permissions` |
| `npm run db:test` | Run a `SELECT NOW()` to verify the database connection and SSL |

## Prisma Commands

Prisma is used for **schema definition and migrations only** — the Prisma Client is not used at runtime. All runtime queries use `lib/db.ts` directly.

| Command | Description |
|---------|-------------|
| `npx prisma migrate dev --name <name>` | Create a new migration file and apply it locally |
| `npx prisma migrate deploy` | Apply all pending migrations in production/staging |
| `npx prisma studio` | Open a browser-based GUI to explore the schema and data |
| `npx prisma generate` | Regenerate the Prisma Client after schema changes (rarely needed at runtime) |
| `npx prisma db push` | Sync schema directly without creating a migration file — development only |

> After any `prisma migrate` or `prisma db push`, restart the dev server to pick up schema changes.

## scripts/ Directory

| File | Purpose | When to run |
|------|---------|------------|
| `scripts/seed-permissions.ts` | Writes the role × page_slug × access_level matrix into `page_permissions`. Uses `ON DUPLICATE KEY UPDATE` so it is safe to re-run. | After adding a new role, a new page slug, or when setting up a fresh database. Run with `npm run db:seed`. |
| `scripts/seed-test-users.js` | Creates sample user accounts for development and testing. | Once, on a fresh development database. Run with `npx tsx scripts/seed-test-users.js`. |
| `scripts/test-connection.js` | Verifies database connectivity by running a `SELECT NOW()`. Exits with code 1 on failure. | Any time you want to confirm the DB connection is healthy. Run with `npm run db:test`. |

## Google Sheets Integration

The `/api/google-sheet` endpoint fetches Google Sheets data as CSV. No Google API key is required — it uses the public CSV export URL.

**Requirement:** The sheet must be published publicly.
1. In Google Sheets: **File → Share → Publish to web**
2. Choose **Comma-separated values (.csv)** format
3. Copy the published URL and pass it as the `url` query parameter

A private or organisation-restricted sheet returns a 403/401 from Google, which the route surfaces as a 500 with an explanatory error message.

## next.config.ts

```ts
const nextConfig: NextConfig = {
  serverExternalPackages: [
    "mysql2",
    "@react-pdf/renderer", "fontkit", "pdfkit", "nodemailer",
    "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner",
  ],
};
```

`serverExternalPackages` tells Next.js not to bundle these packages into the server bundle. `mysql2`, the AWS SDK, and `@react-pdf/renderer` all use native Node.js APIs or binary addons that fail when bundled. **Do not remove any entry from this list.**
