# API Reference

> **Related docs:** [Authentication & Permissions](./authentication-and-permissions.md) · [Masters Module](./masters-module.md) · [Architecture Evolution](./architecture-evolution.md)

## Design Pattern (Current Implementation)

All mutation endpoints follow this pattern:

- **Method:** POST with a JSON body containing an `action` discriminator field
- **Auth:** Every route calls `auth()` at the top and returns `401 { error: "Unauthorized" }` if no session exists
- **Error shape:** `{ error: string }` with an appropriate HTTP status code
- **Success shape:** Varies per action (documented below)

> **No Zod validation yet.** Fields are validated with manual `if (!x?.trim())` guards. The planned `withGateway()` layer in [docs/architecture-evolution.md](./architecture-evolution.md) will centralise validation and error formatting.

---

## Masters Endpoints

### `POST /api/masters/skus`

**File:** `app/api/masters/skus/route.ts`

#### action: `"create"` — Create a single SKU

```json
// Request body
{
  "action": "create",
  "sku_code": "SKU001",
  "name": "Product Name",
  "brand": "BrandName",
  "category": "Personal Care",
  "status": "active"
}
```

| Field | Required | Type |
|-------|----------|------|
| `action` | Yes | `"create"` |
| `sku_code` | Yes | string |
| `name` | Yes | string |
| `brand` | No | string |
| `category` | No | string |
| `status` | No | `"active"` \| `"discontinued"` \| `"new_launch"` \| `"inactive"` |

```json
// Response 200
{ "id": 42 }

// Response 400 — missing required field
{ "error": "Missing required fields" }

// Response 409 — duplicate sku_code
{ "error": "SKU code already exists" }
```

#### action: `"bulk"` — Bulk insert from CSV

```json
// Request body
{
  "action": "bulk",
  "rows": [
    { "sku_code": "SKU001", "name": "Product A", "brand": "Brand", "category": "Care", "status": "active" }
  ]
}
```

```json
// Response 200
{ "inserted": 5, "skipped": 2 }
```

Duplicate `sku_code` values are skipped (counted in `skipped`), not errored.

---

### `POST /api/masters/vendors`

**File:** `app/api/masters/vendors/route.ts`

#### action: `"create"` — Create a single vendor

```json
{
  "action": "create",
  "code": "VEN001",
  "name": "Supplier Ltd",
  "type": "rm",
  "location": "Mumbai",
  "gst_number": "27AADCS0472N1Z1",
  "status": "active"
}
```

| Field | Required | Type |
|-------|----------|------|
| `code` | Yes | string (unique) |
| `name` | Yes | string |
| `type` | Yes | `"rm"` \| `"pm"` \| `"both"` |
| `location` | No | string |
| `gst_number` | No | string |
| `status` | No | string |

Process: Runs a **transaction** — INSERT into `vendors`, then INSERT into `vendor_details` using the returned `insertId`.

```json
// Response 200
{ "id": 12 }
```

#### action: `"update"` — Edit an existing vendor

```json
{
  "action": "update",
  "vendor_id": 12,
  "name": "Updated Supplier Ltd",
  "type": "both",
  "location": "Delhi",
  "gst_number": "07AADCS0472N1Z3",
  "status": "active"
}
```

| Field | Required | Type |
|-------|----------|------|
| `vendor_id` | Yes | number |
| `name` | Yes | string |
| `type` | Yes | `"rm"` \| `"pm"` \| `"both"` |
| `location` | No | string |
| `gst_number` | No | string |
| `status` | No | `"active"` \| `"inactive"` \| `"blacklisted"` \| `"discontinued"` |

Process: Transaction — UPDATE `master_vendors`, then UPDATE `vendor_details`.

```json
// Response 200
{ "ok": true }

// Response 400 — missing vendor_id or name
{ "error": "vendor_id, name, and type are required" }
```

#### action: `"bulk"` — Bulk insert vendors

```json
{ "action": "bulk", "rows": [...] }
// Response 200
{ "inserted": 3, "skipped": 1 }
```

---

### `POST /api/masters/manufacturers`

**File:** `app/api/masters/manufacturers/route.ts`

