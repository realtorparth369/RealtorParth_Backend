import dotenv from "dotenv";
import axios from "axios";
import XLSX from "xlsx";
import fs from "fs";

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

async function fetchAndSave(skip = 240, top = 80, lastSync = "2024-01-1T00:00.00Z") {
  try {
    const token = await getAccessToken();
    // const url = `https://ddfapi.realtor.ca/odata/v1/Property?$top=${top}&$skip=${skip}`;
    // const url = `https://ddfapi.realtor.ca/odata/v1/Property?$top=${top}&$skip=${skip}&$orderby=ListingKey asc`;
    // const url = `https://ddfapi.realtor.ca/Property/PropertyReplication()?$top=${top}&$skip=${skip}`;


  // const url = `https://ddfapi.realtor.ca/odata/v1/Property?$top=${top}&$skip=${skip}&$orderby=ModificationTimestamp desc`;

  const url = `https://ddfapi.realtor.ca/odata/v1/Property/PropertyReplication()` +
            `?$filter=ModificationTimestamp gt ${encodeURIComponent(lastSync)}` +
            `&$top=${top}&$orderby=ModificationTimestamp asc`;
  // const url = `https://ddfapi.realtor.ca/odata/v1/Property/PropertyReplication()?$filter=ModificationTimestamp gt ${lastSync}&$top=${top}&$orderby=ModificationTimestamp asc`;

// 28831798
// to
// 28800376

// to
// 28862415
// to
// 28850592

// to
// 28879389
// to
// 28885168

// to
// 28831798
// to
// 28036626

    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const properties = response.data.value || [];

    const newRows = properties.map((p) => ({
      ListingKey: p.ListingKey,
      ListingId: p.ListingId,
      Status: p.StandardStatus,
      SubType: p.PropertySubType,
      ListPrice: p.ListPrice,
      Address: p.UnparsedAddress,
      City: p.City,
      Province: p.StateOrProvince,
      PostalCode: p.PostalCode,
      Country: p.Country,
      Latitude: p.Latitude,
      Longitude: p.Longitude,
      Remarks: p.PublicRemarks,
      ListingURL: p.ListingURL,
      MainPhoto: p.Media?.length > 0 ? p.Media[0].MediaURL : null,
      DateModified: p.ModificationTimestamp,
    }));

    const filePath = "properties_only_New&Updated.xlsx";
    let allRows = [];

    if (fs.existsSync(filePath)) {
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.Sheets["Properties"];
      const existingRows = XLSX.utils.sheet_to_json(sheet);

      // ✅ Add separator row between old and new data
      const separatorRow = { ListingKey: "--- NEW DATA ---" };
      allRows = [...existingRows, separatorRow, ...newRows];

      // Write merged sheet
      const worksheet = XLSX.utils.json_to_sheet(allRows);

      // Make the separator row bigger
      const sepRowIndex = existingRows.length + 2; // Excel is 1-based
      const cell = worksheet[`A${sepRowIndex}`];
      if (cell) {
        cell.s = { font: { sz: 16, bold: true } }; // font size 16, bold
      }

      const newWorkbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(newWorkbook, worksheet, "Properties");
      XLSX.writeFile(newWorkbook, filePath);

      console.log(`✅ Appended ${newRows.length} records with separator. Total: ${allRows.length}`);
    } else {
      // First time, just write new data
      const worksheet = XLSX.utils.json_to_sheet(newRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Properties");
      XLSX.writeFile(workbook, filePath);

      console.log(`✅ Saved ${newRows.length} records to ${filePath}`);
    }
  } catch (error) {
    console.error("❌ Error fetching/saving data:", error.message);
  }
}

// Example usage
await fetchAndSave(0, 80);
// await fetchAndSave(80, 80);



    // const url = "https://ddfapi.realtor.ca/odata/v1/Property?$top=80&$skip=80"; // limit results for testing











// import express from "express";
// import path from "path";
// import { fileURLToPath } from "url";
// import fetch from "node-fetch";
// import dotenv from "dotenv";

// dotenv.config();
// const app = express();

// // For __dirname in ES modules
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Serve static frontend files
// app.use(express.static(path.join(__dirname, "public")));

// let cachedToken = null;
// let tokenExpiry = null;

// async function getAccessToken() {
//   if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
//     return cachedToken;
//   }
//   const response = await fetch("https://identity.crea.ca/connect/token", {
//     method: "POST",
//     headers: { "Content-Type": "application/x-www-form-urlencoded" },
//     body: new URLSearchParams({
//       grant_type: "client_credentials",
//       client_id: process.env.CLIENT_ID,
//       client_secret: process.env.CLIENT_SECRET,
//       scope: "DDFApi_Read"
//     })
//   });

//   const data = await response.json();
//   cachedToken = data.access_token;
//   tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
//   return cachedToken;
// }

// async function fetchProperties() {
//   const token = await getAccessToken();
// //   const url = "https://ddfapi.realtor.ca/odata/v1/Property?$top=12"; // 12 cards
// const url =
//   "https://ddfapi.realtor.ca/odata/v1/Property?$select=ListingKey,UnparsedAddress,ListPrice,BedroomsTotal,BathroomsTotal,PublicRemarks&$top=20";


//   const res = await fetch(url, {
//     headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
//   });

//   const data = await res.json();
//   return data.value || [];
// }

// // Backend API endpoint
// app.get("/properties", async (req, res) => {
//   try {
//     const properties = await fetchProperties();
//     res.json(properties);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// app.listen(4000, () => console.log("✅ App running at http://localhost:4000/front.html"));

