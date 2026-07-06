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

    const params = new URLSearchParams({
      grant_type: "password",
      client_id: "my-trusted-client",
      username: user_name,
      password : password,
    });

    const url = `${base_url}/oauth/token?${params.toString()}`;

    console.log("Requesting:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const body = await response.text();

    console.log(
      "Status:",
      response.status,
      response.statusText
    );

    try {
      console.log(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      console.log(body);
    }
  } catch (err) {
    console.error("Connection failed:", err);
  }
}

testConnection();


// const url = "https://pep.unicommerce.com/oauth/token?grant_type=password&client_id=my-trusted-client&username=erp.prefg@mcaffeine.com&password=ERP@mcaffeine"