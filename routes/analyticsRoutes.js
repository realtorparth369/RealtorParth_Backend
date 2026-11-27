import express from "express";
import Analytics from "../models/Analytics.js";
import crypto from "crypto";

const router = express.Router();

/* =======================================================
   COUNTRY CACHE

   Keeps country information temporarily in memory
   so we don't repeatedly lookup the same IP.
======================================================= */

const geoCache = new Map();



function hashIp(ip) {
    return crypto
        .createHash("sha256")
        .update(
            `${ip}-${process.env.ANALYTICS_SECRET || "realtorparth-secret"}`
        )
        .digest("hex");
}


/* =======================================================
   GET CLIENT IP
======================================================= */

function getClientIp(req) {
    const forwarded =
        req.headers["x-forwarded-for"];

    if (forwarded) {
        return forwarded
            .split(",")[0]
            .trim();
    }

    const realIp =
        req.headers["x-real-ip"];

    if (realIp) {
        return realIp;
    }

    return (
        req.socket?.remoteAddress ||
        req.ip ||
        ""
    ).replace("::ffff:", "");
}

/* =======================================================
   CHECK PRIVATE / LOCAL IP
======================================================= */

function isPrivateIp(ip) {
    if (!ip) {
        return true;
    }

    return (
        ip === "::1" ||
        ip === "127.0.0.1" ||
        ip.startsWith("10.") ||
        ip.startsWith("192.168.") ||
        ip.startsWith("172.16.") ||
        ip.startsWith("172.17.") ||
        ip.startsWith("172.18.") ||
        ip.startsWith("172.19.") ||
        ip.startsWith("172.2") ||
        ip.startsWith("172.30.") ||
        ip.startsWith("172.31.")
    );
}

/* =======================================================
   GET COUNTRY FROM IP
======================================================= */

async function getCountryFromIp(ip) {
    try {
        if (!ip || isPrivateIp(ip)) {
            return {
                country: "Unknown",
                countryCode: "UN",
            };
        }

        /* RETURN CACHE */

        if (geoCache.has(ip)) {
            return geoCache.get(ip);
        }

        /* LOOKUP IP */

        const response = await fetch(
            `https://ipapi.co/${ip}/json/`
        );

        if (!response.ok) {
            throw new Error(
                `Geo API returned ${response.status}`
            );
        }

        const data =
            await response.json();

        const result = {
            country:
                data.country_name ||
                "Unknown",

            countryCode:
                data.country_code ||
                "UN",
        };

        /* SAVE TO CACHE */

        geoCache.set(
            ip,
            result
        );

        return result;

    } catch (error) {
        console.error(
            "Country lookup error:",
            error.message
        );

        return {
            country: "Unknown",
            countryCode: "UN",
        };
    }
}

/* =======================================================
   DEVICE DETECTION
======================================================= */

function detectDevice(userAgent = "") {
    const ua =
        userAgent.toLowerCase();

    if (!ua) {
        return "Unknown";
    }

    /* TABLET */

    if (
        /ipad|tablet|playbook|silk/.test(
            ua
        ) ||
        (
            /android/.test(ua) &&
            !/mobile/.test(ua)
        )
    ) {
        return "Tablet";
    }

    /* MOBILE */

    if (
        /mobile|iphone|ipod|android|blackberry|windows phone/.test(
            ua
        )
    ) {
        return "Mobile";
    }

    /* DESKTOP */

    return "Desktop";
}

/* =======================================================
   TRACK WEBSITE VISIT
======================================================= */

/* =======================================================
   TRACK UNIQUE WEBSITE VISITOR
======================================================= */

