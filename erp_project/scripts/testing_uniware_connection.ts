import "dotenv/config";

const user_name = process.env.UNIWARE_USER_NAME;
const password = process.env.UNIWARE_PASSWORD;
const base_url = process.env.UNIWARE_BASE_URL;

async function testConnection() {
  try {
    if (!user_name || !password || !base_url) {
      throw new Error(
        "Missing UNIWARE_USER_NAME, UNIWARE_PASSWORD or UNIWARE_BASE_URL"
      );
    }

    // Per Uniware's OAuth docs: only grant_type/client_id are query params —
    // username/password go in HEADERS, not the query string. Sending them as
    // query params (the original bug) makes the server fall through to its
    // browser-based SSO login page instead of issuing a token.
    const params = new URLSearchParams({
      grant_type: "password",
      client_id: "my-trusted-client",
    });

    const url = `${base_url}/oauth/token?${params.toString()}`;
    console.log("Requesting:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        username: user_name,
        password,
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    const bodyText = await response.text();

    console.log("Status:", response.status, response.statusText);
    console.log("Content-Type:", contentType);

    // Some Uniware error responses come back as valid JSON without a proper
    // Content-Type header, so try parsing regardless and only fall back to
    // printing raw text if it's genuinely not JSON (e.g. an HTML login page).
    try {
      console.log(JSON.stringify(JSON.parse(bodyText), null, 2));
    } catch {
      console.error("Response body is not JSON — printing raw body:");
      console.error(bodyText.slice(0, 500));
    }
  } catch (err) {
    console.error("Connection failed:", err);
  }
}

testConnection();