#### action: `"create"`

```json
{
  "action": "create",
  "code": "MFG001",
  "name": "Manufacturing Plant A",
  "location": "Pune",
  "gst_number": "27AADCS0472N1Z1",
  "status": "active"
}
```

Process: Transaction — INSERT into `mfgs`, then INSERT into `mfg_details`.

```json
// Response 200
{ "id": 5 }
```

#### action: `"update"` — Edit an existing manufacturer

```json
{
  "action": "update",
  "mfg_id": 5,
  "name": "Updated Plant A",
  "location": "Nashik",
  "gst_number": "27AADCS0472N1Z1",
  "status": "active"
}
```

| Field | Required | Type |
|-------|----------|------|
| `mfg_id` | Yes | number |
| `name` | Yes | string |
| `location` | No | string |
| `gst_number` | No | string |
| `status` | No | `"active"` \| `"inactive"` |

Process: Transaction — UPDATE `master_mfgs`, then UPDATE `mfg_details`.

```json
// Response 200
{ "ok": true }
```

#### action: `"bulk"`

```json
{ "action": "bulk", "rows": [...] }
// Response 200
{ "inserted": 2, "skipped": 0 }
```

---

### `POST /api/masters/raw-materials`

**File:** `app/api/masters/raw-materials/route.ts`

This is the most complex master route with five actions.

#### action: `"check-RM"` — Duplicate check before create wizard

```json
{ "action": "check-RM", "name": "Aloe Vera", "make": "Natural", "inci_name": "Aloe Barbadensis" }
```

```json
// Response 200
{ "exists": false }
// or
{ "exists": true }
```

#### action: `"check-vendor"` — Check if a vendor rate already exists

```json
{ "action": "check-vendor", "name": "Aloe Vera", "vendor_id": 7, "make": "Natural", "inci_name": "..." }
```

```json
// Response 200 — no existing rate
{ "exists": false }

// Response 200 — existing rate found
{
  "exists": true,
  "existing": {
    "curr_rate": 150.00,
    "moq": 100,
    "uom": "kg",
    "effective_from": "2025-01-01"
  }
}
```

#### action: `"create"` — Create a single raw material (simple)

```json
{
  "action": "create",
  "name": "Aloe Vera Extract",
  "rm_code": "RM001",
  "make": "Natural",
  "type": "botanical",
  "uom": "kg",
  "hsn_code": "330129",
  "inci_name": "Aloe Barbadensis"
}
```

```json
// Response 200
{ "id": 23 }
```

#### action: `"create-full"` — Full wizard: RM + vendor rates + manufacturer approvals

This is the primary create path. Runs in a **single transaction**.

```json
{
  "action": "create-full",
  "rm": {
    "name": "Aloe Vera Extract",
    "make": "Natural",
    "type": "botanical",
    "uom": "kg",
    "hsn_code": "330129",
    "inci_name": "Aloe Barbadensis",
    "status": "active"
  },
  "vendors": [
    {
      "vendor_id": 7,
      "vendor_code": "VEN007",
      "curr_rate": 150.00,
      "moq": 100,
      "rate_uom": "kg",
      "effective_from": "2025-01-01"
    }
  ],
  "manufacturers": [
    { "mfg_id": 2, "mfg_code": "MFG002" }
  ]
}
```

Process:
1. INSERT into `master_rm`
2. For each vendor: if a rate already exists → archive old row to `vrm_history` + `history_vrm`, then UPDATE `rm_vrm_dynamic`; otherwise INSERT new row
3. For each manufacturer: if a rate already exists → archive old row to `history_mrm`, then UPDATE `rm_mrm_fixed`; otherwise INSERT new row

```json
// Response 200
{ "id": 23 }
```

#### action: `"add-rates"` — Add or update rates on an existing RM

Used by the pencil-edit dialogs on the Raw Materials page. Looks up the RM by `name + make + inci_name`, then upserts vendor and/or manufacturer rates with full history archiving.

