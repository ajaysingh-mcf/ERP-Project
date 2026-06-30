import crypto from "crypto";
import { NextRequest } from "next/server";

export function createRequestContext(
  req: NextRequest,
  userId?: number
) {
  return {
    requestId: crypto.randomUUID(),
    userId,
    method: req.method,
    path: req.nextUrl.pathname,
    startTime: Date.now(),
  };
}