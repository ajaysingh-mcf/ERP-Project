import { NextResponse } from "next/server"
import { withGateway } from "@/lib/gateway/with-gateway"

const UNIWARE_BASE_URL  = process.env.UNIWARE_BASE_URL
const UNIWARE_USER_NAME = process.env.UNIWARE_USER_NAME
const UNIWARE_PASSWORD  = process.env.UNIWARE_PASSWORD

/**
 * Uniware sometimes responds 200 with an empty or non-JSON body (e.g. an
 * HTML error page from a gateway in front of the API), which makes
 * `response.json()` throw the unhelpful "Unexpected end of JSON input".
 * Read the body as text first so a parse failure can report the actual
 * status and raw response instead of just the parser's generic error.
 */
async function parseJsonResponse(response: Response, label: string): Promise<any> {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(
      `${label} returned a non-JSON response (status ${response.status}): ${text.slice(0, 300) || "<empty body>"}`
    )
  }
}

async function getAccessToken(): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "password",
    client_id: "my-trusted-client",
    username: UNIWARE_USER_NAME!,
    password: UNIWARE_PASSWORD!,
  })

  const response = await fetch(`${UNIWARE_BASE_URL}/oauth/token?${params.toString()}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  })

  const body = await parseJsonResponse(response, "Uniware auth")

  if (!response.ok || !body.access_token) {
    throw new Error(`Uniware auth failed with status ${response.status}: ${JSON.stringify(body)}`)
  }

  return body.access_token as string
}

export const GET = withGateway({
  handler: async () => {
  if (!UNIWARE_BASE_URL || !UNIWARE_USER_NAME || !UNIWARE_PASSWORD) {
    return NextResponse.json(
      { error: "Missing Uniware environment variables." },
      { status: 500 }
    )
  }

  try {
    const accessToken = await getAccessToken()

    const response = await fetch(
      `${UNIWARE_BASE_URL}/services/rest/v1/catalog/itemType/search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `bearer ${accessToken}`,
        },
        body: JSON.stringify({
          pageNumber: 1,
          pageSize: 100,
        }),
      }
    )

    const data = await parseJsonResponse(response, "Uniware itemType search")

    if (!response.ok) {
      return NextResponse.json(
        { error: `Uniware itemType search failed with status ${response.status}`, details: data },
        { status: 502 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to reach Uniware.",
      },
      { status: 500 }
    )
  }
  },
})