```json
{
  "action": "add-rates",
  "name": "Aloe Vera Extract",
  "make": "Natural",
  "inci_name": "Aloe Barbadensis",
  "vendors": [
    {
      "vendor_id": 7,
      "vendor_code": "VEN007",
      "curr_rate": 160.00,
      "moq": 100,
      "rate_uom": "kg",
      "rate_status": "active",
      "effective_from": "2025-06-01",
      "effective_to": null
    }
  ],
  "manufacturers": [
    {
      "mfg_id": 2,
      "mfg_code": "MFG002",
      "curr_rate": 155.00,
      "rate_uom": "kg",
      "effective_from": "2025-06-01"
    }
  ]
}
```

At least one of `vendors` or `manufacturers` must be non-empty. Each entry is upserted (archive-then-update if exists, insert if new).

```json
// Response 200
{ "id": 23 }

// Response 404 — RM not found by name+make+inci_name
{ "error": "Material not found" }
```

#### action: `"bulk"` — Bulk insert raw materials

```json
{ "action": "bulk", "rows": [...] }
// Response 200
{ "inserted": 10, "skipped": 2 }
```

---

### `POST /api/masters/packing-materials`

**File:** `app/api/masters/packing-materials/route.ts`

#### action: `"check-PM"` — Duplicate check before wizard

```json
{ "action": "check-PM", "name": "200ml Bottle", "type": "Primary" }
```

```json
// Response 200
{ "exists": false }
// or
{ "exists": true }
```

#### action: `"check-vendor"` — Check if a vendor rate already exists

```json
{ "action": "check-vendor", "name": "200ml Bottle", "type": "Primary", "vendor_id": 5 }
```

```json
// Response 200 — no existing rate
{ "exists": false }

// Response 200 — existing rate found
{
  "exists": true,
  "existing": { "curr_rate": 3.50, "moq": 500, "uom": "pcs" }
}
```

#### action: `"create"` — Simple insert (no rate rows)

```json
{
  "action": "create",
  "name": "200ml Bottle",
  "pm_code": "PM001",
  "type": "Primary",
  "hsn_code": "392390",
  "uom": "pcs",
  "status": "active"
}
```

```json
// Response 200
{ "id": 8 }
```

#### action: `"create-full"` — Full wizard: PM + vendor rates + manufacturer approvals

Runs in a **single transaction**.

Process:
1. INSERT into `master_pm`
2. For each vendor: if a rate already exists → archive old row to `history_vrm` (via `archiveVendorRate`), then UPDATE `pm_vrm_dynamic`; otherwise INSERT new row
3. For each manufacturer: if a rate already exists → archive old row to `history_mrm`, then UPDATE `pm_mrm_fixed`; otherwise INSERT new row

```json
{
  "action": "create-full",
  "pm": {
    "name": "200ml Bottle",
    "type": "Primary",
    "hsn_code": "392390",
    "uom": "pcs",
    "status": "active"
  },
  "vendors": [
    { "vendor_id": 5, "vendor_code": "VEN005", "curr_rate": 3.50, "moq": 500, "rate_uom": "pcs" }
  ],
  "manufacturers": [
    { "mfg_id": 2, "mfg_code": "MFG002" }
  ]
}
```

```json
// Response 200
{ "id": 8 }
```

#### action: `"add-rates"` — Add or update rates on an existing PM

Used by the pencil-edit dialogs on the Packing Materials page. Pass `pm_id` directly to bypass the name+type lookup (recommended for edit flows where `type` may be null). At least one of `vendors` or `manufacturers` must be non-empty.

```json
{
  "action": "add-rates",
  "pm_id": 8,
  "vendors": [
    {
      "vendor_id": 5,
      "vendor_code": "VEN005",
      "curr_rate": 3.75,
      "moq": 500,
      "rate_uom": "pcs",
      "rate_status": "active",
      "effective_from": "2025-06-01",
      "effective_to": null
    }
  ],
  "manufacturers": [
    {
      "mfg_id": 2,
      "mfg_code": "MFG002",
      "curr_rate": 3.60,
      "rate_uom": "pcs",
      "effective_from": "2025-06-01"
    }
  ]
}
```

If `pm_id` is omitted, falls back to looking up the PM by `name + type` (same as the wizard flow).

