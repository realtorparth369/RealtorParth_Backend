// hpi.js
// CREA Home Price Index (static sample until API integration)
// Structure: HPI[City][PropertyType][YYYY-MM] = IndexValue
export const HPI = {
    Calgary: {
        House: { // This matches the 'House' type used in fetchListings.js
            "2024-10": 278.1,
            "2024-11": 280.2,
            "2024-12": 283.5,
            "2025-01": 285.6,
            "2025-02": 287.4,
            "2025-03": 290.1,
            "2025-04": 291.2,
            "2025-05": 292.0, // Used as the subject month
        },
        Apartment: {
            "2024-12": 172.4,
            "2025-01": 175.1,
            "2025-02": 176.5,
            "2025-03": 177.9,
            "2025-04": 179.0,
            "2025-05": 180.0,
        },
    },
    // Other cities follow the same structure
    Airdrie: {
        House: {
            "2025-01": 255.8,
            "2025-02": 256.7,
            "2025-03": 258.2,
            "2025-04": 260.1,
            "2025-05": 261.5,
        },
    },
    // ... include other cities as needed
};