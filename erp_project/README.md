# ERP System

A full-stack Enterprise Resource Planning system built with Next.js, TypeScript, Tailwind CSS, and MariaDB via Prisma ORM.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v4
- **Database**: MariaDB (via Prisma ORM 7)
- **ORM**: Prisma with `@prisma/adapter-mariadb`

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env` file at the project root:

```env
DATABASE_URL="mysql://user:password@localhost:3306/erp_db"
```

### 3. Run database migrations

```bash
npm run db:migrate
```

### 4. Start development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Database Scripts

| Command | Description |
|---------|-------------|
| `npm run db:generate` | Regenerate Prisma client after schema changes |
| `npm run db:migrate` | Create and apply a new migration |
| `npm run db:push` | Push schema changes without migration history |
| `npm run db:studio` | Open Prisma Studio (GUI for database) |
| `npm run db:seed` | Seed the database with test data |
| `npm run db:test` | Test the database connection |

## Project Structure

```
erp_project/
├── app/                    # Next.js App Router pages and layouts
│   ├── api/                # API route handlers
│   ├── generated/prisma/   # Auto-generated Prisma client (do not edit)
│   ├── globals.css         # Global styles
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Home page
├── lib/
│   └── db.ts               # Prisma client singleton
├── prisma/
│   └── schema.prisma       # Database schema
├── scripts/
│   ├── seed-test-users.js  # Seed test data
│   └── test-connection.js  # Verify DB connection
└── public/                 # Static assets
```

## Planned Modules

- HR & Payroll
- Inventory Management
- Sales & CRM
- Finance & Accounting
- Manufacturing
- Reports & Analytics