```json
// Response 200
{ "pmId": 8 }

// Response 404 — PM not found (only when pm_id is omitted and name lookup fails)
{ "error": "Material not found" }
```

#### action: `"bulk"`

```json
{ "action": "bulk", "rows": [...] }
// Response 200
{ "inserted": 5, "skipped": 0 }
```

---

### `POST /api/masters/material-master`

**File:** `app/api/masters/material-master/route.ts`

Unified endpoint for the Material Master page. Inserts a base material record only — no vendor or manufacturer rate rows. The `material` field determines which table is written to.

#### action: `"create"` — Insert a Raw Material base record

```json
{
  "action": "create",
  "material": "rm",
  "name": "Aloe Vera Extract",
  "make": "Natural",
  "inci_name": "Aloe Barbadensis",
  "type": "Botanical",
  "uom": "kg",
  "hsn_code": "330129",
  "status": "active"
}
```

| Field | Required | Notes |
|---|---|---|
| `material` | Yes | `"rm"` |
| `name` | Yes | |
| `make` | Yes | Used in duplicate detection |
| `inci_name` | Yes | Used in duplicate detection |
| `type`, `uom`, `hsn_code`, `status` | No | |

```json
// Response 200
{ "id": 23 }

// Response 409 — duplicate check failed
{ "error": "A raw material with this code already exists." }
```

#### action: `"create"` — Insert a Packing Material base record

```json
{
  "action": "create",
  "material": "pm",
  "name": "200ml Bottle",
  "type": "Primary",
  "uom": "pcs",
  "hsn_code": "392390",
  "status": "active"
}
```

| Field | Required | Notes |
|---|---|---|
| `material` | Yes | `"pm"` |
| `name` | Yes | |
| `type` | Yes | Used in duplicate detection |
| `uom`, `hsn_code`, `status` | No | |

```json
// Response 200
{ "id": 8 }
```

---

### `POST /api/masters/bom-master`

**File:** `app/api/masters/bom-master/route.ts`

#### action: `"create"` — Create a BOM with detail lines

```json
{
  "action": "create",
  "bom_code": "BOM001",
  "sku_code": "SKU001",
  "mfg_id": 2,
  "status": "draft",
  "details": [
    {
      "mtrl_type": "rm",
      "mtrl_id": 23,
      "amount": 5.0,
      "uom": "kg",
      "mtrl_cost": 750.00,
      "effective_from": "2025-01-01"
    }
  ]
}
```

Process: Transaction — INSERT into `bom`, then INSERT each `details` row into `bom_details`. Validates that `bom_code + sku_code` is not a duplicate.

```json
// Response 200
{ "id": 31 }

// Response 409 — duplicate BOM
{ "error": "BOM already exists for this SKU and BOM code" }
```

#### action: `"bulk"`

```json
{ "action": "bulk", "rows": [...] }
// Response 200
{ "inserted": 3, "skipped": 1 }
```

---

## Purchase Orders

All PO routes are under `app/api/purchase-orders/`.

---

### `GET /api/purchase-orders`

**File:** `app/api/purchase-orders/route.ts`

Returns all purchase orders joined with manufacturer name, SKU name, and email.

```json
// Response 200 — array of PoRow objects
[
  {
    "id": 1, "po_no": "PO-2026-001", "po_type": "normal",
    "status": "raised", "email_sent_at": "2026-06-15T09:23:00Z",
    "mfg_id": 3, "mfg_code": "MFG003", "mfg_name": "Plant A", "mfg_email": "plant@example.com",
    "sku_code": "SKU001", "sku_name": "Face Wash", "qty": 500,
    "expected_on": "2026-07-01", "attachment_key": null
  }
]
```

---

### `POST /api/purchase-orders`

**File:** `app/api/purchase-orders/route.ts`

Handles three modes via the body's `action` or `po_type` field.

#### Mode 1 — Normal PO (direct raise, no approval)

