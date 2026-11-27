// import dotenv from "dotenv";
// dotenv.config();

// export async function getAccessToken() {
//   const response = await fetch("https://identity.crea.ca/connect/token", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/x-www-form-urlencoded"
//     },
//     body: new URLSearchParams({
//       grant_type: "client_credentials",
//       client_id: process.env.CLIENT_ID,
//       client_secret: process.env.CLIENT_SECRET,
//       scope: "DDFApi_Read"
//     })
//   });

//   if (!response.ok) {
//     throw new Error(`Auth failed: ${response.status} ${await response.text()}`);
//   }

//   const data = await response.json();
//   console.log("Access Token:", data.access_token);
//   return data.access_token;
// }

// // Run when file is executed directly
// getAccessToken().catch(err => console.error(err.message));




// // openhouse.js
// import dotenv from "dotenv";
// dotenv.config();

// // 1. Get an access token
// async function getAccessToken() {
//   const response = await fetch("https://identity.crea.ca/connect/token", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/x-www-form-urlencoded"
//     },
//     body: new URLSearchParams({
//       grant_type: "client_credentials",
//       client_id: process.env.CLIENT_ID,
//       client_secret: process.env.CLIENT_SECRET,
//       scope: "DDFApi_Read"
//     })
//   });

//   if (!response.ok) {
//     throw new Error(`Auth failed: ${response.status} ${await response.text()}`);
//   }

//   const data = await response.json();
//   return data.access_token;
// }

// // 2. Call OpenHouse endpoint
// async function getOpenHouses() {
//   try {
//     const token = await getAccessToken();

//     const res = await fetch("https://ddfapi.realtor.ca/odata/v1/OpenHouse", {
//       method: "GET",
//       headers: {
//         "Authorization": `Bearer ${token}`,
//         "Accept": "application/json"
//       }
//     });

//     if (!res.ok) {
//       throw new Error(`API failed: ${res.status} ${await res.text()}`);
//     }

//     const data = await res.json();
//     console.log("Open Houses:", JSON.stringify(data, null, 2));
//   } catch (err) {
//     console.error("Error:", err.message);
//   }
// }

// // Run it
// getOpenHouses();




// // openhouseSelect.js
// import dotenv from "dotenv";
// dotenv.config();

// async function getAccessToken() {
//   const response = await fetch("https://identity.crea.ca/connect/token", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/x-www-form-urlencoded"
//     },
//     body: new URLSearchParams({
//       grant_type: "client_credentials",
//       client_id: process.env.CLIENT_ID,
//       client_secret: process.env.CLIENT_SECRET,
//       scope: "DDFApi_Read"
//     })
//   });

//   if (!response.ok) {
//     throw new Error(`Auth failed: ${response.status} ${await response.text()}`);
//   }

//   const data = await response.json();
//   return data.access_token;
// }

// async function getOpenHouseKeys() {
//   try {
//     const token = await getAccessToken();

//     const res = await fetch(
//       "https://ddfapi.realtor.ca/odata/v1/OpenHouse?$select=OpenHouseKey",
//       {
//         method: "GET",
//         headers: {
//           "Authorization": `Bearer ${token}`,
//           "Accept": "application/json"
//         }
//       }
//     );

//     if (!res.ok) {
//       throw new Error(`API failed: ${res.status} ${await res.text()}`);
//     }

//     const data = await res.json();
//     console.log("OpenHouse Keys:", JSON.stringify(data, null, 2));
//   } catch (err) {
//     console.error("Error:", err.message);
//   }
// }

// getOpenHouseKeys();







// // replication.js
// import dotenv from "dotenv";
// dotenv.config();

// async function getAccessToken() {
//   const response = await fetch("https://identity.crea.ca/connect/token", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/x-www-form-urlencoded"
//     },
//     body: new URLSearchParams({
//       grant_type: "client_credentials",
//       client_id: process.env.CLIENT_ID,
//       client_secret: process.env.CLIENT_SECRET,
//       scope: "DDFApi_Read"
//     })
//   });

//   if (!response.ok) {
//     throw new Error(`Auth failed: ${response.status} ${await response.text()}`);
//   }

//   const data = await response.json();
//   return data.access_token;
// }

// async function callReplication(endpoint) {
//   try {
//     const token = await getAccessToken();

//     const res = await fetch(`https://ddfapi.realtor.ca/${endpoint}`, {
//       method: "GET",
//       headers: {
//         "Authorization": `Bearer ${token}`,
//         "Accept": "application/json"
//       }
//     });

//     if (!res.ok) {
//       throw new Error(`API failed: ${res.status} ${await res.text()}`);
//     }

//     const data = await res.json();
//     console.log(`📌 Response from ${endpoint}:`, JSON.stringify(data, null, 2));
//   } catch (err) {
//     console.error(`❌ Error from ${endpoint}:`, err.message);
//   }
// }

// // Examples
// await callReplication("Office/OfficeReplication");
// await callReplication("Member/MemberReplication");
// await callReplication("Property/PropertyReplication");









// propertyOdata.js
import dotenv from "dotenv";
dotenv.config();

let cachedToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  // ✅ Reuse token if still valid
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

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

  // Save token + expiry time (convert expires_in to ms)
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // refresh 1 min early

  return cachedToken;
}

async function getProperties() {
  try {
    const token = await getAccessToken();

    // Example query: limit to 5 results with selected fields
    // const url = "https://ddfapi.realtor.ca/odata/v1/Property ";
    const url = "https://ddfapi.realtor.ca/odata/v1/Property/PropertyReplication()";
    // const url = "https://ddfapi.realtor.ca/odata/v1/Destination";
    // const url = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=Latitude lt 50 and Latitude gt 40 and Longitude gt -70 and Longitude lt -80 `;
    // const url = "https://ddfapi.realtor.ca/odata/v1/Property?$filter=Latitude gt 56 ";

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      throw new Error(`API failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    console.log("📌 Property Results:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

// Example calls
await getProperties();   // ✅ first call generates token
await getProperties();   // ✅ second call reuses cached token

