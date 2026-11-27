import express from "express";
import { fetchProperties } from "./metadata.js";
import mongoose from "mongoose";
import axios from "axios";
import { getAccessToken } from "./auth.js";
import Property from "./models/Property.js";
import cors from "cors";
import path from "path";

// ============================================================
// ROUTE IMPORTS
// ============================================================

import propertiesRoute from "./routes/properties.js";
import blogRoute from "./routes/blog.js";
import marketDataRoutes from "./routes/marketdata.js";
import sendmailRoutes from "./routes/sendmail.js";
import buyersRoutes from "./routes/buyers.js";
import sellerRoutes from "./routes/seller.js";
import investorRoutes from "./routes/investor.js";
import flipperRoutes from "./routes/flipper.js";
import contactRoutes from "./routes/contact.js";
import propertyValuationRoutes from "./routes/propertyValuation.js";
import communityRoutes from "./routes/communityPage.js";
import faqRoutes from "./routes/faqRoutes.js";
import resourceRoutes from "./routes/resources.js";
import transactionAuth from "./routes/transactionsAuth.js";
import transactionRoutes from "./routes/transactions.js";
import transactionParties from "./routes/transactionParties.js";
import fintracRoutes from "./routes/fintrac.js";
import pepRoutes from "./routes/pep.js";
import crgRoutes from "./routes/crg.js";

import docusignRoutes from "./routes/docusign.js";

import buyerAgreementRoutes from "./routes/buyeragreement.js";
import buyerAmendmentRoutes from "./routes/buyerAmendment.js";
import buyerTerminationRoutes from "./routes/buyerTermination.js";

import scsaafa from "./routes/SCSAAFA.js";
import idmmgol from "./routes/idmmgol.js";
import esraa from "./routes/esraa.js";

import documentStatusRoutes from "./routes/documentStatusRoutes.js";
import rpcRoutes from "./routes/rpc.js";
import reminderRoutes from "./routes/reminder.js";
import adminSettingsRoutes from "./routes/adminSettings.js";
import subscribeRoute from "./routes/subscriber.js";
import homeValuationRoutes from "./routes/homeValuation.js";

import shareRoutes from "./routes/share.js";
import shareRedirectRoutes from "./routes/shareRedirect.js";

import socialpostRoutes from "./routes/social_post_api.js";
import "./routes/socialScheduler.js";

import analyticsRoutes from "./routes/analyticsRoutes.js";
import testimonialRoutes from "./routes/testimonialRoutes.js";
import designBrandingRoutes from "./routes/designBranding.js";
import socialCommentsRoutes from "./routes/socialComments.js";

// ============================================================
// EXPRESS APP
// ============================================================

const app = express();
const PORT = 4000;

// ============================================================
// CORS CONFIGURATION
// ============================================================

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://realtorparth.ca",
  "https://www.realtorparth.ca",

  // If you use your frontend through an IP address, add its
  // exact browser origin here, including protocol and port.
  // Example: "http://YOUR_SERVER_IP:5173"
];

const corsOptions = {
  origin: (origin, callback) => {
    // Requests without an Origin header are allowed.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn("CORS blocked origin:", origin);
    return callback(new Error("Origin not allowed by CORS"));
  },

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
  ],

  credentials: true,
  optionsSuccessStatus: 204,
};

// CORS must run before API routes and error handling.
app.use(cors(corsOptions));

// Handle browser preflight requests.
app.options(/.*/, cors(corsOptions));

// ============================================================
// REQUEST PARSERS
// ============================================================

app.use(
  express.urlencoded({
    limit: "10mb",
    extended: true,
  })
);

app.use(
  express.json({
    limit: "10mb",
  })
);

// ============================================================
// STATIC FILES
// ============================================================

app.use(
  "/uploads_resources",
  express.static(path.join(process.cwd(), "uploads_resources"))
);

const imagesPath =
  "/home/dhruvit/.openclaw/workspace/skills/blog_manager/images";

app.use("/images", express.static(imagesPath));

// ============================================================
// DATABASE CONNECTION
// ============================================================

async function connectDB() {
  const mongoURI = process.env.MONGODB_URI;

  if (!mongoURI) {
    throw new Error(
      "MONGODB_URI is missing. Configure it in your server environment."
    );
  }

  await mongoose.connect(mongoURI);

  console.log("✅ MongoDB Connected (Authenticated)");
}




