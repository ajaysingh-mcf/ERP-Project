@AGENTS.md

# ERP Project

This workspace is a Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS v4 project using Prisma 7 with MariaDB.

## Key Commands

- `npm run dev` — start the app locally
- `npm run build` — verify a production build
- `npm run lint` — run lint checks
- `npm run db:generate` — regenerate Prisma client after schema changes
- `npm run db:migrate` — create and apply a migration
- `npm run db:push` — sync schema quickly for local development
- `npm run db:studio` — open Prisma Studio
- `npm run db:seed` — seed sample data
- `npm run db:test` — verify the database connection

## Database Access

Use the shared singleton in `lib/db.ts`:

```ts
import { db } from "@/lib/db";
```

Do not edit `app/generated/prisma/` by hand; regenerate it after changing `prisma/schema.prisma`.

## Important Paths

- `README.md` — setup and architecture overview
- `prisma/schema.prisma` — source of truth for DB models
- `lib/db.ts` — Prisma client singleton
- `app/generated/prisma/` — generated client output
- `scripts/` — local DB utility scripts
