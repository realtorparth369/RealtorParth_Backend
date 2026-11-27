// import dotenv from "dotenv";
// import axios from "axios";
// import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";

// dotenv.config();

// let cachedToken = null;
// let tokenExpiry = null;

// async function getAccessToken() {
//   if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) return cachedToken;

//   const response = await axios.post(
//     "https://identity.crea.ca/connect/token",
//     new URLSearchParams({
//       grant_type: "client_credentials",
//       client_id: process.env.CLIENT_ID,
//       client_secret: process.env.CLIENT_SECRET,
//       scope: "DDFApi_Read",
//     }),
//     { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
//   );

//   cachedToken = response.data.access_token;
//   tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
//   return cachedToken;
// }

// async function fetchMetadata() {
//   try {
//     const token = await getAccessToken();
//     const url = "https://ddfapi.realtor.ca/odata/v1/$metadata";

//     const response = await axios.get(url, {
//       headers: { Authorization: `Bearer ${token}`, Accept: "application/xml" },
//     });

//     const xmlData = response.data;

//     // ✅ Parse and pretty-print XML as JSON
//     const parser = new XMLParser({
//       ignoreAttributes: false,
//       attributeNamePrefix: "@_",
//       format: true,
//     });

//     const jsonObj = parser.parse(xmlData);

//     console.log("✅ Metadata fetched in readable JSON format:\n");
//     console.dir(jsonObj, { depth: null, colors: true });
//   } catch (error) {
//     console.error("❌ Error fetching metadata:", error.message);
//   }
// }

// fetchMetadata();







// import dotenv from "dotenv";
// import axios from "axios";

// dotenv.config();

// let cachedToken = null;
// let tokenExpiry = null;

// async function getAccessToken() {
//   if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) return cachedToken;

//   const response = await axios.post(
//     "https://identity.crea.ca/connect/token",
//     new URLSearchParams({
//       grant_type: "client_credentials",
//       client_id: process.env.CLIENT_ID,
//       client_secret: process.env.CLIENT_SECRET,
//       scope: "DDFApi_Read",
//     }),
//     { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
//   );

//   cachedToken = response.data.access_token;
//   tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
//   return cachedToken;
// }


// export async function fetchProperties() {
//   const pageSize = 100; // CREA DDF max
//   let allProperties = [];
//   let skip = 0;
//   let hasMore = true;

//   while (hasMore) {
//     const token = await getAccessToken();
//     const url = `https://ddfapi.realtor.ca/odata/v1/Property?$top=${pageSize}&$skip=${skip}`;

//     const res = await axios.get(url, {
//       headers: { Authorization: `Bearer ${token}` },
//     });

//     const properties = res.data.value;
//     allProperties = [...allProperties, ...properties];

//     // If fewer than pageSize returned, we reached the end
//     if (properties.length < pageSize) {
//       hasMore = false;
//     } else {
//       skip += pageSize;
//     }
//   }

//   return allProperties;
// }




import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

let cachedToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) return cachedToken;

  const response = await axios.post(
    "https://identity.crea.ca/connect/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      scope: "DDFApi_Read",
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  cachedToken = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
  return cachedToken;
}

/**
 * Fetch paginated properties
 * @param {number} page - current page number (1-based)
 * @param {number} pageSize - number of properties per page
 */
export async function fetchProperties(page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize;
  const token = await getAccessToken();

  const url = `https://ddfapi.realtor.ca/odata/v1/Property?$top=${pageSize}&$skip=${skip}`;

  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return res.data.value; // array of properties
}





// export async function fetchProperties(top = 80, skip = 0) {
//   const token = await getAccessToken();
//   const url = `https://ddfapi.realtor.ca/odata/v1/Property?$top=${top}&$skip=${skip}`;

//   const res = await axios.get(url, {
//     headers: { Authorization: `Bearer ${token}` },
//   });

//   return res.data.value; // array of properties
// }




// export async function fetchAllProperties() {
//   const pageSize = 100; // CREA DDF max
//   let allProperties = [];
//   let skip = 0;
//   let hasMore = true;

//   while (hasMore) {
//     const token = await getAccessToken();
//     const url = `https://ddfapi.realtor.ca/odata/v1/Property?$top=${pageSize}&$skip=${skip}`;

//     const res = await axios.get(url, {
//       headers: { Authorization: `Bearer ${token}` },
//     });

//     const properties = res.data.value;
//     allProperties = [...allProperties, ...properties];

//     // If fewer than pageSize returned, we reached the end
//     if (properties.length < pageSize) {
//       hasMore = false;
//     } else {
//       skip += pageSize;
//     }
//   }

//   return allProperties;
// }
