# Getting Started

> **Related docs:** [Architecture](./architecture.md) · [Environment Variables & Scripts](./environment-and-scripts.md)

## Prerequisites

- Node.js 20+ and npm 10+
- Access to the MariaDB instance (AWS RDS — get credentials from the team lead)
- Google OAuth credentials (Google Cloud Console → OAuth 2.0 client)

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment variables

Create a `.env` file in the project root. The table below lists every required variable.

| Variable | Required | Default | Where to get it |
|----------|----------|---------|-----------------|
| `DB_HOST` | Yes | — | AWS RDS endpoint (e.g. `mydb.abcdef.us-east-1.rds.amazonaws.com`) |
| `DB_PORT` | No | `3306` | — |
| `DB_USER` | Yes | — | Team lead |
| `DB_PASSWORD` | Yes | — | Team lead |
| `DB_NAME` | Yes | — | Team lead |
| `AUTH_SECRET` | Yes | — | Run `openssl rand -hex 32` or any 32-char random string |
| `GOOGLE_CLIENT_ID` | Yes | — | Google Cloud Console → Credentials → OAuth 2.0 client |
| `GOOGLE_CLIENT_SECRET` | Yes | — | Same as above |

Example `.env`:
```
DB_HOST=mydb.abcdef.us-east-1.rds.amazonaws.com
DB_PORT=3306
DB_USER=erp_user
DB_PASSWORD=supersecret
DB_NAME=erp_db
AUTH_SECRET=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
GOOGLE_CLIENT_ID=123456789-abcde.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123def456
```

> **Google OAuth redirect URI:** Add `http://localhost:3000/api/auth/callback/google` to the Authorized Redirect URIs in the Google Cloud Console for local development.

## 3. Verify the database connection

```bash
npm run db:test
```

A successful run prints the current database timestamp. If this fails, check `DB_HOST`, `DB_PORT`, and SSL access rules on the RDS security group.

## 4. Seed the role-permissions matrix

```bash
npm run db:seed
```

This writes the role × page_slug × access_level rows into the `page_permissions` table. It is safe to run multiple times (uses `ON DUPLICATE KEY UPDATE`). See [Authentication & Permissions](./authentication-and-permissions.md) for what this table controls.

## 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to the Google sign-in page.

## 6. First login

Sign in with a Google account whose email exists in the `users` table with `status = 'active'`. If no user exists yet, ask a developer to insert one:

```sql
INSERT INTO users (name, email, google_id, status)
VALUES ('Your Name', 'you@company.com', 'GOOGLE_SUBJECT_ID', 'active');
```

The `google_id` value is the `sub` claim from Google's OAuth response (a numeric string like `"115368..."`). If you do not know it yet, you can temporarily omit it (set to `NULL`) — NextAuth will still match by email.

## Important note on Prisma

`prisma/schema.prisma` is the **schema definition and migration tool only**. The Prisma Client generated in `app/generated/prisma/` is **not used at runtime**. All database calls go through the `mysql2` connection pool in `lib/db.ts`.

Do not import from `app/generated/prisma/` in application code. Use:
```ts
import { query, execute } from "@/lib/db";
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `ECONNRESET` on first query | RDS security group blocks the connection | Check inbound rules; `lib/db.ts` auto-retries once |
| Redirect loop on every page | Invalid `AUTH_SECRET` or mismatched cookie | Regenerate `AUTH_SECRET`, clear browser cookies |
| `/auth/unauthorized` on every page | User's email has no role in `user_roles` or `page_permissions` has no entry for the page | Run `npm run db:seed`; add a `user_roles` row for the user |
| `Access denied` on Google sign-in | Email not in `users` table or `status = 'inactive'` | Insert the user row as shown above |
| `mysql2` module not found in dev | `serverExternalPackages` missing from `next.config.ts` | See `next.config.ts` — do not remove this setting |