router.post("/visit", async (req, res) => {
    try {

        const { page } = req.body;

        /* ==========================================
           EXCLUDE ADMIN
        ========================================== */

        if (page?.startsWith("/admin")) {
            return res.json({
                success: true,
                tracked: false,
            });
        }


        /* ==========================================
           GET IP
        ========================================== */

        const ip = getClientIp(req);


        if (!ip) {

            console.log(
                "Analytics: No IP detected"
            );

            return res.json({
                success: true,
                tracked: false,
            });
        }


        /* ==========================================
           HASH IP
        ========================================== */

        const ipHash = hashIp(ip);


        /* ==========================================
           CHECK IF VISITOR ALREADY EXISTS
        ========================================== */

        const existingVisitor =
            await Analytics.findOne({
                ipHash,
            });


        /* ==========================================
           ALREADY VISITED
        ========================================== */

        if (existingVisitor) {

            console.log(
                "Existing visitor - ignored:",
                ipHash
            );

            return res.json({
                success: true,
                tracked: false,
                message: "Visitor already tracked",
            });
        }


        /* ==========================================
           USER AGENT
        ========================================== */

        const userAgent =
            req.headers["user-agent"] || "";


        /* ==========================================
           DEVICE
        ========================================== */

        const device =
            detectDevice(userAgent);


        /* ==========================================
           COUNTRY
        ========================================== */

        const geo =
            await getCountryFromIp(ip);


        /* ==========================================
           DEBUG
        ========================================== */

        console.log(
            "================================="
        );

        console.log(
            "NEW UNIQUE VISITOR"
        );

        console.log(
            "IP:",
            ip
        );

        console.log(
            "Country:",
            geo.country
        );

        console.log(
            "Country Code:",
            geo.countryCode
        );

        console.log(
            "Device:",
            device
        );

        console.log(
            "Page:",
            page
        );

        console.log(
            "================================="
        );


        /* ==========================================
           CREATE UNIQUE VISITOR
        ========================================== */

        await Analytics.create({

            page:
                page || "/",

            country:
                geo.country,

            countryCode:
                geo.countryCode,

            device,

            userAgent,

            ipHash,
        });


        /* ==========================================
           RESPONSE
        ========================================== */

        return res.json({

            success: true,

            tracked: true,

            message:
                "New visitor tracked",

            data: {
                country:
                    geo.country,

                countryCode:
                    geo.countryCode,

                device,
            },

        });

    } catch (error) {

        /* ==========================================
           DUPLICATE KEY
        ========================================== */

        if (error.code === 11000) {

            return res.json({
                success: true,
                tracked: false,
                message:
                    "Visitor already tracked",
            });
        }


        console.error(
            "Track Visit Error:",
            error
        );


        return res.status(500).json({
            success: false,
        });
    }
});




// =====================================================
// DASHBOARD - MONTHLY VISITORS
// GET /analytics/dashboard-monthly-visitors
// =====================================================

router.get(
  "/dashboard-monthly-visitors",
  async (req, res) => {
    try {
      const last30Days = new Date();

      last30Days.setDate(
        last30Days.getDate() - 30
      );

      const data = await Analytics.aggregate([
        {
          $match: {
            createdAt: {
              $gte: last30Days,
            },
          },
        },

        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
              },
            },

            visitors: {
              $sum: 1,
            },
          },
        },

        {
          $sort: {
            _id: 1,
          },
        },
      ]);

      return res.json({
        success: true,
        data,
      });

    } catch (error) {
      console.error(
        "Dashboard Monthly Visitors Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch monthly visitor statistics",
      });
    }
  }
);


/* =======================================================
   LAST 30 DAYS VISITORS GRAPH
======================================================= */

router.get(
    "/monthly-visitors",
    async (req, res) => {
        try {
            const last30Days =
                new Date();

            last30Days.setDate(
                last30Days.getDate() - 30
            );

            const data =
                await Analytics.aggregate([
                    /* MATCH */

                    {
                        $match: {
                            createdAt: {
                                $gte:
                                    last30Days,
                            },
                        },
                    },

                    /* GROUP BY DATE */

                    {
                        $group: {
                            _id: {
                                $dateToString: {
                                    format:
                                        "%Y-%m-%d",
                                    date:
                                        "$createdAt",
                                },
                            },

                            visitors: {
                                $sum: 1,
                            },
                        },
                    },

                    /* SORT */

                    {
                        $sort: {
                            _id: 1,
                        },
                    },
                ]);

            return res.json({
                success: true,
                data,
            });

        } catch (error) {
            console.error(
                "Monthly Visitors Error:",
                error
            );

            return res.status(500).json({
                success: false,
            });
        }
    }
);



// =====================================================
// DASHBOARD - ANALYTICS SUMMARY
// GET /analytics/dashboard-summary
// =====================================================

