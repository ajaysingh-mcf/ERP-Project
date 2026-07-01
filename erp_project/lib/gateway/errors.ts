import { NextResponse } from "next/server"

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message)
  }
}

export function toErrorResponse(err: unknown, requestId: string) {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: err.message, code: err.code, details: err.details, requestId },
      { status: err.status }
    )
  }
  return NextResponse.json(
    { error: "Database error", code: "internal", requestId },
    { status: 500 }
  )
}