```json
// Request body
{
  "po_type": "normal",
  "mfg_id": 3,
  "sku_code": "SKU001",
  "qty": 500,
  "expected_on": "2026-07-01",
  "destination": "Warehouse A"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `po_type` | Yes | `"normal"` |
| `mfg_id` | Yes | number |
| `sku_code` | Yes | must be `active` |
| `qty` | Yes | > 0 |
| `expected_on` | No | date string |
| `destination` | No | string |

Process: inserts directly as `raised`; no approval record created. PO number format: `PO-YYYY-NNN`.

```json
// Response 200
{ "ok": true, "po_no": "PO-2026-001" }
```

#### Mode 2 — Impromptu PO (draft → approval → raised)

```json
{
  "po_type": "impromptu",
  "mfg_id": 3,
  "sku_code": "SKU001",
  "qty": 200,
  "expected_on": "2026-07-15",
  "destination": "Warehouse B",
  "reason": "Urgent restock"
}
```

Process: inserts PO as `draft`, creates an `approvals` record with `approval_items` showing the full diff. On approval the PO status moves to `raised` and an email with the PDF is auto-sent. PO number format: `IMP-YYYY-NNN`.

```json
// Response 200
{ "ok": true, "approval_id": 42, "po_no": "IMP-2026-007" }
```

#### Mode 3 — Bulk CSV upload (approval gated)

```json
{
  "action": "bulk_csv",
  "key": "imports/purchase-orders/2026-06/bulk_1718000000.csv",
  "filename": "june_orders.csv"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `action` | Yes | `"bulk_csv"` |
| `key` | Yes | S3 object key returned by `POST /api/upload` |
| `filename` | Yes | Original filename (shown in the approval diff) |

Process: saves the S3 key + filename as `approval_items` under module `PO_BULK`. When an approver approves the record, the server fetches the file, parses each row, and inserts POs directly as `raised`. No individual PO approval records are created.

```json
// Response 200
{ "ok": true, "approval_id": 55 }
```

**Common error responses:**

```json
// 400 — missing / invalid field
{ "error": "Manufacturer is required." }
{ "error": "SKU not found." }
{ "error": "SKU is not active." }

// 409 — duplicate PO number (rare race condition)
{ "error": "PO number already exists, please retry." }
```

---

### `PATCH /api/purchase-orders/[id]`

**File:** `app/api/purchase-orders/[id]/route.ts`

Update the S3 attachment key on a PO. If a previous key exists it is deleted from S3 before the new one is saved.

```json
// Request body
{ "attachment_key": "attachments/purchase-orders/1/attachment.pdf" }
// or null to remove the attachment
{ "attachment_key": null }
```

```json
// Response 200
{ "ok": true }
```

---

### `POST /api/purchase-orders/[id]/split`

**File:** `app/api/purchase-orders/[id]/split/route.ts`

Split a PO into N child POs, each optionally destined for a different manufacturer and warehouse. At least 2 split rows are required.

```json
// Request body
{
  "splits": [
    { "mfg_id": 3, "destination": "Warehouse A", "qty": 200 },
    { "mfg_id": 5, "destination": "Warehouse B", "qty": 150 }
  ]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `splits` | Yes | array, min 2 entries |
| `splits[].mfg_id` | Yes | manufacturer for this child PO |
| `splits[].qty` | Yes | > 0 |
| `splits[].destination` | No | warehouse name |

**Parent PO closing rules** (the parent's `qty` is never changed — it matches the email already sent):

| Condition | Result |
|-----------|--------|
| `splitTotal >= remaining` | `received_qty += splitTotal` → status → `short_closed` |
| `splitTotal < remaining` | `received_qty += splitTotal` → status unchanged (partial split) |

Child PO statuses mirror the parent: `draft` parents → `draft` children; raised/punched parents → `raised` children. Child PO numbers: `{parent_po_no}-S1`, `{parent_po_no}-S2`, …

```json
// Response 200
{ "ok": true, "splits_created": 2, "split_type": "full" }
// split_type: "full" (parent short_closed) | "partial" (parent status unchanged)

// 400 — validation failures
{ "error": "At least 2 split rows are required." }
{ "error": "Each split row must have a manufacturer selected." }
{ "error": "Split total (350) exceeds remaining quantity (300)." }

// 409 — PO status prevents splitting
{ "error": "PO status 'received' cannot be split." }
```

---

### `GET /api/purchase-orders/[id]/preview-pdf`

Streams the generated PO PDF inline so the user can review it in a new browser tab before sending the email. No DB changes.

```
GET /api/purchase-orders/42/preview-pdf
```

**Response:** `Content-Type: application/pdf` byte stream.

---

### `POST /api/purchase-orders/[id]/send-email`

Manually (re-)send the PO email to the manufacturer. Can be called on any `raised` PO. Stamps `email_sent_at` on first send only (subsequent calls do not overwrite it).

```json
// Response 200
{ "ok": true }

// 404
{ "error": "PO not found." }

// 500 — email or PDF generation failure
{ "error": "Failed to send email." }
```

---

## Utility Endpoints

### `GET /api/google-sheet`

**File:** `app/api/google-sheet/route.ts`

Fetches a publicly shared Google Sheet as CSV and returns it as an array of objects.

```
GET /api/google-sheet?url=https://docs.google.com/spreadsheets/d/SHEET_ID/edit#gid=0
```

| Query param | Required | Description |
|-------------|----------|-------------|
| `url` | Yes | Any Google Sheets URL format (full URL, share URL, or `/edit` URL with `#gid=`) |

```json
// Response 200
{
  "rows": [
    { "SKU Code": "SKU001", "Name": "Product A", "Brand": "Brand" },
    ...
  ],
  "sourceUrl": "https://docs.google.com/spreadsheets/d/...",
  "exportedUrl": "https://docs.google.com/spreadsheets/d/.../export?format=csv&gid=0"
}

// Response 400 — missing or invalid URL
{ "error": "Missing url parameter" }

// Response 500 — sheet is private or fetch failed
{ "error": "Could not fetch sheet. Make sure it is published publicly (File → Share → Publish to web)." }
```

**Notes:**
- No Google API key required — uses the CSV export URL directly
- The sheet must be **published to the web** (`File → Share → Publish to web` in Google Sheets)
- Uses a custom CSV parser that handles RFC 4180 quoting and embedded newlines

---

## Admin Endpoints

All admin endpoints require the `"developer"` role. Non-developer requests receive `403 { error: "Forbidden" }`.

### `GET /api/admin/permissions`

Returns all role-page permission entries.

```json
// Response 200
[
  { "id": 1, "role": "developer", "page_slug": "/masters", "access_level": "editor" },
  ...
]
```

### `POST /api/admin/permissions`

Upsert a role-page permission. Uses `ON DUPLICATE KEY UPDATE` — safe to call multiple times.

```json
// Request body
{ "role": "bom_creator", "page_slug": "/masters", "access_level": "editor" }

// Response 200
{ "id": 45, "role": "bom_creator", "page_slug": "/masters", "access_level": "editor" }
```

### `GET /api/admin/user-permissions?user_id=<id>`

Returns user-specific permission overrides. Omitting `user_id` returns all overrides.

```json
// Response 200
[
  { "id": 3, "user_id": 12, "page_slug": "/finance", "access_level": "editor" }
]
```

### `POST /api/admin/user-permissions`

Upsert a user-specific permission override.

```json
// Request body
{ "user_id": 12, "page_slug": "/finance", "access_level": "editor" }

// Response 200
{ "id": 3, "user_id": 12, "page_slug": "/finance", "access_level": "editor" }
```

### `DELETE /api/admin/user-permissions`

Remove a user-specific override (restoring role-based access for that page).

```json
// Request body
{ "user_id": 12, "page_slug": "/finance" }

// Response 200
{ "ok": true }
```

---

## NextAuth-Managed Endpoints

These are handled internally by NextAuth and do not have custom route files.

| Endpoint | Description |
|----------|-------------|
| `GET /api/auth/session` | Returns the current session object |
| `GET /api/auth/csrf` | Returns a CSRF token |
| `POST /api/auth/signin` | Initiates the Google OAuth redirect |
| `POST /api/auth/signout` | Clears the JWT cookie and fires the `signOut` event |
| `GET /api/auth/callback/google` | OAuth callback URL — Google redirects here after user consent |
