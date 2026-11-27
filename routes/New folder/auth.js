import dotenv from "dotenv";
dotenv.config();

let cachedToken = null;
let tokenExpiry = null; // timestamp when token expires

export async function getAccessToken() {
  // ✅ If cached and still valid, reuse it
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  // Otherwise fetch a new token
  const response = await fetch("https://identity.crea.ca/connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      scope: "DDFApi_Read"
    })
  });

  if (!response.ok) {
    throw new Error(`Auth failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();

  // Cache it with expiry (refresh 1 min earlier to be safe)
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

  console.log("🔑 New Access Token created (valid for ~1 hour)");
  return cachedToken;
}
