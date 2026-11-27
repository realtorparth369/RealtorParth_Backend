import { fetchProperties } from "../metadata.js";
import express from "express";
import mongoose from "mongoose";
import axios from "axios";
import { getAccessToken } from "../auth.js";
import Property from "../models/Property.js"; // your schema
import cors from 'cors';
import Wishlist from "../models/WishList.js"; // your MongoDB model
import cron from "node-cron";
import PropertyModel from "../models/Property.js"; // make sure you have .js here
import User from "../models/User.js";
import SelectedProperties from "../models/SelectedProperties.js";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import Blog from "../models/Blog.js";


const router = express.Router();



// Static credentials
const USER = { id: "admin", password: "1234" };
// const USER = { id: "admin@admin.com", password: "admin789" };

// Login route
router.post("/login", (req, res) => {
  const { id, password } = req.body;

  if (id === USER.id && password === USER.password) {
    console.log("yes")
    return res.status(200).json({ message: "Login successful" });
  } else {
    console.log("not")
    return res.status(401).json({ message: "Invalid ID or password" });
  }
});



// Save selected properties globally
router.post("/properties/save-selected", async (req, res) => {
  try {
    const { selected } = req.body;

    if (!Array.isArray(selected)) {
      return res.status(400).json({ message: "Invalid data format" });
    }

    // Update the single document OR create it if missing
    const result = await SelectedProperties.findOneAndUpdate(
      {},
      { selected },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: "Selected properties updated successfully!",
      data: result,
    });

  } catch (error) {
    console.error("Error saving selected properties:", error);
    res.status(500).json({ message: "Server error", error });
  }
});


// Load selected properties
router.get("/property/get-selected", async (req, res) => {
  try {
    const data = await SelectedProperties.findOne({});

    res.json({
      success: true,
      selected: data?.selected || [],
    });

  } catch (error) {
    console.error("Error fetching selected properties:", error);
    res.status(500).json({ message: "Server error", error });
  }
});


router.get("/property/:listingKey", async (req, res) => {
  try {
    const listingKey = req.params.listingKey;
    const token = await getAccessToken();

    // ✅ Use filter instead of invalid (ListingKey=...)
    const url = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=ListingKey eq '${listingKey}'`;

    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // DDF always returns an array in `value`
    const property = response.data.value[0];

    if (!property) {
      return res.status(404).send("Property not found");
    }

    res.render("propertyDetail", { property });
  } catch (err) {
    console.error("❌ Error fetching property details:", err.response?.data || err.message);
    res.status(500).send("Error fetching property details");
  }
});



router.get("/properties/office/:officeKey/random5", async (req, res) => {
  try {
    const token = await getAccessToken();
    const officeKey = req.params.officeKey;

    // ⭐ Load selected listing keys from DB
    const selectedDoc = await SelectedProperties.findOne({});
    const selectedKeys = selectedDoc?.selected || [];

    if (selectedKeys.length === 0) {
      return res.json({ properties: [] });
    }

    // Fetch larger list of office properties
    const filter = encodeURIComponent(`listOfficeKey eq '${officeKey}'`);
    const url = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=${filter}&$top=100`;

    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const allProps = response.data.value || [];

    // ⭐ Filter only selected properties
    const selectedProps = allProps.filter((p) =>
      selectedKeys.includes(p.ListingKey)
    );

    // ⭐ If fewer than 5 selected → return all
    if (selectedProps.length <= 5) {
      return res.json({ properties: selectedProps });
    }

    // ⭐ Shuffle (Fisher-Yates)
    for (let i = selectedProps.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [selectedProps[i], selectedProps[j]] = [selectedProps[j], selectedProps[i]];
    }

    // ⭐ Take random 5
    const random5 = selectedProps.slice(0, 5);

    console.log(
      `🎯 Random 5 (from ${selectedProps.length} selected):`,
      random5.length
    );

    res.json({ properties: random5 });

  } catch (err) {
    console.error("❌ Error fetching random properties:", err.response?.data || err.message);
    res.status(500).json({ error: "Error fetching random properties" });
  }
});


router.get("/properties/sample", async (req, res) => {
  const token = await getAccessToken();
  const url = `https://ddfapi.realtor.ca/odata/v1/Property?$top=5`;
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  res.json(response.data.value.map(p => ({
    ListingKey: p.ListingKey,
    MlsNumber: p.MlsNumber,
    Address: p.Address?.AddressText,
  })));
});





import * as XLSX from "xlsx";
import fs from "fs";
// import path from "path";


