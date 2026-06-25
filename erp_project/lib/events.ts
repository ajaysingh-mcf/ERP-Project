import { putEvent } from "@/lib/s3"

type EventStatus = "raw" | "processed" | "failed"

function eventKey(status: EventStatus, module: string, eventId: string): string {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return `${status}-events/${module}/${date}/${eventId}.json`
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