router.get(
  "/dashboard-summary",
  async (req, res) => {
    try {
      const now = new Date();

      // ==========================================
      // TODAY
      // ==========================================

      const today = new Date(now);

      today.setHours(
        0,
        0,
        0,
        0
      );

      // ==========================================
      // LAST 7 DAYS
      // ==========================================

      const week = new Date(now);

      week.setDate(
        week.getDate() - 7
      );

      // ==========================================
      // LAST 1 MONTH
      // ==========================================

      const month = new Date(now);

      month.setMonth(
        month.getMonth() - 1
      );

      // ==========================================
      // LAST 1 YEAR
      // ==========================================

      const year = new Date(now);

      year.setFullYear(
        year.getFullYear() - 1
      );

      // ==========================================
      // RUN EVERYTHING IN PARALLEL
      // ==========================================

      const [
        todayVisitors,
        weekVisitors,
        monthVisitors,
        yearVisitors,
        totalVisitors,
        topCountries,
        devices,
      ] = await Promise.all([

        // TODAY
        Analytics.countDocuments({
          createdAt: {
            $gte: today,
          },
        }),

        // LAST 7 DAYS
        Analytics.countDocuments({
          createdAt: {
            $gte: week,
          },
        }),

        // LAST MONTH
        Analytics.countDocuments({
          createdAt: {
            $gte: month,
          },
        }),

        // LAST YEAR
        Analytics.countDocuments({
          createdAt: {
            $gte: year,
          },
        }),

        // TOTAL
        Analytics.countDocuments(),

        // ======================================
        // TOP 10 COUNTRIES
        // ======================================

        Analytics.aggregate([
          {
            $match: {
              countryCode: {
                $nin: [
                  null,
                  "",
                  "UN",
                  "Unknown",
                ],
              },
            },
          },

          {
            $group: {
              _id: {
                country: "$country",
                countryCode: "$countryCode",
              },

              visitors: {
                $sum: 1,
              },
            },
          },

          {
            $sort: {
              visitors: -1,
            },
          },

          {
            $limit: 10,
          },

          {
            $project: {
              _id: 0,

              country:
                "$_id.country",

              countryCode:
                "$_id.countryCode",

              visitors: 1,
            },
          },
        ]),

        // ======================================
        // DEVICE STATISTICS
        // ======================================

        Analytics.aggregate([
          {
            $group: {
              _id: "$device",

              visitors: {
                $sum: 1,
              },
            },
          },

          {
            $sort: {
              visitors: -1,
            },
          },

          {
            $project: {
              _id: 0,

              device: "$_id",

              visitors: 1,
            },
          },
        ]),
      ]);

      // ==========================================
      // RESPONSE
      // ==========================================

      return res.json({
        success: true,

        data: {
          today: todayVisitors,

          week: weekVisitors,

          month: monthVisitors,

          year: yearVisitors,

          total: totalVisitors,

          topCountries,

          devices,
        },
      });

    } catch (error) {
      console.error(
        "Dashboard Analytics Summary Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch analytics summary",
      });
    }
  }
);


/* =======================================================
   VISITOR SUMMARY
======================================================= */

router.get(
    "/summary",
    async (req, res) => {
        try {
            const now =
                new Date();

            /* ==========================================
               TODAY
            ========================================== */

            const today =
                new Date();

            today.setHours(
                0,
                0,
                0,
                0
            );

            /* ==========================================
               LAST 7 DAYS
            ========================================== */

            const week =
                new Date();

            week.setDate(
                now.getDate() - 7
            );

            /* ==========================================
               LAST 1 MONTH
            ========================================== */

            const month =
                new Date();

            month.setMonth(
                now.getMonth() - 1
            );

            /* ==========================================
               LAST 1 YEAR
            ========================================== */

            const year =
                new Date();

            year.setFullYear(
                now.getFullYear() - 1
            );

            /* ==========================================
               BASIC COUNTS
            ========================================== */

            const [
                todayVisitors,
                weekVisitors,
                monthVisitors,
                yearVisitors,
                totalVisitors,
            ] = await Promise.all([
                Analytics.countDocuments({
                    createdAt: {
                        $gte: today,
                    },
                }),

                Analytics.countDocuments({
                    createdAt: {
                        $gte: week,
                    },
                }),

                Analytics.countDocuments({
                    createdAt: {
                        $gte: month,
                    },
                }),

                Analytics.countDocuments({
                    createdAt: {
                        $gte: year,
                    },
                }),

                Analytics.countDocuments(),
            ]);

            /* ==========================================
               TOP 10 COUNTRIES
            ========================================== */

            const topCountries =
                await Analytics.aggregate([
                    /* IGNORE UNKNOWN */

                    {
                        $match: {
                            countryCode: {
                                $nin: [
                                    null,
                                    "",
                                    "UN",
                                    "Unknown",
                                ],
                            },
                        },
                    },

                    /* GROUP COUNTRY */

                    {
                        $group: {
                            _id: {
                                country:
                                    "$country",

                                countryCode:
                                    "$countryCode",
                            },

                            visitors: {
                                $sum: 1,
                            },
                        },
                    },

                    /* MOST VISITORS FIRST */

                    {
                        $sort: {
                            visitors: -1,
                        },
                    },

                    /* TOP 10 */

                    {
                        $limit: 10,
                    },

                    /* CLEAN RESPONSE */

                    {
                        $project: {
                            _id: 0,

                            country:
                                "$_id.country",

                            countryCode:
                                "$_id.countryCode",

                            visitors: 1,
                        },
                    },
                ]);

            /* ==========================================
               DEVICE STATISTICS
            ========================================== */

            const devices =
                await Analytics.aggregate([
                    /* GROUP */

                    {
                        $group: {
                            _id:
                                "$device",

                            visitors: {
                                $sum: 1,
                            },
                        },
                    },

                    /* MOST VISITORS FIRST */

                    {
                        $sort: {
                            visitors: -1,
                        },
                    },

                    /* CLEAN RESPONSE */

                    {
                        $project: {
                            _id: 0,

                            device:
                                "$_id",

                            visitors: 1,
                        },
                    },
                ]);

            /* ==========================================
               RESPONSE
            ========================================== */

            return res.json({
                success: true,

                data: {
                    today:
                        todayVisitors,

                    week:
                        weekVisitors,

                    month:
                        monthVisitors,

                    year:
                        yearVisitors,

                    total:
                        totalVisitors,

                    topCountries,

                    devices,
                },
            });

        } catch (error) {
            console.error(
                "Summary Error:",
                error
            );

            return res.status(500).json({
                success: false,
            });
        }
    }
);