// 👉 Fetch Calgary properties and save them to Excel
router.get("/propertiesss/calgary", async (req, res) => {
  try {
    const token = await getAccessToken();

    if (!token) {
      return res.status(401).json({ error: "Failed to get access token" });
    }

    let allProperties = [];
    let skip = 0;
    const fetchSize = 100;
    let keepFetching = true;

    console.log("🚀 Starting Calgary property data fetch...");

    while (keepFetching) {
      // Filter for City eq 'Calgary'
      const filter = encodeURIComponent(`City eq 'Calgary'`);
      const url = `https://ddfapi.realtor.ca/odata/v1/Property?$top=${fetchSize}&$skip=${skip}&$filter=${filter}`;

      console.log(`🔗 Fetching: ${url}`);

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      const batch = response.data?.value || [];

      if (batch.length === 0) {
        console.log("⚠️ No more Calgary properties returned from API");
        keepFetching = false;
        break;
      }

      const simplified = batch.map((p) => ({
        ListingKey: p.ListingKey || p.ListingKeyNumeric || "N/A",
        MlsNumber: p.MlsNumber || "N/A",
        ListAgentKey: p.ListAgentKey || "N/A",
        ListAgentFullName: p.ListAgentFullName || "N/A",
        ListOfficeKey: p.ListOfficeKey || "N/A",
        ListOfficeName: p.ListOfficeName || "N/A",
        Address: p.Address?.AddressText || "N/A",
        Price: p.Price || "N/A",
        PropertyType: p.PropertyType || "N/A",
        TransactionType: p.TransactionType || "N/A",
      }));

      allProperties = allProperties.concat(simplified);
      console.log(`✅ Batch fetched: ${simplified.length}, Total so far: ${allProperties.length}`);

      if (batch.length < fetchSize) {
        keepFetching = false;
      } else {
        skip += fetchSize;
      }
    }

    if (allProperties.length === 0) {
      return res.status(404).json({ error: "No Calgary properties found" });
    }

    // --- 🧾 SAVE TO EXCEL ---
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(allProperties);
    XLSX.utils.book_append_sheet(workbook, worksheet, "CalgaryProperties");

    const filePath = path.join(process.cwd(), "calgary_properties.xlsx");
    XLSX.writeFile(workbook, filePath);

    console.log(`💾 Saved ${allProperties.length} Calgary records to ${filePath}`);

    res.json({
      message: "✅ Calgary properties fetched and saved to Excel successfully!",
      total: allProperties.length,
      file: "calgary_properties.xlsx",
    });
  } catch (err) {
    console.error("❌ Error fetching Calgary properties:", err.response?.data || err.message);
    res.status(500).json({
      error: "Error fetching Calgary properties",
      details: err.response?.data || err.message,
    });
  }
});