// async function connectDB() {
//   try {
//     await mongoose.connect(
//       "mongodb://realtorparth:parthrealtor369%21@127.0.0.1:27017/realestate?authSource=admin",
//       {
//         useNewUrlParser: true,
//         useUnifiedTopology: true,
//       }
//     );

//     console.log("✅ MongoDB Connected (Authenticated)");
//   } catch (err) {
//     console.error("❌ MongoDB Connection Error:", err.message);
//     process.exit(1);
//   }
// }

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "RealtorParth API is running",
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// ALL EXISTING API ROUTES
// ============================================================

app.use("/api", propertiesRoute);
app.use("/api/blogging", blogRoute);
app.use("/api/market-data", marketDataRoutes);
app.use("/api/mail", sendmailRoutes);
app.use("/api/buyers", buyersRoutes);
app.use("/api/seller", sellerRoutes);
app.use("/api/investor", investorRoutes);
app.use("/api/flipper", flipperRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/propertyValue", propertyValuationRoutes);
app.use("/api/communityDetails", communityRoutes);
app.use("/api/faqs", faqRoutes);
app.use("/api/resources", resourceRoutes);

app.use("/api/transactions", transactionAuth);
app.use("/api/transactions", transactionRoutes);
app.use("/api/transactions/parties", transactionParties);

app.use("/api/fintracpdf", fintracRoutes);
app.use("/api/fintracpeppdf", pepRoutes);
app.use("/api/crgpdf", crgRoutes);

app.use("/api/ebraapdf", buyerAmendmentRoutes);
app.use("/api/ebratdapdf", buyerTerminationRoutes);
app.use("/api/rpcpdf", rpcRoutes);
app.use("/api/ebradapdf", buyerAgreementRoutes);

app.use("/api/scsaafa", scsaafa);
app.use("/api/idmmgol", idmmgol);
app.use("/api/esraa", esraa);

app.use("/api/statuspdf", documentStatusRoutes);
app.use("/api/reminder", reminderRoutes);
app.use("/api/admin", adminSettingsRoutes);
app.use("/api/subscribe", subscribeRoute);
app.use("/api/homevaluation", homeValuationRoutes);

app.use("/api/socialpost", socialpostRoutes);
app.use("/api/share", shareRoutes);
app.use("/api/design-branding", designBrandingRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/testimonials", testimonialRoutes);
app.use("/api/social-comments", socialCommentsRoutes);
app.use("/api/docusign", docusignRoutes);

// ============================================================
// GOOGLE MAPS GEOCODING
// Set GOOGLE_MAPS_API_KEY in your server environment.
// ============================================================

app.get("/api/geocode", async (req, res) => {
  try {
    const address = req.query.address;

    if (!address || typeof address !== "string") {
      return res.status(400).json({
        success: false,
        error: "Address required",
      });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      console.error("GOOGLE_MAPS_API_KEY is not configured.");

      return res.status(500).json({
        success: false,
        error: "Geocoding service is not configured",
      });
    }

    const url = new URL(
      "https://maps.googleapis.com/maps/api/geocode/json"
    );

    url.searchParams.set("address", address);
    url.searchParams.set("region", "ca");
    url.searchParams.set("key", apiKey);

    const response = await axios.get(url.toString(), {
      timeout: 15000,
    });

    return res.json(response.data);
  } catch (error) {
    console.error(
      "Geocode error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      error: "Geocoding request failed",
    });
  }
});

// ============================================================
// SERVER START TIME
// ============================================================

export const SERVER_START_TIME = Date.now();

// ============================================================
// SERVER TIME ROUTE
// ============================================================

app.get("/api/servertime", (req, res) => {
  const now = new Date();
  const nextSync = new Date(now);

  nextSync.setUTCMinutes(0);
  nextSync.setUTCSeconds(0);
  nextSync.setUTCMilliseconds(0);
  nextSync.setUTCHours(nextSync.getUTCHours() + 1);

  return res.json({
    success: true,
    serverTime: now.getTime(),
    nextSyncTime: nextSync.getTime(),
  });
});

// ============================================================
// 404 HANDLER
// ============================================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use((error, req, res, next) => {
  console.error("❌ EXPRESS ERROR:", {
    message: error.message,
    method: req.method,
    url: req.originalUrl,
    stack: error.stack,
  });

  if (res.headersSent) {
    return next(error);
  }

  if (error.message === "Origin not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "This origin is not allowed to access the API.",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

// ============================================================
// START SERVER
// ============================================================

async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log("✅ CORS configured");
      console.log("✅ MongoDB connected");
    });
  } catch (error) {
    console.error("❌ Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();








































// import express from "express";
// import { fetchProperties } from "./metadata.js";
// import mongoose from "mongoose";
// import axios from "axios";
// import { getAccessToken } from "./auth.js";
// import Property from "./models/Property.js"; // your schema
// const app = express();
// import cors from 'cors';
// import propertiesRoute from "./routes/properties.js";
// import blogRoute from "./routes/blog.js";
// import marketDataRoutes from "./routes/marketdata.js";
// import sendmailRoutes from "./routes/sendmail.js";
// import buyersRoutes from "./routes/buyers.js";
// import sellerRoutes from "./routes/seller.js";
// import investorRoutes from "./routes/investor.js";
// import flipperRoutes from "./routes/flipper.js";
// import contactRoutes from "./routes/contact.js";
// import propertyValuationRoutes from "./routes/propertyValuation.js";
// import communityRoutes from './routes/communityPage.js';
// import faqRoutes from './routes/faqRoutes.js';
// import resourceRoutes from './routes/resources.js';
// import transactionAuth from "./routes/transactionsAuth.js";
// import transactionRoutes from "./routes/transactions.js";
// import transactionParties from "./routes/transactionParties.js";
// import fintracRoutes from "./routes/fintrac.js";
// import pepRoutes from "./routes/pep.js";
// import crgRoutes from "./routes/crg.js";

// import buyerAgreementRoutes from "./routes/buyeragreement.js";
// import buyerAmendmentRoutes from "./routes/buyerAmendment.js";
// import buyerTerminationRoutes from "./routes/buyerTermination.js";


// import scsaafa from "./routes/SCSAAFA.js";
// import idmmgol from "./routes/idmmgol.js";
// import esraa from "./routes/esraa.js";

// import documentStatusRoutes from "./routes/documentStatusRoutes.js";
// import rpcRoutes from "./routes/rpc.js";

// import reminderRoutes from "./routes/reminder.js";
// import adminSettingsRoutes from "./routes/adminSettings.js";
// import path from 'path';
// import subscribeRoute from "./routes/subscriber.js";
// import homeValuationRoutes from "./routes/homeValuation.js";

// import shareRoutes from "./routes/share.js";
// import shareRedirectRoutes from "./routes/shareRedirect.js";
// import socialpostRoutes from "./routes/social_post_api.js";
// import "./routes/socialScheduler.js";
// import analyticsRoutes from "./routes/analyticsRoutes.js";

// import testimonialRoutes from "./routes/testimonialRoutes.js"

// import designBrandingRoutes from "./routes/designBranding.js";

// import socialCommentsRoutes from "./routes/socialComments.js";


// // Allow requests from your frontend dev server
// app.use(cors({
//   origin: ['http://localhost:5173', '46.225.18.186', 'https://realtorparth.ca', 'https://www.realtorparth.ca', "100.121.62.83"], // React/Vite dev server
//   methods: ['GET', 'POST', 'PUT', 'DELETE', "OPTIONS", "PATCH"],
//   credentials: true
// }));

// app.use(express.urlencoded({ limit: "10mb", extended: true }));
// app.use(express.json({ limit: "10mb" }));

// //app.options("*", cors());

// app.use(
//   '/uploads_resources',
//   express.static(
//     path.join(process.cwd(), 'uploads_resources')
//   )
// );

// async function connectDB() {
//   try {
//     await mongoose.connect(
//       "mongodb://realtorparth:parthrealtor369%21@127.0.0.1:27017/realestate?authSource=admin",
//       {
//         useNewUrlParser: true,
//         useUnifiedTopology: true,
//       }
//     );

//     console.log("✅ MongoDB Connected (Authenticated)");
//   } catch (err) {
//     console.error("❌ MongoDB Connection Error:", err.message);
//     process.exit(1);
//   }
// }

// connectDB();

// const imagesPath = "/home/dhruvit/.openclaw/workspace/skills/blog_manager/images";

// app.use("/images", express.static(imagesPath));

// app.use('/api', propertiesRoute);
// app.use('/api/blogging', blogRoute);
// app.use("/api/market-data", marketDataRoutes);
// app.use("/api/mail", sendmailRoutes);
// app.use("/api/buyers", buyersRoutes);
// app.use("/api/seller", sellerRoutes);
// app.use("/api/investor", investorRoutes);
// app.use("/api/flipper", flipperRoutes);
// app.use("/api/contact", contactRoutes);
// app.use("/api/propertyValue", propertyValuationRoutes);
// app.use("/api/communityDetails", communityRoutes);
// app.use('/api/faqs', faqRoutes);
// app.use('/api/resources', resourceRoutes);
// app.use("/api/transactions", transactionAuth);
// app.use("/api/transactions", transactionRoutes);
// app.use("/api/transactions/parties", transactionParties);
// app.use("/api/fintracpdf", fintracRoutes);
// app.use("/api/fintracpeppdf", pepRoutes);
// app.use("/api/crgpdf", crgRoutes);

// app.use("/api/ebraapdf", buyerAmendmentRoutes);
// app.use("/api/ebratdapdf", buyerTerminationRoutes);
// app.use("/api/rpcpdf", rpcRoutes);

// app.use("/api/ebradapdf", buyerAgreementRoutes);
// app.use("/api/scsaafa", scsaafa);
// app.use("/api/idmmgol", idmmgol);
// app.use("/api/esraa", esraa);

// app.use("/api/statuspdf", documentStatusRoutes);
// app.use("/api/reminder", reminderRoutes);
// app.use("/api/admin", adminSettingsRoutes);
// app.use("/api/subscribe", subscribeRoute);

// app.use("/api/homevaluation", homeValuationRoutes);
// app.use("/api/socialpost", socialpostRoutes);
// app.use("/api/share", shareRoutes);

// app.use("/api/design-branding", designBrandingRoutes);

// app.use("/api/analytics", analyticsRoutes);

// app.use("/api/testimonials", testimonialRoutes);

// app.use("/api/social-comments", socialCommentsRoutes);

// app.get("/api/geocode", async (req, res) => {
//   try {
//     const address = req.query.address;
//     if (!address) return res.status(400).json({ error: "Address required" });

//     const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
//       address
//     )}&region=ca&key=AIzaSyDuSvWNjAcCP_0vUsbAhbAWsHovsfgIBWA`;

//     const response = await fetch(url);
//     const data = await response.json();

//     res.json(data);
//   } catch (error) {
//     console.error("Geocode error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// });

// export const SERVER_START_TIME = Date.now();

// // ===============================
// // SERVER TIME ROUTE
// // ===============================

// // app.get(
// //   "/api/servertime",
// //   (req, res) => {
    
// //     console.log("Server Time:", new Date().toString());

// //     res.json({
// //       success: true,
// //       serverStartTime:
// //         SERVER_START_TIME
// //     });
// //   }
// // );

// app.get(
//   "/api/servertime",
//   (req, res) => {

//     const now = new Date();

//     const nextSync =
//       new Date(now);

//     nextSync.setUTCMinutes(0);
//     nextSync.setUTCSeconds(0);
//     nextSync.setUTCMilliseconds(0);

//     nextSync.setUTCHours(
//       nextSync.getUTCHours() + 1
//     );

//     res.json({
//       success: true,
//       serverTime: now.getTime(),
//       nextSyncTime:
//         nextSync.getTime()
//     });
//   }
// );


// app.listen(4000, '0.0.0.0', () => {
//   console.log('✅ Server running on http://192.168.29.151:4000');
// });








































// import express from "express";
// import { fetchProperties } from "./metadata.js";
// import mongoose from "mongoose";
// import axios from "axios";
// import { getAccessToken } from "./auth.js";
// import Property from "./models/Property.js"; // your schema
// const app = express();
// import cors from 'cors';
// import propertiesRoute from "./routes/properties.js";
// import blogRoute from "./routes/blog.js";
// import marketDataRoutes from "./routes/marketdata.js";
// import sendmailRoutes from "./routes/sendmail.js";
// import buyersRoutes from "./routes/buyers.js";
// import sellerRoutes from "./routes/seller.js";
// import investorRoutes from "./routes/investor.js";
// import flipperRoutes from "./routes/flipper.js";
// import contactRoutes from "./routes/contact.js";
// import propertyValuationRoutes from "./routes/propertyValuation.js";
// import communityRoutes from './routes/communityPage.js';
// import faqRoutes from './routes/faqRoutes.js';
// import resourceRoutes from './routes/resources.js';
// import transactionAuth from "./routes/transactionsAuth.js";
// import transactionRoutes from "./routes/transactions.js";
// import transactionParties from "./routes/transactionParties.js";
// import fintracRoutes from "./routes/fintrac.js";
// import pepRoutes from "./routes/pep.js";
// import crgRoutes from "./routes/crg.js";


// import docusignRoutes from "./routes/docusign.js";

// import buyerAgreementRoutes from "./routes/buyeragreement.js";
// import buyerAmendmentRoutes from "./routes/buyerAmendment.js";
// import buyerTerminationRoutes from "./routes/buyerTermination.js";


// import scsaafa from "./routes/SCSAAFA.js";

// import idmmgol from "./routes/idmmgol.js";

// import esraa from "./routes/esraa.js";

// import documentStatusRoutes from "./routes/documentStatusRoutes.js";
// import rpcRoutes from "./routes/rpc.js";

// import reminderRoutes from "./routes/reminder.js";

// import adminSettingsRoutes from "./routes/adminSettings.js";

// import path from 'path';

// import subscribeRoute from "./routes/subscriber.js";

// import homeValuationRoutes from "./routes/homeValuation.js";


// import shareRoutes from "./routes/share.js";
// import shareRedirectRoutes from "./routes/shareRedirect.js";

// import socialpostRoutes from "./routes/social_post_api.js";

// import "./routes/socialScheduler.js";

// import analyticsRoutes from "./routes/analyticsRoutes.js";

// import testimonialRoutes from "./routes/testimonialRoutes.js"

// import designBrandingRoutes from "./routes/designBranding.js";

// import socialCommentsRoutes from "./routes/socialComments.js";


// // Allow requests from your frontend dev server
// app.use(cors({
//   origin: ['http://localhost:5173', '46.225.18.186','https://realtorparth.ca','https://www.realtorparth.ca', "100.121.62.83"], // React/Vite dev server
//   methods: ['GET', 'POST', 'PUT', 'DELETE', "OPTIONS", "PATCH"],
//   credentials: true
// }));

// //app.use(express.urlencoded({extended: true}));
// //app.use(express.json());

// app.use(express.urlencoded({ limit: "10mb", extended: true }));
// app.use(express.json({ limit: "10mb" }));

// //app.options("*", cors());

// app.use(
//   '/uploads_resources',
//   express.static(
//     path.join(process.cwd(), 'uploads_resources')
//   )
// );


// async function connectDB() {
//   try {
//     await mongoose.connect(
//       "mongodb://realtorparth:parthrealtor369%21@127.0.0.1:27017/realestate?authSource=admin",
//       {
//         useNewUrlParser: true,
//         useUnifiedTopology: true,
//       }
//     );

//     console.log("✅ MongoDB Connected (Authenticated)");
//   } catch (err) {
//     console.error("❌ MongoDB Connection Error:", err.message);
//     process.exit(1);
//   }
// }

// connectDB();



// const imagesPath = "/home/dhruvit/.openclaw/workspace/skills/blog_manager/images";

// //console.log("📁 Serving images from:", imagesPath);

// app.use("/images", express.static(imagesPath));



// app.use('/api',propertiesRoute);
// app.use('/api/blogging',blogRoute);
// app.use("/api/market-data", marketDataRoutes);
// app.use("/api/mail", sendmailRoutes);
// app.use("/api/buyers", buyersRoutes);
// app.use("/api/seller", sellerRoutes);
// app.use("/api/investor", investorRoutes);
// app.use("/api/flipper", flipperRoutes);
// app.use("/api/contact", contactRoutes);
// app.use("/api/propertyValue", propertyValuationRoutes);
// app.use("/api/communityDetails", communityRoutes);
// app.use('/api/faqs', faqRoutes);
// app.use('/api/resources', resourceRoutes);
// app.use("/api/transactions", transactionAuth);
// app.use("/api/transactions", transactionRoutes);
// app.use("/api/transactions/parties", transactionParties);
// app.use("/api/fintracpdf", fintracRoutes);
// app.use("/api/fintracpeppdf", pepRoutes);
// app.use("/api/crgpdf", crgRoutes);

// app.use("/api/ebraapdf", buyerAmendmentRoutes);
// app.use("/api/ebratdapdf", buyerTerminationRoutes);
// app.use("/api/rpcpdf", rpcRoutes);

// app.use("/api/ebradapdf", buyerAgreementRoutes);

// app.use("/api/scsaafa", scsaafa);

// app.use("/api/idmmgol", idmmgol);

// app.use("/api/esraa", esraa);

// app.use("/api/statuspdf", documentStatusRoutes);
// app.use("/api/reminder", reminderRoutes);
// app.use("/api/admin", adminSettingsRoutes);
// app.use("/api/subscribe", subscribeRoute);

// app.use("/api/homevaluation", homeValuationRoutes);

// app.use("/api/socialpost", socialpostRoutes);

// app.use("/api/share", shareRoutes);

// app.use("/api/design-branding", designBrandingRoutes);

// app.use("/api/analytics", analyticsRoutes);
// //app.use("/r", shareRedirectRoutes);

// app.use("/api/testimonials", testimonialRoutes);

// app.use("/api/social-comments", socialCommentsRoutes);

// app.use("/api/docusign", docusignRoutes);

// app.get("/api/geocode", async (req, res) => {
//   try {
//     const address = req.query.address;
//     if (!address) return res.status(400).json({ error: "Address required" });

//     const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
//       address
//     )}&region=ca&key=AIzaSyDuSvWNjAcCP_0vUsbAhbAWsHovsfgIBWA`;

//     const response = await fetch(url);
//     const data = await response.json();

//     res.json(data);
//   } catch (error) {
//     console.error("Geocode error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// });


// export const SERVER_START_TIME = Date.now();

// // ===============================
// // SERVER TIME ROUTE
// // ===============================


// app.get(
//   "/api/servertime",
//   (req, res) => {

//     const now = new Date();

//     const nextSync =
//       new Date(now);

//     nextSync.setUTCMinutes(0);
//     nextSync.setUTCSeconds(0);
//     nextSync.setUTCMilliseconds(0);

//     nextSync.setUTCHours(
//       nextSync.getUTCHours() + 1
//     );

//     res.json({
//       success: true,
//       serverTime: now.getTime(),
//       nextSyncTime:
//         nextSync.getTime()
//     });
//   }
// );


// // app.listen(4000, () => console.log("Server running on http://localhost:4000"));
// app.listen(4000, '0.0.0.0', () => {
//   console.log('✅ Server running on http://192.168.29.151:4000');
// });



// import Wishlist from "./models/WishList.js"; // your MongoDB model


// // Save property
// app.post("/wishlist/save", async (req, res) => {
//   const { userEmail, listingId, listOfficeKey } = req.body;
//   try {
//     const wishlist = await Wishlist.findOne({ userEmail });
//     if (wishlist) {
//       // Avoid duplicates
//       if (!wishlist.savedProperties.some(p => p.listingId === listingId)) {
//         wishlist.savedProperties.push({ listingId, listOfficeKey });
//         await wishlist.save();
//       }
//     } else {
//       await Wishlist.create({ userEmail, savedProperties: [{ listingId, listOfficeKey }] });
//     }
//     res.json({ success: true });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// });

// // Remove property
// app.post("/wishlist/remove", async (req, res) => {
//   const { userEmail, listingId } = req.body;
//   try {
//     const wishlist = await Wishlist.findOne({ userEmail });
//     if (wishlist) {
//       wishlist.savedProperties = wishlist.savedProperties.filter(p => p.listingId !== listingId);
//       await wishlist.save();
//     }
//     res.json({ success: true });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// });


// app.get("/wishlist/:userEmail", async (req, res) => {
//   const { userEmail } = req.params;
//   try {
//     const wishlist = await Wishlist.findOne({ userEmail });
//     if (!wishlist || wishlist.savedProperties.length === 0) return res.json([]);

//     const properties = [];

//     // Loop over saved IDs and fetch from Realtor API
//     for (const item of wishlist.savedProperties) {
//       const { listingId, listOfficeKey } = item;

//       const response = await axios.get(
//         `https://ddfapi.realtor.ca/odata/v1/Property(${listingId})`,
//         {
//           params: {
//             ListOfficeKey: listOfficeKey
//           },
//           headers: {
//             "Accept": "application/json"
//           }
//         }
//       );

//       if (response.data) properties.push(response.data);
//     }

//     res.json(properties);

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: err.message });
//   }
// });