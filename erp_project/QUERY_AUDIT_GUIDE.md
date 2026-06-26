# Query Performance Audit Guide

## What We've Set Up

Created `lib/query-timing.ts` — a timing wrapper that logs every database query with its execution time.

### Three exports:

1. **`timedQuery<T>(sql, params, options)`** — Drop-in replacement for `query()`
   - Logs: `[QUERY] tableName SELECT (12.34ms)` 
   - Marks as slow if > 50ms: `🐢 [SLOW] tableName SELECT (145.67ms)`

2. **`timedParallel(queries)`** — Batch parallel queries with timing
   - Logs individual query times + total parallel time

3. **Label extraction** — Auto-generates labels from SQL (TABLE NAME + OPERATION)

---

## Pages Now Instrumented

| Page | File | What it audits |
|------|------|---|
| SKUs master | `app/masters/skus/page.tsx` | Paginated SELECT + COUNT |
| Vendors master | `app/masters/vendors/page.tsx` | Paginated SELECT + COUNT |
| Raw Materials master | `app/masters/raw-materials/page.tsx` | Reference lists + 2 paginated views |

---

## How to View Audit Results

### In Development

1. Start the dev server: `npm run dev`
2. Open **Developer Tools → Console** (F12)
3. Navigate to a master page (e.g., `/masters/skus`)
4. Watch console output:

```
[AUDIT] SKUs page load - page=1, size=20, search=none, status=all
[QUERY] selectPaginated (23.45ms)
[QUERY] countAll (8.12ms)
[AUDIT] SKUs page complete: 32.57ms | fetched 20/1250 rows
```

### Using Node.js console in production logs (future)

Once you add Winston logging, these console.log() calls will route to:
- Console transport (dev)
- File transport (error.log + combined.log)
- CloudWatch (production on AWS)

---

## Next Steps: Extend to More Pages

To add timing to another page:

```tsx
// 1. Import
import { timedQuery } from "@/lib/query-timing"

// 2. Wrap your query() calls
const rows = await timedQuery<MyType>(sql, params, { label: "myQuery" })

// 3. Optionally time the whole page
const pageStart = performance.now()
// ... queries ...
const pageTime = performance.now() - pageStart
console.log(`[AUDIT] MyPage complete: ${pageTime.toFixed(2)}ms`)
```

---

## Important: The N+1 Problem in Approvals

**Not yet instrumented.** The approvals page has a known N+1 issue:

```ts
// Current (slow): 1 + N*2 queries
const rows = await query(listPending)  // 1 query
for each approval:
  await query(getItems)                // N queries
  await query(entityLabel)             // N queries
```

**Should be:** 1 + 2 queries (batch all items + labels)

Once you're confident with the timing wrapper, we'll add it to `/app/approvals/page.tsx` to confirm.

---

## Interpreting Results

| Duration | Assessment | Action |
|----------|-----------|--------|
| < 10ms | Fast | ✅ Good |
| 10–50ms | Normal | ℹ️ Monitor |
| 50–100ms | Slow | ⚠️ Check indexing |
| > 100ms | Very slow | 🔴 Add index or refactor |

**If a query is > 50ms:**
1. Check if the table has an index on the WHERE columns
2. Look for N+1 patterns (loop + query inside)
3. Consider batching or JOINing instead of separate queries

---

## Database Indexes to Add (Next Task)

Once you identify slow queries, we'll add indexes. Template:

```sql
CREATE INDEX idx_<table>_<columns> ON <table>(<col1>, <col2>);
```

For now, run the pages and watch the console — that's your data.
