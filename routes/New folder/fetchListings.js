// fetchListings.js
import fetch from "node-fetch"; // or global fetch if Node 18+
import { getAccessToken } from "../auth.js"; // <-- PATH CORRECTION APPLIED: Assuming same directory

// Map simplified property types to DDF StructureType (from your JSON)
const PROPERTY_TYPES = {
  detached: "House",
  semi: "Semi-Detached",
  row: "Row / Townhouse",
  apartment: "Apartment",
};

// Utility: ISO date N days ago
function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10); // Format for OData
}

/**
 * Fetch residential listings from CREA DDF
 * @param {Object} params
 * @param {string} params.propertyType - 'detached', 'semi', 'row', 'apartment'
 * @param {string} params.community
 * @param {string} params.city
 * @param {number} params.daysBack
 */
export async function fetchListings({
  propertyType,
  community,
  city,
  daysBack = 180,
}) {
  const token = await getAccessToken();

  const propTypeLabel = PROPERTY_TYPES[propertyType] || "House";

  // Build OData query
  const filterParts = [
    // Filter Fix: StructureType is a collection
    `StructureType/any(s: s eq '${propTypeLabel}')`, 
    `City eq '${city}'`,
    `SubdivisionName eq '${community}'`,
    `ModificationTimestamp ge ${getDateDaysAgo(daysBack)}T00:00:00Z`,
  ];

  const filter = encodeURIComponent(filterParts.join(" and "));

  // Fields confirmed to exist in your data structure:
  const select = encodeURIComponent([
    "ListingKey",
    "ListPrice",
    "StandardStatus",
    "StatusChangeTimestamp",
    "BedroomsTotal",
    "BathroomsTotalInteger",
    "YearBuilt",
    "LivingArea",
    "LotSizeArea",
    "LotSizeUnits",
    "StreetName",
    "StreetNumber",
    "SubdivisionName",
    "City",
    "PostalCode",
    "OriginalEntryTimestamp",
    "StructureType",
    "Latitude",
    "Longitude"
  ].join(","));

  // CRITICAL FIX: Changed $top=200 to $top=100
  const url = `https://ddfapi.realtor.ca/odata/v1/Property?$filter=${filter}&$select=${select}&$orderby=StatusChangeTimestamp desc&$top=100`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`❌ Failed to fetch listings: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.value || [];
}