# Frontend Patterns

> **Related docs:** [Architecture](./architecture.md) · [Masters Module](./masters-module.md) · [Adding a New Module](./adding-a-new-module.md)

This document describes the recurring patterns used across the frontend. Follow these when building new pages or components to stay consistent with the existing codebase.

## Server vs Client Component Split

**The rule:** Server Components fetch data and enforce authentication/authorisation. Client Components own interactivity (state, events, dialogs, optimistic UI).

| Concern | Component type | Why |
|---------|---------------|-----|
| Authentication check | Server | `auth()` is async and server-only |
| Permission check | Server | `resolveAccess()` queries the DB |
| Data fetching | Server | `lib/db.ts` is server-only (mysql2) |
| URL redirects | Server | `redirect()` from `next/navigation` |
| React state, `useState`, `useEffect` | Client | Requires the browser runtime |
| Event handlers, dialogs, forms | Client | Interactive DOM manipulation |
| `useRouter().refresh()` | Client | Triggers server re-fetch after mutation |

```ts
// app/masters/skus/page.tsx — Server Component (no "use client")
export default async function Page() {
  const session = await auth();
  const skus = await query<Sku>("SELECT ...");
  return <SkusClient initialSkus={skus} />;
}

// app/masters/skus/SkusClient.tsx — Client Component
"use client";
export function SkusClient({ initialSkus }: { initialSkus: Sku[] }) {
  const [search, setSearch] = useState("");
  // ...
}
```

## After a Mutation: Use `router.refresh()`

After a successful POST to an API route, call `router.refresh()` (not `router.push()`). This re-runs the Server Component's data fetch and updates the UI with fresh data from the database, without a full page reload.

```ts
import { useRouter } from "next/navigation";

const router = useRouter();

async function handleCreate(data: FormData) {
  const res = await fetch("/api/masters/skus", { method: "POST", body: ... });
  if (res.ok) router.refresh(); // ← triggers server-side re-fetch
}
```

## Sidebar Navigation (`components/Sidebar.tsx`)

The `NAV` array inside `Sidebar.tsx` is the single source of truth for the navigation menu structure. To add a new menu item or submenu, add an entry to this array.

```ts
const NAV = [
  {
    label: "Masters",
    href: "/masters",
    icon: Database,
    children: [
      { label: "SKUs", href: "/masters/skus" },
      { label: "Vendors", href: "/masters/vendors" },
      // add new sub-pages here
    ],
  },
  // add new top-level modules here
];
```

Children render as a collapsible sub-list. Active state is determined by `pathname === href || pathname.startsWith(href + "/")`.

**Auth pages** (`/auth/*`) suppress the sidebar entirely — `ClientLayout.tsx` checks the pathname and renders only `{children}` without the layout chrome on auth routes.

## Styling Conventions

**Tailwind CSS v4** — CSS-first configuration. There is no `tailwind.config.js`. For most styling needs, use standard Tailwind utility classes directly.

**Component library:** `components/ui/` contains shadcn/ui components (Button, Input, Dialog, Table, Badge, Card, Tooltip, Label). Do not edit these files directly. To add a new component:
```bash
npx shadcn@latest add <component-name>
```

**`cn()` utility** — always use this for conditional or merged class names:
```ts
import { cn } from "@/lib/utils";

// Merges Tailwind classes correctly, resolving conflicts
<div className={cn("px-4 py-2", isActive && "bg-blue-500", className)}>
```

`cn()` wraps `clsx` (conditional class joining) and `tailwind-merge` (conflict resolution). Using string concatenation or template literals directly can produce duplicate or conflicting Tailwind classes.

**Design tokens** — CSS variables for colours, spacing, and typography are defined in `app/globals.css`. Sidebar colours (`--sidebar`, `--sidebar-foreground`, etc.) are customised there.

## Form and Dialog Pattern

Generic dialogs in `components/masters/` accept a `fields: MasterField[]` prop that declaratively defines the form:

```ts
type MasterField = {
  key: string;           // field name in the POST body
  label: string;         // display label
  type: "text" | "number" | "select";
  required?: boolean;
  placeholder?: string;
  options?: string[];    // for type: "select"
  colSpan?: 1 | 2;      // grid column span in the form layout
};
```

The dialog:
1. Renders a form from the field config
2. Validates `required` fields before submit
3. POSTs `{ action: "create", ...formValues }` to the `endpoint` prop
4. Shows the API error message inline on failure (not a toast/notification)
5. Calls `onSuccess()` on success (caller typically calls `router.refresh()`)

For entities that need custom forms (like Raw Materials' multi-step wizard), build a custom component that follows the same POST + `router.refresh()` pattern.

## Table Rendering

All master tables are plain HTML `<table>` elements styled with Tailwind. The shadcn/ui `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` components are wrappers around these.

| Feature | Current approach |
|---------|-----------------|
| Default sort order | Defined server-side in the SQL `ORDER BY` clause |
| Search / filter | Client-side string match in `SearchInput` — filters the `initialData` array in state |
| Pagination | Not implemented — all rows are returned |
| Column sorting | Not implemented |

The client component holds the full dataset in memory and filters it on each search keystroke. This is acceptable for master data where row counts are in the hundreds, not millions.

## Font Setup

Four fonts are loaded via `next/font/google` in `app/layout.tsx`:

| CSS variable | Font | Usage |
|-------------|------|-------|
| `--font-geist-sans` | Geist | Sans-serif body text |
| `--font-geist-mono` | Geist Mono | Monospace / code |
| `--font-sans` | Roboto | Alternative sans-serif |
| `--font-heading` | Merriweather | Headings |

These variables are applied via Tailwind's `font-*` utilities or CSS `var(--font-*)` directly.

## Auth Pages Layout

Auth pages (`/auth/signin`, `/auth/error`, `/auth/unauthorized`) render without the sidebar or top bar. `ClientLayout.tsx` detects the `/auth` prefix in the pathname and returns `{children}` directly, bypassing the main layout chrome.