router.get("/propertiesss/alberta", async (req, res) => {
  try {
    const token = await getAccessToken();

    if (!token) {
      return res.status(401).json({
        error: "Failed to get access token",
      });
    }

    let allProperties = [];
    let skip = 0;
    const top = 100;
    let hasMore = true;

    console.log("🚀 Fetching Alberta properties...");

    while (hasMore) {
      const filter = encodeURIComponent(`StateOrProvince eq 'Alberta'`);
      const url = `https://ddfapi.realtor.ca/odata/v1/Property?$top=${top}&$skip=${skip}&$filter=${filter}`;

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      const properties = response.data?.value || [];

      if (properties.length === 0) {
        hasMore = false;
        break;
      }

      allProperties = [...allProperties, ...properties];

      console.log(
        `✅ Got ${properties.length} properties | Total: ${allProperties.length}`
      );

      skip += top;
    }

    res.json({
      success: true,
      total: allProperties.length,
      data: allProperties,
    });

  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});

router.get("/test-property", async (req, res) => {
  try {
    const token = await getAccessToken();

    const response = await axios.get(
      "https://ddfapi.realtor.ca/odata/v1/Property?$top=1",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );

    // show all available fields
    console.log(response.data.value[0]);

    res.json(response.data.value[0]);

  } catch (err) {
    console.error(err.response?.data || err.message);

    res.status(500).json({
      error: err.response?.data || err.message,
    });
  }
});


// =====================================================
// DASHBOARD - LISTING STATISTICS
// GET /properties/office/dashboard-stats/:officeKey
// =====================================================

// ============================================================
// DASHBOARD LISTING STATS
// Fast version - parallel Realtor.ca requests + cache
// ============================================================

router.get(
  "/properties/office/dashboard-stats/:officeKey",
  async (req, res) => {
    try {
      const officeKey = req.params.officeKey;

      if (!officeKey) {
        return res.status(400).json({
          success: false,
          message: "Office key is required",
        });
      }

      // ========================================================
      // CACHE
      // Keep dashboard stats for 60 seconds.
      // This prevents hitting Realtor.ca every dashboard refresh.
      // ========================================================

      const CACHE_TIME = 60 * 1000;

      // Make sure this exists outside the route.
      // If you don't already have it, see section below.
      const cached = dashboardListingStatsCache.get(officeKey);

      if (
        cached &&
        Date.now() - cached.timestamp < CACHE_TIME
      ) {
        console.log(
          `⚡ Dashboard listing stats served from cache: ${officeKey}`
        );

        return res.json({
          success: true,
          totalListings: cached.totalListings,
          selectedListings: cached.selectedListings,
          cached: true,
        });
      }


      // ========================================================
      // GET REALTOR ACCESS TOKEN
      // ========================================================

      const token = await getAccessToken();


      // ========================================================
      // GET SELECTED PROPERTY KEYS FROM MONGODB
      // ========================================================

      const selectedDoc =
        await SelectedProperties.findOne({}).lean();

      const selectedKeys = new Set(
        selectedDoc?.selected || []
      );


      // ========================================================
      // REALTOR API
      // ========================================================

      const baseUrl =
        "https://ddfapi.realtor.ca/odata/v1/Property";

      const headers = {
        Authorization: `Bearer ${token}`,
      };


      // ========================================================
      // PAGE SIZE
      // ========================================================

      const fetchSize = 100;


      // ========================================================
      // FIRST REQUEST
      //
      // We request $count=true so we know how many records
      // Realtor.ca has for this office.
      // ========================================================

      console.log(
        `🔎 Fetching dashboard listing stats for office: ${officeKey}`
      );

      const firstResponse = await axios.get(
        baseUrl,
        {
          headers,
          params: {
            $filter: `listOfficeKey eq '${officeKey}'`,
            $select:
              "ListingKey,PropertySubType,BuildingType",
            $top: fetchSize,
            $skip: 0,
            $count: true,
          },

          // Don't let one external request hang forever.
          timeout: 15000,
        }
      );


      // ========================================================
      // FIRST BATCH
      // ========================================================

      const firstBatch =
        firstResponse.data?.value || [];


      // ========================================================
      // TOTAL RECORD COUNT FROM REALTOR
      // ========================================================

      const realtorTotal =
        Number(
          firstResponse.data?.["@odata.count"]
        ) || 0;


      console.log(
        `📊 Realtor total records: ${realtorTotal}`
      );


      // ========================================================
      // RESIDENTIAL FILTER
      // ========================================================

      const isResidential = (property) => {

        const sub =
          property.PropertySubType
            ?.toLowerCase()
            .trim() || "";

        const build =
          property.BuildingType
            ?.toLowerCase()
            .trim() || "";

        const isCommercial =
          sub.includes("office") ||
          sub.includes("retail") ||
          sub.includes("commercial") ||
          sub.includes("industrial") ||
          sub.includes("business") ||

          build.includes("office") ||
          build.includes("retail") ||
          build.includes("commercial") ||
          build.includes("industrial") ||
          build.includes("business");

        return !isCommercial;
      };


      // ========================================================
      // PROCESS A BATCH
      // ========================================================

      const processBatch = (batch) => {

        const residential =
          batch.filter(isResidential);

        let total = residential.length;
        let selected = 0;

        for (const property of residential) {

          if (
            selectedKeys.has(
              property.ListingKey
            )
          ) {
            selected++;
          }
        }

        return {
          total,
          selected,
        };
      };


      // ========================================================
      // PROCESS FIRST BATCH
      // ========================================================

      let totalListings = 0;
      let selectedListings = 0;

      const firstStats =
        processBatch(firstBatch);

      totalListings += firstStats.total;
      selectedListings += firstStats.selected;


      // ========================================================
      // DETERMINE REMAINING PAGES
      // ========================================================

      const totalPages =
        Math.ceil(
          realtorTotal / fetchSize
        );


      console.log(
        `📄 Total pages: ${totalPages}`
      );


      // ========================================================
      // FETCH REMAINING PAGES IN PARALLEL
      //
      // Instead of:
      //
      // page 1 → wait → page 2 → wait → page 3
      //
      // we do:
      //
      // page 2 ─┐
      // page 3 ─┤
      // page 4 ─┤
      // page 5 ─┘
      //
      // ========================================================

      const remainingPages = [];

      for (
        let page = 1;
        page < totalPages;
        page++
      ) {
        remainingPages.push(page);
      }


      // ========================================================
      // CONCURRENCY
      //
      // Don't fire hundreds of requests at once.
      // 5 at a time is safer for Realtor API.
      // ========================================================

      const CONCURRENCY = 5;


      for (
        let i = 0;
        i < remainingPages.length;
        i += CONCURRENCY
      ) {

        const pageGroup =
          remainingPages.slice(
            i,
            i + CONCURRENCY
          );


        const responses =
          await Promise.all(
            pageGroup.map(
              async (page) => {

                const skip =
                  page * fetchSize;

                try {

                  const response =
                    await axios.get(
                      baseUrl,
                      {
                        headers,

                        params: {
                          $filter:
                            `listOfficeKey eq '${officeKey}'`,

                          $select:
                            "ListingKey,PropertySubType,BuildingType",

                          $top:
                            fetchSize,

                          $skip:
                            skip,
                        },

                        timeout: 15000,
                      }
                    );

                  return (
                    response.data?.value ||
                    []
                  );

                } catch (error) {

                  console.error(
                    `❌ Realtor page ${page} failed:`,
                    error.response?.data ||
                    error.message
                  );

                  throw error;
                }
              }
            )
          );


        // ======================================================
        // PROCESS RESPONSES
        // ======================================================

        for (const batch of responses) {

          const stats =
            processBatch(batch);

          totalListings +=
            stats.total;

          selectedListings +=
            stats.selected;
        }


        console.log(
          `⚡ Processed pages ${i + 1} - ${Math.min(
            i + CONCURRENCY,
            remainingPages.length
          )} of ${remainingPages.length}`
        );
      }


      // ========================================================
      // SAVE TO CACHE
      // ========================================================

      dashboardListingStatsCache.set(
        officeKey,
        {
          totalListings,
          selectedListings,
          timestamp: Date.now(),
        }
      );


      // ========================================================
      // FINAL RESPONSE
      // ========================================================

      console.log(
        `✅ Dashboard listing stats complete`,
        {
          officeKey,
          totalListings,
          selectedListings,
        }
      );


      return res.json({
        success: true,

        totalListings,

        selectedListings,

        cached: false,
      });


    } catch (error) {

      console.error(
        "❌ Dashboard Listing Stats Error:"
      );

      console.error(
        error.response?.data ||
        error.message ||
        error
      );


      return res.status(500).json({
        success: false,

        message:
          "Failed to fetch listing statistics",

        error:
          process.env.NODE_ENV === "production"
            ? undefined
            : (
              error.response?.data ||
              error.message
            ),
      });
    }
  }
);

router.get("/properties/office/admin/:officeKey", async (req, res) => {
  try {
    const token = await getAccessToken();
    const officeKey = req.params.officeKey;

    // Load selected from DB (same as before)
    const selectedDoc = await SelectedProperties.findOne({});
    const selectedKeys = selectedDoc?.selected || [];

    let allProperties = [];
    let skip = 0;
    const fetchSize = 100;

    const filter = encodeURIComponent(`listOfficeKey eq '${officeKey}'`);

    while (true) {
      // const url = `https://ddfapi.realtor.ca/odata/v1/Property`;
      const url = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=${filter}&$top=${fetchSize}&$skip=${skip}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const batch = response.data.value;
      allProperties = [...allProperties, ...batch];

      if (batch.length < fetchSize) break;
      skip += fetchSize;
    }

    // 🔥 FILTER OUT COMMERCIAL / BUSINESS PROPERTIES
    const residentialList = allProperties.filter((p) => {
      const sub = p.PropertySubType?.toLowerCase() || "";
      const build = p.BuildingType?.toLowerCase() || "";

      const isCommercial =
        sub.includes("office") ||
        sub.includes("retail") ||
        sub.includes("commercial") ||
        sub.includes("industrial") ||
        sub.includes("business") ||
        build.includes("office") ||
        build.includes("retail") ||
        build.includes("commercial") ||
        build.includes("industrial") ||
        build.includes("business");

      return !isCommercial;
    });

    // 🔥 ADD isSelected FLAG
    const finalList = residentialList.map((p) => ({
      ...p,
      isSelected: selectedKeys.includes(p.ListingKey),
    }));

    res.json({ properties: finalList });

  } catch (err) {
    console.error("❌ Error fetching properties:", err.response?.data || err);
    res.status(500).json({ error: "Error fetching properties" });
  }
});



router.get("/properties/office/:officeKey", async (req, res) => {
  try {
    const token = await getAccessToken();
    const officeKey = req.params.officeKey;

    // Load selected IDs from DB
    const selectedDoc = await SelectedProperties.findOne({});
    const selectedList = selectedDoc?.selected || [];

    let allProperties = [];
    let skip = 0;
    const fetchSize = 100;
    let keepFetching = true;

    const filter = encodeURIComponent(`listOfficeKey eq '${officeKey}'`);

    while (keepFetching) {
      const url = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=${filter}&$top=${fetchSize}&$skip=${skip}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const batch = response.data.value;
      allProperties = allProperties.concat(batch);

      if (batch.length < fetchSize) keepFetching = false;
      else skip += fetchSize;
    }

    // Filter ONLY selected properties
    const selectedProps = allProperties.filter((prop) =>
      selectedList.includes(prop.ListingKey)
    );

    res.json({ properties: selectedProps });

  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Error fetching properties" });
  }
});




router.get("/properties/:listingID", async (req, res) => {
  try {
    const { listingID } = req.params;
    const token = await getAccessToken();

    // Fetch property from Realtor.ca API
    const url = `https://ddfapi.realtor.ca/odata/v1/Property('${listingID}')`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Always return property as "property"
    // Some API responses might have value array, fallback to response.data
    const property = response.data.value?.[0] || response.data;

    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    res.json({ property });
  } catch (err) {
    console.error("❌ Error fetching property:", err.response?.data || err.message);
    res.status(500).json({ error: "Property not found" });
  }
});


router.get("/properties/analysis/:listingID", async (req, res) => {
  try {
    const { listingID } = req.params;

    const token = await getAccessToken();

    if (!token) {
      return res.status(401).json({
        error: "Failed to get access token",
      });
    }

    // ✅ Search using ListingId instead of ListingKey
    const filter = encodeURIComponent(
      `ListingId eq '${listingID}'`
    );

    const url =
      `https://ddfapi.realtor.ca/odata/v1/Property?$filter=${filter}`;

    console.log("🔗 URL:", url);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const property = response.data?.value?.[0];

    if (!property) {
      return res.status(404).json({
        error: "Property not found",
      });
    }

    res.json({ property });

  } catch (err) {
    console.error(
      "❌ Error fetching property:",
      err.response?.data || err.message
    );

    res.status(500).json({
      error: "Property not found",
    });
  }
});



// 👉 Get property details by ListingKey
router.get("/propertyy/:listingKey", async (req, res) => {
  try {
    const token = await getAccessToken();
    const listingKey = req.params.listingKey;

    const url = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=ListingKey eq '${listingKey}'`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const property = response.data.value[0];
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    // Extract agent & office info
    const { ListAgentKey, ListAgentFullName, ListOfficeKey, ListOfficeName } = property;

    res.json({
      listingKey,
      property,
      agent: { ListAgentKey, ListAgentFullName },
      office: { ListOfficeKey, ListOfficeName },
    });
  } catch (err) {
    console.error("❌ Error fetching property by ListingKey:", err.response?.data || err.message);
    res.status(500).json({ error: "Error fetching property" });
  }
});




router.get("/properties/analysisdetail/:listingID", async (req, res) => {
  try {
    const { listingID } = req.params;

    const token = await getAccessToken();

    if (!token) {
      return res.status(401).json({
        error: "Failed to get access token",
      });
    }

    // ✅ Search by ListingId
    const filter = encodeURIComponent(
      `ListingId eq '${listingID}'`
    );

    const url =
      `https://ddfapi.realtor.ca/odata/v1/Property?$filter=${filter}`;

    console.log("🔗 URL:", url);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const property = response.data?.value?.[0];

    if (!property) {
      return res.status(404).json({
        error: "Property not found",
      });
    }

    res.json({ property });

  } catch (err) {
    console.error(
      "❌ Error fetching property:",
      err.response?.data || err.message
    );

    res.status(500).json({
      error: "Property not found",
    });
  }
});




// ==========================================
// COMMUNITY QUIZ PROPERTY RECOMMENDATION API
// ==========================================

router.post("/community-quiz", async (req, res) => {

  try {

    const { answers = [], scores = {} } = req.body;

    console.log("🧠 Quiz Attempted");

    // ==========================================
    // FIND BEST MATCH TYPE
    // ==========================================

    let topCommunity = null;
    let maxScore = -1;

    Object.entries(scores).forEach(([community, score]) => {

      if (score > maxScore) {

        maxScore = score;
        topCommunity = community;

      }

    });

    // ==========================================
    // EXTRACT FILTERS
    // ==========================================

    let minBedrooms = null;
    let propertyType = null;
    let minPrice = null;
    let maxPrice = null;
    let fireplace = null;
    let minYearBuilt = null;
    let maxYearBuilt = null;
    let stories = null;
    let minLivingArea = null;
    let maxLivingArea = null;

    answers.forEach((answer) => {

      const filters = answer.filters || {};

      // Bedrooms
      if (filters.BedroomsTotal) {

        minBedrooms = filters.BedroomsTotal;

      }

      // Property Type
      if (filters.PropertySubType) {

        propertyType = filters.PropertySubType;

      }

      // Price
      if (filters.MinPrice) {

        minPrice = filters.MinPrice;

      }

      if (filters.MaxPrice) {

        maxPrice = filters.MaxPrice;

      }

      // Fireplace
      if (
        filters.FireplaceYN !== undefined
      ) {

        fireplace = filters.FireplaceYN;

      }

      // Year Built
      if (filters.MinYearBuilt) {

        minYearBuilt = filters.MinYearBuilt;

      }

      if (filters.MaxYearBuilt) {

        maxYearBuilt = filters.MaxYearBuilt;

      }

      // Stories
      if (filters.Stories) {

        stories = filters.Stories;

      }

      // Living Area
      if (filters.MinLivingArea) {

        minLivingArea = filters.MinLivingArea;

      }

      if (filters.MaxLivingArea) {

        maxLivingArea = filters.MaxLivingArea;

      }

    });

    // ==========================================
    // GET REALTOR TOKEN
    // ==========================================

    const token = await getAccessToken();

    if (!token) {

      return res.status(401).json({

        success: false,

        error: "Failed to get access token",

      });

    }

    // ==========================================
    // BUILD FILTERS
    // ==========================================

    const filters = [];

    // Alberta only
    filters.push(
      `StateOrProvince eq 'Alberta'`
    );

    // Active only
    filters.push(
      `StandardStatus eq 'Active'`
    );

    // ==========================================
    // BEDROOMS
    // ==========================================

    if (minBedrooms) {

      filters.push(
        `BedroomsTotal ge ${minBedrooms}`
      );

    }

    // ==========================================
    // PRICE
    // ==========================================

    if (minPrice) {

      filters.push(
        `ListPrice ge ${minPrice}`
      );

    }

    if (maxPrice) {

      filters.push(
        `ListPrice le ${maxPrice}`
      );

    }

    // ==========================================
    // FIREPLACE
    // ==========================================

    if (fireplace !== null) {

      filters.push(
        `FireplaceYN eq ${fireplace}`
      );

    }

    // ==========================================
    // YEAR BUILT
    // ==========================================

    if (minYearBuilt) {

      filters.push(
        `YearBuilt ge ${minYearBuilt}`
      );

    }

    if (maxYearBuilt) {

      filters.push(
        `YearBuilt le ${maxYearBuilt}`
      );

    }

    // ==========================================
    // STORIES
    // ==========================================

    if (stories) {

      filters.push(
        `Stories eq ${stories}`
      );

    }

    // ==========================================
    // LIVING AREA
    // ==========================================

    if (minLivingArea) {

      filters.push(
        `LivingArea ge ${minLivingArea}`
      );

    }

    if (maxLivingArea) {

      filters.push(
        `LivingArea le ${maxLivingArea}`
      );

    }

    // ==========================================
    // PROPERTY TYPE
    // ==========================================

    // Detached House
    if (propertyType === "Single Family") {

      filters.push(
        `PropertySubType eq 'Single Family'`
      );

    }

    // Townhouse / Attached
    if (propertyType === "Row / Townhouse") {

      filters.push(
        `PropertyAttachedYN eq true`
      );

    }

    // Apartment / Condo
    if (propertyType === "Apartment") {

      filters.push(
        `PropertySubType eq 'Apartment'`
      );

    }

    // ==========================================
    // FINAL FILTER
    // ==========================================

    const filterString =
      filters.join(" and ");

    console.log(
      "🧠 FILTER:",
      filterString
    );

    const filterQuery =
      encodeURIComponent(filterString);

    // ==========================================
    // REALTOR API URL
    // ==========================================

    const url =
      `https://ddfapi.realtor.ca/odata/v1/Property?$top=24&$orderby=ModificationTimestamp desc&$filter=${filterQuery}`;

    console.log("🔗 URL:", url);

    // ==========================================
    // FETCH PROPERTIES
    // ==========================================

    const response = await axios.get(url, {

      headers: {

        Authorization: `Bearer ${token}`,

        Accept: "application/json",

      },

    });

    const listings =
      response.data?.value || [];

    console.log(
      `✅ Found ${listings.length} listings`
    );

    // ==========================================
    // RESPONSE
    // ==========================================

    res.json({

      success: true,

      result: topCommunity,

      totalListings: listings.length,

      listings,

      appliedFilters: {

        minBedrooms,

        propertyType,

        minPrice,

        maxPrice,

        fireplace,

        minYearBuilt,

        maxYearBuilt,

        stories,

        minLivingArea,

        maxLivingArea,

      },

    });

  } catch (err) {

    console.error(
      "❌ Quiz API Error:",
      err.response?.data || err.message
    );

    res.status(500).json({

      success: false,

      error:
        err.response?.data ||
        err.message ||
        "Failed to fetch recommendations",

    });

  }

});



// router.post("/community-quiz", async (req, res) => {

//   try {

//     const { answers = [], scores = {} } = req.body;

//     console.log("🧠 Quiz Attempted");

//     // ==========================================
//     // FIND BEST COMMUNITY
//     // ==========================================

//     let topCommunity = "coopers-crossing";
//     let maxScore = -1;

//     Object.entries(scores).forEach(([community, score]) => {

//       if (score > maxScore) {

//         maxScore = score;
//         topCommunity = community;

//       }

//     });

//     // ==========================================
//     // EXTRACT QUIZ FILTERS
//     // ==========================================

//     let minBedrooms = null;
//     let propertyType = null;
//     let minPrice = null;
//     let maxPrice = null;

//     answers.forEach((answer) => {

//       const filters = answer.filters || {};

//       if (filters.BedroomsTotal) {

//         minBedrooms = filters.BedroomsTotal;

//       }

//       if (filters.PropertySubType) {

//         propertyType = filters.PropertySubType;

//       }

//       if (filters.MinPrice) {

//         minPrice = filters.MinPrice;

//       }

//       if (filters.MaxPrice) {

//         maxPrice = filters.MaxPrice;

//       }

//     });

//     // ==========================================
//     // GET REALTOR TOKEN
//     // ==========================================

//     const token = await getAccessToken();

//     if (!token) {

//       return res.status(401).json({
//         success: false,
//         error: "Failed to get access token",
//       });

//     }

//     // ==========================================
//     // BUILD FILTERS
//     // ==========================================

//     const filters = [];

//     // Alberta only
//     filters.push(`StateOrProvince eq 'Alberta'`);

//     // Bedrooms
//     if (minBedrooms) {

//       filters.push(
//         `BedroomsTotal ge ${minBedrooms}`
//       );

//     }

//     // Min Price
//     if (minPrice) {

//       filters.push(
//         `ListPrice ge ${minPrice}`
//       );

//     }

//     // Max Price
//     if (maxPrice) {

//       filters.push(
//         `ListPrice le ${maxPrice}`
//       );

//     }

//     // ==========================================
//     // PROPERTY TYPE FILTER
//     // ==========================================

//     // IMPORTANT:
//     // Realtor.ca data is inconsistent.
//     // Use exact matches only.

//     if (propertyType === "Detached") {

//       filters.push(
//         `PropertySubType eq 'Single Family'`
//       );

//     }

//     if (propertyType === "Townhouse") {

//       filters.push(
//         `PropertyAttachedYN eq true`
//       );

//     }

//     if (propertyType === "Apartment") {

//       filters.push(
//         `PropertySubType eq 'Apartment'`
//       );

//     }

//     // ==========================================
//     // COMMUNITY FILTER
//     // ==========================================

//     const communityMap = {
//       "coopers-crossing": "Coopers Crossing",
//       "kings-heights": "Kings Heights",
//       "windsong": "Windsong",
//       "reunion": "Reunion",
//       "thorburn": "Thorburn",
//       "baysprings": "Baysprings",
//     };

//     // OPTIONAL:
//     // Sometimes CityRegion is empty.
//     // Safer to skip if causing low results.

//     if (communityMap[topCommunity]) {

//       filters.push(
//         `CityRegion eq '${communityMap[topCommunity]}'`
//       );

//     }

//     // ==========================================
//     // FINAL FILTER QUERY
//     // ==========================================

//     const filterString =
//       filters.join(" and ");

//     console.log("🧠 FILTER:", filterString);

//     const filterQuery =
//       encodeURIComponent(filterString);

//     // ==========================================
//     // REALTOR API URL
//     // ==========================================

//     const url =
//       `https://ddfapi.realtor.ca/odata/v1/Property?$top=12&$filter=${filterQuery}`;

//     console.log("🔗 URL:", url);

//     // ==========================================
//     // FETCH PROPERTIES
//     // ==========================================

//     const response = await axios.get(url, {

//       headers: {
//         Authorization: `Bearer ${token}`,
//         Accept: "application/json",
//       },

//     });

//     const listings =
//       response.data?.value || [];

//     console.log(
//       `✅ Found ${listings.length} listings`
//     );

//     // ==========================================
//     // RESPONSE
//     // ==========================================

//     res.json({

//       success: true,

//       result: topCommunity,

//       totalListings: listings.length,

//       listings,

//       appliedFilters: {
//         minBedrooms,
//         propertyType,
//         minPrice,
//         maxPrice,
//       },

//     });

//   } catch (err) {

//     console.error(
//       "❌ Quiz API Error:",
//       err.response?.data || err.message
//     );

//     res.status(500).json({

//       success: false,

//       error:
//         err.response?.data ||
//         err.message ||
//         "Failed to fetch recommendations",

//     });

//   }

// });

export default router;















// import { fetchProperties } from "../metadata.js";
// import express from "express";
// import mongoose from "mongoose";
// import axios from "axios";
// import { getAccessToken } from "../auth.js";
// import Property from "../models/Property.js"; // your schema
// import cors from 'cors';
// import Wishlist from "../models/WishList.js"; // your MongoDB model
// import cron from "node-cron";
// import PropertyModel from "../models/Property.js"; // make sure you have .js here
// import User from "../models/User.js";
// import SelectedProperties from "../models/SelectedProperties.js";
// import multer from "multer";
// import path from "path";
// import { fileURLToPath } from "url";
// import Blog from "../models/Blog.js";


// const router = express.Router();



// // Static credentials
// const USER = { id: "admin", password: "1234" };

// // Login route
// router.post("/login", (req, res) => {
//   const { id, password } = req.body;

//   if (id === USER.id && password === USER.password) {
//     console.log("yes")
//     return res.status(200).json({ message: "Login successful" });
//   } else {
//     console.log("not")
//     return res.status(401).json({ message: "Invalid ID or password" });
//   }
// });



// // Save selected properties globally
// router.post("/property/save-selected", async (req, res) => {
//   try {
//     const { selected } = req.body;

//     if (!Array.isArray(selected)) {
//       return res.status(400).json({ message: "Invalid data format" });
//     }

//     // Update the single document OR create it if missing
//     const result = await SelectedProperties.findOneAndUpdate(
//       {},
//       { selected },
//       { upsert: true, new: true }
//     );

//     res.json({
//       success: true,
//       message: "Selected properties updated successfully!",
//       data: result,
//     });

//   } catch (error) {
//     console.error("Error saving selected properties:", error);
//     res.status(500).json({ message: "Server error", error });
//   }
// });


// // Load selected properties
// router.get("/property/get-selected", async (req, res) => {
//   try {
//     const data = await SelectedProperties.findOne({});

//     res.json({
//       success: true,
//       selected: data?.selected || [],
//     });

//   } catch (error) {
//     console.error("Error fetching selected properties:", error);
//     res.status(500).json({ message: "Server error", error });
//   }
// });


// router.get("/property/:listingKey", async (req, res) => {
//   try {
//     const listingKey = req.params.listingKey;
//     const token = await getAccessToken();

//     // ✅ Use filter instead of invalid (ListingKey=...)
//     const url = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=ListingKey eq '${listingKey}'`;

//     const response = await axios.get(url, {
//       headers: { Authorization: `Bearer ${token}` }
//     });

//     // DDF always returns an array in `value`
//     const property = response.data.value[0];

//     if (!property) {
//       return res.status(404).send("Property not found");
//     }

//     res.render("propertyDetail", { property });
//   } catch (err) {
//     console.error("❌ Error fetching property details:", err.response?.data || err.message);
//     res.status(500).send("Error fetching property details");
//   }
// });



// router.get("/properties/office/:officeKey/random5", async (req, res) => {
//   try {
//     const token = await getAccessToken();
//     const officeKey = req.params.officeKey;

//     // ⭐ Load selected listing keys from DB
//     const selectedDoc = await SelectedProperties.findOne({});
//     const selectedKeys = selectedDoc?.selected || [];

//     if (selectedKeys.length === 0) {
//       return res.json({ properties: [] });
//     }

//     // Fetch larger list of office properties
//     const filter = encodeURIComponent(`listOfficeKey eq '${officeKey}'`);
//     const url = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=${filter}&$top=200`;

//     const response = await axios.get(url, {
//       headers: { Authorization: `Bearer ${token}` },
//     });

//     const allProps = response.data.value || [];

//     // ⭐ Filter only selected properties
//     const selectedProps = allProps.filter((p) =>
//       selectedKeys.includes(p.ListingKey)
//     );

//     // ⭐ If fewer than 5 selected → return all
//     if (selectedProps.length <= 5) {
//       return res.json({ properties: selectedProps });
//     }

//     // ⭐ Shuffle (Fisher-Yates)
//     for (let i = selectedProps.length - 1; i > 0; i--) {
//       const j = Math.floor(Math.random() * (i + 1));
//       [selectedProps[i], selectedProps[j]] = [selectedProps[j], selectedProps[i]];
//     }

//     // ⭐ Take random 5
//     const random5 = selectedProps.slice(0, 5);

//     console.log(
//       `🎯 Random 5 (from ${selectedProps.length} selected):`,
//       random5.length
//     );

//     res.json({ properties: random5 });

//   } catch (err) {
//     console.error("❌ Error fetching random properties:", err.response?.data || err.message);
//     res.status(500).json({ error: "Error fetching random properties" });
//   }
// });

// router.get("/properties/sample", async (req, res) => {
//   const token = await getAccessToken();
//   const url = `https://ddfapi.realtor.ca/odata/v1/Property?$top=5`;
//   const response = await axios.get(url, {
//     headers: { Authorization: `Bearer ${token}` },
//   });
//   res.json(response.data.value.map(p => ({
//     ListingKey: p.ListingKey,
//     MlsNumber: p.MlsNumber,
//     Address: p.Address?.AddressText,
//   })));
// });






// import * as XLSX from "xlsx";
// import fs from "fs";
// // import path from "path";


// // 👉 Fetch Calgary properties and save them to Excel
// router.get("/propertiesss/calgary", async (req, res) => {
//   try {
//     const token = await getAccessToken();

//     if (!token) {
//       return res.status(401).json({ error: "Failed to get access token" });
//     }

//     let allProperties = [];
//     let skip = 0;
//     const fetchSize = 100;
//     let keepFetching = true;

//     console.log("🚀 Starting Calgary property data fetch...");

//     while (keepFetching) {
//       // Filter for City eq 'Calgary'
//       const filter = encodeURIComponent(`City eq 'Calgary'`);
//       const url = `https://ddfapi.realtor.ca/odata/v1/Property?$top=${fetchSize}&$skip=${skip}&$filter=${filter}`;

//       console.log(`🔗 Fetching: ${url}`);

//       const response = await axios.get(url, {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           Accept: "application/json",
//         },
//       });

//       const batch = response.data?.value || [];

//       if (batch.length === 0) {
//         console.log("⚠️ No more Calgary properties returned from API");
//         keepFetching = false;
//         break;
//       }

//       const simplified = batch.map((p) => ({
//         ListingKey: p.ListingKey || p.ListingKeyNumeric || "N/A",
//         MlsNumber: p.MlsNumber || "N/A",
//         ListAgentKey: p.ListAgentKey || "N/A",
//         ListAgentFullName: p.ListAgentFullName || "N/A",
//         ListOfficeKey: p.ListOfficeKey || "N/A",
//         ListOfficeName: p.ListOfficeName || "N/A",
//         Address: p.Address?.AddressText || "N/A",
//         Price: p.Price || "N/A",
//         PropertyType: p.PropertyType || "N/A",
//         TransactionType: p.TransactionType || "N/A",
//       }));

//       allProperties = allProperties.concat(simplified);
//       console.log(`✅ Batch fetched: ${simplified.length}, Total so far: ${allProperties.length}`);

//       if (batch.length < fetchSize) {
//         keepFetching = false;
//       } else {
//         skip += fetchSize;
//       }
//     }

//     if (allProperties.length === 0) {
//       return res.status(404).json({ error: "No Calgary properties found" });
//     }

//     // --- 🧾 SAVE TO EXCEL ---
//     const workbook = XLSX.utils.book_new();
//     const worksheet = XLSX.utils.json_to_sheet(allProperties);
//     XLSX.utils.book_append_sheet(workbook, worksheet, "CalgaryProperties");

//     const filePath = path.join(process.cwd(), "calgary_properties.xlsx");
//     XLSX.writeFile(workbook, filePath);

//     console.log(`💾 Saved ${allProperties.length} Calgary records to ${filePath}`);

//     res.json({
//       message: "✅ Calgary properties fetched and saved to Excel successfully!",
//       total: allProperties.length,
//       file: "calgary_properties.xlsx",
//     });
//   } catch (err) {
//     console.error("❌ Error fetching Calgary properties:", err.response?.data || err.message);
//     res.status(500).json({
//       error: "Error fetching Calgary properties",
//       details: err.response?.data || err.message,
//     });
//   }
// });


// router.get("/properties/office/admin/:officeKey", async (req, res) => {
//   try {
//     const token = await getAccessToken();
//     const officeKey = req.params.officeKey;

//     // Load selected from DB (same as before)
//     const selectedDoc = await SelectedProperties.findOne({});
//     const selectedKeys = selectedDoc?.selected || [];

//     let allProperties = [];
//     let skip = 0;
//     const fetchSize = 100;

//     const filter = encodeURIComponent(`listOfficeKey eq '${officeKey}'`);

//     while (true) {
//       const url = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=${filter}&$top=${fetchSize}&$skip=${skip}`;

//       const response = await axios.get(url, {
//         headers: { Authorization: `Bearer ${token}` },
//       });

//       const batch = response.data.value;
//       allProperties = [...allProperties, ...batch];

//       if (batch.length < fetchSize) break;
//       skip += fetchSize;
//     }

//     // 🔥 FILTER OUT COMMERCIAL / BUSINESS PROPERTIES
//     const residentialList = allProperties.filter((p) => {
//       const sub = p.PropertySubType?.toLowerCase() || "";
//       const build = p.BuildingType?.toLowerCase() || "";

//       const isCommercial =
//         sub.includes("office") ||
//         sub.includes("retail") ||
//         sub.includes("commercial") ||
//         sub.includes("industrial") ||
//         sub.includes("business") ||
//         build.includes("office") ||
//         build.includes("retail") ||
//         build.includes("commercial") ||
//         build.includes("industrial") ||
//         build.includes("business");

//       return !isCommercial;
//     });

//     // 🔥 ADD isSelected FLAG
//     const finalList = residentialList.map((p) => ({
//       ...p,
//       isSelected: selectedKeys.includes(p.ListingKey),
//     }));

//     res.json({ properties: finalList });

//   } catch (err) {
//     console.error("❌ Error fetching properties:", err.response?.data || err);
//     res.status(500).json({ error: "Error fetching properties" });
//   }
// });




// router.get("/properties/office/:officeKey", async (req, res) => {
//   try {
//     const token = await getAccessToken();
//     const officeKey = req.params.officeKey;

//     // Load selected IDs from DB
//     const selectedDoc = await SelectedProperties.findOne({});
//     const selectedList = selectedDoc?.selected || [];

//     let allProperties = [];
//     let skip = 0;
//     const fetchSize = 100;
//     let keepFetching = true;

//     const filter = encodeURIComponent(`listOfficeKey eq '${officeKey}'`);

//     while (keepFetching) {
//       const url = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=${filter}&$top=${fetchSize}&$skip=${skip}`;

//       const response = await axios.get(url, {
//         headers: { Authorization: `Bearer ${token}` },
//       });

//       const batch = response.data.value;
//       allProperties = allProperties.concat(batch);

//       if (batch.length < fetchSize) keepFetching = false;
//       else skip += fetchSize;
//     }

//     // Filter ONLY selected properties
//     const selectedProps = allProperties.filter((prop) =>
//       selectedList.includes(prop.ListingKey)
//     );

//     res.json({ properties: selectedProps });

//   } catch (err) {
//     console.error("❌ Error:", err.response?.data || err.message);
//     res.status(500).json({ error: "Error fetching properties" });
//   }
// });






// router.get("/properties/:listingID", async (req, res) => {
//   try {
//     const { listingID } = req.params;
//     const token = await getAccessToken();

//     // Fetch property from Realtor.ca API
//     const url = `https://ddfapi.realtor.ca/odata/v1/Property('${listingID}')`;
//     const response = await axios.get(url, {
//       headers: { Authorization: `Bearer ${token}` },
//     });

//     // Always return property as "property"
//     // Some API responses might have value array, fallback to response.data
//     const property = response.data.value?.[0] || response.data;

//     if (!property) {
//       return res.status(404).json({ error: "Property not found" });
//     }

//     res.json({ property });
//   } catch (err) {
//     console.error("❌ Error fetching property:", err.response?.data || err.message);
//     res.status(500).json({ error: "Property not found" });
//   }
// });




// // 👉 Get property details by ListingKey
// router.get("/propertyy/:listingKey", async (req, res) => {
//   try {
//     const token = await getAccessToken();
//     const listingKey = req.params.listingKey;

//     const url = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=ListingKey eq '${listingKey}'`;
//     const response = await axios.get(url, {
//       headers: { Authorization: `Bearer ${token}` },
//     });

//     const property = response.data.value[0];
//     if (!property) {
//       return res.status(404).json({ error: "Property not found" });
//     }

//     // Extract agent & office info
//     const { ListAgentKey, ListAgentFullName, ListOfficeKey, ListOfficeName } = property;

//     res.json({
//       listingKey,
//       property,
//       agent: { ListAgentKey, ListAgentFullName },
//       office: { ListOfficeKey, ListOfficeName },
//     });
//   } catch (err) {
//     console.error("❌ Error fetching property by ListingKey:", err.response?.data || err.message);
//     res.status(500).json({ error: "Error fetching property" });
//   }
// });

// export default router;






// db.createUser({user: "realtorparth2",pwd: "parthrealtor369!",roles: [ { role: "root", db: "admin" } ]})
// db.createUser({user: "realtorparth",pwd: "parthrealtor369!",roles: [ { role: "root", db: "admin" } ]})
// mongosh -u realtorparth -p parthrealtor369! --authenticationDatabase admin