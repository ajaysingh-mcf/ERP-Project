import { putEvent } from "@/lib/s3"

type EventStatus = "raw" | "processed" | "failed"

/**
 * Builds one event id shared by the logger's `eventId` field and the S3
 * object key, so a backtracking search from a logged eventId lands on the
 * exact bucket object -- no separate random id in between.
 *
 * Shape: `{module}-{action}-{ref-}{ISO timestamp}-{rand6}`, e.g.
 * `PO-close-482-2026-07-09T11-45-23-456Z-a1b2c3`. `ref` is the entity id the
 * event is about (poId, vendorId, ...); omit it for pre-insert events where
 * no id exists yet.
 */
export function makeEventId(module: string, action: string, ref?: string | number): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-")
  const rand = Math.random().toString(36).slice(2, 8)
  const parts = [module, action]
  if (ref !== undefined && ref !== null && ref !== "") parts.push(String(ref))
  parts.push(ts, rand)
  return parts.join("-")
}

// S3 key is derived directly from eventId -- no extra random path segment --
// so the same string logged via `eventId` resolves straight to this object.
function eventKey(status: EventStatus, module: string, eventId: string): string {
  return `${status}-events/${module}/${eventId}.json`
}

/**
 * Record a raw event (before DB write).
 * Call this as soon as a request is validated and about to be processed.
 */
export function recordRawEvent(module: string, eventId: string, payload: unknown): void {
  putEvent(eventKey("raw", module, eventId), { module, eventId, payload, ts: new Date().toISOString() })
}

/**
 * Record a processed event (after successful DB write).
 */
export function recordProcessedEvent(module: string, eventId: string, payload: unknown): void {
  putEvent(eventKey("processed", module, eventId), { module, eventId, payload, ts: new Date().toISOString() })
}

/**
 * Record a failed event (after DB error or validation failure).
 */
export function recordFailedEvent(module: string, eventId: string, payload: unknown, error: string): void {
  putEvent(eventKey("failed", module, eventId), { module, eventId, payload, error, ts: new Date().toISOString() })
}