export default router;




























// import express from "express";
// import Analytics from "../models/Analytics.js";

// const router = express.Router();
// /* =======================================================
//    TRACK WEBSITE VISIT
// ======================================================= */
// router.post("/visit", async (req, res) => {
//     try {
//         const { page } = req.body;
//         /* EXCLUDE ADMIN */
//         if (page?.startsWith("/admin")) {
//             return res.json({
//                 success: true,
//             });
//         }
//         await Analytics.create({
//             page,
//         });
//         return res.json({
//             success: true,
//         });
//     } catch (error) {
//         console.error("Track Visit Error:", error);
//         return res.status(500).json({
//             success: false,
//         });
//     }
// });

// /* =======================================================
//    LAST 30 DAYS VISITORS GRAPH
// ======================================================= */
// router.get("/monthly-visitors", async (req, res) => {
//     try {
//         const last30Days = new Date();
//         last30Days.setDate(
//             last30Days.getDate() - 30
//         );
//         const data = await Analytics.aggregate([
//             {
//                 $match: {
//                     createdAt: {
//                         $gte: last30Days,
//                     },
//                 },
//             },
//             {
//                 $group: {
//                     _id: {
//                         $dateToString: {
//                             format: "%Y-%m-%d",
//                             date: "$createdAt",
//                         },
//                     },
//                     visitors: {
//                         $sum: 1,
//                     },
//                 },
//             },
//             {
//                 $sort: {
//                     _id: 1,
//                 },
//             },
//         ]);
//         return res.json({
//             success: true,
//             data,
//         });
//     } catch (error) {
//         console.error("Monthly Visitors Error:", error);
//         return res.status(500).json({
//             success: false,
//         });
//     }
// });

// /* =======================================================
//    VISITOR SUMMARY
// ======================================================= */
// router.get("/summary", async (req, res) => {
//     try {
//         const now = new Date();
//         /* TODAY */
//         const today = new Date();
//         today.setHours(0, 0, 0, 0);
//         /* WEEK */
//         const week = new Date();
//         week.setDate(
//             now.getDate() - 7
//         );
//         /* MONTH */
//         const month = new Date();
//         month.setMonth(
//             now.getMonth() - 1
//         );
//         /* YEAR */
//         const year = new Date();
//         year.setFullYear(
//             now.getFullYear() - 1
//         );
//         const [
//             todayVisitors,
//             weekVisitors,
//             monthVisitors,
//             yearVisitors,
//             totalVisitors,
//         ] = await Promise.all([
//             Analytics.countDocuments({
//                 createdAt: {
//                     $gte: today,
//                 },
//             }),
//             Analytics.countDocuments({
//                 createdAt: {
//                     $gte: week,
//                 },
//             }),
//             Analytics.countDocuments({
//                 createdAt: {
//                     $gte: month,
//                 },
//             }),
//             Analytics.countDocuments({
//                 createdAt: {
//                     $gte: year,
//                 },
//             }),
//             Analytics.countDocuments(),
//         ]);
//         return res.json({
//             success: true,
//             data: {
//                 today: todayVisitors,
//                 week: weekVisitors,
//                 month: monthVisitors,
//                 year: yearVisitors,
//                 total: totalVisitors,
//             },
//         });
//     } catch (error) {
//         console.error(
//             "Summary Error:",
//             error
//         );
//         return res.status(500).json({
//             success: false,
//         });
//     }
// });

// export default router;