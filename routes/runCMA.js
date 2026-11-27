// runCMA.js
import { fetchListings } from "./fetchListings.js";
import { HPI } from "./hpi.js";
import { runCMA } from "./cma.js";

/**
 * Utility to map/clean API data (based on provided JSON structure) to CMA format (cma.js fields).
 * @param {Object} apiListing - Raw listing object from DDF API
 * @returns {Object} Normalized listing object
 */
function normalizeListing(apiListing) {
    const status = (apiListing.StandardStatus || "").toLowerCase();

    // Lot Size conversion: Assuming subject.lotSize is in SqFt.
    let lotSizeSqFt = apiListing.LotSizeArea || 0;
    if ((apiListing.LotSizeUnits || '').toLowerCase() === 'acres') {
        lotSizeSqFt = lotSizeSqFt * 43560; // 1 acre = 43,560 sq ft
    }
    
    return {
        // IDs and Core Info
        MLS_ID: apiListing.ListingKey,
        community: apiListing.SubdivisionName || apiListing.City,
        city: apiListing.City,
        propertyType: Array.isArray(apiListing.StructureType) ? (apiListing.StructureType[0] || '').toLowerCase() : (apiListing.StructureType || '').toLowerCase(), 
        status: status,

        // Prices & Dates
        price: apiListing.ListPrice || 0,
        sale_date: apiListing.StatusChangeTimestamp,
        list_date: apiListing.OriginalEntryTimestamp,

        // Features - Mapped to cma.js expectations
        GLA: apiListing.LivingArea || 0, 
        bedrooms: apiListing.BedroomsTotal || 0,
        bathrooms: apiListing.BathroomsTotalInteger || 0,
        year_built: apiListing.YearBuilt || 0,
        lot_size: Math.round(lotSizeSqFt), 
        
        // Placeholders for complex fields
        basementFinished: false,
        garageType: "none",
        suite_status: "none",
        condition: "Average",
        upgrades: [],
        location: { lat: apiListing.Latitude, lon: apiListing.Longitude } 
    };
}


(async () => {
    // 1. DEFINE SUBJECT PROPERTY
    const subject = {
        propertyType: "house", 
        address: "123 Cougar Ridge Dr SW",
        community: "Cougar Ridge",
        city: "Calgary",
        gla: 2200, 
        lotSize: 4000, 
        yearBuilt: 2015,
        beds: 4,
        baths: 3.5,
        condition: "Good",
        basementFinished: true,
        garageType: "Attached Double",
        location: { lat: 51.0501, lon: -114.0708 } 
    };

    // 2. FETCH RAW LISTINGS
    console.log(`Fetching listings for ${subject.community}, ${subject.city}...`);
    try {
        const rawComps = await fetchListings({
            propertyType: 'detached', 
            community: subject.community,
            city: subject.city,
            daysBack: 365,
        });
        
        if (!rawComps || rawComps.length === 0) {
            console.log("No listings found matching criteria. CMA aborted.");
            return;
        }

        // 3. NORMALIZE DATA
        const allListings = rawComps.map(normalizeListing);
        console.log(`Fetched and normalized ${allListings.length} listings.`);

        // 4. RUN CMA ANALYSIS
        const subjectMonthYYYYMM = "2025-05"; 

        const report = await runCMA({
            subject,
            allListings,
            HPI,
            subjectMonthYYYYMM,
        });
        
        // 5. OUTPUT REPORT (JSON to console)
        console.log("\n--- CMA REPORT ---");
        console.log(JSON.stringify(report, null, 2));


    } catch (error) {
        console.error("An error occurred during CMA execution:", error.message);
    }
})();