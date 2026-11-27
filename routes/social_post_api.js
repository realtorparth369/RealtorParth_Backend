import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import axios from "axios";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

import { generateImage } from "./social_manager.js";
import ScheduledSocialPost from "../models/ScheduledSocialPost.js";
import SocialDesignLayer from "../models/SocialDesignLayer.js";
import User from "../models/User.js";

const router = express.Router();

// ============================================================
// PATHS AND ENVIRONMENT
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_PATH = path.resolve(__dirname, "../../.env");
dotenv.config({ path: ENV_PATH });

const IMAGE_DIR =
  "/home/dhruvit/.openclaw/workspace/skills/blog_manager/images";

const ASSET_DIR = path.join(
  __dirname,
  "assets",
  "realtorparths_pdf"
);

if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

// ============================================================
// UPLOAD CONFIGURATION
// ============================================================

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, IMAGE_DIR);
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const uniqueName =
      `upload-${Date.now()}-${Math.round(Math.random() * 1e9)}` +
      extension;
    cb(null, uniqueName);
  },
});

const fileFilter = (_req, file, cb) => {
  if (file.mimetype?.startsWith("image/")) {
    return cb(null, true);
  }
  return cb(new Error("Only image files are allowed"), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// ============================================================
// EXTERNAL SERVICES & MODELS
// ============================================================

const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "not-configured",
});

const MODEL = "gemini-2.5-flash";
const DESIGN_ANALYSIS_MODEL = "gemini-3.1-pro-preview";
const DESIGN_IMAGE_MODEL = "gemini-3.1-flash-image";

// ============================================================
// HELPERS & VALIDATION
// ============================================================

function isValidObjectId(id) {
  return /^[a-fA-F0-9]{24}$/.test(String(id || ""));
}

function getRequestUserId(req) {
  const candidate =
    req.user?._id ||
    req.user?.id ||
    req.admin?._id ||
    req.admin?.id ||
    req.body?.userId ||
    req.query?.userId ||
    null;

  if (!candidate) return null;
  const id = String(candidate);
  return isValidObjectId(id) ? id : null;
}

function escapeSvgText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getSafeMimeType(mimetype) {
  if (
    mimetype === "image/jpeg" ||
    mimetype === "image/png" ||
    mimetype === "image/webp"
  ) {
    return mimetype;
  }
  return "image/jpeg";
}

async function readUploadedImage(file) {
  if (!file?.path) {
    throw new Error("Reference image is required");
  }
  return fs.promises.readFile(file.path);
}

async function deleteTempFile(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch {}
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

function normalizeBrandingMode(brandingMode) {
  const value = String(brandingMode || "")
    .trim()
    .toLowerCase();

  if (["none", "no-layer", "nolayer"].includes(value)) {
    return "none";
  }
  if (["custom", "customize", "saved", "custom-layer"].includes(value)) {
    return "custom";
  }
  if (["ai", "auto", "ai-auto", "auto-layer", "ai-generated"].includes(value)) {
    return "ai";
  }
  return "default";
}

// ============================================================
// CAPTION GENERATION
// ============================================================

async function generateSocialContent(topic) {
  const prompt = `
You are an expert Calgary and Airdrie real estate social media strategist.

Create ONE unique Facebook and Instagram post.

TOPIC:
${topic}

TARGET AUDIENCE:
- Home buyers
- Home sellers
- First-time buyers
- Real estate investors
- Alberta homeowners

LOCATION FOCUS:
- Calgary
- Airdrie
- Chestermere
- Cochrane
- Okotoks
- High River
- Strathmore

WRITING STYLE:
- Professional
- Modern
- Friendly
- Trustworthy
- Conversational
- Persuasive
- Easy to read

CONTENT REQUIREMENTS:
- 150-200 words
- Start with a strong hook
- Naturally use relevant emojis
- Highlight benefits instead of features
- Include a clear call-to-action
- Generate different wording every time
- Never copy previous responses
- Mention Calgary or nearby communities naturally when relevant

CONTACT INFORMATION:
📞 403-439-1555
🌐 www.realtorparth.ca
✉️ hello@realtorparth.ca

RULES:
- Never say "Free Consultation"
- Instead use: "Contact me for a consultation."
- No markdown
- No headings
- No bullet points
- No quotation marks
- Plain text only

HASHTAGS:
Always include #realtorparth.
Also include 6-10 relevant hashtags such as:
#CalgaryRealEstate
#AirdrieRealEstate
#YYCRealEstate
#CalgaryHomes
#AirdrieHomes
#AlbertaRealEstate
#CalgaryRealtor
#DreamHome
#HomeBuying
#HomeSelling

Return ONLY the social media caption.
`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
  });

  return (response.text || "")
    .replace(/^caption\s*:/i, "")
    .replace(/^post\s*:/i, "")
    .replace(/\*\*/g, "")
    .replace(/```/g, "")
    .trim();
}

export async function generatePropertyPost(property) {
  const prompt = `
Create a Facebook and Instagram real estate post.

PROPERTY INFORMATION:
Address: ${property.UnparsedAddress || ""}
MLS: ${property.ListingKey || property.ListingId || ""}
Price: ${property.ListPrice || ""}
Property Type: ${property.PropertyType || ""}
Style: ${property.ArchitecturalStyle || ""}
City: ${property.City || ""}
Community: ${property.SubdivisionName || ""}
Bedrooms: ${property.BedroomsTotal || ""}
Bathrooms: ${property.BathroomsTotalInteger || ""}
Garage: ${property.GarageSpaces || ""}
Square Feet: ${property.BuildingAreaTotal || ""}
Year Built: ${property.YearBuilt || ""}
Description: ${property.PublicRemarks || ""}

REQUIREMENTS:
- 120-180 words
- Professional, modern, friendly, trustworthy, conversational and persuasive
- Include relevant emojis naturally
- Include a strong opening hook
- Highlight the property's most appealing benefits
- Include a clear call-to-action
- Calgary/Airdrie focused
- Generate a unique caption every time
- Use different wording and hooks
- Avoid repetitive sentence structures
- Make the post feel natural and human-written

CONTACT INFORMATION:
Ph: 403-439-1555
www.realtorparth.ca
hello@realtorparth.ca

RULES:
- Never say "Free Consultation"
- Instead use: "Contact me for a consultation."
- Price must be written with $ followed by the number
- No markdown, headings, bullet points or quotation marks
- Do not give an Open House date or time
- Do not invent property information
- Only use facts provided in the property information
- Do not mention information that is not available
- Do not say that you are an AI
- Return ONLY the social media post

HASHTAGS:
Always include #realtorparth and relevant real estate hashtags.

Return only post text.
`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        temperature: 1.2,
      },
    });

    const caption = (response.text || "")
      .replace(/^caption\s*:/i, "")
      .replace(/^post\s*:/i, "")
      .replace(/\*\*/g, "")
      .replace(/```/g, "")
      .trim();

    if (!caption) {
      throw new Error("Gemini returned an empty property caption");
    }

    return { caption, property };
  } catch (error) {
    console.error(
      "GEMINI PROPERTY POST ERROR:",
      error?.response?.data || error?.message || error
    );
    throw error;
  }
}

// ============================================================
// MLS IMAGE BUFFER
// ============================================================

async function getPropertyImageBuffer(property, imageIndex = 0) {
  const sortedMedia = Array.isArray(property?.Media)
    ? [...property.Media].sort(
        (a, b) => (a.Order ?? 0) - (b.Order ?? 0)
      )
    : [];

  const imageMedia = sortedMedia.filter((media) => {
    const url = media.MediaURL?.toLowerCase() || "";
    return (
      url.endsWith(".jpg") ||
      url.endsWith(".jpeg") ||
      url.endsWith(".png") ||
      url.includes("ddfcdn.realtor.ca")
    );
  });

  if (!imageMedia.length) {
    throw new Error("No property images found in MLS listing");
  }

  const imageUrl =
    imageMedia[imageIndex % imageMedia.length]?.MediaURL;

  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    throw new Error("Valid property image URL not found");
  }

  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 30000,
  });

  return {
    buffer: Buffer.from(response.data),
    imageUrl,
  };
}

// ============================================================
// NORMAL PROPERTY IMAGE GENERATION
// ============================================================

async function generatePropertyImage(property, imageIndex = 0) {
  const fileName = `property-${Date.now()}.jpg`;
  const outputPath = path.join(IMAGE_DIR, fileName);

  const { buffer: propertyImageBuffer } =
    await getPropertyImageBuffer(property, imageIndex);

  const defaultLayer = await getOrCreateDefaultLayer();

  const buffer = await applyDesignLayer({
    baseImage: propertyImageBuffer,
    property,
    layer: defaultLayer,
    showMLS: true,
    includeRealtorLogo: true,
    brandingMode: "default",
  });

  await fs.promises.writeFile(outputPath, buffer);

  return {
    imageURL: `https://realtorparth.ca/social-images/${fileName}`,
    outputPath,
  };
}

// ============================================================
// INTERACTION TEXT & IMAGE EXTRACTION
// ============================================================

function extractInteractionText(interaction) {
  let text = "";
  if (typeof interaction?.output_text === "string") {
    text = interaction.output_text;
  }
  if (!text && Array.isArray(interaction?.steps)) {
    for (const step of interaction.steps) {
      if (step?.type !== "model_output") continue;
      for (const block of step?.content || []) {
        if (block?.type === "text") {
          text += block.text || "";
        }
      }
    }
  }
  return text
    .trim()
    .replace(/^```(?:text|markdown|json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractInteractionImage(interaction) {
  if (interaction?.output_image?.data) {
    return Buffer.from(interaction.output_image.data, "base64");
  }
  if (Array.isArray(interaction?.steps)) {
    for (const step of interaction.steps) {
      if (step?.type !== "model_output") continue;
      for (const block of step?.content || []) {
        if (
          (block?.type === "image" ||
            block?.type === "output_image") &&
          block?.data
        ) {
          return Buffer.from(block.data, "base64");
        }
      }
    }
  }
  return null;
}

// ============================================================
// DESIGN REFERENCE ANALYSIS
// ============================================================

async function analyzeDesignReference(
  referenceBuffer,
  referenceMimeType
) {
  if (!Buffer.isBuffer(referenceBuffer)) {
    throw new Error("Reference image buffer is required.");
  }

  const analysisPrompt = `
You are an expert architectural visualization designer,
architectural drafting analyst, real-estate marketing designer,
and image composition specialist.

Analyze the uploaded image ONLY as a DESIGN REFERENCE.

The house in the reference image is NOT the property used in
the final generation. Do not copy or reconstruct that house.

Extract reusable visual design language, including:
- Composition and layout
- Color palette and contrast
- Photographic treatment and lighting
- Blueprint and CAD overlays
- Dimension lines and extension lines
- Arrowheads and measurement labels
- Callout circles and technical labels
- Elevations and section drawings
- Roof, window, door and wall tracing
- Line thickness and opacity
- Typography and visual hierarchy
- Overlay placement and aspect ratio
- Background treatment

Do not reuse numerical measurements from the reference.
The MLS property is the source of truth.
Fabricated measurements are prohibited.
Technical overlays must follow the actual MLS property.
The final property must remain photorealistic.

Do not instruct the image model to create REALTOR branding,
Realtor logo, Diamond Realty logo, agent name, phone number,
brokerage information, price, MLS number, footer, contact card,
address card, or fake property statistics.

The application handles branding separately.

Return ONLY a detailed reusable image-generation prompt.
Do not return JSON.
Do not describe the specific reference house as something to copy.
`;

  try {
    const interaction = await ai.interactions.create({
      model: DESIGN_ANALYSIS_MODEL,
      input: [
        {
          type: "image",
          mime_type: referenceMimeType,
          data: referenceBuffer.toString("base64"),
        },
        {
          type: "text",
          text: analysisPrompt,
        },
      ],
    });

    const result = extractInteractionText(interaction);

    if (!result) {
      throw new Error("Gemini did not return a design prompt");
    }

    return result;
  } catch (error) {
    console.error(
      "GEMINI DESIGN ANALYSIS ERROR:",
      error?.response?.data || error?.message || error
    );
    throw error;
  }
}

// ============================================================
// CONSTANTS & DEFAULTS
// ============================================================

const DEFAULT_LAYER_NAME = "RealtorParth Default";

const DEFAULT_PROFILE_VALUES = {
  agentName: "PARTH BRAHMBHATT",
  agentPhone: "403-439-1555",
  phone: "403-439-1555",
  realtor: "REALTOR",
  agentRole: "REALTOR",
  realtorText: "REALTOR",
  brokerage: "DIAMOND REALTY",
};

function normalizeAssetKey(assetKey) {
  return String(assetKey || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function normalizeSharpPosition(position) {
  if (position === undefined || position === null || position === "") {
    return "center";
  }

  const value = String(position)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  const map = {
    center: "center",
    "center center": "center",
    "top center": "north",
    "center top": "north",
    top: "north",
    "bottom center": "south",
    "center bottom": "south",
    bottom: "south",
    "left center": "west",
    "center left": "west",
    left: "west",
    "right center": "east",
    "center right": "east",
    right: "east",
    "top left": "northwest",
    "left top": "northwest",
    "top right": "northeast",
    "right top": "northeast",
    "bottom left": "southwest",
    "left bottom": "southwest",
    "bottom right": "southeast",
    "right bottom": "southeast",
    north: "north",
    south: "south",
    east: "east",
    west: "west",
    northeast: "northeast",
    northwest: "northwest",
    southeast: "southeast",
    southwest: "southwest",
  };

  return map[value] || "center";
}

function getLayerProfileOverrides(layer) {
  const values = {
    ...DEFAULT_PROFILE_VALUES,
    ...(layer?.profile?.toObject?.() || layer?.profile || {}),
  };

  values.agentName =
    values.agentName || values.name || DEFAULT_PROFILE_VALUES.agentName;

  values.agentPhone =
    values.agentPhone ||
    values.phone ||
    DEFAULT_PROFILE_VALUES.agentPhone;

  values.phone = values.phone || values.agentPhone;

  values.realtor =
    values.realtor ||
    values.realtorText ||
    values.agentRole ||
    DEFAULT_PROFILE_VALUES.realtor;

  values.realtorText =
    values.realtorText || values.realtor || values.agentRole;

  values.agentRole =
    values.agentRole || values.realtor || values.realtorText;

  values.brokerage =
    values.brokerage || DEFAULT_PROFILE_VALUES.brokerage;

  const elements = Array.isArray(layer?.elements)
    ? layer.elements
    : [];

  for (const element of elements) {
    if (!element || element.enabled === false) continue;

    const key = String(element.textKey || "")
      .trim()
      .toLowerCase();

    const text =
      typeof element.text === "string"
        ? element.text.trim()
        : "";

    if (!text) continue;

    if (["agentname", "name"].includes(key)) {
      values.agentName = text;
    }

    if (["agentphone", "phone"].includes(key)) {
      values.agentPhone = text;
      values.phone = text;
    }

    if (
      ["realtor", "realtortext", "agentrole", "role"].includes(key)
    ) {
      values.realtor = text;
      values.realtorText = text;
      values.agentRole = text;
    }

    if (["brokerage", "brokeragename"].includes(key)) {
      values.brokerage = text;
    }
  }

  return values;
}

function getEffectiveLayerProfile(layer) {
  const profile = getLayerProfileOverrides(layer);

  return {
    agentName: profile.agentName,
    agentPhone: profile.agentPhone,
    phone: profile.phone,
    realtor: profile.realtor,
    realtorText: profile.realtorText,
    agentRole: profile.agentRole,
    brokerage: profile.brokerage,
    agentPhoto: profile.agentPhoto || "",
    brokerageLogo: profile.brokerageLogo || "",
  };
}

function getPropertyLayerValues(property, layer = null) {
  const profile = getLayerProfileOverrides(layer);

  const price = property?.ListPrice
    ? `$${Number(property.ListPrice).toLocaleString("en-CA")}`
    : "Call for Price";

  return {
    price,
    address: property?.UnparsedAddress || "",
    city: property?.City || "Calgary",
    mls: property?.ListingId || property?.ListingKey || "",
    beds: property?.BedroomsTotal || 0,
    bedrooms: property?.BedroomsTotal || 0,
    baths: property?.BathroomsTotalInteger || 0,
    bathrooms: property?.BathroomsTotalInteger || 0,
    sqft: property?.BuildingAreaTotal || property?.LivingArea || "",
    buildingArea: property?.BuildingAreaTotal || "",
    livingArea: property?.LivingArea || "",
    propertyType: property?.PropertyType || "",
    style: property?.ArchitecturalStyle || "",
    community: property?.SubdivisionName || "",
    subdivision: property?.SubdivisionName || "",
    yearBuilt: property?.YearBuilt || "",
    garage: property?.GarageSpaces || "",
    agentName: profile.agentName,
    agentPhone: profile.agentPhone,
    phone: profile.phone,
    realtor: profile.realtor,
    realtorText: profile.realtorText,
    agentRole: profile.agentRole,
    brokerage: profile.brokerage,
  };
}

function resolveLayerText(element, property, layer = null) {
  const values = getPropertyLayerValues(property, layer);

  const textKey = String(element?.textKey || "")
    .trim()
    .toLowerCase();

  const aliases = {
    agentname: "agentName",
    name: "agentName",
    agentphone: "agentPhone",
    phone: "phone",
    realtor: "realtor",
    realtortext: "realtorText",
    agentrole: "agentRole",
    role: "agentRole",
    brokeragename: "brokerage",
  };

  const normalizedKey = aliases[textKey] || textKey;

  const profileKeys = [
    "agentname",
    "name",
    "agentphone",
    "phone",
    "realtor",
    "realtortext",
    "agentrole",
    "role",
    "brokerage",
    "brokeragename",
  ];

  if (
    profileKeys.includes(textKey) &&
    typeof element?.text === "string" &&
    element.text.trim()
  ) {
    return element.text;
  }

  if (
    normalizedKey &&
    Object.prototype.hasOwnProperty.call(values, normalizedKey)
  ) {
    return String(values[normalizedKey] ?? "");
  }

  let text = element?.textTemplate || element?.text || "";

  Object.entries(values).forEach(([key, value]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, "gi");
    text = String(text).replace(regex, String(value ?? ""));
  });

  return text;
}

function applyLayerProfileToElements(elements, profile) {
  if (
    !Array.isArray(elements) ||
    !profile ||
    typeof profile !== "object"
  ) {
    return elements;
  }

  const agentName = profile.agentName ?? profile.name;
  const agentPhone = profile.agentPhone ?? profile.phone;
  const realtor =
    profile.realtor ??
    profile.realtorText ??
    profile.agentRole;
  const brokerage = profile.brokerage;

  return elements.map((element) => {
    const next = {
      ...(element?.toObject?.() || element),
    };

    const key = String(element?.textKey || "")
      .trim()
      .toLowerCase();

    if (
      agentName !== undefined &&
      ["agentname", "name"].includes(key)
    ) {
      next.text = String(agentName).trim();
    }

    if (
      agentPhone !== undefined &&
      ["agentphone", "phone"].includes(key)
    ) {
      next.text = String(agentPhone).trim();
    }

    if (
      realtor !== undefined &&
      ["realtor", "realtortext", "agentrole", "role"].includes(key)
    ) {
      next.text = String(realtor).trim();
    }

    if (
      brokerage !== undefined &&
      ["brokerage", "brokeragename"].includes(key)
    ) {
      next.text = String(brokerage).trim();
    }

    return next;
  });
}

function buildRequestProfile({
  profile,
  agentName,
  name,
  agentPhone,
  phone,
  agentRole,
  realtor,
  realtorText,
  brokerage,
  agentPhoto,
  brokerageLogo,
}) {
  const result = {
    ...(profile && typeof profile === "object" ? profile : {}),
  };

  if (agentName !== undefined) result.agentName = agentName;
  if (name !== undefined) result.name = name;
  if (agentPhone !== undefined) result.agentPhone = agentPhone;
  if (phone !== undefined) result.phone = phone;
  if (agentRole !== undefined) result.agentRole = agentRole;
  if (realtor !== undefined) result.realtor = realtor;
  if (realtorText !== undefined) result.realtorText = realtorText;
  if (brokerage !== undefined) result.brokerage = brokerage;
  if (agentPhoto !== undefined) result.agentPhoto = agentPhoto;
  if (brokerageLogo !== undefined) result.brokerageLogo = brokerageLogo;

  return result;
}

function getDefaultLayerElements() {
  return [
    // ==========================================
    // 1. TOP PROPERTY INFORMATION CARD
    // ==========================================
    {
      type: "background",
      enabled: true,
      x: 285,
      y: 32,
      width: 647,
      height: 205,
      background: "rgba(20,20,20,0.72)",
      borderRadius: 18,
      zIndex: 1,
    },
    {
      type: "shape",
      enabled: true,
      x: 285,
      y: 32,
      width: 647,
      height: 4,
      background: "rgba(255,255,255,0.85)",
      borderRadius: 2,
      zIndex: 2,
    },

    // PROPERTY ADDRESS
    {
      type: "text",
      enabled: true,
      x: 315,
      y: 68,
      textKey: "address",
      fontSize: 32,
      fontWeight: "800",
      fontFamily: "Arial, Helvetica, sans-serif",
      color: "#ffffff",
      zIndex: 3,
    },

    // MLS
    {
      type: "mls",
      enabled: true,
      x: 315,
      y: 110,
      textKey: "mls",
      textTemplate: "MLS® {{mls}}",
      fontSize: 20,
      fontWeight: "600",
      fontFamily: "Arial, Helvetica, sans-serif",
      color: "#F8F8F8",
      zIndex: 4,
    },
    {
      type: "line",
      enabled: true,
      x: 312,
      y: 130,
      width: 588,
      height: 1,
      background: "#8F8F8F",
      opacity: 0.45,
      zIndex: 5,
    },

    // CITY
    {
      type: "text",
      enabled: true,
      x: 315,
      y: 163,
      text: "CITY",
      fontSize: 17,
      fontWeight: "600",
      color: "#CFCFCF",
      zIndex: 6,
    },
    {
      type: "text",
      enabled: true,
      x: 455,
      y: 163,
      textKey: "city",
      fontSize: 20,
      fontWeight: "700",
      color: "#ffffff",
      zIndex: 7,
    },

    // BEDROOMS
    {
      type: "text",
      enabled: true,
      x: 315,
      y: 199,
      text: "BEDROOMS",
      fontSize: 17,
      fontWeight: "600",
      color: "#CFCFCF",
      zIndex: 8,
    },
    {
      type: "text",
      enabled: true,
      x: 455,
      y: 199,
      textKey: "beds",
      fontSize: 20,
      fontWeight: "700",
      color: "#ffffff",
      zIndex: 9,
    },

    // BATHROOMS
    {
      type: "text",
      enabled: true,
      x: 650,
      y: 163,
      text: "BATHROOMS",
      fontSize: 17,
      fontWeight: "600",
      color: "#CFCFCF",
      zIndex: 10,
    },
    {
      type: "text",
      enabled: true,
      x: 785,
      y: 163,
      textKey: "baths",
      fontSize: 20,
      fontWeight: "700",
      color: "#ffffff",
      zIndex: 11,
    },

    // PROPERTY SIZE
    {
      type: "text",
      enabled: true,
      x: 650,
      y: 199,
      text: "SIZE",
      fontSize: 17,
      fontWeight: "600",
      color: "#CFCFCF",
      zIndex: 12,
    },
    {
      type: "text",
      enabled: true,
      x: 785,
      y: 199,
      textKey: "sqft",
      textTemplate: "{{sqft}} Sq Ft",
      fontSize: 20,
      fontWeight: "700",
      color: "#ffffff",
      zIndex: 13,
    },

    // ==========================================
    // 2. FOOTER BACKGROUNDS
    // ==========================================

    // LEFT FOOTER: WHITE LOGO AREA
    {
      type: "background",
      enabled: true,
      x: 0,
      y: 1160,
      width: 280,
      height: 190,
      background: "#ffffff",
      zIndex: 20,
    },

    // RIGHT FOOTER: DEEP BROWN
    {
      type: "background",
      enabled: true,
      x: 280,
      y: 1160,
      width: 800,
      height: 190,
      background: "#4b2b2b",
      zIndex: 21,
    },

    // ==========================================
    // 3. AGENT CONTACT INFORMATION
    // ==========================================

    // NAME
    {
      type: "text",
      enabled: true,
      x: 315,
      y: 1220,
      text: "PARTH BRAHMBHATT",
      textKey: "agentName",
      fontSize: 38,
      fontWeight: "800",
      fontFamily: "Arial, Helvetica, sans-serif",
      color: "#ffffff",
      zIndex: 27,
    },

    // ROLE
    {
      type: "text",
      enabled: true,
      x: 450,
      y: 1272,
      text: "Realtor",
      textKey: "realtor",
      fontSize: 30,
      fontWeight: "400",
      fontFamily: "Arial, Helvetica, sans-serif",
      color: "#ffffff",
      zIndex: 28,
    },

    // PHONE
    {
      type: "text",
      enabled: true,
      x: 380,
      y: 1325,
      text: "403-439-1555",
      textKey: "agentPhone",
      fontSize: 38,
      fontWeight: "500",
      fontFamily: "Arial, Helvetica, sans-serif",
      color: "#ffffff",
      zIndex: 29,
    },

    // ==========================================
    // 4. BROKERAGE LOGO
    // ==========================================
    {
      type: "image",
      enabled: true,
      x: 12,
      y: 1168,
      width: 255,
      height: 175,
      assetKey: "brokerage",
      assetUrl: "diamond_realty.jpeg",
      fit: "contain",
      zIndex: 30,
    },

    // ==========================================
    // 5. AGENT IMAGE
    // Match social-portrait2 Canvas placement
    // ==========================================
    {
      type: "agent",
      enabled: true,
      x: 650,
      y: 770,
      width: 580,
      height: 580,
      assetKey: "agent",
      assetUrl: "agent222.png",
      fit: "contain",
      zIndex: 31,
    },
  ];
}


async function getOrCreateDefaultLayer() {
  const layerName = DEFAULT_LAYER_NAME;
  const expectedElements = getDefaultLayerElements();

  let layer = await SocialDesignLayer.findOne({
    name: layerName,
    userId: null,
  });

  if (!layer) {
    layer = await SocialDesignLayer.create({
      name: layerName,
      description: "Default RealtorParth property branding layer.",
      type: "default",
      isActive: true,
      isDefault: true,
      showMLS: true,
      canvas: {
        width: 1080,
        height: 1350,
        background: "transparent",
        backgroundImage: "",
      },
      profile: DEFAULT_PROFILE_VALUES,
      elements: expectedElements,
      userId: null,
      sortOrder: 0,
    });

    console.log("[Default Layer] Created with current layout.");
    return layer;
  }

  // Always synchronize the built-in Default layout with the
  // coordinates defined in getDefaultLayerElements().
  const currentElements = Array.isArray(layer.elements)
    ? layer.elements
    : [];

  const normalizeElement = (element) => {
    const plain = element?.toObject?.() || element || {};

    return {
      type: String(plain.type || "").toLowerCase(),
      x: Number(plain.x ?? 0),
      y: Number(plain.y ?? 0),
      width: Number(plain.width ?? 0),
      height: Number(plain.height ?? 0),
      textKey: String(plain.textKey || ""),
      assetKey: String(plain.assetKey || ""),
      assetUrl: String(plain.assetUrl || ""),
      fontSize: Number(plain.fontSize ?? 0),
      text: String(plain.text || ""),
    };
  };

  const currentSignature = JSON.stringify(
    currentElements.map(normalizeElement)
  );

  const expectedSignature = JSON.stringify(
    expectedElements.map(normalizeElement)
  );

  let needsSave = currentSignature !== expectedSignature;

  if (
    Number(layer.canvas?.width) !== 1080 ||
    Number(layer.canvas?.height) !== 1350 ||
    layer.canvas?.background !== "transparent"
  ) {
    layer.canvas = {
      width: 1080,
      height: 1350,
      background: "transparent",
      backgroundImage: "",
    };

    needsSave = true;
  }

  if (
    layer.type !== "default" ||
    layer.isActive !== true ||
    layer.isDefault !== true
  ) {
    layer.type = "default";
    layer.isActive = true;
    layer.isDefault = true;
    needsSave = true;
  }

  if (needsSave) {
    layer.elements = expectedElements;
    await layer.save();

    console.log(
      "[Default Layer] Updated saved elements from getDefaultLayerElements()."
    );
  }

  return layer;
}


async function getLayerByIdOrDefault(layerId, userId = null) {
  const defaultLayer = await getOrCreateDefaultLayer();

  if (
    layerId &&
    !["default", "minimal", "none"].includes(String(layerId))
  ) {
    if (!isValidObjectId(layerId)) {
      throw new Error("Invalid design layer ID");
    }

    const query = {
      _id: layerId,
      isActive: { $ne: false },
    };

    if (userId && isValidObjectId(userId)) {
      query.$or = [{ userId: null }, { userId }];
    } else {
      query.userId = null;
    }

    const layer = await SocialDesignLayer.findOne(query);

    if (!layer) {
      throw new Error("Selected design layer not found or inaccessible");
    }

    return layer;
  }

  if (userId && isValidObjectId(userId)) {
    const user = await User.findById(userId).select(
      "socialDesignPreferences"
    );

    const preferredId =
      user?.socialDesignPreferences?.defaultLayerId;

    if (preferredId && isValidObjectId(preferredId)) {
      const preferredLayer = await SocialDesignLayer.findOne({
        _id: preferredId,
        isActive: { $ne: false },
        $or: [{ userId: null }, { userId }],
      });

      if (preferredLayer) return preferredLayer;
    }
  }

  return defaultLayer;
}

// ============================================================
// SAFE ASSET RESOLVER (AVOIDS INVALID URL THROWS)
// ============================================================

function resolveLayerAssetPath(element, layer = null) {
  const assetKey = normalizeAssetKey(element?.assetKey);
  const assetUrl = String(element?.assetUrl || "").trim();

  const profile = layer?.profile?.toObject?.() || layer?.profile || {};

  const agentPhoto =
    profile.agentPhoto ||
    element?.assetUrl ||
    "";

  const brokerageLogo =
    profile.brokerageLogo ||
    element?.assetUrl ||
    "";

  const systemAssets = {
    realtorlogo: path.join(ASSET_DIR, "realtor_logo.svg"),
    agent: path.join(ASSET_DIR, "agent222.png"),
    agentphoto: path.join(ASSET_DIR, "agent222.png"),
    agent12: path.join(ASSET_DIR, "agent222.png"),
    brokerage: path.join(ASSET_DIR, "diamond_realty.jpeg"),
    diamondrealty: path.join(ASSET_DIR, "diamond_realty.jpeg"),
    diamondrealtylogo: path.join(ASSET_DIR, "diamond_realty.jpeg"),
  };

  if (assetKey === "agentphoto" && agentPhoto) {
    const resolved = resolveLayerAssetPath({
      ...element,
      assetKey: "",
      assetUrl: agentPhoto,
    });
    if (resolved) return resolved;
  }

  if (
    ["brokerage", "brokeragelogo", "diamondrealtylogo"].includes(assetKey) &&
    brokerageLogo
  ) {
    const resolved = resolveLayerAssetPath({
      ...element,
      assetKey: "",
      assetUrl: brokerageLogo,
    });
    if (resolved) return resolved;
  }

  if (systemAssets[assetKey] && fs.existsSync(systemAssets[assetKey])) {
    return systemAssets[assetKey];
  }

  if (!assetUrl) return null;

  let clean = assetUrl;

  if (/^https?:\/\//i.test(assetUrl)) {
    try {
      const parsed = new URL(assetUrl);
      const pathname = decodeURIComponent(parsed.pathname);
      clean = path.basename(pathname);
    } catch {
      clean = "";
    }
  }

  if (!clean || clean === "." || clean === "..") return null;

  clean = clean.replace(/^\/+/, "");
  const basename = path.basename(clean);

  const candidates = [
    path.join(ASSET_DIR, basename),
    path.join(IMAGE_DIR, basename),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

async function createAlwaysOnRealtorLogo() {
  const logoPath = path.join(ASSET_DIR, "realtor_logo.svg");

  if (!fs.existsSync(logoPath)) {
    console.warn("REALTOR logo missing:", logoPath);
    return null;
  }

  const raw = await fs.promises.readFile(logoPath, "utf8");
  const base64 = Buffer.from(raw).toString("base64");

  return Buffer.from(`
<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
  <image
    href="data:image/svg+xml;base64,${base64}"
    x="55" y="52" width="190" height="165"
    opacity="0.35"
    preserveAspectRatio="xMidYMid meet"
  />
</svg>`);
}

// ============================================================
// APPLY DESIGN LAYER (4 MODES)
// ============================================================

function createLayerSvg(layer, property, showMLS = true) {
  const canvasWidth = 1080;
  const canvasHeight = 1350;

  const elements = Array.isArray(layer?.elements)
    ? [...layer.elements].sort(
        (a, b) =>
          (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0)
      )
    : [];

  let svg = `
<svg width="${canvasWidth}" height="${canvasHeight}"
  viewBox="0 0 ${canvasWidth} ${canvasHeight}"
  xmlns="http://www.w3.org/2000/svg">`;

  const canvasBackground = layer?.canvas?.background;

  if (
    canvasBackground &&
    canvasBackground !== "transparent"
  ) {
    svg += `
<rect x="0" y="0" width="${canvasWidth}" height="${canvasHeight}"
  fill="${escapeSvgText(canvasBackground)}"/>`;
  }

  for (const element of elements) {
    if (!element || element.enabled === false) continue;

    const type = String(element.type || "")
      .trim()
      .toLowerCase();

    if (type === "mls" && !showMLS) continue;

    const x = Number(element.x) || 0;
    const y = Number(element.y) || 0;
    const width = Number(element.width) || 0;
    const height = Number(element.height) || 0;

    const opacity =
      element.opacity === undefined
        ? 1
        : Math.max(
            0,
            Math.min(1, Number(element.opacity) || 0)
          );

    const radius = Number(element.borderRadius) || 0;
    const background = element.background || "transparent";
    const color = element.color || "#000000";
    const fontSize = Number(element.fontSize) || 20;
    const fontWeight = element.fontWeight || "normal";
    const fontFamily =
      element.fontFamily || "Arial, Helvetica, sans-serif";

    if (["background", "shape", "rect"].includes(type)) {
      svg += `
<rect x="${x}" y="${y}" width="${width}" height="${height}"
  rx="${radius}" ry="${radius}"
  fill="${escapeSvgText(background)}" opacity="${opacity}"/>`;

      if (Number(element.borderWidth) > 0) {
        svg += `
<rect x="${x}" y="${y}" width="${width}" height="${height}"
  rx="${radius}" ry="${radius}" fill="none"
  stroke="${escapeSvgText(element.borderColor || "transparent")}"
  stroke-width="${Number(element.borderWidth)}"
  opacity="${opacity}"/>`;
      }

      continue;
    }

    if (type === "line") {
      svg += `
<line x1="${x}" y1="${y}" x2="${x + width}"
  y2="${y + Math.max(height, 1)}"
  stroke="${escapeSvgText(background || color)}"
  stroke-width="${Math.max(Number(element.height) || 1, 1)}"
  opacity="${opacity}"/>`;

      continue;
    }

    if (
      ["text", "mls", "address", "price", "details"].includes(type)
    ) {
      const resolved = resolveLayerText(element, property, layer);

      const anchor =
        element.textAlign === "center"
          ? "middle"
          : element.textAlign === "right"
            ? "end"
            : "start";

      const baseline =
        y +
        (element.textBaseline === "baseline" ? 0 : fontSize);

      svg += `
<text x="${x}" y="${baseline}"
  fill="${escapeSvgText(color)}"
  font-family="${escapeSvgText(fontFamily)}"
  font-size="${fontSize}px"
  font-weight="${escapeSvgText(fontWeight)}"
  text-anchor="${anchor}" opacity="${opacity}">${escapeSvgText(resolved)}</text>`;
    }
  }

  svg += "</svg>";

  return svg;
}

// ============================================================
// LAYER IMAGE COMPOSITES
// Uses model elements plus the saved profile assets.
// ============================================================

async function prepareLayerImageComposites(layer) {
  const composites = [];

  const elements = Array.isArray(layer?.elements)
    ? [...layer.elements].sort(
        (a, b) =>
          (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0)
      )
    : [];

  for (const element of elements) {
    if (!element || element.enabled === false) continue;

    const type = String(element.type || "")
      .trim()
      .toLowerCase();

    if (!["image", "agent", "logo", "brokerage"].includes(type)) {
      continue;
    }

    const assetPath = resolveLayerAssetPath(element, layer);

    if (!assetPath) {
      console.warn("Layer asset not found:", {
        layer: layer.name,
        type,
        assetKey: element.assetKey || "",
        assetUrl: element.assetUrl || "",
      });
      continue;
    }

    const assetKey = normalizeAssetKey(element.assetKey);

    const isAgent =
      type === "agent" ||
      ["agent", "agentphoto", "agent12"].includes(assetKey);

    const isBrokerageLogo = [
      "brokerage",
      "brokeragelogo",
      "diamondrealtylogo",
    ].includes(assetKey);

    // IMPORTANT:
    // Use the coordinates and dimensions stored in the layer.
    // Do not overwrite the Default layer's custom positions.
    let left = Number(element.x ?? 0);
    let top = Number(element.y ?? 0);
    let width = Number(element.width) || undefined;
    let height = Number(element.height) || undefined;

    // Keep legacy brokerage logo defaults only when dimensions
    // and positions have not been configured on the element.
    if (
      isBrokerageLogo &&
      Number(element.width) === 0 &&
      Number(element.height) === 0
    ) {
      left = 12;
      top = 1168;
      width = 255;
      height = 175;
    }

    let image = sharp(assetPath);

    const rotation = Number(element.rotation) || 0;

    if (rotation !== 0) {
      image = image.rotate(rotation);
    }

    // Optional full-height reference layout.
    // This intentionally overrides normal coordinates only when enabled.
    if (isAgent && element.useReferenceAgentLayout === true) {
      const metadata = await sharp(assetPath).metadata();

      const originalWidth = Number(metadata.width) || 1;
      const originalHeight = Number(metadata.height) || 1;

      height = 900;
      width = Math.round(
        (originalWidth / originalHeight) * height
      );

      left = 1080 - width + 120;
      top = 400;
    }

    if (width || height) {
      image = image.resize({
        width,
        height,
        fit:
          element.fit === "fill"
            ? "fill"
            : element.fit === "cover"
              ? "cover"
              : "contain",
        position: normalizeSharpPosition(element.objectPosition),
      });
    }

    const buffer = await image.png().toBuffer();

    composites.push({
      input: buffer,
      left: Math.round(left),
      top: Math.round(top),
    });
  }

  return composites;
}


// ============================================================

async function generateAILayer({
  property,
  designPrompt,
  userPrompt,
  showMLS = true,
}) {
  const propertyAddress = property?.UnparsedAddress || "";
  const city = property?.City || "";

  const price = property?.ListPrice
    ? `$${Number(property.ListPrice).toLocaleString("en-CA")}`
    : "";

  const mls = property?.ListingId || property?.ListingKey || "";
  const beds = property?.BedroomsTotal || "";
  const baths = property?.BathroomsTotalInteger || "";
  const sqft = property?.BuildingAreaTotal || property?.LivingArea || "";
  const propertyType = property?.PropertyType || "";

  const prompt = `
You are a premium real-estate social-media graphic designer.

Create a visual branding layer specification for a
1080 x 1350 portrait real-estate listing image.

The final image is for RealtorParth.

USER DESIGN REQUEST:
${userPrompt || "Create a premium modern real-estate design."}

DESIGN STYLE ANALYSIS:
${designPrompt || "Premium modern real-estate marketing style."}

VERIFIED PROPERTY INFORMATION:
Address: ${propertyAddress || "Not available"}
City: ${city || "Not available"}
Price: ${price || "Not available"}
MLS: ${mls || "Not available"}
Bedrooms: ${beds || "Not available"}
Bathrooms: ${baths || "Not available"}
Square Feet: ${sqft || "Not available"}
Property Type: ${propertyType || "Not available"}

Create an overlay/layer only.
Do not modify the actual property.
Do not create a different house.
Do not invent property facts.

The layer may contain:
- Address
- City
- Price
- Bedrooms and bathrooms
- Square feet
- Property type
- MLS, when permitted
- Agent name and phone
- REALTOR role
- Brokerage name
- Shapes, cards, lines, borders and accent blocks

MLS VISIBILITY:
${
  showMLS
    ? "MLS MAY be displayed only when an MLS number exists."
    : "MLS MUST NOT be displayed anywhere in the layer."
}

DEFAULT CONTACT INFORMATION:
Agent: PARTH BRAHMBHATT
Phone: 403-439-1555
Role: REALTOR
Brokerage: DIAMOND REALTY

Return ONLY valid JSON in this structure:
{
  "name": "AI Auto Layer",
  "description": "AI-generated real-estate branding layer",
  "canvas": {
    "width": 1080,
    "height": 1350,
    "background": "transparent",
    "backgroundImage": ""
  },
  "profile": {
    "agentName": "PARTH BRAHMBHATT",
    "agentPhone": "403-439-1555",
    "agentRole": "REALTOR",
    "brokerage": "DIAMOND REALTY"
  },
  "elements": [
    {
      "type": "background",
      "enabled": true,
      "x": 0,
      "y": 0,
      "width": 1080,
      "height": 200,
      "background": "rgba(0,0,0,0.65)",
      "opacity": 1,
      "zIndex": 1
    },
    {
      "type": "text",
      "enabled": true,
      "x": 40,
      "y": 80,
      "textKey": "address",
      "fontSize": 32,
      "fontWeight": "700",
      "color": "#ffffff",
      "zIndex": 2
    }
  ]
}

SUPPORTED ELEMENT TYPES:
background, shape, rect, line, text, mls, image, agent, logo, brokerage.

VALID TEXT KEYS:
address, city, price, mls, beds, baths, sqft, propertyType,
agentName, agentPhone, realtor, brokerage.

Do not generate image elements. Image assets are handled by the application.
Keep the design elegant, readable and professional.
Return ONLY JSON.
`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        temperature: 0.8,
        responseMimeType: "application/json",
      },
    });

    let text = response.text || "";

    text = text
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      const first = text.indexOf("{");
      const last = text.lastIndexOf("}");

      if (first >= 0 && last > first) {
        parsed = JSON.parse(text.substring(first, last + 1));
      }
    }

    if (!parsed || typeof parsed !== "object") {
      throw new Error("AI returned invalid layer JSON");
    }

    const allowedTypes = new Set([
      "background",
      "shape",
      "rect",
      "line",
      "text",
      "mls",
    ]);

    const rawElements = Array.isArray(parsed.elements)
      ? parsed.elements
      : [];

    const elements = rawElements
      .filter((element) => {
        const type = String(element?.type || "").toLowerCase();

        return allowedTypes.has(type);
      })
      .map((element, index) => ({
        ...element,
        enabled: element.enabled !== false,
        x: Number(element.x) || 0,
        y: Number(element.y) || 0,
        width: Number(element.width) || 0,
        height: Number(element.height) || 0,
        zIndex: Number(element.zIndex) || index + 1,
      }));

    // Never allow AI output to bypass the user's MLS visibility choice.
    const safeElements = showMLS
      ? elements
      : elements.filter(
          (element) =>
            String(element.type).toLowerCase() !== "mls" &&
            !/\bMLS\b/i.test(
              `${element.text || ""} ${element.textTemplate || ""}`
            )
        );

    const generatedProfile = {
      ...DEFAULT_PROFILE_VALUES,
      ...(parsed.profile && typeof parsed.profile === "object"
        ? parsed.profile
        : {}),
    };

    return {
      name: String(parsed.name || "AI Auto Layer").trim(),
      description: String(
        parsed.description ||
          "AI-generated real-estate branding layer."
      ).trim(),
      type: "ai",
      aiGenerated: true,
      aiPrompt: String(userPrompt || designPrompt || ""),
      isActive: true,
      isDefault: false,
      showMLS: Boolean(showMLS),
      canvas: {
        width: 1080,
        height: 1350,
        background: parsed.canvas?.background || "transparent",
        backgroundImage: parsed.canvas?.backgroundImage || "",
      },
      profile: generatedProfile,
      elements: safeElements,
    };
  } catch (error) {
    console.error("AI AUTO LAYER ERROR:", error?.message || error);
    throw error;
  }
}

// ============================================================
// SAVE AI-GENERATED LAYER
// ============================================================

async function saveGeneratedAILayer({
  layerDefinition,
  userId,
}) {
  if (!layerDefinition) return null;

  const cleanUserId =
    userId && isValidObjectId(userId) ? userId : null;

  const layer = await SocialDesignLayer.create({
    name: layerDefinition.name || "AI Auto Layer",
    description:
      layerDefinition.description ||
      "AI-generated real-estate branding layer.",
    type: "ai",
    aiGenerated: true,
    aiPrompt: layerDefinition.aiPrompt || "",
    isActive: true,
    isDefault: false,
    showMLS: Boolean(layerDefinition.showMLS),
    canvas: layerDefinition.canvas || {
      width: 1080,
      height: 1350,
      background: "transparent",
      backgroundImage: "",
    },
    profile: layerDefinition.profile || DEFAULT_PROFILE_VALUES,
    elements: Array.isArray(layerDefinition.elements)
      ? layerDefinition.elements
      : [],
    userId: cleanUserId,
    sortOrder: 0,
  });

  return layer;
}

// ============================================================

async function generateAIDesignImage({
  referenceBuffer,
  referenceMimeType,
  propertyBuffer,
  propertyMimeType = "image/jpeg",
  designPrompt,
  property,
  userPrompt,
}) {
  if (!propertyBuffer) {
    throw new Error(
      "A property/source image is required for AI image generation."
    );
  }

  if (!designPrompt && !userPrompt) {
    throw new Error("Design prompt is required.");
  }

  const aspectRatio = "4:5";

  const propertyBase64 = (
    await sharp(propertyBuffer)
      .rotate()
      .jpeg({ quality: 94, mozjpeg: true })
      .toBuffer()
  ).toString("base64");

  const propertyFacts = `
VERIFIED PROPERTY INFORMATION:
Address: ${property?.UnparsedAddress || "Not provided"}
MLS: ${property?.ListingKey || property?.ListingId || "Not provided"}
Price: ${property?.ListPrice || "Not provided"}
Property Type: ${property?.PropertyType || "Not provided"}
Architectural Style: ${property?.ArchitecturalStyle || "Not provided"}
City: ${property?.City || "Not provided"}
Community: ${property?.SubdivisionName || "Not provided"}
Bedrooms: ${property?.BedroomsTotal || "Not provided"}
Bathrooms: ${property?.BathroomsTotalInteger || "Not provided"}
Garage: ${property?.GarageSpaces || "Not provided"}
Building Area: ${property?.BuildingAreaTotal || "Not provided"}
Living Area: ${property?.LivingArea || "Not provided"}
Year Built: ${property?.YearBuilt || "Not provided"}
`;

  const referenceSection = referenceBuffer
    ? `
IMAGE 2 = DESIGN REFERENCE.
IMAGE 2 is ONLY a visual design/style reference.
Do NOT copy the property or house from IMAGE 2.
Do NOT replace the source property with IMAGE 2.
Apply only its reusable visual language.
`
    : `
NO DESIGN REFERENCE IMAGE WAS PROVIDED.
Create a premium visual treatment based on the user's
design instructions and the verified property image.
`;

  const finalPrompt = `
You are creating a premium professional real-estate
architectural marketing image for RealtorParth.

IMAGE 1 = ACTUAL PROPERTY SOURCE IMAGE.
IMAGE 1 is the source of truth for the actual property.

${referenceSection}

PRESERVE THE ACTUAL PROPERTY:
- Roof
- Windows
- Doors
- Garage
- Porch
- Balconies
- Siding
- Facade
- Building proportions
- Landscaping
- Driveway
- Surrounding context
- Camera perspective

Do not replace the property or create a different house.
Do not invent architecture.
Do not turn the property into a cartoon or 3D render.
Keep the property photorealistic.

If the design asks for architectural lines, blueprint-style overlays,
CAD overlays, elevation lines, section lines, dimension lines,
callouts, roof tracing, window tracing, door tracing, or wall tracing,
those elements MUST follow the actual source property.

Do not copy dimensions from a reference image.
Never fabricate measurements.
If verified numerical dimensions are unavailable, use non-numeric
technical guide lines instead.

USER DESIGN INSTRUCTIONS:
${userPrompt || ""}

ANALYZED DESIGN STYLE:
${designPrompt || ""}

VERIFIED PROPERTY INFORMATION:
${propertyFacts}

Create ONE professional portrait real-estate image.
Aspect ratio: 4:5.

Do not create REALTOR branding, REALTOR logo, Diamond Realty logo,
agent name, phone number, brokerage, price card, contact card,
MLS card, footer, or fake statistics.
Those are handled separately by the application layer.

Generate ONLY the clean AI property/design image.
`;

  console.log("AI DESIGN IMAGE GENERATION");
  console.log("MODEL:", DESIGN_IMAGE_MODEL);
  console.log("REFERENCE:", referenceBuffer ? "YES" : "NO");
  console.log("MLS PROPERTY:", property ? "YES" : "NO");

  const input = [
    {
      type: "image",
      mime_type: propertyMimeType,
      data: propertyBase64,
    },
  ];

  if (referenceBuffer) {
    input.push({
      type: "image",
      mime_type: referenceMimeType || "image/jpeg",
      data: referenceBuffer.toString("base64"),
    });
  }

  input.push({
    type: "text",
    text: finalPrompt,
  });

  const interaction = await ai.interactions.create({
    model: DESIGN_IMAGE_MODEL,
    input,
    response_format: {
      type: "image",
      aspect_ratio: aspectRatio,
      image_size: "1K",
    },
  });

  const generatedImageBuffer = extractInteractionImage(interaction);

  if (!generatedImageBuffer) {
    console.error(
      "Gemini returned no image:",
      JSON.stringify(interaction, null, 2)
    );

    throw new Error("Gemini did not return a generated image");
  }

  const cleanGeneratedImage = await sharp(generatedImageBuffer)
    .rotate()
    .resize(1080, 1350, {
      fit: "cover",
      position: "center",
    })
    .png()
    .toBuffer();

  return {
    imageBuffer: cleanGeneratedImage,
    aspectRatio,
    model: DESIGN_IMAGE_MODEL,
    width: 1080,
    height: 1350,
  };
}

// ============================================================

async function applyDesignLayer({
  baseImage,
  property,
  layer,
  showMLS = true,
  includeRealtorLogo = true,
  brandingMode = "default",
}) {
  const normalizedBase = sharp(baseImage)
    .rotate()
    .resize(1080, 1350, { fit: "cover", position: "center" });

  if (brandingMode === "none") {
    return normalizedBase
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  }

  const composites = [];

  if (includeRealtorLogo) {
    const realtorLogo = await createAlwaysOnRealtorLogo();
    if (realtorLogo) composites.push({ input: realtorLogo, left: 0, top: 0 });
  }

  if (layer) {
    const canvasWidth = 1080;
    const canvasHeight = 1350;
    const canvasBackground = layer?.canvas?.background;

    if (canvasBackground && canvasBackground !== "transparent") {
      composites.push({
        input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}"><rect width="100%" height="100%" fill="${escapeSvgText(canvasBackground)}"/></svg>`),
        left: 0,
        top: 0,
      });
    }

    const elements = Array.isArray(layer.elements)
      ? [...layer.elements].filter(Boolean).sort(
          (a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0)
        )
      : [];

    // Composite elements in z-order so custom image assets never jump above
    // text/shapes that should appear in front of them.
    for (const element of elements) {
      if (element.enabled === false) continue;
      const type = String(element.type || "").trim().toLowerCase();
      if (type === "mls" && !showMLS) continue;

      if (["image", "agent", "logo", "brokerage"].includes(type)) {
        const imageComposites = await prepareLayerImageComposites({
          ...layer,
          elements: [element],
        });
        composites.push(...imageComposites);
        continue;
      }

      const elementLayer = {
        ...layer,
        canvas: {
          width: canvasWidth,
          height: canvasHeight,
          background: "transparent",
          backgroundImage: "",
        },
        elements: [element],
      };
      composites.push({
        input: Buffer.from(createLayerSvg(elementLayer, property, showMLS)),
        left: 0,
        top: 0,
      });
    }
  }

  return normalizedBase
    .composite(composites)
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

function serializeLayer(layer) {
  if (!layer) return null;
  const plain = layer.toObject ? layer.toObject() : { ...layer };
  return {
    ...plain,
    profile: getEffectiveLayerProfile(plain),
  };
}

function layerIsAccessibleToUser(layer, userId) {
  if (!layer) return false;
  const ownerId = layer.userId ? String(layer.userId) : null;
  if (!ownerId) return true;
  return Boolean(
    userId && isValidObjectId(userId) && ownerId === String(userId)
  );
}

// ============================================================
// PREFERENCES ROUTE (DECLARED BEFORE PARAMETERIZED ROUTES)
// ============================================================

async function getDesignPreferences(req, res) {
  try {
    const defaultLayer = await getOrCreateDefaultLayer();
    const userId = getRequestUserId(req);

    let defaultLayerId = defaultLayer._id;
    let defaultShowMLS = Boolean(defaultLayer.showMLS);

    if (userId) {
      const user = await User.findById(userId).select(
        "socialDesignPreferences"
      );

      if (user?.socialDesignPreferences) {
        const preferences = user.socialDesignPreferences;

        if (preferences.defaultLayerId) {
          const preferredLayer = await SocialDesignLayer.findOne({
            _id: preferences.defaultLayerId,
            isActive: { $ne: false },
            $or: [{ userId: null }, { userId }],
          });

          if (preferredLayer) {
            defaultLayerId = preferredLayer._id;
          }
        }

        if (preferences.defaultShowMLS !== undefined) {
          defaultShowMLS = Boolean(preferences.defaultShowMLS);
        }
      }
    }

    return res.json({
      success: true,
      preferences: {
        defaultLayerId,
        defaultShowMLS,
      },
    });
  } catch (error) {
    console.error("GET DESIGN PREFERENCES ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load design preferences",
    });
  }
}

router.get("/design-layers/preferences", getDesignPreferences);
router.get("/design-preferences", getDesignPreferences);

async function saveDesignPreferences(req, res) {
  try {
    const { defaultLayerId, defaultShowMLS } = req.body || {};
    const userId = getRequestUserId(req);

    if (userId) {
      const user = await User.findById(userId);
      if (user) {
        user.socialDesignPreferences = user.socialDesignPreferences || {};
        if (defaultLayerId !== undefined) {
          if (defaultLayerId && !isValidObjectId(defaultLayerId)) {
            return res.status(400).json({ success: false, message: "Invalid default layer ID" });
          }
          if (defaultLayerId) {
            const chosen = await SocialDesignLayer.findOne({
              _id: defaultLayerId,
              isActive: { $ne: false },
              $or: [{ userId: null }, { userId }],
            });
            if (!chosen) {
              return res.status(404).json({ success: false, message: "Selected design layer not found or inaccessible" });
            }
          }
          user.socialDesignPreferences.defaultLayerId = defaultLayerId || null;
        }
        if (defaultShowMLS !== undefined) {
          user.socialDesignPreferences.defaultShowMLS = parseBoolean(defaultShowMLS, true);
        }
        await user.save();
      }
    }

    return res.json({
      success: true,
      message: "Preferences updated",
      preferences: {
        defaultLayerId: defaultLayerId || null,
        defaultShowMLS: parseBoolean(defaultShowMLS, false),
      },
    });
  } catch (error) {
    console.error("SAVE DESIGN PREFERENCES ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save preferences",
    });
  }
}

router.put("/design-layers/preferences", saveDesignPreferences);
router.post("/design-layers/preferences", saveDesignPreferences);
router.put("/design-preferences", saveDesignPreferences);
router.post("/design-preferences", saveDesignPreferences);

// ============================================================
// ANALYZE DESIGN REFERENCE
// Required by SocialPostCreator.tsx:
// POST /api/socialpost/analyze-design
// ============================================================

router.post(
  "/analyze-design",
  upload.single("referenceImage"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Reference image is required.",
        });
      }

      const referenceBuffer = await readUploadedImage(req.file);
      const referenceMimeType = getSafeMimeType(req.file.mimetype);
      const prompt = await analyzeDesignReference(
        referenceBuffer,
        referenceMimeType
      );

      return res.json({
        success: true,
        prompt,
        model: DESIGN_ANALYSIS_MODEL,
      });
    } catch (error) {
      console.error(
        "AI DESIGN ANALYSIS ERROR:",
        error?.response?.data || error?.message || error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.response?.data?.message ||
          error?.message ||
          "Failed to analyze design reference.",
      });
    } finally {
      await deleteTempFile(req.file?.path);
    }
  }
);

// ============================================================
// MAIN GENERATE DESIGN ROUTE
// ============================================================

router.post(
  "/generate-design",
  upload.single("referenceImage"),
  async (req, res) => {
    try {
      const {
        mls,
        prompt,
        layerId,
        showMLS,
        brandingMode,
        userPrompt,
      } = req.body || {};

      const cleanMLS =
        typeof mls === "string" ? mls.trim() : "";

      const cleanPrompt =
        typeof prompt === "string" ? prompt.trim() : "";

      const cleanUserPrompt =
        typeof userPrompt === "string" ? userPrompt.trim() : "";

      const cleanBrandingMode =
        normalizeBrandingMode(brandingMode);

      const shouldShowMLS = parseBoolean(showMLS, false);

      const userId = getRequestUserId(req);

      let property = null;
      let propertyImageBuffer = null;
      let propertyImageUrl = null;

      if (cleanMLS) {
        const propertyResponse = await axios.get(
          `https://realtorparth.ca/api/properties/analysis/${encodeURIComponent(cleanMLS)}`,
          { timeout: 30000 }
        );

        property = propertyResponse.data?.property;

        if (!property) {
          return res.status(404).json({
            success: false,
            message: "Property not found for the provided MLS number.",
          });
        }

        const source = await getPropertyImageBuffer(property, 0);
        propertyImageBuffer = source.buffer;
        propertyImageUrl = source.imageUrl;
      } else if (req.file) {
        propertyImageBuffer = await readUploadedImage(req.file);
        property = {
          UnparsedAddress: "",
          ListingId: "",
          ListingKey: "",
          ListPrice: "",
          PropertyType: "",
          ArchitecturalStyle: "",
          City: "Calgary",
          SubdivisionName: "",
          BedroomsTotal: "",
          BathroomsTotalInteger: "",
          GarageSpaces: "",
          BuildingAreaTotal: "",
          LivingArea: "",
          YearBuilt: "",
          PublicRemarks: "",
          Media: [],
        };
      }

      if (!propertyImageBuffer) {
        return res.status(400).json({
          success: false,
          message: "Please provide an MLS number or a reference image.",
        });
      }

      let caption = "";
      if (cleanMLS) {
        const preview = await generatePropertyPost(property);
        caption = preview.caption;
      } else {
        caption = await generateSocialContent(
          cleanUserPrompt || cleanPrompt || "Luxury Real Estate"
        );
      }

      let referenceBuffer = null;
      let referenceMimeType = null;

      if (req.file) {
        referenceBuffer = await readUploadedImage(req.file);
        referenceMimeType = getSafeMimeType(req.file.mimetype);
      }

      let baseImage = propertyImageBuffer;

      if (cleanPrompt || cleanUserPrompt) {
        const generated = await generateAIDesignImage({
          referenceBuffer,
          referenceMimeType,
          propertyBuffer: propertyImageBuffer,
          propertyMimeType: "image/jpeg",
          designPrompt: cleanPrompt,
          userPrompt: cleanUserPrompt,
          property,
        });

        baseImage = generated.imageBuffer;
      }

      let selectedLayer = null;
      let generatedLayer = null;

      if (cleanBrandingMode === "default") {
        selectedLayer = await getLayerByIdOrDefault(null, userId);
      } else if (cleanBrandingMode === "custom") {
        if (layerId && isValidObjectId(layerId)) {
          selectedLayer = await getLayerByIdOrDefault(layerId, userId);
        } else {
          selectedLayer = await getLayerByIdOrDefault(null, userId);
        }
      } else if (cleanBrandingMode === "ai") {
        const layerDefinition = await generateAILayer({
          property,
          designPrompt: cleanPrompt,
          userPrompt: cleanUserPrompt,
          showMLS: shouldShowMLS,
        });

        generatedLayer = await saveGeneratedAILayer({
          layerDefinition,
          userId,
        });

        selectedLayer = generatedLayer;
      }

      const finalImageBuffer = await applyDesignLayer({
        baseImage,
        property,
        layer: selectedLayer,
        showMLS: shouldShowMLS,
        includeRealtorLogo: cleanBrandingMode !== "none",
        brandingMode: cleanBrandingMode,
      });

      const fileName =
        `design-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;

      const outputPath = path.join(IMAGE_DIR, fileName);

      await fs.promises.writeFile(outputPath, finalImageBuffer);

      const imageURL =
        `https://realtorparth.ca/social-images/${fileName}`;

      const profile = selectedLayer
        ? getEffectiveLayerProfile(selectedLayer)
        : null;

      const topic =
        property?.UnparsedAddress ||
        cleanMLS ||
        cleanUserPrompt ||
        cleanPrompt ||
        "AI Real Estate Design";

      return res.json({
        success: true,
        topic,
        caption,
        imageURL,
        property: cleanMLS ? property : null,
        prompt: cleanPrompt || cleanUserPrompt,
        aspectRatio: "4:5",
        model: DESIGN_IMAGE_MODEL,
        sourcePropertyImage: propertyImageUrl,
        sourceType: cleanMLS ? "mls" : "uploaded-image",
        brandingMode: cleanBrandingMode,
        layerId: selectedLayer?._id || null,
        layerName:
          cleanBrandingMode === "none"
            ? "No Layer"
            : selectedLayer?.name || null,
        layer: selectedLayer ? serializeLayer(selectedLayer) : null,
        generatedLayer: generatedLayer
          ? serializeLayer(generatedLayer)
          : null,
        layerProfile: profile,
        showMLS: shouldShowMLS,
        mls: cleanMLS || null,
      });
} catch (error) {
  console.error("AI DESIGN GENERATION ERROR:", {
    message: error?.message,
    status: error?.response?.status,
    response: error?.response?.data,
    code: error?.code,
    stack: error?.stack,
  });

  // The frontend and reverse proxy can only return a useful error if
  // Express is still connected. Do not expose API keys or request headers.
  if (!res.headersSent) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to generate AI property design",
    });
  }
} finally {
  await deleteTempFile(req.file?.path);
}
  }
);

// ============================================================
// LAYER CRUD ROUTES
// ============================================================

router.get("/design-layers", async (req, res) => {
  try {
    await getOrCreateDefaultLayer();

    const userId = getRequestUserId(req);

    const ownershipFilter = [{ userId: null }];

    if (userId) {
      ownershipFilter.push({ userId });
    }

    const layers = await SocialDesignLayer.find({
      isActive: { $ne: false },
      $or: ownershipFilter,
    })
      .sort({
        isDefault: -1,
        sortOrder: 1,
        createdAt: 1,
      })
      .lean();

    return res.json({
      success: true,
      layers: layers.map(serializeLayer),
    });
  } catch (error) {
    console.error("GET DESIGN LAYERS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch design layers",
    });
  }
});

router.get("/design-layers/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid design layer ID",
      });
    }

    const layer = await SocialDesignLayer.findById(req.params.id);

    if (!layer) {
      return res.status(404).json({
        success: false,
        message: "Design layer not found",
      });
    }

    if (!layerIsAccessibleToUser(layer, getRequestUserId(req))) {
      return res.status(403).json({
        success: false,
        message: "You cannot access this design layer",
      });
    }

    return res.json({
      success: true,
      layer: serializeLayer(layer),
      profile: getEffectiveLayerProfile(layer),
    });
  } catch (error) {
    console.error("GET DESIGN LAYER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch design layer",
    });
  }
});

router.post("/design-layers", async (req, res) => {
  try {
    const {
      name,
      description,
      type,
      isDefault,
      showMLS,
      canvas,
      elements,
      sortOrder,
      userId: bodyUserId,
      profile,
      agentName,
      name: requestedName,
      agentPhone,
      phone,
      agentRole,
      realtor,
      realtorText,
      brokerage,
      agentPhoto,
      brokerageLogo,
      footerBackground,
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Layer name is required",
      });
    }

    const requestUserId = getRequestUserId(req);

    if (
      requestUserId &&
      bodyUserId &&
      String(bodyUserId) !== String(requestUserId)
    ) {
      return res.status(403).json({
        success: false,
        message: "The supplied user ID does not match the current user",
      });
    }

    const ownerId =
      requestUserId ||
      (bodyUserId && isValidObjectId(bodyUserId)
        ? String(bodyUserId)
        : null);

    const normalizedType = ["default", "custom", "ai"].includes(
      String(type || "custom").toLowerCase()
    )
      ? String(type || "custom").toLowerCase()
      : "custom";

    if (normalizedType === "default" && ownerId) {
      return res.status(400).json({
        success: false,
        message: "User-created layers must use type custom or ai",
      });
    }

    const requestedProfile = buildRequestProfile({
      profile,
      agentName,
      name: requestedName,
      agentPhone,
      phone,
      agentRole,
      realtor,
      realtorText,
      brokerage,
      agentPhoto,
      brokerageLogo,
    });

    const finalProfile = {
      ...DEFAULT_PROFILE_VALUES,
      ...requestedProfile,
    };

    const finalElements = applyLayerProfileToElements(
      Array.isArray(elements) ? elements : [],
      finalProfile
    );

    const shouldBeDefault = parseBoolean(isDefault, false);

    if (shouldBeDefault) {
      await SocialDesignLayer.updateMany(
        {
          userId: ownerId,
          isDefault: true,
        },
        {
          $set: { isDefault: false },
        }
      );
    }

    const layer = await SocialDesignLayer.create({
      name: String(name).trim(),
      description: description || "",
      type: normalizedType,
      aiGenerated: normalizedType === "ai",
      isActive: true,
      isDefault: shouldBeDefault,
      showMLS: parseBoolean(showMLS, false),
      canvas: {
        width: 1080,
        height: 1350,
        background: canvas?.background || "transparent",
        backgroundImage: canvas?.backgroundImage || "",
      },
      profile: finalProfile,
      elements: finalElements,
      settings: {
        footerBackground: footerBackground || "#4b2b2b",
      },
      userId: ownerId,
      sortOrder: Number(sortOrder) || 0,
    });

    return res.status(201).json({
      success: true,
      message: "Design layer created successfully",
      layer: serializeLayer(layer),
      profile: getEffectiveLayerProfile(layer),
    });
  } catch (error) {
    console.error("CREATE DESIGN LAYER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create design layer",
    });
  }
});

router.put("/design-layers/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid design layer ID",
      });
    }

    const layer = await SocialDesignLayer.findById(req.params.id);

    if (!layer) {
      return res.status(404).json({
        success: false,
        message: "Design layer not found",
      });
    }

    const userId = getRequestUserId(req);

    if (!layerIsAccessibleToUser(layer, userId)) {
      return res.status(403).json({
        success: false,
        message: "You cannot edit this design layer",
      });
    }

    const {
      name,
      description,
      type,
      isActive,
      isDefault,
      showMLS,
      canvas,
      elements,
      sortOrder,
      profile,
      agentName,
      agentPhone,
      phone,
      agentRole,
      realtor,
      realtorText,
      brokerage,
      agentPhoto,
      brokerageLogo,
      footerBackground,
    } = req.body || {};

    const isProtectedDefault =
      layer.name === DEFAULT_LAYER_NAME && !layer.userId;

    if (isProtectedDefault) {
      layer.isActive = true;
      layer.isDefault = true;
    }

    if (isDefault !== undefined && parseBoolean(isDefault, false)) {
      await SocialDesignLayer.updateMany(
        {
          _id: { $ne: layer._id },
          userId: layer.userId || null,
          isDefault: true,
        },
        {
          $set: { isDefault: false },
        }
      );
    }

    if (name !== undefined && !isProtectedDefault) {
      const cleanName = String(name).trim();
      if (!cleanName) {
        return res.status(400).json({
          success: false,
          message: "Layer name cannot be empty",
        });
      }
      layer.name = cleanName;
    }

    if (description !== undefined) {
      layer.description = String(description);
    }

    if (type !== undefined && !isProtectedDefault) {
      const normalizedType = String(type).toLowerCase();
      if (["custom", "ai", "default"].includes(normalizedType)) {
        layer.type = normalizedType;
        layer.aiGenerated = normalizedType === "ai";
      }
    }

    if (isActive !== undefined && !isProtectedDefault) {
      layer.isActive = parseBoolean(isActive, layer.isActive);
    }

    if (isDefault !== undefined) {
      layer.isDefault = isProtectedDefault
        ? true
        : parseBoolean(isDefault, layer.isDefault);
    }

    if (showMLS !== undefined) {
      layer.showMLS = parseBoolean(showMLS, layer.showMLS);
    }

    if (canvas && typeof canvas === "object") {
      layer.canvas = {
        width: 1080,
        height: 1350,
        background: canvas.background || "transparent",
        backgroundImage: canvas.backgroundImage || "",
      };
    }

    if (Array.isArray(elements)) {
      layer.elements = elements;
    }

    if (footerBackground) {
      layer.settings = {
        ...(layer.settings || {}),
        footerBackground,
      };
    }

    const profileWasProvided =
      Boolean(
        profile &&
          typeof profile === "object" &&
          Object.keys(profile).length
      ) ||
      agentName !== undefined ||
      agentPhone !== undefined ||
      phone !== undefined ||
      agentRole !== undefined ||
      realtor !== undefined ||
      realtorText !== undefined ||
      brokerage !== undefined ||
      agentPhoto !== undefined ||
      brokerageLogo !== undefined;

    if (profileWasProvided) {
      const requestedProfile = buildRequestProfile({
        profile,
        agentName,
        agentPhone,
        phone,
        agentRole,
        realtor,
        realtorText,
        brokerage,
        agentPhoto,
        brokerageLogo,
      });

      const currentProfile =
        layer.profile?.toObject?.() || layer.profile || {};

      const finalProfile = {
        ...DEFAULT_PROFILE_VALUES,
        ...currentProfile,
        ...requestedProfile,
      };

      layer.profile = finalProfile;

      layer.elements = applyLayerProfileToElements(
        layer.elements,
        finalProfile
      );
    }

    if (sortOrder !== undefined) {
      layer.sortOrder = Number(sortOrder) || 0;
    }

    await layer.save();

    return res.json({
      success: true,
      message: "Design layer updated successfully",
      layer: serializeLayer(layer),
      profile: getEffectiveLayerProfile(layer),
    });
  } catch (error) {
    console.error("UPDATE DESIGN LAYER ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update design layer",
    });
  }
});

router.post("/design-layers/:id/default", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid design layer ID" });
    }
    const userId = getRequestUserId(req);
    const layer = await SocialDesignLayer.findById(id);
    if (!layer) return res.status(404).json({ success: false, message: "Design layer not found" });
    if (!layerIsAccessibleToUser(layer, userId)) {
      return res.status(403).json({ success: false, message: "You cannot select this design layer" });
    }
    if (layer.name === DEFAULT_LAYER_NAME && !layer.userId) {
      layer.isDefault = true;
      layer.isActive = true;
      await layer.save();
    } else {
      await SocialDesignLayer.updateMany(
        { userId: layer.userId || null, isDefault: true, _id: { $ne: layer._id } },
        { $set: { isDefault: false } }
      );
      layer.isDefault = true;
      layer.isActive = true;
      await layer.save();
    }
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        $set: { "socialDesignPreferences.defaultLayerId": layer._id },
      });
    }
    return res.json({ success: true, message: "Default design layer updated", layer: serializeLayer(layer) });
  } catch (error) {
    console.error("SET DEFAULT DESIGN LAYER ERROR:", error);
    return res.status(500).json({ success: false, message: "Failed to set default design layer" });
  }
});

router.post("/design-layers/:id/select", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid design layer ID" });
    }
    const userId = getRequestUserId(req);
    const layer = await SocialDesignLayer.findOne({
      _id: id,
      isActive: { $ne: false },
      ...(userId ? { $or: [{ userId: null }, { userId }] } : { userId: null }),
    });
    if (!layer) return res.status(404).json({ success: false, message: "Selected design layer not found or inaccessible" });
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        $set: {
          "socialDesignPreferences.defaultLayerId": layer._id,
          ...(req.body?.showMLS !== undefined
            ? { "socialDesignPreferences.defaultShowMLS": parseBoolean(req.body.showMLS, true) }
            : {}),
        },
      });
    }
    return res.json({
      success: true,
      message: "Design layer selected",
      layer: serializeLayer(layer),
      preferences: {
        defaultLayerId: layer._id,
        defaultShowMLS: req.body?.showMLS === undefined ? Boolean(layer.showMLS) : parseBoolean(req.body.showMLS, true),
      },
    });
  } catch (error) {
    console.error("SELECT DESIGN LAYER ERROR:", error);
    return res.status(500).json({ success: false, message: "Failed to select design layer" });
  }
});

router.delete("/design-layers/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid design layer ID",
      });
    }

    const layer = await SocialDesignLayer.findById(req.params.id);

    if (!layer) {
      return res.status(404).json({
        success: false,
        message: "Design layer not found",
      });
    }

    if (!layerIsAccessibleToUser(layer, getRequestUserId(req))) {
      return res.status(403).json({
        success: false,
        message: "You cannot delete this design layer",
      });
    }

    if (
      layer.name === DEFAULT_LAYER_NAME ||
      (layer.isDefault && !layer.userId)
    ) {
      return res.status(400).json({
        success: false,
        message: "The system default design layer cannot be deleted",
      });
    }

    await SocialDesignLayer.findByIdAndDelete(layer._id);

    return res.json({
      success: true,
      message: "Design layer deleted successfully",
    });
  } catch (error) {
    console.error("DELETE DESIGN LAYER ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete design layer",
    });
  }
});

// ============================================================
// STANDARD GENERATE PROPERTY & TOPIC ROUTES
// ============================================================

router.post("/generate-property", async (req, res) => {
  try {
    const { mls } = req.body || {};
    if (!mls || typeof mls !== "string") {
      return res.status(400).json({
        success: false,
        message: "MLS number is required",
      });
    }

    const cleanMLS = mls.trim();
    const propertyResponse = await axios.get(
      `https://realtorparth.ca/api/properties/analysis/${encodeURIComponent(cleanMLS)}`,
      { timeout: 30000 }
    );
    const property = propertyResponse.data?.property;

    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    const province =
      property.StateOrProvince || property.Province || "";

    if (
      province &&
      !["ab", "alberta"].includes(
        String(province).toLowerCase()
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Only Alberta properties are supported",
      });
    }

    const preview = await generatePropertyPost(property);
    const { imageURL } = await generatePropertyImage(property, 0);

    return res.json({
      success: true,
      topic: property.UnparsedAddress,
      caption: preview.caption,
      imageURL,
      property,
    });
  } catch (error) {
    console.error("PROPERTY SOCIAL POST ERROR:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to generate property social post",
    });
  }
});

router.post("/generate", async (req, res) => {
  try {
    const { topic } = req.body || {};
    if (!topic || !String(topic).trim()) {
      return res.status(400).json({
        success: false,
        message: "Topic is required",
      });
    }

    const caption = await generateSocialContent(String(topic).trim());
    const { imageURL } = await generateImage(String(topic).trim());

    return res.json({
      success: true,
      topic: String(topic).trim(),
      caption,
      imageURL,
    });
  } catch (error) {
    console.error("SOCIAL API ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate social post",
    });
  }
});

router.post(
  "/upload-social-images",
  upload.array("images", 10),
  async (req, res) => {
    try {
      const files = req.files;
      if (!files || !files.length) {
        return res.status(400).json({
          success: false,
          message: "No images uploaded",
        });
      }

      const urls = files.map(
        (file) =>
          `https://realtorparth.ca/social-images/${file.filename}`
      );

      return res.json({
        success: true,
        imageURLs: urls,
        urls,
      });
    } catch (error) {
      console.error("UPLOAD ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to upload images",
      });
    }
  }
);

// ============================================================
// SOCIAL POST MANAGEMENT & PLATFORM ROUTES
// ============================================================

router.get("/posted-comment-posts", async (req, res) => {
  try {
    const posts = await ScheduledSocialPost.find({})
      .sort({ publishDate: -1, createdAt: -1 })
      .lean();

    const results = posts.filter((post) => {
      const ids = getSocialPostIds(post);
      return Boolean(
        ids.facebook ||
        ids.instagram ||
        ids.facebookPostId ||
        ids.instagramPostId
      );
    });

    return res.json({
      success: true,
      posts: results.map(serializeSocialPost),
    });
  } catch (error) {
    console.error("POSTED COMMENT POSTS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve posted social posts",
    });
  }
});

router.post("/check", async (req, res) => {
  try {
    const { topic, caption, publishDate } = req.body || {};
    const query = {};

    if (topic) query.topic = String(topic).trim();
    if (caption) query.caption = String(caption).trim();
    if (publishDate) {
      const date = new Date(publishDate);
      if (!Number.isNaN(date.getTime())) {
        query.publishDate = date;
      }
    }

    if (!Object.keys(query).length) {
      return res.status(400).json({
        success: false,
        message: "Provide a topic, caption, or publish date to check",
      });
    }

    const post = await ScheduledSocialPost.findOne(query).lean();

    return res.json({
      success: true,
      exists: Boolean(post),
      post: post ? serializeSocialPost(post) : null,
    });
  } catch (error) {
    console.error("SOCIAL POST CHECK ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check social post",
    });
  }
});

router.post("/save", async (req, res) => {
  try {
    const {
      topic,
      caption,
      images,
      imageURL,
      platforms,
      publishDate,
      status,
      socialPostIds,
      ...additionalFields
    } = req.body || {};

    if (!topic || !String(topic).trim()) {
      return res.status(400).json({
        success: false,
        message: "Topic is required",
      });
    }

    const cleanImages = normalizeImageList(images || imageURL);
    const cleanPlatforms = normalizePostPlatforms(platforms);

    const post = await ScheduledSocialPost.create({
      topic: String(topic).trim(),
      caption: caption || "",
      images: cleanImages,
      platforms: cleanPlatforms,
      publishDate: publishDate ? new Date(publishDate) : null,
      status: status || "draft",
      ...(socialPostIds ? { socialPostIds } : {}),
      ...additionalFields,
    });

    return res.status(201).json({
      success: true,
      message: "Social post saved successfully",
      post: serializeSocialPost(post),
    });
  } catch (error) {
    console.error("SAVE SOCIAL POST ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save social post",
    });
  }
});

router.post("/save-platform-post-id", async (req, res) => {
  try {
    const {
      id,
      postId,
      platform,
      platformPostId,
      facebookPostId,
      instagramPostId,
    } = req.body || {};

    const documentId = id || postId;

    if (!documentId || !isValidObjectId(documentId)) {
      return res.status(400).json({
        success: false,
        message: "A valid social post ID is required",
      });
    }

    const post = await ScheduledSocialPost.findById(documentId);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Social post not found",
      });
    }

    const ids = getSocialPostIds(post);

    if (facebookPostId) ids.facebook = String(facebookPostId);
    if (instagramPostId) ids.instagram = String(instagramPostId);

    if (platform && platformPostId) {
      const key = String(platform).toLowerCase();
      if (!["facebook", "instagram"].includes(key)) {
        return res.status(400).json({
          success: false,
          message: "Platform must be facebook or instagram",
        });
      }
      ids[key] = String(platformPostId);
    }

    post.socialPostIds = ids;
    await post.save();

    return res.json({
      success: true,
      message: "Platform post IDs saved successfully",
      post: serializeSocialPost(post),
    });
  } catch (error) {
    console.error("SAVE PLATFORM POST ID ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save platform post IDs",
    });
  }
});

router.post("/schedule", async (req, res) => {
  try {
    const {
      id,
      topic,
      caption,
      images,
      imageURL,
      platforms,
      publishDate,
      ...additionalFields
    } = req.body || {};

    if (!publishDate) {
      return res.status(400).json({
        success: false,
        message: "Publish date is required",
      });
    }

    const scheduledDate = new Date(publishDate);

    if (Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid publish date",
      });
    }

    const cleanPlatforms = normalizePostPlatforms(platforms);

    if (!cleanPlatforms.length) {
      return res.status(400).json({
        success: false,
        message: "Select at least one supported platform",
      });
    }

    const cleanImages = normalizeImageList(images || imageURL);

    if (!cleanImages.length) {
      return res.status(400).json({
        success: false,
        message: "At least one image is required",
      });
    }

    let post;

    if (id) {
      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid social post ID",
        });
      }

      post = await ScheduledSocialPost.findById(id);

      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Social post not found",
        });
      }

      post.topic = topic ?? post.topic;
      post.caption = caption ?? post.caption;
      post.images = cleanImages;
      post.platforms = cleanPlatforms;
      post.publishDate = scheduledDate;
      post.status = "scheduled";
    } else {
      post = new ScheduledSocialPost({
        topic: topic || "Social Media Post",
        caption: caption || "",
        images: cleanImages,
        platforms: cleanPlatforms,
        publishDate: scheduledDate,
        status: "scheduled",
        ...additionalFields,
      });
    }

    await post.save();

    return res.status(201).json({
      success: true,
      message: "Social post scheduled successfully",
      post: serializeSocialPost(post),
    });
  } catch (error) {
    console.error("SCHEDULE SOCIAL POST ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to schedule social post",
    });
  }
});

router.post("/update-instagram-status", async (req, res) => {
  try {
    const { id, status, instagramPostId } = req.body || {};

    if (!id || !isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "A valid social post ID is required",
      });
    }

    const post = await ScheduledSocialPost.findById(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Social post not found",
      });
    }

    if (status) post.status = status;

    if (instagramPostId) {
      const ids = getSocialPostIds(post);
      ids.instagram = String(instagramPostId);
      post.socialPostIds = ids;
    }

    await post.save();

    return res.json({
      success: true,
      message: "Instagram post status updated",
      post: serializeSocialPost(post),
    });
  } catch (error) {
    console.error("INSTAGRAM STATUS UPDATE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update Instagram status",
    });
  }
});

router.get("/instagram-posts", async (req, res) => {
  try {
    const posts = await ScheduledSocialPost.find({})
      .sort({ publishDate: -1, createdAt: -1 })
      .lean();

    const instagramPosts = posts.filter((post) => {
      const ids = getSocialPostIds(post);
      return (
        normalizePostPlatforms(post.platforms).includes("instagram") ||
        Boolean(ids.instagram || ids.instagramPostId)
      );
    });

    return res.json({
      success: true,
      posts: instagramPosts.map(serializeSocialPost),
    });
  } catch (error) {
    console.error("GET INSTAGRAM POSTS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve Instagram posts",
    });
  }
});

router.post("/update-facebook-status", async (req, res) => {
  try {
    const { id, status, facebookPostId } = req.body || {};

    if (!id || !isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "A valid social post ID is required",
      });
    }

    const post = await ScheduledSocialPost.findById(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Social post not found",
      });
    }

    if (status) post.status = status;

    if (facebookPostId) {
      const ids = getSocialPostIds(post);
      ids.facebook = String(facebookPostId);
      post.socialPostIds = ids;
    }

    await post.save();

    return res.json({
      success: true,
      message: "Facebook post status updated",
      post: serializeSocialPost(post),
    });
  } catch (error) {
    console.error("FACEBOOK STATUS UPDATE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update Facebook status",
    });
  }
});

router.get("/facebook-posts", async (req, res) => {
  try {
    const posts = await ScheduledSocialPost.find({})
      .sort({ publishDate: -1, createdAt: -1 })
      .lean();

    const facebookPosts = posts.filter((post) => {
      const ids = getSocialPostIds(post);
      return (
        normalizePostPlatforms(post.platforms).includes("facebook") ||
        Boolean(ids.facebook || ids.facebookPostId)
      );
    });

    return res.json({
      success: true,
      posts: facebookPosts.map(serializeSocialPost),
    });
  } catch (error) {
    console.error("GET FACEBOOK POSTS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve Facebook posts",
    });
  }
});

router.post("/import-facebook-posts", async (req, res) => {
  try {
    const { posts } = req.body || {};

    if (!Array.isArray(posts) || !posts.length) {
      return res.status(400).json({
        success: false,
        message: "Provide an array of Facebook posts to import",
      });
    }

    const imported = [];
    const skipped = [];

    for (const item of posts) {
      const facebookPostId =
        item?.facebookPostId ||
        item?.postId ||
        item?.id;

      if (!facebookPostId) {
        skipped.push({
          reason: "Missing Facebook post ID",
        });
        continue;
      }

      const existing = await ScheduledSocialPost.findOne({
        "socialPostIds.facebook": String(facebookPostId),
      });

      if (existing) {
        skipped.push({
          facebookPostId,
          reason: "Already imported",
        });
        continue;
      }

      const ids = {
        facebook: String(facebookPostId),
      };

      const post = await ScheduledSocialPost.create({
        topic: item.topic || item.message || "Facebook Post",
        caption: item.caption || item.message || "",
        images: normalizeImageList(
          item.images || item.imageURL || item.full_picture
        ),
        platforms: ["facebook"],
        publishDate: item.publishDate
          ? new Date(item.publishDate)
          : item.created_time
            ? new Date(item.created_time)
            : new Date(),
        status: item.status || "published",
        socialPostIds: ids,
      });

      imported.push(serializeSocialPost(post));
    }

    return res.json({
      success: true,
      message: "Facebook post import completed",
      importedCount: imported.length,
      skippedCount: skipped.length,
      posts: imported,
      skipped,
    });
  } catch (error) {
    console.error("IMPORT FACEBOOK POSTS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to import Facebook posts",
    });
  }
});

router.get("/scheduled", async (req, res) => {
  try {
    const posts = await ScheduledSocialPost.find({
      status: "scheduled",
    })
      .sort({ publishDate: 1 })
      .lean();

    return res.json({
      success: true,
      posts: posts.map(serializeSocialPost),
    });
  } catch (error) {
    console.error("GET SCHEDULED POSTS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve scheduled posts",
    });
  }
});

router.post("/edit/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid social post ID",
      });
    }

    const post = await ScheduledSocialPost.findById(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Social post not found",
      });
    }

    const {
      topic,
      caption,
      images,
      imageURL,
      platforms,
      publishDate,
      status,
    } = req.body || {};

    if (topic !== undefined) post.topic = topic;
    if (caption !== undefined) post.caption = caption;

    if (images !== undefined || imageURL !== undefined) {
      post.images = normalizeImageList(images || imageURL);
    }

    if (platforms !== undefined) {
      post.platforms = normalizePostPlatforms(platforms);
    }

    if (publishDate !== undefined) {
      const date = new Date(publishDate);
      if (!Number.isNaN(date.getTime())) {
        post.publishDate = date;
      }
    }

    if (status !== undefined) post.status = status;

    await post.save();

    return res.json({
      success: true,
      message: "Social post updated successfully",
      post: serializeSocialPost(post),
    });
  } catch (error) {
    console.error("EDIT SOCIAL POST ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to edit social post",
    });
  }
});

router.post("/remove/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid social post ID",
      });
    }

    const post = await ScheduledSocialPost.findByIdAndDelete(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Social post not found",
      });
    }

    return res.json({
      success: true,
      message: "Social post removed successfully",
      id,
    });
  } catch (error) {
    console.error("REMOVE SOCIAL POST ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove social post",
    });
  }
});

// ============================================================
// PARAMETERIZED ROUTES
// ============================================================

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid social post ID",
      });
    }

    const post = await ScheduledSocialPost.findByIdAndDelete(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Social post not found",
      });
    }

    return res.json({
      success: true,
      message: "Social post deleted successfully",
      id,
    });
  } catch (error) {
    console.error("DELETE SOCIAL POST ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete social post",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid social post ID",
      });
    }

    const post = await findSocialPostById(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Social post not found",
      });
    }

    return res.json({
      success: true,
      post: serializeSocialPost(post),
    });
  } catch (error) {
    console.error("GET SOCIAL POST ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve social post",
    });
  }
});

export default router;
















































// import express from "express";
// import cors from "cors";
// import dotenv from "dotenv";
// import Groq from "groq-sdk";
// import axios from "axios";
// import multer from "multer";
// import path from "path";
// import fs from "fs";
// import { fileURLToPath } from "url";
// import { GoogleGenAI } from "@google/genai";
// import sharp from "sharp";

// import { generateImage } from "./social_manager.js";
// import ScheduledSocialPost from "../models/ScheduledSocialPost.js";
// import SocialDesignLayer from "../models/SocialDesignLayer.js";
// import User from "../models/User.js";

// const router = express.Router();

// // ============================================================
// // PATHS AND ENVIRONMENT
// // ============================================================

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const ENV_PATH = path.resolve(__dirname, "../../.env");

// dotenv.config({ path: ENV_PATH });

// const IMAGE_DIR =
//   "/home/dhruvit/.openclaw/workspace/skills/blog_manager/images";

// const ASSET_DIR = path.join(
//   __dirname,
//   "assets",
//   "realtorparths_pdf"
// );

// if (!fs.existsSync(IMAGE_DIR)) {
//   fs.mkdirSync(IMAGE_DIR, { recursive: true });
// }

// // ============================================================
// // UPLOAD CONFIGURATION
// // ============================================================

// const storage = multer.diskStorage({
//   destination: (_req, _file, cb) => {
//     cb(null, IMAGE_DIR);
//   },

//   filename: (_req, file, cb) => {
//     const extension = path.extname(file.originalname || "").toLowerCase();

//     const uniqueName =
//       `upload-${Date.now()}-${Math.round(Math.random() * 1e9)}` +
//       extension;

//     cb(null, uniqueName);
//   },
// });

// const fileFilter = (_req, file, cb) => {
//   if (file.mimetype?.startsWith("image/")) {
//     return cb(null, true);
//   }

//   return cb(new Error("Only image files are allowed"), false);
// };

// const upload = multer({
//   storage,
//   fileFilter,
//   limits: {
//     fileSize: 10 * 1024 * 1024,
//   },
// });

// // ============================================================
// // EXTERNAL SERVICES
// // ============================================================

// const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

// const ai = new GoogleGenAI({
//   apiKey: process.env.GEMINI_API_KEY,
// });

// const groq = new Groq({
//   apiKey: process.env.GROQ_API_KEY || "not-configured",
// });

// const MODEL = "gemini-2.5-flash";
// const DESIGN_ANALYSIS_MODEL = "gemini-3.1-pro-preview";
// const DESIGN_IMAGE_MODEL = "gemini-3.1-flash-image";

// // ============================================================
// // OBJECT ID VALIDATION
// // ============================================================

// function isValidObjectId(id) {
//   return /^[a-fA-F0-9]{24}$/.test(String(id || ""));
// }

// // ============================================================
// // REQUEST USER ID
// // ============================================================

// function getRequestUserId(req) {
//   const candidate =
//     req.user?._id ||
//     req.user?.id ||
//     req.admin?._id ||
//     req.admin?.id ||
//     req.body?.userId ||
//     req.query?.userId ||
//     null;

//   if (!candidate) return null;

//   const id = String(candidate);

//   return isValidObjectId(id) ? id : null;
// }

// // ============================================================
// // GENERAL HELPERS
// // ============================================================

// function escapeSvgText(value) {
//   return String(value ?? "")
//     .replace(/&/g, "&amp;")
//     .replace(/</g, "&lt;")
//     .replace(/>/g, "&gt;")
//     .replace(/"/g, "&quot;")
//     .replace(/'/g, "&apos;");
// }

// function getSafeMimeType(mimetype) {
//   if (
//     mimetype === "image/jpeg" ||
//     mimetype === "image/png" ||
//     mimetype === "image/webp"
//   ) {
//     return mimetype;
//   }

//   return "image/jpeg";
// }

// async function readUploadedImage(file) {
//   if (!file?.path) {
//     throw new Error("Reference image is required");
//   }

//   return fs.promises.readFile(file.path);
// }

// async function deleteTempFile(filePath) {
//   if (!filePath) return;

//   try {
//     await fs.promises.unlink(filePath);
//   } catch {
//     // Temporary-file cleanup failure should not mask the main result.
//   }
// }

// function parseBoolean(value, defaultValue = false) {
//   if (value === undefined || value === null || value === "") {
//     return defaultValue;
//   }

//   if (typeof value === "boolean") {
//     return value;
//   }

//   const normalized = String(value).trim().toLowerCase();

//   if (["true", "1", "yes", "on"].includes(normalized)) {
//     return true;
//   }

//   if (["false", "0", "no", "off"].includes(normalized)) {
//     return false;
//   }

//   return defaultValue;
// }

// function normalizeBrandingMode(brandingMode) {
//   const value = String(brandingMode || "")
//     .trim()
//     .toLowerCase();

//   if (["none", "no-layer", "nolayer"].includes(value)) {
//     return "none";
//   }

//   if (
//     ["saved", "custom", "custom-layer", "customize"].includes(value)
//   ) {
//     return "saved";
//   }

//   if (
//     ["ai", "auto", "ai-auto", "auto-layer", "ai-generated"].includes(value)
//   ) {
//     return "ai";
//   }

//   if (["default", "minimal", ""].includes(value)) {
//     return "default";
//   }

//   return "default";
// }

// // ============================================================
// // SOCIAL CONTENT GENERATION
// // ============================================================

// async function generateSocialContent(topic) {
//   const prompt = `
// You are an expert Calgary and Airdrie real estate social media strategist.

// Create ONE unique Facebook and Instagram post.

// TOPIC:
// ${topic}

// TARGET AUDIENCE:
// - Home buyers
// - Home sellers
// - First-time buyers
// - Real estate investors
// - Alberta homeowners

// LOCATION FOCUS:
// - Calgary
// - Airdrie
// - Chestermere
// - Cochrane
// - Okotoks
// - High River
// - Strathmore

// WRITING STYLE:
// - Professional
// - Modern
// - Friendly
// - Trustworthy
// - Conversational
// - Persuasive
// - Easy to read

// CONTENT REQUIREMENTS:
// - 150-200 words
// - Start with a strong hook
// - Naturally use relevant emojis
// - Highlight benefits instead of features
// - Include a clear call-to-action
// - Generate different wording every time
// - Never copy previous responses
// - Mention Calgary or nearby communities naturally when relevant

// CONTACT INFORMATION:
// 📞 403-439-1555
// 🌐 www.realtorparth.ca
// ✉️ hello@realtorparth.ca

// RULES:
// - Never say "Free Consultation"
// - Instead use: "Contact me for a consultation."
// - No markdown
// - No headings
// - No bullet points
// - No quotation marks
// - Plain text only

// HASHTAGS:
// Always include #realtorparth.
// Also include 6-10 relevant hashtags such as:
// #CalgaryRealEstate
// #AirdrieRealEstate
// #YYCRealEstate
// #CalgaryHomes
// #AirdrieHomes
// #AlbertaRealEstate
// #CalgaryRealtor
// #DreamHome
// #HomeBuying
// #HomeSelling

// Return ONLY the social media caption.
// `;

//   const response = await ai.models.generateContent({
//     model: MODEL,
//     contents: prompt,
//   });

//   return (response.text || "")
//     .replace(/^caption\s*:/i, "")
//     .replace(/^post\s*:/i, "")
//     .replace(/\*\*/g, "")
//     .replace(/```/g, "")
//     .trim();
// }

// // ============================================================
// // PROPERTY CAPTION GENERATION
// // ============================================================

// export async function generatePropertyPost(property) {
//   const prompt = `
// Create a Facebook and Instagram real estate post.

// PROPERTY INFORMATION:
// Address: ${property.UnparsedAddress || ""}
// MLS: ${property.ListingKey || property.ListingId || ""}
// Price: ${property.ListPrice || ""}
// Property Type: ${property.PropertyType || ""}
// Style: ${property.ArchitecturalStyle || ""}
// City: ${property.City || ""}
// Community: ${property.SubdivisionName || ""}
// Bedrooms: ${property.BedroomsTotal || ""}
// Bathrooms: ${property.BathroomsTotalInteger || ""}
// Garage: ${property.GarageSpaces || ""}
// Square Feet: ${property.BuildingAreaTotal || ""}
// Year Built: ${property.YearBuilt || ""}
// Description: ${property.PublicRemarks || ""}

// REQUIREMENTS:
// - 120-180 words
// - Professional, modern, friendly, trustworthy, conversational and persuasive
// - Include relevant emojis naturally
// - Include a strong opening hook
// - Highlight the property's most appealing benefits
// - Include a clear call-to-action
// - Calgary/Airdrie focused
// - Generate a unique caption every time
// - Use different wording and hooks
// - Avoid repetitive sentence structures
// - Make the post feel natural and human-written

// CONTACT INFORMATION:
// Ph: 403-439-1555
// www.realtorparth.ca
// hello@realtorparth.ca

// RULES:
// - Never say "Free Consultation"
// - Instead use: "Contact me for a consultation."
// - Price must be written with $ followed by the number
// - No markdown, headings, bullet points or quotation marks
// - Do not give an Open House date or time
// - Do not invent property information
// - Only use facts provided in the property information
// - Do not mention information that is not available
// - Do not say that you are an AI
// - Return ONLY the social media post

// HASHTAGS:
// Always include #realtorparth and relevant real estate hashtags.

// Return only post text.
// `;

//   try {
//     const response = await ai.models.generateContent({
//       model: MODEL,
//       contents: prompt,
//       config: {
//         temperature: 1.2,
//       },
//     });

//     const caption = (response.text || "")
//       .replace(/^caption\s*:/i, "")
//       .replace(/^post\s*:/i, "")
//       .replace(/\*\*/g, "")
//       .replace(/```/g, "")
//       .trim();

//     if (!caption) {
//       throw new Error("Gemini returned an empty property caption");
//     }

//     return { caption, property };
//   } catch (error) {
//     console.error(
//       "GEMINI PROPERTY POST ERROR:",
//       error?.response?.data || error?.message || error
//     );

//     throw error;
//   }
// }

// // ============================================================
// // PROPERTY IMAGE BUFFER
// // ============================================================

// async function getPropertyImageBuffer(property, imageIndex = 0) {
//   const sortedMedia = Array.isArray(property?.Media)
//     ? [...property.Media].sort(
//         (a, b) => (a.Order ?? 0) - (b.Order ?? 0)
//       )
//     : [];

//   const imageMedia = sortedMedia.filter((media) => {
//     const url = media.MediaURL?.toLowerCase() || "";

//     return (
//       url.endsWith(".jpg") ||
//       url.endsWith(".jpeg") ||
//       url.endsWith(".png") ||
//       url.includes("ddfcdn.realtor.ca")
//     );
//   });

//   if (!imageMedia.length) {
//     throw new Error("No property images found in MLS listing");
//   }

//   const imageUrl =
//     imageMedia[imageIndex % imageMedia.length]?.MediaURL;

//   if (!imageUrl) {
//     throw new Error("Property image not found");
//   }

//   const response = await axios.get(imageUrl, {
//     responseType: "arraybuffer",
//     timeout: 30000,
//   });

//   return {
//     buffer: Buffer.from(response.data),
//     imageUrl,
//   };
// }

// // ============================================================
// // NORMAL PROPERTY IMAGE GENERATION
// // Original property-image layout is preserved.
// // ============================================================

// async function generatePropertyImage(property, imageIndex = 0) {
//   const fileName = `property-${Date.now()}.jpg`;
//   const outputPath = path.join(IMAGE_DIR, fileName);

//   const { buffer: propertyImageBuffer } =
//     await getPropertyImageBuffer(property, imageIndex);

//   const price = property.ListPrice
//     ? `$${Number(property.ListPrice).toLocaleString()}`
//     : "Call for Price";

//   const beds = property.BedroomsTotal || 0;
//   const baths = property.BathroomsTotalInteger || 0;
//   const city = property.City || "Calgary";

//   const address =
//     (property.UnparsedAddress || "").length > 38
//       ? property.UnparsedAddress.substring(0, 38) + "..."
//       : property.UnparsedAddress || "";

//   const mls = property.ListingId || "";
//   const sqft =
//     property.BuildingAreaTotal || property.LivingArea || "";
//   const propertyType = property.PropertyType || "";

//   const realtorLogoPath = path.join(
//     ASSET_DIR,
//     "realtor_logo.svg"
//   );

//   const realtorLogoRaw = await fs.promises.readFile(
//     realtorLogoPath,
//     "utf8"
//   );

//   const realtorLogoBase64 = Buffer.from(
//     realtorLogoRaw
//   ).toString("base64");

//   const realtorLogoSvg = `
// <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
//   <image
//     href="data:image/svg+xml;base64,${realtorLogoBase64}"
//     x="55" y="52" width="190" height="165"
//     opacity="0.35"
//     preserveAspectRatio="xMidYMid meet"
//   />
// </svg>`;

//   const addressBgSvg = `
// <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
//   <rect x="285" y="32" width="647" height="205"
//     rx="18" ry="18" fill="rgba(20,20,20,0.72)" />
//   <rect x="285" y="32" width="647" height="4"
//     rx="2" fill="rgba(255,255,255,0.85)" />
// </svg>`;

//   const addressSvg = `
// <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
// <style>
// .address { fill:#fff; font:800 32px Arial,Helvetica,sans-serif; }
// .mls { fill:#F8F8F8; font:600 20px Arial,Helvetica,sans-serif; }
// .label { fill:#CFCFCF; font:600 17px Arial,Helvetica,sans-serif; }
// .value { fill:#fff; font:700 20px Arial,Helvetica,sans-serif; }
// .line { stroke:#8F8F8F; stroke-width:1; opacity:.45; }
// </style>
// <text x="315" y="78" class="address">${escapeSvgText(address)}</text>
// <text x="315" y="110" class="mls">MLS® ${escapeSvgText(mls)}</text>
// <line x1="312" y1="130" x2="900" y2="130" class="line"/>
// <text x="315" y="163" class="label">CITY</text>
// <text x="455" y="163" class="value">${escapeSvgText(city)}</text>
// <text x="315" y="199" class="label">BEDROOMS</text>
// <text x="455" y="199" class="value">${escapeSvgText(beds)}</text>
// <text x="650" y="163" class="label">BATHROOMS</text>
// <text x="785" y="163" class="value">${escapeSvgText(baths)}</text>
// <text x="650" y="199" class="label">SIZE</text>
// <text x="785" y="199" class="value">${escapeSvgText(sqft || "-")} Sq Ft</text>
// </svg>`;

//   const footerBgSvg = `
// <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
//   <rect x="0" y="1160" width="280" height="190" fill="#ffffff"/>
//   <rect x="280" y="1160" width="800" height="190" fill="#4b2b2b"/>
// </svg>`;

//   const footerTextSvg = `
// <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
// <style>
// .name { fill:#fff; font:800 38px Arial,Helvetica,sans-serif; }
// .role { fill:#fff; font:400 30px Arial,Helvetica,sans-serif; }
// .phone { fill:#fff; font:500 38px Arial,Helvetica,sans-serif; }
// .price { fill:#222; font:800 34px Arial,Helvetica,sans-serif; }
// .info { fill:#444; font:21px Arial,Helvetica,sans-serif; }
// </style>
// <text x="20" y="1198" class="price">${escapeSvgText(price)}</text>
// <text x="20" y="1235" class="info">${escapeSvgText(beds)} Bed • ${escapeSvgText(baths)} Bath</text>
// <text x="20" y="1268" class="info">${escapeSvgText(propertyType)}</text>
// <text x="20" y="1300" class="info">${escapeSvgText(sqft || "")} Sq Ft</text>
// <text x="20" y="1332" class="info">MLS® ${escapeSvgText(mls)}</text>
// <text x="315" y="1220" class="name">PARTH BRAHMBHATT</text>
// <text x="455" y="1275" class="role">REALTOR</text>
// <text x="340" y="1330" class="phone">403-439-1555</text>
// </svg>`;

//   const agentPath = path.join(ASSET_DIR, "agent12.png");

//   const agentBuffer = await sharp(agentPath)
//     .resize({ height: 400, fit: "inside" })
//     .png()
//     .toBuffer();

//   const logoPath = path.join(ASSET_DIR, "diamond_realty.jpeg");

//   const logoBuffer = await sharp(logoPath)
//     .resize({ width: 280, height: 190, fit: "fill" })
//     .png()
//     .toBuffer();

//   const buffer = await sharp(propertyImageBuffer)
//     .resize(1080, 1350, { fit: "cover" })
//     .composite([
//       { input: Buffer.from(addressBgSvg), left: 0, top: 0 },
//       { input: Buffer.from(realtorLogoSvg), left: 0, top: 0 },
//       { input: Buffer.from(addressSvg), left: 0, top: 0 },
//       { input: Buffer.from(footerBgSvg), left: 0, top: 0 },
//       { input: Buffer.from(footerTextSvg), left: 0, top: 0 },
//       { input: logoBuffer, left: 0, top: 1160 },
//       { input: agentBuffer, left: 740, top: 960 },
//     ])
//     .flatten({ background: "#000000" })
//     .jpeg({ quality: 84, mozjpeg: true })
//     .toBuffer();

//   await fs.promises.writeFile(outputPath, buffer);

//   return {
//     imageURL: `https://realtorparth.ca/social-images/${fileName}`,
//     outputPath,
//   };
// }

// // ============================================================
// // INTERACTION TEXT EXTRACTION
// // ============================================================

// function extractInteractionText(interaction) {
//   let text = "";

//   if (typeof interaction?.output_text === "string") {
//     text = interaction.output_text;
//   }

//   if (!text && Array.isArray(interaction?.steps)) {
//     for (const step of interaction.steps) {
//       if (step?.type !== "model_output") continue;

//       for (const block of step?.content || []) {
//         if (block?.type === "text") {
//           text += block.text || "";
//         }
//       }
//     }
//   }

//   return text
//     .trim()
//     .replace(/^```(?:text|markdown|json)?/i, "")
//     .replace(/```$/i, "")
//     .trim();
// }

// // ============================================================
// // INTERACTION IMAGE EXTRACTION
// // ============================================================

// function extractInteractionImage(interaction) {
//   if (interaction?.output_image?.data) {
//     return Buffer.from(interaction.output_image.data, "base64");
//   }

//   if (Array.isArray(interaction?.steps)) {
//     for (const step of interaction.steps) {
//       if (step?.type !== "model_output") continue;

//       for (const block of step?.content || []) {
//         if (
//           (block?.type === "image" ||
//             block?.type === "output_image") &&
//           block?.data
//         ) {
//           return Buffer.from(block.data, "base64");
//         }
//       }
//     }
//   }

//   return null;
// }

// // ============================================================
// // DESIGN REFERENCE ANALYSIS
// // ============================================================

// async function analyzeDesignReference(
//   referenceBuffer,
//   referenceMimeType
// ) {
//   if (!Buffer.isBuffer(referenceBuffer)) {
//     throw new Error("Reference image buffer is required.");
//   }

//   const analysisPrompt = `
// You are an expert architectural visualization designer,
// architectural drafting analyst, real-estate marketing designer,
// and image composition specialist.

// Analyze the uploaded image ONLY as a DESIGN REFERENCE.

// The house in the reference image is NOT the property used in
// the final generation. Do not copy or reconstruct that house.

// Extract reusable visual design language, including:
// - Composition and layout
// - Color palette and contrast
// - Photographic treatment and lighting
// - Blueprint and CAD overlays
// - Dimension lines and extension lines
// - Arrowheads and measurement labels
// - Callout circles and technical labels
// - Elevations and section drawings
// - Roof, window, door and wall tracing
// - Line thickness and opacity
// - Typography and visual hierarchy
// - Overlay placement and aspect ratio
// - Background treatment

// Do not reuse numerical measurements from the reference.
// The MLS property is the source of truth.
// Fabricated measurements are prohibited.
// Technical overlays must follow the actual MLS property.
// The final property must remain photorealistic.

// Do not instruct the image model to create REALTOR branding,
// Realtor logo, Diamond Realty logo, agent name, phone number,
// brokerage information, price, MLS number, footer, contact card,
// address card, or fake property statistics.

// The application handles branding separately.

// Return ONLY a detailed reusable image-generation prompt.
// Do not return JSON.
// Do not describe the specific reference house as something to copy.
// `;

//   try {
//     const interaction = await ai.interactions.create({
//       model: DESIGN_ANALYSIS_MODEL,
//       input: [
//         {
//           type: "image",
//           mime_type: referenceMimeType,
//           data: referenceBuffer.toString("base64"),
//         },
//         {
//           type: "text",
//           text: analysisPrompt,
//         },
//       ],
//     });

//     const result = extractInteractionText(interaction);

//     if (!result) {
//       console.error(JSON.stringify(interaction, null, 2));
//       throw new Error("Gemini did not return a design prompt");
//     }

//     return result;
//   } catch (error) {
//     console.error(
//       "GEMINI DESIGN ANALYSIS ERROR:",
//       error?.response?.data || error?.message || error
//     );

//     throw error;
//   }
// }

// // ============================================================
// // DESIGN LAYER CONSTANTS
// // ============================================================

// const DEFAULT_LAYER_NAME = "RealtorParth Default";

// const DEFAULT_PROFILE_VALUES = {
//   agentName: "PARTH BRAHMBHATT",
//   agentPhone: "403-439-1555",
//   phone: "403-439-1555",
//   realtor: "REALTOR",
//   agentRole: "REALTOR",
//   realtorText: "REALTOR",
//   brokerage: "DIAMOND REALTY",
// };

// // ============================================================
// // NORMALIZE ASSET KEY
// // ============================================================

// function normalizeAssetKey(assetKey) {
//   return String(assetKey || "")
//     .trim()
//     .toLowerCase()
//     .replace(/[\s_-]+/g, "");
// }

// // ============================================================
// // NORMALIZE SHARP IMAGE POSITION
// // ============================================================

// function normalizeSharpPosition(position) {
//   if (position === undefined || position === null || position === "") {
//     return "center";
//   }

//   const value = String(position)
//     .trim()
//     .toLowerCase()
//     .replace(/\s+/g, " ");

//   const map = {
//     center: "center",
//     "center center": "center",
//     "top center": "north",
//     "center top": "north",
//     top: "north",
//     "bottom center": "south",
//     "center bottom": "south",
//     bottom: "south",
//     "left center": "west",
//     "center left": "west",
//     left: "west",
//     "right center": "east",
//     "center right": "east",
//     right: "east",
//     "top left": "northwest",
//     "left top": "northwest",
//     "top right": "northeast",
//     "right top": "northeast",
//     "bottom left": "southwest",
//     "left bottom": "southwest",
//     "bottom right": "southeast",
//     "right bottom": "southeast",
//     north: "north",
//     south: "south",
//     east: "east",
//     west: "west",
//     northeast: "northeast",
//     northwest: "northwest",
//     southeast: "southeast",
//     southwest: "southwest",
//   };

//   return map[value] || "center";
// }

// // ============================================================
// // PROFILE HELPERS
// // Uses the model's profile object and legacy text elements.
// // ============================================================

// function getLayerProfileOverrides(layer) {
//   const values = {
//     ...DEFAULT_PROFILE_VALUES,
//     ...(layer?.profile?.toObject?.() || layer?.profile || {}),
//   };

//   // Normalize aliases from the profile schema.
//   values.agentName =
//     values.agentName || values.name || DEFAULT_PROFILE_VALUES.agentName;

//   values.agentPhone =
//     values.agentPhone ||
//     values.phone ||
//     DEFAULT_PROFILE_VALUES.agentPhone;

//   values.phone = values.phone || values.agentPhone;

//   values.realtor =
//     values.realtor ||
//     values.realtorText ||
//     values.agentRole ||
//     DEFAULT_PROFILE_VALUES.realtor;

//   values.realtorText =
//     values.realtorText || values.realtor || values.agentRole;

//   values.agentRole =
//     values.agentRole || values.realtor || values.realtorText;

//   values.brokerage =
//     values.brokerage || DEFAULT_PROFILE_VALUES.brokerage;

//   // Elements override profile text when they explicitly define it.
//   const elements = Array.isArray(layer?.elements)
//     ? layer.elements
//     : [];

//   for (const element of elements) {
//     if (!element || element.enabled === false) continue;

//     const key = String(element.textKey || "")
//       .trim()
//       .toLowerCase();

//     const text =
//       typeof element.text === "string"
//         ? element.text.trim()
//         : "";

//     if (!text) continue;

//     if (["agentname", "name"].includes(key)) {
//       values.agentName = text;
//     }

//     if (["agentphone", "phone"].includes(key)) {
//       values.agentPhone = text;
//       values.phone = text;
//     }

//     if (
//       ["realtor", "realtortext", "agentrole", "role"].includes(key)
//     ) {
//       values.realtor = text;
//       values.realtorText = text;
//       values.agentRole = text;
//     }

//     if (["brokerage", "brokeragename"].includes(key)) {
//       values.brokerage = text;
//     }
//   }

//   return values;
// }

// function getEffectiveLayerProfile(layer) {
//   const profile = getLayerProfileOverrides(layer);

//   return {
//     agentName: profile.agentName,
//     agentPhone: profile.agentPhone,
//     phone: profile.phone,
//     realtor: profile.realtor,
//     realtorText: profile.realtorText,
//     agentRole: profile.agentRole,
//     brokerage: profile.brokerage,
//     agentPhoto: profile.agentPhoto || "",
//     brokerageLogo: profile.brokerageLogo || "",
//   };
// }

// // ============================================================
// // PROPERTY VALUES FOR LAYER TEXT
// // ============================================================

// function getPropertyLayerValues(property, layer = null) {
//   const profile = getLayerProfileOverrides(layer);

//   const price = property?.ListPrice
//     ? `$${Number(property.ListPrice).toLocaleString("en-CA")}`
//     : "Call for Price";

//   return {
//     price,
//     address: property?.UnparsedAddress || "",
//     city: property?.City || "",
//     mls: property?.ListingId || property?.ListingKey || "",
//     beds: property?.BedroomsTotal || 0,
//     bedrooms: property?.BedroomsTotal || 0,
//     baths: property?.BathroomsTotalInteger || 0,
//     bathrooms: property?.BathroomsTotalInteger || 0,
//     sqft: property?.BuildingAreaTotal || property?.LivingArea || "",
//     buildingArea: property?.BuildingAreaTotal || "",
//     livingArea: property?.LivingArea || "",
//     propertyType: property?.PropertyType || "",
//     style: property?.ArchitecturalStyle || "",
//     community: property?.SubdivisionName || "",
//     subdivision: property?.SubdivisionName || "",
//     yearBuilt: property?.YearBuilt || "",
//     garage: property?.GarageSpaces || "",
//     agentName: profile.agentName,
//     agentPhone: profile.agentPhone,
//     phone: profile.phone,
//     realtor: profile.realtor,
//     realtorText: profile.realtorText,
//     agentRole: profile.agentRole,
//     brokerage: profile.brokerage,
//   };
// }

// // ============================================================
// // RESOLVE LAYER TEXT
// // ============================================================

// function resolveLayerText(element, property, layer = null) {
//   const values = getPropertyLayerValues(property, layer);

//   const textKey = String(element?.textKey || "")
//     .trim()
//     .toLowerCase();

//   const aliases = {
//     agentname: "agentName",
//     name: "agentName",
//     agentphone: "agentPhone",
//     phone: "phone",
//     realtor: "realtor",
//     realtorText: "realtorText",
//     agentrole: "agentRole",
//     role: "agentRole",
//     brokeragename: "brokerage",
//   };

//   const normalizedKey = aliases[textKey] || textKey;

//   const profileKeys = [
//     "agentname",
//     "name",
//     "agentphone",
//     "phone",
//     "realtor",
//     "realtortext",
//     "agentrole",
//     "role",
//     "brokerage",
//     "brokeragename",
//   ];

//   if (
//     profileKeys.includes(textKey) &&
//     typeof element?.text === "string" &&
//     element.text.trim()
//   ) {
//     return element.text;
//   }

//   if (
//     normalizedKey &&
//     Object.prototype.hasOwnProperty.call(values, normalizedKey)
//   ) {
//     return String(values[normalizedKey] ?? "");
//   }

//   let text = element?.textTemplate || element?.text || "";

//   Object.entries(values).forEach(([key, value]) => {
//     const regex = new RegExp(`{{\\s*${key}\\s*}}`, "gi");

//     text = String(text).replace(regex, String(value ?? ""));
//   });

//   return text;
// }

// // ============================================================
// // APPLY PROFILE TO TEXT ELEMENTS
// // ============================================================

// function applyLayerProfileToElements(elements, profile) {
//   if (
//     !Array.isArray(elements) ||
//     !profile ||
//     typeof profile !== "object"
//   ) {
//     return elements;
//   }

//   const agentName = profile.agentName ?? profile.name;
//   const agentPhone = profile.agentPhone ?? profile.phone;

//   const realtor =
//     profile.realtor ??
//     profile.realtorText ??
//     profile.agentRole;

//   const brokerage = profile.brokerage;

//   return elements.map((element) => {
//     const next = {
//       ...(element?.toObject?.() || element),
//     };

//     const key = String(element?.textKey || "")
//       .trim()
//       .toLowerCase();

//     if (
//       agentName !== undefined &&
//       ["agentname", "name"].includes(key)
//     ) {
//       next.text = String(agentName).trim();
//     }

//     if (
//       agentPhone !== undefined &&
//       ["agentphone", "phone"].includes(key)
//     ) {
//       next.text = String(agentPhone).trim();
//     }

//     if (
//       realtor !== undefined &&
//       ["realtor", "realtortext", "agentrole", "role"].includes(key)
//     ) {
//       next.text = String(realtor).trim();
//     }

//     if (
//       brokerage !== undefined &&
//       ["brokerage", "brokeragename"].includes(key)
//     ) {
//       next.text = String(brokerage).trim();
//     }

//     return next;
//   });
// }

// // ============================================================
// // BUILD PROFILE FROM REQUEST
// // ============================================================

// function buildRequestProfile({
//   profile,
//   agentName,
//   name,
//   agentPhone,
//   phone,
//   agentRole,
//   realtor,
//   realtorText,
//   brokerage,
//   agentPhoto,
//   brokerageLogo,
// }) {
//   const result = {
//     ...(profile && typeof profile === "object" ? profile : {}),
//   };

//   if (agentName !== undefined) result.agentName = agentName;
//   if (name !== undefined) result.name = name;
//   if (agentPhone !== undefined) result.agentPhone = agentPhone;
//   if (phone !== undefined) result.phone = phone;
//   if (agentRole !== undefined) result.agentRole = agentRole;
//   if (realtor !== undefined) result.realtor = realtor;
//   if (realtorText !== undefined) result.realtorText = realtorText;
//   if (brokerage !== undefined) result.brokerage = brokerage;
//   if (agentPhoto !== undefined) result.agentPhoto = agentPhoto;
//   if (brokerageLogo !== undefined) result.brokerageLogo = brokerageLogo;

//   return result;
// }

// // ============================================================
// // DEFAULT LAYER ELEMENTS
// // Preserves the original 1080 x 1350 design.
// // ============================================================

// function getDefaultLayerElements() {
//   return [
//     {
//       type: "background",
//       enabled: true,
//       x: 285,
//       y: 32,
//       width: 647,
//       height: 205,
//       background: "rgba(20,20,20,0.72)",
//       borderRadius: 18,
//       opacity: 1,
//       zIndex: 1,
//     },
//     {
//       type: "shape",
//       enabled: true,
//       x: 285,
//       y: 32,
//       width: 647,
//       height: 4,
//       background: "rgba(255,255,255,0.85)",
//       borderRadius: 2,
//       zIndex: 2,
//     },
//     {
//       type: "text",
//       enabled: true,
//       x: 315,
//       y: 78,
//       textKey: "address",
//       fontSize: 32,
//       fontWeight: "800",
//       fontFamily: "Arial, Helvetica, sans-serif",
//       color: "#ffffff",
//       zIndex: 3,
//     },
//     {
//       type: "mls",
//       enabled: true,
//       x: 315,
//       y: 110,
//       textKey: "mls",
//       textTemplate: "MLS® {{mls}}",
//       fontSize: 20,
//       fontWeight: "600",
//       fontFamily: "Arial, Helvetica, sans-serif",
//       color: "#F8F8F8",
//       zIndex: 4,
//     },
//     {
//       type: "line",
//       enabled: true,
//       x: 312,
//       y: 130,
//       width: 588,
//       height: 1,
//       background: "#8F8F8F",
//       opacity: 0.45,
//       zIndex: 5,
//     },
//     {
//       type: "text",
//       enabled: true,
//       x: 315,
//       y: 163,
//       text: "CITY",
//       fontSize: 17,
//       fontWeight: "600",
//       color: "#CFCFCF",
//       zIndex: 6,
//     },
//     {
//       type: "text",
//       enabled: true,
//       x: 455,
//       y: 163,
//       textKey: "city",
//       fontSize: 20,
//       fontWeight: "700",
//       color: "#ffffff",
//       zIndex: 7,
//     },
//     {
//       type: "text",
//       enabled: true,
//       x: 315,
//       y: 199,
//       text: "BEDROOMS",
//       fontSize: 17,
//       fontWeight: "600",
//       color: "#CFCFCF",
//       zIndex: 8,
//     },
//     {
//       type: "text",
//       enabled: true,
//       x: 455,
//       y: 199,
//       textKey: "beds",
//       fontSize: 20,
//       fontWeight: "700",
//       color: "#ffffff",
//       zIndex: 9,
//     },
//     {
//       type: "text",
//       enabled: true,
//       x: 650,
//       y: 163,
//       text: "BATHROOMS",
//       fontSize: 17,
//       fontWeight: "600",
//       color: "#CFCFCF",
//       zIndex: 10,
//     },
//     {
//       type: "text",
//       enabled: true,
//       x: 785,
//       y: 163,
//       textKey: "baths",
//       fontSize: 20,
//       fontWeight: "700",
//       color: "#ffffff",
//       zIndex: 11,
//     },
//     {
//       type: "text",
//       enabled: true,
//       x: 650,
//       y: 199,
//       text: "SIZE",
//       fontSize: 17,
//       fontWeight: "600",
//       color: "#CFCFCF",
//       zIndex: 12,
//     },
//     {
//       type: "text",
//       enabled: true,
//       x: 785,
//       y: 199,
//       textKey: "sqft",
//       textTemplate: "{{sqft}} Sq Ft",
//       fontSize: 20,
//       fontWeight: "700",
//       color: "#ffffff",
//       zIndex: 13,
//     },
//     {
//       type: "background",
//       enabled: true,
//       x: 0,
//       y: 1160,
//       width: 280,
//       height: 190,
//       background: "#ffffff",
//       zIndex: 20,
//     },
//     {
//       type: "background",
//       enabled: true,
//       x: 280,
//       y: 1160,
//       width: 800,
//       height: 190,
//       background: "#4b2b2b",
//       zIndex: 21,
//     },
//     {
//       type: "text",
//       enabled: true,
//       x: 20,
//       y: 1198,
//       textKey: "price",
//       fontSize: 34,
//       fontWeight: "800",
//       color: "#222222",
//       zIndex: 22,
//     },
//     {
//       type: "text",
//       enabled: true,
//       x: 20,
//       y: 1235,
//       textTemplate: "{{beds}} Bed • {{baths}} Bath",
//       fontSize: 21,
//       fontWeight: "400",
//       color: "#444444",
//       zIndex: 23,
//     },
//     {
//       type: "text",
//       enabled: true,
//       x: 20,
//       y: 1268,
//       textKey: "propertyType",
//       fontSize: 21,
//       fontWeight: "400",
//       color: "#444444",
//       zIndex: 24,
//     },
//     {
//       type: "text",
//       enabled: true,
//       x: 20,
//       y: 1300,
//       textTemplate: "{{sqft}} Sq Ft",
//       fontSize: 21,
//       fontWeight: "400",
//       color: "#444444",
//       zIndex: 25,
//     },
//     {
//       type: "mls",
//       enabled: true,
//       x: 20,
//       y: 1332,
//       textTemplate: "MLS® {{mls}}",
//       fontSize: 21,
//       fontWeight: "400",
//       color: "#444444",
//       zIndex: 26,
//     },
//     {
//       type: "text",
//       enabled: true,
//       x: 315,
//       y: 1220,
//       text: "PARTH BRAHMBHATT",
//       textKey: "agentName",
//       fontSize: 38,
//       fontWeight: "800",
//       color: "#ffffff",
//       zIndex: 27,
//     },
//     {
//       type: "text",
//       enabled: true,
//       x: 455,
//       y: 1275,
//       text: "REALTOR",
//       textKey: "realtor",
//       fontSize: 30,
//       fontWeight: "400",
//       color: "#ffffff",
//       zIndex: 28,
//     },
//     {
//       type: "text",
//       enabled: true,
//       x: 340,
//       y: 1330,
//       text: "403-439-1555",
//       textKey: "agentPhone",
//       fontSize: 38,
//       fontWeight: "500",
//       color: "#ffffff",
//       zIndex: 29,
//     },
//     {
//       type: "image",
//       enabled: true,
//       x: 0,
//       y: 1160,
//       width: 280,
//       height: 190,
//       assetKey: "brokerage",
//       assetUrl: "diamond_realty.jpeg",
//       fit: "fill",
//       zIndex: 30,
//     },
//     {
//       type: "agent",
//       enabled: true,
//       x: 740,
//       y: 960,
//       width: 340,
//       height: 400,
//       assetKey: "agent",
//       assetUrl: "agent12.png",
//       fit: "contain",
//       zIndex: 31,
//     },
//   ];
// }

// // ============================================================
// // CREATE OR RETRIEVE DEFAULT LAYER
// // ============================================================

// async function getOrCreateDefaultLayer() {
//   let layer = await SocialDesignLayer.findOne({
//     name: DEFAULT_LAYER_NAME,
//     userId: null,
//   });

//   if (layer) return layer;

//   layer = await SocialDesignLayer.create({
//     name: DEFAULT_LAYER_NAME,
//     description: "Default RealtorParth property branding layer.",
//     type: "default",
//     isActive: true,
//     isDefault: true,
//     showMLS: true,
//     canvas: {
//       width: 1080,
//       height: 1350,
//       background: "transparent",
//       backgroundImage: "",
//     },
//     profile: DEFAULT_PROFILE_VALUES,
//     elements: getDefaultLayerElements(),
//     userId: null,
//     sortOrder: 0,
//   });

//   console.log("Created RealtorParth Default Layer");

//   return layer;
// }

// // ============================================================
// // FIND LAYER BY ID OR DEFAULT
// // ============================================================

// async function getLayerByIdOrDefault(layerId, userId = null) {
//   const defaultLayer = await getOrCreateDefaultLayer();

//   if (
//     layerId &&
//     !["default", "minimal", "none"].includes(String(layerId))
//   ) {
//     if (!isValidObjectId(layerId)) {
//       throw new Error("Invalid design layer ID");
//     }

//     const query = {
//       _id: layerId,
//       isActive: { $ne: false },
//     };

//     // Permit global layers and layers belonging to this user.
//     if (userId && isValidObjectId(userId)) {
//       query.$or = [{ userId: null }, { userId }];
//     } else {
//       query.userId = null;
//     }

//     const layer = await SocialDesignLayer.findOne(query);

//     if (!layer) {
//       throw new Error("Selected design layer not found or inaccessible");
//     }

//     return layer;
//   }

//   if (userId && isValidObjectId(userId)) {
//     const user = await User.findById(userId).select(
//       "socialDesignPreferences"
//     );

//     const preferredId =
//       user?.socialDesignPreferences?.defaultLayerId;

//     if (preferredId && isValidObjectId(preferredId)) {
//       const preferredLayer = await SocialDesignLayer.findOne({
//         _id: preferredId,
//         isActive: { $ne: false },
//         $or: [{ userId: null }, { userId }],
//       });

//       if (preferredLayer) return preferredLayer;
//     }
//   }

//   return defaultLayer;
// }

// // ============================================================
// // RESOLVE LAYER ASSET PATH
// // ============================================================

// function resolveLayerAssetPath(element, layer = null) {
//   const assetKey = normalizeAssetKey(element?.assetKey);
//   const assetUrl = String(element?.assetUrl || "").trim();

//   const profile = layer?.profile?.toObject?.() || layer?.profile || {};

//   const agentPhoto =
//     profile.agentPhoto ||
//     element?.assetUrl ||
//     "";

//   const brokerageLogo =
//     profile.brokerageLogo ||
//     element?.assetUrl ||
//     "";

//   const systemAssets = {
//     realtorlogo: path.join(ASSET_DIR, "realtor_logo.svg"),
//     agent: path.join(ASSET_DIR, "agent12.png"),
//     agentphoto: path.join(ASSET_DIR, "agent12.png"),
//     agent12: path.join(ASSET_DIR, "agent12.png"),
//     brokerage: path.join(ASSET_DIR, "diamond_realty.jpeg"),
//     diamondrealty: path.join(ASSET_DIR, "diamond_realty.jpeg"),
//     diamondrealtylogo: path.join(ASSET_DIR, "diamond_realty.jpeg"),
//   };

//   if (assetKey === "agentphoto" && agentPhoto) {
//     const resolved = resolveLayerAssetPath({
//       ...element,
//       assetKey: "",
//       assetUrl: agentPhoto,
//     });

//     if (resolved) return resolved;
//   }

//   if (
//     ["brokerage", "brokeragelogo", "diamondrealtylogo"].includes(assetKey) &&
//     brokerageLogo
//   ) {
//     const resolved = resolveLayerAssetPath({
//       ...element,
//       assetKey: "",
//       assetUrl: brokerageLogo,
//     });

//     if (resolved) return resolved;
//   }

//   if (systemAssets[assetKey] && fs.existsSync(systemAssets[assetKey])) {
//     return systemAssets[assetKey];
//   }

//   if (!assetUrl) return null;

//   // Only resolve local assets. The renderer must not read arbitrary
//   // server paths or treat an untrusted URL as a local filename.
//   let clean = assetUrl;

//   if (/^https?:\/\//i.test(assetUrl)) {
//     try {
//       const parsed = new URL(assetUrl);
//       const pathname = decodeURIComponent(parsed.pathname);
//       const basename = path.basename(pathname);

//       if (!basename || basename === "." || basename === "..") {
//         return null;
//       }

//       const candidates = [
//         path.join(ASSET_DIR, basename),
//         path.join(IMAGE_DIR, basename),
//       ];

//       for (const candidate of candidates) {
//         if (fs.existsSync(candidate)) return candidate;
//       }

//       return null;
//     } catch {
//       return null;
//     }
//   }

//   clean = clean.replace(/^\/+/, "");

//   const basename = path.basename(clean);

//   const candidates = [
//     path.join(ASSET_DIR, basename),
//     path.join(IMAGE_DIR, basename),
//   ];

//   for (const candidate of candidates) {
//     if (fs.existsSync(candidate)) return candidate;
//   }

//   return null;
// }

// // ============================================================
// // OPTIONAL ALWAYS-ON REALTOR LOGO
// // ============================================================

// async function createAlwaysOnRealtorLogo() {
//   const logoPath = path.join(ASSET_DIR, "realtor_logo.svg");

//   if (!fs.existsSync(logoPath)) {
//     console.warn("REALTOR logo missing:", logoPath);
//     return null;
//   }

//   const raw = await fs.promises.readFile(logoPath, "utf8");
//   const base64 = Buffer.from(raw).toString("base64");

//   return Buffer.from(`
// <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
//   <image
//     href="data:image/svg+xml;base64,${base64}"
//     x="55" y="52" width="190" height="165"
//     opacity="0.35"
//     preserveAspectRatio="xMidYMid meet"
//   />
// </svg>`);
// }

// // ============================================================
// // SVG DESIGN LAYER
// // ============================================================

// function createLayerSvg(layer, property, showMLS = true) {
//   const canvasWidth = Number(layer?.canvas?.width) || 1080;
//   const canvasHeight = Number(layer?.canvas?.height) || 1350;

//   const elements = Array.isArray(layer?.elements)
//     ? [...layer.elements].sort(
//         (a, b) =>
//           (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0)
//       )
//     : [];

//   let svg = `
// <svg width="${canvasWidth}" height="${canvasHeight}"
//   viewBox="0 0 ${canvasWidth} ${canvasHeight}"
//   xmlns="http://www.w3.org/2000/svg">`;

//   const canvasBackground = layer?.canvas?.background;

//   if (
//     canvasBackground &&
//     canvasBackground !== "transparent"
//   ) {
//     svg += `
// <rect x="0" y="0" width="${canvasWidth}" height="${canvasHeight}"
//   fill="${escapeSvgText(canvasBackground)}"/>`;
//   }

//   for (const element of elements) {
//     if (!element || element.enabled === false) continue;

//     const type = String(element.type || "")
//       .trim()
//       .toLowerCase();

//     if (type === "mls" && !showMLS) continue;

//     const x = Number(element.x) || 0;
//     const y = Number(element.y) || 0;
//     const width = Number(element.width) || 0;
//     const height = Number(element.height) || 0;

//     const opacity =
//       element.opacity === undefined
//         ? 1
//         : Math.max(
//             0,
//             Math.min(1, Number(element.opacity) || 0)
//           );

//     const radius = Number(element.borderRadius) || 0;
//     const background = element.background || "transparent";
//     const color = element.color || "#000000";
//     const fontSize = Number(element.fontSize) || 20;
//     const fontWeight = element.fontWeight || "normal";
//     const fontFamily =
//       element.fontFamily || "Arial, Helvetica, sans-serif";

//     if (["background", "shape", "rect"].includes(type)) {
//       svg += `
// <rect x="${x}" y="${y}" width="${width}" height="${height}"
//   rx="${radius}" ry="${radius}"
//   fill="${escapeSvgText(background)}" opacity="${opacity}"/>`;

//       if (Number(element.borderWidth) > 0) {
//         svg += `
// <rect x="${x}" y="${y}" width="${width}" height="${height}"
//   rx="${radius}" ry="${radius}" fill="none"
//   stroke="${escapeSvgText(element.borderColor || "transparent")}"
//   stroke-width="${Number(element.borderWidth)}"
//   opacity="${opacity}"/>`;
//       }

//       continue;
//     }

//     if (type === "line") {
//       svg += `
// <line x1="${x}" y1="${y}" x2="${x + width}"
//   y2="${y + Math.max(height, 1)}"
//   stroke="${escapeSvgText(background || color)}"
//   stroke-width="${Math.max(Number(element.height) || 1, 1)}"
//   opacity="${opacity}"/>`;

//       continue;
//     }

//     if (
//       ["text", "mls", "address", "price", "details"].includes(type)
//     ) {
//       const resolved = resolveLayerText(element, property, layer);

//       const anchor =
//         element.textAlign === "center"
//           ? "middle"
//           : element.textAlign === "right"
//             ? "end"
//             : "start";

//       const baseline =
//         y +
//         (element.textBaseline === "baseline" ? 0 : fontSize);

//       svg += `
// <text x="${x}" y="${baseline}"
//   fill="${escapeSvgText(color)}"
//   font-family="${escapeSvgText(fontFamily)}"
//   font-size="${fontSize}px"
//   font-weight="${escapeSvgText(fontWeight)}"
//   text-anchor="${anchor}" opacity="${opacity}">${escapeSvgText(resolved)}</text>`;
//     }
//   }

//   svg += "</svg>";

//   return svg;
// }

// // ============================================================
// // LAYER IMAGE COMPOSITES
// // Uses model elements plus the saved profile assets.
// // ============================================================

// async function prepareLayerImageComposites(layer) {
//   const composites = [];

//   const elements = Array.isArray(layer?.elements)
//     ? [...layer.elements].sort(
//         (a, b) =>
//           (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0)
//       )
//     : [];

//   for (const element of elements) {
//     if (!element || element.enabled === false) continue;

//     const type = String(element.type || "")
//       .trim()
//       .toLowerCase();

//     if (!["image", "agent", "logo", "brokerage"].includes(type)) {
//       continue;
//     }

//     const assetPath = resolveLayerAssetPath(element, layer);

//     if (!assetPath) {
//       console.warn("Layer asset not found:", {
//         layer: layer.name,
//         type,
//         assetKey: element.assetKey || "",
//         assetUrl: element.assetUrl || "",
//       });

//       continue;
//     }

//     const assetKey = normalizeAssetKey(element.assetKey);

//     const isAgent =
//       type === "agent" ||
//       ["agent", "agentphoto", "agent12"].includes(assetKey);

//     let left = Number(element.x) || 0;
//     let top = Number(element.y) || 0;
//     let width = Number(element.width) || undefined;
//     let height = Number(element.height) || undefined;

//     let image = sharp(assetPath);

//     const rotation = Number(element.rotation) || 0;

//     if (rotation !== 0) {
//       image = image.rotate(rotation);
//     }

//     if (isAgent && element.useReferenceAgentLayout === true) {
//       const metadata = await sharp(assetPath).metadata();

//       const originalWidth = Number(metadata.width) || 1;
//       const originalHeight = Number(metadata.height) || 1;

//       height = 900;
//       width = Math.round(
//         (originalWidth / originalHeight) * height
//       );

//       left = 1080 - width + 120;
//       top = 400;
//     }

//     if (width || height) {
//       image = image.resize({
//         width,
//         height,
//         fit:
//           element.fit === "fill"
//             ? "fill"
//             : element.fit === "cover"
//               ? "cover"
//               : "contain",
//         position: normalizeSharpPosition(element.objectPosition),
//       });
//     }

//     const buffer = await image.png().toBuffer();

//     composites.push({
//       input: buffer,
//       left,
//       top,
//     });
//   }

//   return composites;
// }

// // ============================================================
// // APPLY DESIGN LAYER
// // ============================================================

// async function applyDesignLayer({
//   baseImage,
//   property,
//   layer,
//   showMLS = true,
//   includeRealtorLogo = false,
// }) {
//   const composites = [];

//   if (includeRealtorLogo) {
//     const realtorLogo = await createAlwaysOnRealtorLogo();

//     if (realtorLogo) {
//       composites.push({
//         input: realtorLogo,
//         left: 0,
//         top: 0,
//       });
//     }
//   }

//   if (layer) {
//     const layerSvg = createLayerSvg(layer, property, showMLS);

//     composites.push({
//       input: Buffer.from(layerSvg),
//       left: 0,
//       top: 0,
//     });

//     const imageComposites =
//       await prepareLayerImageComposites(layer);

//     composites.push(...imageComposites);
//   }

//   return sharp(baseImage)
//     .resize(1080, 1350, {
//       fit: "cover",
//       position: "center",
//     })
//     .composite(composites)
//     .flatten({ background: "#000000" })
//     .jpeg({ quality: 84, mozjpeg: true })
//     .toBuffer();
// }

// // ============================================================
// // AI-GENERATED DESIGN LAYER
// // ============================================================

// async function generateAILayer({
//   property,
//   designPrompt,
//   userPrompt,
//   showMLS = true,
// }) {
//   const propertyAddress = property?.UnparsedAddress || "";
//   const city = property?.City || "";

//   const price = property?.ListPrice
//     ? `$${Number(property.ListPrice).toLocaleString("en-CA")}`
//     : "";

//   const mls = property?.ListingId || property?.ListingKey || "";
//   const beds = property?.BedroomsTotal || "";
//   const baths = property?.BathroomsTotalInteger || "";
//   const sqft = property?.BuildingAreaTotal || property?.LivingArea || "";
//   const propertyType = property?.PropertyType || "";

//   const prompt = `
// You are a premium real-estate social-media graphic designer.

// Create a visual branding layer specification for a
// 1080 x 1350 portrait real-estate listing image.

// The final image is for RealtorParth.

// USER DESIGN REQUEST:
// ${userPrompt || "Create a premium modern real-estate design."}

// DESIGN STYLE ANALYSIS:
// ${designPrompt || "Premium modern real-estate marketing style."}

// VERIFIED PROPERTY INFORMATION:
// Address: ${propertyAddress || "Not available"}
// City: ${city || "Not available"}
// Price: ${price || "Not available"}
// MLS: ${mls || "Not available"}
// Bedrooms: ${beds || "Not available"}
// Bathrooms: ${baths || "Not available"}
// Square Feet: ${sqft || "Not available"}
// Property Type: ${propertyType || "Not available"}

// Create an overlay/layer only.
// Do not modify the actual property.
// Do not create a different house.
// Do not invent property facts.

// The layer may contain:
// - Address
// - City
// - Price
// - Bedrooms and bathrooms
// - Square feet
// - Property type
// - MLS, when permitted
// - Agent name and phone
// - REALTOR role
// - Brokerage name
// - Shapes, cards, lines, borders and accent blocks

// MLS VISIBILITY:
// ${
//   showMLS
//     ? "MLS MAY be displayed only when an MLS number exists."
//     : "MLS MUST NOT be displayed anywhere in the layer."
// }

// DEFAULT CONTACT INFORMATION:
// Agent: PARTH BRAHMBHATT
// Phone: 403-439-1555
// Role: REALTOR
// Brokerage: DIAMOND REALTY

// Return ONLY valid JSON in this structure:
// {
//   "name": "AI Auto Layer",
//   "description": "AI-generated real-estate branding layer",
//   "canvas": {
//     "width": 1080,
//     "height": 1350,
//     "background": "transparent",
//     "backgroundImage": ""
//   },
//   "profile": {
//     "agentName": "PARTH BRAHMBHATT",
//     "agentPhone": "403-439-1555",
//     "agentRole": "REALTOR",
//     "brokerage": "DIAMOND REALTY"
//   },
//   "elements": [
//     {
//       "type": "background",
//       "enabled": true,
//       "x": 0,
//       "y": 0,
//       "width": 1080,
//       "height": 200,
//       "background": "rgba(0,0,0,0.65)",
//       "opacity": 1,
//       "zIndex": 1
//     },
//     {
//       "type": "text",
//       "enabled": true,
//       "x": 40,
//       "y": 80,
//       "textKey": "address",
//       "fontSize": 32,
//       "fontWeight": "700",
//       "color": "#ffffff",
//       "zIndex": 2
//     }
//   ]
// }

// SUPPORTED ELEMENT TYPES:
// background, shape, rect, line, text, mls, image, agent, logo, brokerage.

// VALID TEXT KEYS:
// address, city, price, mls, beds, baths, sqft, propertyType,
// agentName, agentPhone, realtor, brokerage.

// Do not generate image elements. Image assets are handled by the application.
// Keep the design elegant, readable and professional.
// Return ONLY JSON.
// `;

//   try {
//     const response = await ai.models.generateContent({
//       model: MODEL,
//       contents: prompt,
//       config: {
//         temperature: 0.8,
//         responseMimeType: "application/json",
//       },
//     });

//     let text = response.text || "";

//     text = text
//       .replace(/^```json/i, "")
//       .replace(/^```/i, "")
//       .replace(/```$/i, "")
//       .trim();

//     let parsed;

//     try {
//       parsed = JSON.parse(text);
//     } catch {
//       const first = text.indexOf("{");
//       const last = text.lastIndexOf("}");

//       if (first >= 0 && last > first) {
//         parsed = JSON.parse(text.substring(first, last + 1));
//       }
//     }

//     if (!parsed || typeof parsed !== "object") {
//       throw new Error("AI returned invalid layer JSON");
//     }

//     const allowedTypes = new Set([
//       "background",
//       "shape",
//       "rect",
//       "line",
//       "text",
//       "mls",
//     ]);

//     const rawElements = Array.isArray(parsed.elements)
//       ? parsed.elements
//       : [];

//     const elements = rawElements
//       .filter((element) => {
//         const type = String(element?.type || "").toLowerCase();

//         return allowedTypes.has(type);
//       })
//       .map((element, index) => ({
//         ...element,
//         enabled: element.enabled !== false,
//         x: Number(element.x) || 0,
//         y: Number(element.y) || 0,
//         width: Number(element.width) || 0,
//         height: Number(element.height) || 0,
//         zIndex: Number(element.zIndex) || index + 1,
//       }));

//     // Never allow AI output to bypass the user's MLS visibility choice.
//     const safeElements = showMLS
//       ? elements
//       : elements.filter(
//           (element) =>
//             String(element.type).toLowerCase() !== "mls" &&
//             !/\bMLS\b/i.test(
//               `${element.text || ""} ${element.textTemplate || ""}`
//             )
//         );

//     const generatedProfile = {
//       ...DEFAULT_PROFILE_VALUES,
//       ...(parsed.profile && typeof parsed.profile === "object"
//         ? parsed.profile
//         : {}),
//     };

//     return {
//       name: String(parsed.name || "AI Auto Layer").trim(),
//       description: String(
//         parsed.description ||
//           "AI-generated real-estate branding layer."
//       ).trim(),
//       type: "ai",
//       aiGenerated: true,
//       aiPrompt: String(userPrompt || designPrompt || ""),
//       isActive: true,
//       isDefault: false,
//       showMLS: Boolean(showMLS),
//       canvas: {
//         width: Number(parsed.canvas?.width) || 1080,
//         height: Number(parsed.canvas?.height) || 1350,
//         background: parsed.canvas?.background || "transparent",
//         backgroundImage: parsed.canvas?.backgroundImage || "",
//       },
//       profile: generatedProfile,
//       elements: safeElements,
//     };
//   } catch (error) {
//     console.error("AI AUTO LAYER ERROR:", error?.message || error);
//     throw error;
//   }
// }

// // ============================================================
// // SAVE AI-GENERATED LAYER
// // ============================================================

// async function saveGeneratedAILayer({
//   layerDefinition,
//   userId,
// }) {
//   if (!layerDefinition) return null;

//   const cleanUserId =
//     userId && isValidObjectId(userId) ? userId : null;

//   const layer = await SocialDesignLayer.create({
//     name: layerDefinition.name || "AI Auto Layer",
//     description:
//       layerDefinition.description ||
//       "AI-generated real-estate branding layer.",
//     type: "ai",
//     aiGenerated: true,
//     aiPrompt: layerDefinition.aiPrompt || "",
//     isActive: true,
//     isDefault: false,
//     showMLS: Boolean(layerDefinition.showMLS),
//     canvas: layerDefinition.canvas || {
//       width: 1080,
//       height: 1350,
//       background: "transparent",
//       backgroundImage: "",
//     },
//     profile: layerDefinition.profile || DEFAULT_PROFILE_VALUES,
//     elements: Array.isArray(layerDefinition.elements)
//       ? layerDefinition.elements
//       : [],
//     userId: cleanUserId,
//     sortOrder: 0,
//   });

//   return layer;
// }

// // ============================================================
// // LAYER RESPONSE HELPER
// // ============================================================

// function serializeLayer(layer) {
//   if (!layer) return null;

//   const plain = layer.toObject
//     ? layer.toObject()
//     : { ...layer };

//   return {
//     ...plain,
//     profile: getEffectiveLayerProfile(plain),
//   };
// }

// // ============================================================
// // CHECK LAYER OWNERSHIP
// // ============================================================

// function layerIsAccessibleToUser(layer, userId) {
//   if (!layer) return false;

//   const ownerId = layer.userId
//     ? String(layer.userId)
//     : null;

//   // Global layers are available to all users.
//   if (!ownerId) return true;

//   // Private layers require the matching user ID.
//   return Boolean(
//     userId && isValidObjectId(userId) && ownerId === String(userId)
//   );
// }

// // ============================================================
// // GET DESIGN LAYERS
// // ============================================================

// router.get("/design-layers", async (req, res) => {
//   try {
//     await getOrCreateDefaultLayer();

//     const userId = getRequestUserId(req);

//     const ownershipFilter = [{ userId: null }];

//     if (userId) {
//       ownershipFilter.push({ userId });
//     }

//     const layers = await SocialDesignLayer.find({
//       isActive: { $ne: false },
//       $or: ownershipFilter,
//     })
//       .sort({
//         isDefault: -1,
//         sortOrder: 1,
//         createdAt: 1,
//       })
//       .lean();

//     return res.json({
//       success: true,
//       layers: layers.map(serializeLayer),
//     });
//   } catch (error) {
//     console.error("GET DESIGN LAYERS ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch design layers",
//     });
//   }
// });

// // ============================================================
// // GET SINGLE DESIGN LAYER
// // ============================================================

// router.get("/design-layers/:id", async (req, res) => {
//   try {
//     if (!isValidObjectId(req.params.id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid design layer ID",
//       });
//     }

//     const layer = await SocialDesignLayer.findById(req.params.id);

//     if (!layer) {
//       return res.status(404).json({
//         success: false,
//         message: "Design layer not found",
//       });
//     }

//     if (!layerIsAccessibleToUser(layer, getRequestUserId(req))) {
//       return res.status(403).json({
//         success: false,
//         message: "You cannot access this design layer",
//       });
//     }

//     return res.json({
//       success: true,
//       layer: serializeLayer(layer),
//       profile: getEffectiveLayerProfile(layer),
//     });
//   } catch (error) {
//     console.error("GET DESIGN LAYER ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch design layer",
//     });
//   }
// });

// // ============================================================
// // CREATE DESIGN LAYER
// // ============================================================

// router.post("/design-layers", async (req, res) => {
//   try {
//     const {
//       name,
//       description,
//       type,
//       isDefault,
//       showMLS,
//       canvas,
//       elements,
//       sortOrder,
//       userId: bodyUserId,
//       profile,
//       agentName,
//       name: requestedName,
//       agentPhone,
//       phone,
//       agentRole,
//       realtor,
//       realtorText,
//       brokerage,
//       agentPhoto,
//       brokerageLogo,
//     } = req.body || {};

//     if (!name || !String(name).trim()) {
//       return res.status(400).json({
//         success: false,
//         message: "Layer name is required",
//       });
//     }

//     const requestUserId = getRequestUserId(req);

//     // Do not permit an arbitrary request body to create a layer
//     // under a different user's account.
//     if (
//       requestUserId &&
//       bodyUserId &&
//       String(bodyUserId) !== String(requestUserId)
//     ) {
//       return res.status(403).json({
//         success: false,
//         message: "The supplied user ID does not match the current user",
//       });
//     }

//     const ownerId =
//       requestUserId ||
//       (bodyUserId && isValidObjectId(bodyUserId)
//         ? String(bodyUserId)
//         : null);

//     const normalizedType = ["default", "custom", "ai"].includes(
//       String(type || "custom").toLowerCase()
//     )
//       ? String(type || "custom").toLowerCase()
//       : "custom";

//     if (normalizedType === "default" && ownerId) {
//       return res.status(400).json({
//         success: false,
//         message: "User-created layers must use type custom or ai",
//       });
//     }

//     const requestedProfile = buildRequestProfile({
//       profile,
//       agentName,
//       name: requestedName,
//       agentPhone,
//       phone,
//       agentRole,
//       realtor,
//       realtorText,
//       brokerage,
//       agentPhoto,
//       brokerageLogo,
//     });

//     const finalProfile = {
//       ...DEFAULT_PROFILE_VALUES,
//       ...requestedProfile,
//     };

//     const finalElements = applyLayerProfileToElements(
//       Array.isArray(elements) ? elements : [],
//       finalProfile
//     );

//     const shouldBeDefault = parseBoolean(isDefault, false);

//     if (shouldBeDefault) {
//       await SocialDesignLayer.updateMany(
//         {
//           userId: ownerId,
//           isDefault: true,
//         },
//         {
//           $set: { isDefault: false },
//         }
//       );
//     }

//     const layer = await SocialDesignLayer.create({
//       name: String(name).trim(),
//       description: description || "",
//       type: normalizedType,
//       aiGenerated: normalizedType === "ai",
//       isActive: true,
//       isDefault: shouldBeDefault,
//       showMLS: parseBoolean(showMLS, true),
//       canvas: {
//         width: Number(canvas?.width) || 1080,
//         height: Number(canvas?.height) || 1350,
//         background: canvas?.background || "transparent",
//         backgroundImage: canvas?.backgroundImage || "",
//       },
//       profile: finalProfile,
//       elements: finalElements,
//       userId: ownerId,
//       sortOrder: Number(sortOrder) || 0,
//     });

//     return res.status(201).json({
//       success: true,
//       message: "Design layer created successfully",
//       layer: serializeLayer(layer),
//       profile: getEffectiveLayerProfile(layer),
//     });
//   } catch (error) {
//     console.error("CREATE DESIGN LAYER ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to create design layer",
//     });
//   }
// });

// // ============================================================
// // UPDATE DESIGN LAYER
// // ============================================================

// router.put("/design-layers/:id", async (req, res) => {
//   try {
//     if (!isValidObjectId(req.params.id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid design layer ID",
//       });
//     }

//     const layer = await SocialDesignLayer.findById(req.params.id);

//     if (!layer) {
//       return res.status(404).json({
//         success: false,
//         message: "Design layer not found",
//       });
//     }

//     const userId = getRequestUserId(req);

//     if (!layerIsAccessibleToUser(layer, userId)) {
//       return res.status(403).json({
//         success: false,
//         message: "You cannot edit this design layer",
//       });
//     }

//     const {
//       name,
//       description,
//       type,
//       isActive,
//       isDefault,
//       showMLS,
//       canvas,
//       elements,
//       sortOrder,
//       profile,
//       agentName,
//       agentPhone,
//       phone,
//       agentRole,
//       realtor,
//       realtorText,
//       brokerage,
//       agentPhoto,
//       brokerageLogo,
//     } = req.body || {};

//     const isProtectedDefault =
//       layer.name === DEFAULT_LAYER_NAME && !layer.userId;

//     if (isProtectedDefault) {
//       layer.isActive = true;
//       layer.isDefault = true;
//     }

//     if (isDefault !== undefined && parseBoolean(isDefault, false)) {
//       await SocialDesignLayer.updateMany(
//         {
//           _id: { $ne: layer._id },
//           userId: layer.userId || null,
//           isDefault: true,
//         },
//         {
//           $set: { isDefault: false },
//         }
//       );
//     }

//     if (name !== undefined && !isProtectedDefault) {
//       const cleanName = String(name).trim();

//       if (!cleanName) {
//         return res.status(400).json({
//           success: false,
//           message: "Layer name cannot be empty",
//         });
//       }

//       layer.name = cleanName;
//     }

//     if (description !== undefined) {
//       layer.description = String(description);
//     }

//     if (type !== undefined && !isProtectedDefault) {
//       const normalizedType = String(type).toLowerCase();

//       if (!["custom", "ai", "default"].includes(normalizedType)) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid design layer type",
//         });
//       }

//       if (normalizedType === "default" && layer.userId) {
//         return res.status(400).json({
//           success: false,
//           message: "User-owned layers cannot use the default type",
//         });
//       }

//       layer.type = normalizedType;
//       layer.aiGenerated = normalizedType === "ai";
//     }

//     if (isActive !== undefined && !isProtectedDefault) {
//       layer.isActive = parseBoolean(isActive, layer.isActive);
//     }

//     if (isDefault !== undefined) {
//       layer.isDefault = isProtectedDefault
//         ? true
//         : parseBoolean(isDefault, layer.isDefault);
//     }

//     if (showMLS !== undefined) {
//       layer.showMLS = parseBoolean(showMLS, layer.showMLS);
//     }

//     if (canvas && typeof canvas === "object") {
//       layer.canvas = {
//         width: Number(canvas.width) || 1080,
//         height: Number(canvas.height) || 1350,
//         background: canvas.background || "transparent",
//         backgroundImage: canvas.backgroundImage || "",
//       };
//     }

//     if (Array.isArray(elements)) {
//       layer.elements = elements;
//     }

//     const profileWasProvided =
//       Boolean(
//         profile &&
//           typeof profile === "object" &&
//           Object.keys(profile).length
//       ) ||
//       agentName !== undefined ||
//       agentPhone !== undefined ||
//       phone !== undefined ||
//       agentRole !== undefined ||
//       realtor !== undefined ||
//       realtorText !== undefined ||
//       brokerage !== undefined ||
//       agentPhoto !== undefined ||
//       brokerageLogo !== undefined;

//     if (profileWasProvided) {
//       const requestedProfile = buildRequestProfile({
//         profile,
//         agentName,
//         agentPhone,
//         phone,
//         agentRole,
//         realtor,
//         realtorText,
//         brokerage,
//         agentPhoto,
//         brokerageLogo,
//       });

//       const currentProfile =
//         layer.profile?.toObject?.() || layer.profile || {};

//       const finalProfile = {
//         ...DEFAULT_PROFILE_VALUES,
//         ...currentProfile,
//         ...requestedProfile,
//       };

//       layer.profile = finalProfile;

//       layer.elements = applyLayerProfileToElements(
//         layer.elements,
//         finalProfile
//       );
//     }

//     if (sortOrder !== undefined) {
//       layer.sortOrder = Number(sortOrder) || 0;
//     }

//     await layer.save();

//     return res.json({
//       success: true,
//       message: "Design layer updated successfully",
//       layer: serializeLayer(layer),
//       profile: getEffectiveLayerProfile(layer),
//     });
//   } catch (error) {
//     console.error("UPDATE DESIGN LAYER ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to update design layer",
//     });
//   }
// });

// // ============================================================
// // SET DEFAULT LAYER
// // ============================================================

// router.post("/design-layers/:id/default", async (req, res) => {
//   try {
//     if (!isValidObjectId(req.params.id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid design layer ID",
//       });
//     }

//     const layer = await SocialDesignLayer.findById(req.params.id);

//     if (!layer) {
//       return res.status(404).json({
//         success: false,
//         message: "Design layer not found",
//       });
//     }

//     const userId = getRequestUserId(req);

//     if (!layerIsAccessibleToUser(layer, userId)) {
//       return res.status(403).json({
//         success: false,
//         message: "You cannot select this design layer",
//       });
//     }

//     await SocialDesignLayer.updateMany(
//       {
//         _id: { $ne: layer._id },
//         userId: layer.userId || null,
//         isDefault: true,
//       },
//       {
//         $set: { isDefault: false },
//       }
//     );

//     layer.isDefault = true;
//     layer.isActive = true;

//     await layer.save();

//     return res.json({
//       success: true,
//       message: "Default design layer updated",
//       layer: serializeLayer(layer),
//     });
//   } catch (error) {
//     console.error("SET DEFAULT DESIGN LAYER ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to set default design layer",
//     });
//   }
// });

// // ============================================================
// // SELECT DESIGN LAYER
// // ============================================================

// router.post("/design-layers/:id/select", async (req, res) => {
//   try {
//     if (!isValidObjectId(req.params.id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid design layer ID",
//       });
//     }

//     const userId = getRequestUserId(req);

//     if (!userId) {
//       return res.status(401).json({
//         success: false,
//         message: "A valid authenticated user is required",
//       });
//     }

//     const layer = await SocialDesignLayer.findOne({
//       _id: req.params.id,
//       isActive: { $ne: false },
//       $or: [{ userId: null }, { userId }],
//     });

//     if (!layer) {
//       return res.status(404).json({
//         success: false,
//         message: "Design layer not found or inaccessible",
//       });
//     }

//     const user = await User.findById(userId);

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     user.socialDesignPreferences =
//       user.socialDesignPreferences || {};

//     user.socialDesignPreferences.defaultLayerId = layer._id;
//     user.socialDesignPreferences.defaultShowMLS =
//       Boolean(layer.showMLS);

//     await user.save();

//     return res.json({
//       success: true,
//       message: "Design layer selected",
//       layer: serializeLayer(layer),
//       preferences: {
//         defaultLayerId: layer._id,
//         defaultShowMLS: Boolean(layer.showMLS),
//       },
//     });
//   } catch (error) {
//     console.error("SELECT DESIGN LAYER ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to select design layer",
//     });
//   }
// });

// // ============================================================
// // DELETE DESIGN LAYER
// // ============================================================

// router.delete("/design-layers/:id", async (req, res) => {
//   try {
//     if (!isValidObjectId(req.params.id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid design layer ID",
//       });
//     }

//     const layer = await SocialDesignLayer.findById(req.params.id);

//     if (!layer) {
//       return res.status(404).json({
//         success: false,
//         message: "Design layer not found",
//       });
//     }

//     if (!layerIsAccessibleToUser(layer, getRequestUserId(req))) {
//       return res.status(403).json({
//         success: false,
//         message: "You cannot delete this design layer",
//       });
//     }

//     if (
//       layer.name === DEFAULT_LAYER_NAME ||
//       (layer.isDefault && !layer.userId)
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "The system default design layer cannot be deleted",
//       });
//     }

//     await SocialDesignLayer.findByIdAndDelete(layer._id);

//     // Remove dangling preference references, if the model supports them.
//     await User.updateMany(
//       { "socialDesignPreferences.defaultLayerId": layer._id },
//       {
//         $set: {
//           "socialDesignPreferences.defaultLayerId": null,
//         },
//       }
//     );

//     return res.json({
//       success: true,
//       message: "Design layer deleted successfully",
//     });
//   } catch (error) {
//     console.error("DELETE DESIGN LAYER ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to delete design layer",
//     });
//   }
// });

// // ============================================================
// // GET DESIGN PREFERENCES
// // ============================================================

// async function getDesignPreferences(req, res) {
//   try {
//     const defaultLayer = await getOrCreateDefaultLayer();

//     const userId = getRequestUserId(req);

//     let defaultLayerId = defaultLayer._id;
//     let defaultShowMLS = Boolean(defaultLayer.showMLS);

//     if (userId) {
//       const user = await User.findById(userId).select(
//         "socialDesignPreferences"
//       );

//       if (user?.socialDesignPreferences) {
//         const preferences = user.socialDesignPreferences;

//         if (preferences.defaultLayerId) {
//           const preferredLayer = await SocialDesignLayer.findOne({
//             _id: preferences.defaultLayerId,
//             isActive: { $ne: false },
//             $or: [{ userId: null }, { userId }],
//           });

//           if (preferredLayer) {
//             defaultLayerId = preferredLayer._id;
//           }
//         }

//         if (preferences.defaultShowMLS !== undefined) {
//           defaultShowMLS = Boolean(preferences.defaultShowMLS);
//         } else if (preferences.defaultLayerId) {
//           const preferredLayer = await SocialDesignLayer.findById(
//             preferences.defaultLayerId
//           ).select("showMLS");

//           if (preferredLayer) {
//             defaultShowMLS = Boolean(preferredLayer.showMLS);
//           }
//         }
//       }
//     }

//     return res.json({
//       success: true,
//       preferences: {
//         defaultLayerId,
//         defaultShowMLS,
//       },
//     });
//   } catch (error) {
//     console.error("GET DESIGN PREFERENCES ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to load design preferences",
//     });
//   }
// }

// router.get("/design-layers/preferences", getDesignPreferences);
// router.get("/design-preferences", getDesignPreferences);

// // ============================================================
// // SAVE DESIGN PREFERENCES
// // Supports both POST and PUT.
// // ============================================================

// async function saveDesignPreferences(req, res) {
//   try {
//     const { defaultLayerId, defaultShowMLS } = req.body || {};
//     const userId = getRequestUserId(req);

//     if (!userId) {
//       return res.status(401).json({
//         success: false,
//         message: "A valid authenticated user is required",
//       });
//     }

//     const user = await User.findById(userId);

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     user.socialDesignPreferences =
//       user.socialDesignPreferences || {};

//     if (defaultLayerId !== undefined) {
//       if (defaultLayerId && !isValidObjectId(defaultLayerId)) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid default layer ID",
//         });
//       }

//       if (defaultLayerId) {
//         const layer = await SocialDesignLayer.findOne({
//           _id: defaultLayerId,
//           isActive: { $ne: false },
//           $or: [{ userId: null }, { userId }],
//         });

//         if (!layer) {
//           return res.status(404).json({
//             success: false,
//             message: "Selected design layer not found or inaccessible",
//           });
//         }
//       }

//       user.socialDesignPreferences.defaultLayerId =
//         defaultLayerId || null;
//     }

//     if (defaultShowMLS !== undefined) {
//       user.socialDesignPreferences.defaultShowMLS =
//         parseBoolean(defaultShowMLS, true);
//     }

//     await user.save();

//     return res.json({
//       success: true,
//       message: "Design preferences saved",
//       preferences: {
//         defaultLayerId:
//           user.socialDesignPreferences.defaultLayerId || null,
//         defaultShowMLS:
//           user.socialDesignPreferences.defaultShowMLS !== false,
//       },
//     });
//   } catch (error) {
//     console.error("SAVE DESIGN PREFERENCES ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to save design preferences",
//     });
//   }
// }

// router.put("/design-layers/preferences", saveDesignPreferences);
// router.post("/design-layers/preferences", saveDesignPreferences);
// router.put("/design-preferences", saveDesignPreferences);
// router.post("/design-preferences", saveDesignPreferences);


// // ============================================================
// // ANALYZE DESIGN REFERENCE
// // ============================================================

// router.post(
//   "/analyze-design",
//   upload.single("referenceImage"),
//   async (req, res) => {
//     try {
//       if (!req.file) {
//         return res.status(400).json({
//           success: false,
//           message: "Reference image is required",
//         });
//       }

//       const referenceBuffer = await readUploadedImage(req.file);
//       const referenceMimeType = getSafeMimeType(req.file.mimetype);

//       const prompt = await analyzeDesignReference(
//         referenceBuffer,
//         referenceMimeType
//       );

//       return res.json({
//         success: true,
//         prompt,
//         model: DESIGN_ANALYSIS_MODEL,
//       });
//     } catch (error) {
//       console.error(
//         "AI DESIGN ANALYSIS ERROR:",
//         error?.response?.data || error?.message || error
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           error?.response?.data?.message ||
//           error?.message ||
//           "Failed to analyze design reference",
//       });
//     } finally {
//       await deleteTempFile(req.file?.path);
//     }
//   }
// );

// // ============================================================
// // GENERATE AI DESIGN IMAGE
// // ============================================================

// async function generateAIDesignImage({
//   referenceBuffer,
//   referenceMimeType,
//   propertyBuffer,
//   propertyMimeType = "image/jpeg",
//   designPrompt,
//   property,
//   userPrompt,
// }) {
//   if (!propertyBuffer) {
//     throw new Error(
//       "A property/source image is required for AI image generation."
//     );
//   }

//   if (!designPrompt && !userPrompt) {
//     throw new Error("Design prompt is required.");
//   }

//   const aspectRatio = "4:5";

//   const propertyBase64 = (
//     await sharp(propertyBuffer)
//       .rotate()
//       .jpeg({ quality: 94, mozjpeg: true })
//       .toBuffer()
//   ).toString("base64");

//   const propertyFacts = `
// VERIFIED PROPERTY INFORMATION:
// Address: ${property?.UnparsedAddress || "Not provided"}
// MLS: ${property?.ListingKey || property?.ListingId || "Not provided"}
// Price: ${property?.ListPrice || "Not provided"}
// Property Type: ${property?.PropertyType || "Not provided"}
// Architectural Style: ${property?.ArchitecturalStyle || "Not provided"}
// City: ${property?.City || "Not provided"}
// Community: ${property?.SubdivisionName || "Not provided"}
// Bedrooms: ${property?.BedroomsTotal || "Not provided"}
// Bathrooms: ${property?.BathroomsTotalInteger || "Not provided"}
// Garage: ${property?.GarageSpaces || "Not provided"}
// Building Area: ${property?.BuildingAreaTotal || "Not provided"}
// Living Area: ${property?.LivingArea || "Not provided"}
// Year Built: ${property?.YearBuilt || "Not provided"}
// `;

//   const referenceSection = referenceBuffer
//     ? `
// IMAGE 2 = DESIGN REFERENCE.
// IMAGE 2 is ONLY a visual design/style reference.
// Do NOT copy the property or house from IMAGE 2.
// Do NOT replace the source property with IMAGE 2.
// Apply only its reusable visual language.
// `
//     : `
// NO DESIGN REFERENCE IMAGE WAS PROVIDED.
// Create a premium visual treatment based on the user's
// design instructions and the verified property image.
// `;

//   const finalPrompt = `
// You are creating a premium professional real-estate
// architectural marketing image for RealtorParth.

// IMAGE 1 = ACTUAL PROPERTY SOURCE IMAGE.
// IMAGE 1 is the source of truth for the actual property.

// ${referenceSection}

// PRESERVE THE ACTUAL PROPERTY:
// - Roof
// - Windows
// - Doors
// - Garage
// - Porch
// - Balconies
// - Siding
// - Facade
// - Building proportions
// - Landscaping
// - Driveway
// - Surrounding context
// - Camera perspective

// Do not replace the property or create a different house.
// Do not invent architecture.
// Do not turn the property into a cartoon or 3D render.
// Keep the property photorealistic.

// If the design asks for architectural lines, blueprint-style overlays,
// CAD overlays, elevation lines, section lines, dimension lines,
// callouts, roof tracing, window tracing, door tracing, or wall tracing,
// those elements MUST follow the actual source property.

// Do not copy dimensions from a reference image.
// Never fabricate measurements.
// If verified numerical dimensions are unavailable, use non-numeric
// technical guide lines instead.

// USER DESIGN INSTRUCTIONS:
// ${userPrompt || ""}

// ANALYZED DESIGN STYLE:
// ${designPrompt || ""}

// VERIFIED PROPERTY INFORMATION:
// ${propertyFacts}

// Create ONE professional portrait real-estate image.
// Aspect ratio: 4:5.

// Do not create REALTOR branding, REALTOR logo, Diamond Realty logo,
// agent name, phone number, brokerage, price card, contact card,
// MLS card, footer, or fake statistics.
// Those are handled separately by the application layer.

// Generate ONLY the clean AI property/design image.
// `;

//   console.log("AI DESIGN IMAGE GENERATION");
//   console.log("MODEL:", DESIGN_IMAGE_MODEL);
//   console.log("REFERENCE:", referenceBuffer ? "YES" : "NO");
//   console.log("MLS PROPERTY:", property ? "YES" : "NO");

//   const input = [
//     {
//       type: "image",
//       mime_type: propertyMimeType,
//       data: propertyBase64,
//     },
//   ];

//   if (referenceBuffer) {
//     input.push({
//       type: "image",
//       mime_type: referenceMimeType || "image/jpeg",
//       data: referenceBuffer.toString("base64"),
//     });
//   }

//   input.push({
//     type: "text",
//     text: finalPrompt,
//   });

//   const interaction = await ai.interactions.create({
//     model: DESIGN_IMAGE_MODEL,
//     input,
//     response_format: {
//       type: "image",
//       aspect_ratio: aspectRatio,
//       image_size: "2K",
//     },
//   });

//   const generatedImageBuffer = extractInteractionImage(interaction);

//   if (!generatedImageBuffer) {
//     console.error(
//       "Gemini returned no image:",
//       JSON.stringify(interaction, null, 2)
//     );

//     throw new Error("Gemini did not return a generated image");
//   }

//   const cleanGeneratedImage = await sharp(generatedImageBuffer)
//     .rotate()
//     .resize(1080, 1350, {
//       fit: "cover",
//       position: "center",
//     })
//     .png()
//     .toBuffer();

//   return {
//     imageBuffer: cleanGeneratedImage,
//     aspectRatio,
//     model: DESIGN_IMAGE_MODEL,
//     width: 1080,
//     height: 1350,
//   };
// }

// // ============================================================
// // GENERATE AI DESIGN
// // ============================================================

// router.post(
//   "/generate-design",
//   upload.single("referenceImage"),
//   async (req, res) => {
//     try {
//       const {
//         mls,
//         prompt,
//         layerId,
//         showMLS,
//         brandingMode,
//         userPrompt,
//       } = req.body || {};

//       const cleanMLS =
//         typeof mls === "string" ? mls.trim() : "";

//       const cleanPrompt =
//         typeof prompt === "string" ? prompt.trim() : "";

//       const cleanUserPrompt =
//         typeof userPrompt === "string" ? userPrompt.trim() : "";

//       const cleanBrandingMode =
//         normalizeBrandingMode(brandingMode);

//       const shouldShowMLS = parseBoolean(showMLS, true);

//       if (!cleanPrompt && !cleanUserPrompt) {
//         return res.status(400).json({
//           success: false,
//           message: "Please provide AI design instructions.",
//         });
//       }

//       if (
//         cleanBrandingMode === "saved" &&
//         (!layerId ||
//           ["default", "minimal", "none"].includes(String(layerId)))
//       ) {
//         return res.status(400).json({
//           success: false,
//           message: "Please select a saved design layer.",
//         });
//       }

//       const userId = getRequestUserId(req);

//       let property = null;
//       let propertyImageBuffer = null;
//       let propertyImageUrl = null;

//       // --------------------------------------------------------
//       // MLS PROPERTY SOURCE
//       // --------------------------------------------------------

//       if (cleanMLS) {
//         const propertyResponse = await axios.get(
//           `https://realtorparth.ca/api/properties/analysis/${encodeURIComponent(cleanMLS)}`,
//           { timeout: 30000 }
//         );

//         property = propertyResponse.data?.property;

//         if (!property) {
//           return res.status(404).json({
//             success: false,
//             message: "Property not found for the provided MLS number.",
//           });
//         }

//         const province =
//           property.StateOrProvince || property.Province || "";

//         if (
//           province &&
//           !["ab", "alberta"].includes(
//             String(province).toLowerCase()
//           )
//         ) {
//           return res.status(400).json({
//             success: false,
//             message: "Only Alberta properties are supported.",
//           });
//         }

//         const source = await getPropertyImageBuffer(property, 0);

//         propertyImageBuffer = source.buffer;
//         propertyImageUrl = source.imageUrl;
//       } else {
//         // ------------------------------------------------------
//         // UPLOADED SOURCE IMAGE
//         // ------------------------------------------------------

//         if (!req.file) {
//           return res.status(400).json({
//             success: false,
//             message:
//               "MLS is optional, but when MLS is empty you must provide a reference/source image.",
//           });
//         }

//         propertyImageBuffer = await readUploadedImage(req.file);

//         property = {
//           UnparsedAddress: "",
//           ListingId: "",
//           ListingKey: "",
//           ListPrice: "",
//           PropertyType: "",
//           ArchitecturalStyle: "",
//           City: "",
//           SubdivisionName: "",
//           BedroomsTotal: "",
//           BathroomsTotalInteger: "",
//           GarageSpaces: "",
//           BuildingAreaTotal: "",
//           LivingArea: "",
//           YearBuilt: "",
//           PublicRemarks: "",
//           Media: [],
//         };
//       }

//       // --------------------------------------------------------
//       // CAPTION
//       // --------------------------------------------------------

//       let caption = "";

//       if (cleanMLS) {
//         const preview = await generatePropertyPost(property);
//         caption = preview.caption;
//       } else {
//         caption = await generateSocialContent(
//           cleanUserPrompt || cleanPrompt
//         );
//       }

//       // --------------------------------------------------------
//       // DESIGN REFERENCE IMAGE
//       // --------------------------------------------------------

//       let referenceBuffer = null;
//       let referenceMimeType = null;

//       if (req.file) {
//         referenceBuffer = await readUploadedImage(req.file);
//         referenceMimeType = getSafeMimeType(req.file.mimetype);
//       }

//       // --------------------------------------------------------
//       // GENERATE CLEAN PROPERTY IMAGE
//       // --------------------------------------------------------

//       const generated = await generateAIDesignImage({
//         referenceBuffer,
//         referenceMimeType,
//         propertyBuffer: propertyImageBuffer,
//         propertyMimeType: "image/jpeg",
//         designPrompt: cleanPrompt,
//         userPrompt: cleanUserPrompt,
//         property,
//       });

//       // --------------------------------------------------------
//       // RESOLVE BRANDING LAYER
//       // --------------------------------------------------------

//       let selectedLayer = null;
//       let generatedLayer = null;

//       if (cleanBrandingMode === "default") {
//         selectedLayer = await getLayerByIdOrDefault(null, userId);
//       } else if (cleanBrandingMode === "saved") {
//         selectedLayer = await getLayerByIdOrDefault(layerId, userId);
//       } else if (cleanBrandingMode === "ai") {
//         const layerDefinition = await generateAILayer({
//           property,
//           designPrompt: cleanPrompt,
//           userPrompt: cleanUserPrompt,
//           showMLS: shouldShowMLS,
//         });

//         generatedLayer = await saveGeneratedAILayer({
//           layerDefinition,
//           userId,
//         });

//         selectedLayer = generatedLayer;

//         if (!selectedLayer) {
//           throw new Error("Failed to save generated AI design layer");
//         }
//       }

//       // --------------------------------------------------------
//       // FINAL IMAGE
//       // --------------------------------------------------------

//       const finalImageBuffer = await applyDesignLayer({
//         baseImage: generated.imageBuffer,
//         property,
//         layer: selectedLayer,
//         showMLS: shouldShowMLS,
//         includeRealtorLogo: cleanBrandingMode !== "none",
//       });

//       const fileName =
//         `ai-design-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;

//       const outputPath = path.join(IMAGE_DIR, fileName);

//       await fs.promises.writeFile(outputPath, finalImageBuffer);

//       const imageURL =
//         `https://realtorparth.ca/social-images/${fileName}`;

//       const profile = selectedLayer
//         ? getEffectiveLayerProfile(selectedLayer)
//         : null;

//       const topic =
//         property?.UnparsedAddress ||
//         cleanMLS ||
//         cleanUserPrompt ||
//         cleanPrompt ||
//         "AI Real Estate Design";

//       return res.json({
//         success: true,
//         topic,
//         caption,
//         imageURL,
//         property: cleanMLS ? property : null,
//         prompt: cleanPrompt || cleanUserPrompt,
//         aspectRatio: generated.aspectRatio,
//         model: generated.model,
//         sourcePropertyImage: propertyImageUrl,
//         sourceType: cleanMLS ? "mls" : "uploaded-image",
//         brandingMode: cleanBrandingMode,
//         layerId: selectedLayer?._id || null,
//         layerName: selectedLayer?.name || null,
//         layer: selectedLayer ? serializeLayer(selectedLayer) : null,
//         generatedLayer: generatedLayer
//           ? serializeLayer(generatedLayer)
//           : null,
//         layerProfile: profile,
//         showMLS: shouldShowMLS,
//         mls: cleanMLS || null,
//       });
//     } catch (error) {
//       console.error(
//         "AI DESIGN GENERATION ERROR:",
//         error?.response?.data || error?.message || error
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           error?.response?.data?.message ||
//           error?.message ||
//           "Failed to generate AI property design",
//       });
//     } finally {
//       await deleteTempFile(req.file?.path);
//     }
//   }
// );

// // ============================================================
// // GENERATE NORMAL PROPERTY POST
// // ============================================================

// router.post("/generate-property", async (req, res) => {
//   try {
//     const { mls } = req.body || {};

//     if (!mls || typeof mls !== "string") {
//       return res.status(400).json({
//         success: false,
//         message: "MLS number is required",
//       });
//     }

//     const cleanMLS = mls.trim();

//     const propertyResponse = await axios.get(
//       `https://realtorparth.ca/api/properties/analysis/${encodeURIComponent(cleanMLS)}`,
//       { timeout: 30000 }
//     );

//     const property = propertyResponse.data?.property;

//     if (!property) {
//       return res.status(404).json({
//         success: false,
//         message: "Property not found",
//       });
//     }

//     const province =
//       property.StateOrProvince || property.Province || "";

//     if (
//       province &&
//       !["ab", "alberta"].includes(
//         String(province).toLowerCase()
//       )
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Only Alberta properties are supported",
//       });
//     }

//     const preview = await generatePropertyPost(property);
//     const { imageURL } = await generatePropertyImage(property, 0);

//     return res.json({
//       success: true,
//       topic: property.UnparsedAddress,
//       caption: preview.caption,
//       imageURL,
//       property,
//     });
//   } catch (error) {
//     console.error(
//       "PROPERTY SOCIAL POST ERROR:",
//       error?.response?.data || error?.message || error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         error?.response?.data?.message ||
//         error?.message ||
//         "Failed to generate property social post",
//     });
//   }
// });

// // ============================================================
// // GENERATE TOPIC POST
// // ============================================================

// router.post("/generate", async (req, res) => {
//   try {
//     const { topic } = req.body || {};

//     if (!topic || !String(topic).trim()) {
//       return res.status(400).json({
//         success: false,
//         message: "Topic is required",
//       });
//     }

//     const caption = await generateSocialContent(String(topic).trim());
//     const { imageURL } = await generateImage(String(topic).trim());

//     return res.json({
//       success: true,
//       topic: String(topic).trim(),
//       caption,
//       imageURL,
//     });
//   } catch (error) {
//     console.error(
//       "SOCIAL API ERROR:",
//       error?.response?.data || error?.message || error
//     );

//     return res.status(500).json({
//       success: false,
//       message: "Failed to generate social post",
//     });
//   }
// });

// // ============================================================
// // UPLOAD SOCIAL IMAGES
// // ============================================================

// router.post(
//   "/upload-social-images",
//   upload.array("images", 10),
//   async (req, res) => {
//     try {
//       const files = req.files;

//       if (!files || !files.length) {
//         return res.status(400).json({
//           success: false,
//           message: "No images uploaded",
//         });
//       }

//       const urls = files.map(
//         (file) =>
//           `https://realtorparth.ca/social-images/${file.filename}`
//       );

//       return res.json({
//         success: true,
//         imageURLs: urls,
//         urls,
//       });
//     } catch (error) {
//       console.error("UPLOAD ERROR:", error);

//       return res.status(500).json({
//         success: false,
//         message: "Failed to upload images",
//       });
//     }
//   }
// );


// // ============================================================
// // PART 5 — SOCIAL POST MANAGEMENT & PLATFORM ROUTES
// // Append after Part 4.
// // ============================================================

// // ============================================================
// // HELPERS
// // ============================================================

// function normalizePostPlatforms(platforms) {
//   if (!platforms) return [];

//   const values = Array.isArray(platforms)
//     ? platforms
//     : [platforms];

//   return [...new Set(
//     values
//       .map((value) => String(value).trim().toLowerCase())
//       .filter((value) =>
//         ["facebook", "instagram"].includes(value)
//       )
//   )];
// }

// function normalizeImageList(images) {
//   if (!images) return [];

//   const values = Array.isArray(images) ? images : [images];

//   return values
//     .map((image) => {
//       if (typeof image === "string") return image;

//       if (image && typeof image === "object") {
//         return (
//           image.url ||
//           image.imageURL ||
//           image.src ||
//           ""
//         );
//       }

//       return "";
//     })
//     .filter(Boolean);
// }

// function serializeSocialPost(post) {
//   const value =
//     typeof post?.toObject === "function"
//       ? post.toObject()
//       : post;

//   return {
//     ...value,
//     id: String(value._id || value.id || ""),
//     images: normalizeImageList(value.images),
//     platforms: normalizePostPlatforms(value.platforms),
//   };
// }

// async function findSocialPostById(id) {
//   if (!isValidObjectId(id)) return null;

//   return ScheduledSocialPost.findById(id);
// }

// function getSocialPostIds(post) {
//   const value = post?.socialPostIds;

//   if (!value) return {};

//   if (value instanceof Map) {
//     return Object.fromEntries(value.entries());
//   }

//   if (typeof value === "object" && !Array.isArray(value)) {
//     return { ...value };
//   }

//   return {};
// }

// // ============================================================
// // POSTS WITH REPLIED COMMENTS
// // ============================================================

// router.get("/posted-comment-posts", async (req, res) => {
//   try {
//     const posts = await ScheduledSocialPost.find({})
//       .sort({ publishDate: -1, createdAt: -1 })
//       .lean();

//     const results = posts.filter((post) => {
//       const ids = getSocialPostIds(post);

//       return Boolean(
//         ids.facebook ||
//         ids.instagram ||
//         ids.facebookPostId ||
//         ids.instagramPostId
//       );
//     });

//     return res.json({
//       success: true,
//       posts: results.map(serializeSocialPost),
//     });
//   } catch (error) {
//     console.error("POSTED COMMENT POSTS ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to retrieve posted social posts",
//     });
//   }
// });

// // ============================================================
// // CHECK WHETHER A POST EXISTS
// // ============================================================

// router.post("/check", async (req, res) => {
//   try {
//     const { topic, caption, publishDate } = req.body || {};

//     const query = {};

//     if (topic) query.topic = String(topic).trim();
//     if (caption) query.caption = String(caption).trim();
//     if (publishDate) {
//       const date = new Date(publishDate);

//       if (!Number.isNaN(date.getTime())) {
//         query.publishDate = date;
//       }
//     }

//     if (!Object.keys(query).length) {
//       return res.status(400).json({
//         success: false,
//         message: "Provide a topic, caption, or publish date to check",
//       });
//     }

//     const post = await ScheduledSocialPost.findOne(query).lean();

//     return res.json({
//       success: true,
//       exists: Boolean(post),
//       post: post ? serializeSocialPost(post) : null,
//     });
//   } catch (error) {
//     console.error("SOCIAL POST CHECK ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to check social post",
//     });
//   }
// });

// // ============================================================
// // SAVE SOCIAL POST
// // ============================================================

// router.post("/save", async (req, res) => {
//   try {
//     const {
//       topic,
//       caption,
//       images,
//       imageURL,
//       platforms,
//       publishDate,
//       status,
//       socialPostIds,
//       ...additionalFields
//     } = req.body || {};

//     if (!topic || !String(topic).trim()) {
//       return res.status(400).json({
//         success: false,
//         message: "Topic is required",
//       });
//     }

//     const cleanImages = normalizeImageList(
//       images || imageURL
//     );

//     const cleanPlatforms = normalizePostPlatforms(platforms);

//     const post = await ScheduledSocialPost.create({
//       topic: String(topic).trim(),
//       caption: caption || "",
//       images: cleanImages,
//       platforms: cleanPlatforms,
//       publishDate: publishDate
//         ? new Date(publishDate)
//         : null,
//       status: status || "draft",
//       ...(socialPostIds ? { socialPostIds } : {}),
//       ...additionalFields,
//     });

//     return res.status(201).json({
//       success: true,
//       message: "Social post saved successfully",
//       post: serializeSocialPost(post),
//     });
//   } catch (error) {
//     console.error("SAVE SOCIAL POST ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to save social post",
//     });
//   }
// });

// // ============================================================
// // SAVE FACEBOOK / INSTAGRAM POST IDS
// // ============================================================

// router.post("/save-platform-post-id", async (req, res) => {
//   try {
//     const {
//       id,
//       postId,
//       platform,
//       platformPostId,
//       facebookPostId,
//       instagramPostId,
//     } = req.body || {};

//     const documentId = id || postId;

//     if (!documentId || !isValidObjectId(documentId)) {
//       return res.status(400).json({
//         success: false,
//         message: "A valid social post ID is required",
//       });
//     }

//     const post = await ScheduledSocialPost.findById(documentId);

//     if (!post) {
//       return res.status(404).json({
//         success: false,
//         message: "Social post not found",
//       });
//     }

//     const ids = getSocialPostIds(post);

//     if (facebookPostId) {
//       ids.facebook = String(facebookPostId);
//     }

//     if (instagramPostId) {
//       ids.instagram = String(instagramPostId);
//     }

//     if (platform && platformPostId) {
//       const key = String(platform).toLowerCase();

//       if (!["facebook", "instagram"].includes(key)) {
//         return res.status(400).json({
//           success: false,
//           message: "Platform must be facebook or instagram",
//         });
//       }

//       ids[key] = String(platformPostId);
//     }

//     post.socialPostIds = ids;
//     await post.save();

//     return res.json({
//       success: true,
//       message: "Platform post IDs saved successfully",
//       post: serializeSocialPost(post),
//     });
//   } catch (error) {
//     console.error("SAVE PLATFORM POST ID ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to save platform post IDs",
//     });
//   }
// });

// // ============================================================
// // SCHEDULE SOCIAL POST
// // ============================================================

// router.post("/schedule", async (req, res) => {
//   try {
//     const {
//       id,
//       topic,
//       caption,
//       images,
//       imageURL,
//       platforms,
//       publishDate,
//       ...additionalFields
//     } = req.body || {};

//     if (!publishDate) {
//       return res.status(400).json({
//         success: false,
//         message: "Publish date is required",
//       });
//     }

//     const scheduledDate = new Date(publishDate);

//     if (Number.isNaN(scheduledDate.getTime())) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid publish date",
//       });
//     }

//     if (scheduledDate.getTime() <= Date.now()) {
//       return res.status(400).json({
//         success: false,
//         message: "Publish date must be in the future",
//       });
//     }

//     const cleanPlatforms = normalizePostPlatforms(platforms);

//     if (!cleanPlatforms.length) {
//       return res.status(400).json({
//         success: false,
//         message: "Select at least one supported platform",
//       });
//     }

//     const cleanImages = normalizeImageList(
//       images || imageURL
//     );

//     if (!cleanImages.length) {
//       return res.status(400).json({
//         success: false,
//         message: "At least one image is required",
//       });
//     }

//     let post;

//     if (id) {
//       if (!isValidObjectId(id)) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid social post ID",
//         });
//       }

//       post = await ScheduledSocialPost.findById(id);

//       if (!post) {
//         return res.status(404).json({
//           success: false,
//           message: "Social post not found",
//         });
//       }

//       if (post.status === "published") {
//         return res.status(400).json({
//           success: false,
//           message: "A published post cannot be rescheduled here",
//         });
//       }

//       post.topic = topic ?? post.topic;
//       post.caption = caption ?? post.caption;
//       post.images = cleanImages;
//       post.platforms = cleanPlatforms;
//       post.publishDate = scheduledDate;
//       post.status = "scheduled";
//     } else {
//       post = new ScheduledSocialPost({
//         topic: topic || "Social Media Post",
//         caption: caption || "",
//         images: cleanImages,
//         platforms: cleanPlatforms,
//         publishDate: scheduledDate,
//         status: "scheduled",
//         ...additionalFields,
//       });
//     }

//     await post.save();

//     return res.status(201).json({
//       success: true,
//       message: "Social post scheduled successfully",
//       post: serializeSocialPost(post),
//     });
//   } catch (error) {
//     console.error("SCHEDULE SOCIAL POST ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to schedule social post",
//     });
//   }
// });

// // ============================================================
// // INSTAGRAM STATUS UPDATE
// // ============================================================

// router.post("/update-instagram-status", async (req, res) => {
//   try {
//     const { id, status, instagramPostId } = req.body || {};

//     if (!id || !isValidObjectId(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "A valid social post ID is required",
//       });
//     }

//     const post = await ScheduledSocialPost.findById(id);

//     if (!post) {
//       return res.status(404).json({
//         success: false,
//         message: "Social post not found",
//       });
//     }

//     if (status) post.status = status;

//     if (instagramPostId) {
//       const ids = getSocialPostIds(post);
//       ids.instagram = String(instagramPostId);
//       post.socialPostIds = ids;
//     }

//     await post.save();

//     return res.json({
//       success: true,
//       message: "Instagram post status updated",
//       post: serializeSocialPost(post),
//     });
//   } catch (error) {
//     console.error("INSTAGRAM STATUS UPDATE ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to update Instagram status",
//     });
//   }
// });

// // ============================================================
// // GET INSTAGRAM POSTS
// // ============================================================

// router.get("/instagram-posts", async (req, res) => {
//   try {
//     const posts = await ScheduledSocialPost.find({})
//       .sort({ publishDate: -1, createdAt: -1 })
//       .lean();

//     const instagramPosts = posts.filter((post) => {
//       const ids = getSocialPostIds(post);

//       return (
//         normalizePostPlatforms(post.platforms).includes("instagram") ||
//         Boolean(ids.instagram || ids.instagramPostId)
//       );
//     });

//     return res.json({
//       success: true,
//       posts: instagramPosts.map(serializeSocialPost),
//     });
//   } catch (error) {
//     console.error("GET INSTAGRAM POSTS ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to retrieve Instagram posts",
//     });
//   }
// });

// // ============================================================
// // FACEBOOK STATUS UPDATE
// // ============================================================

// router.post("/update-facebook-status", async (req, res) => {
//   try {
//     const { id, status, facebookPostId } = req.body || {};

//     if (!id || !isValidObjectId(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "A valid social post ID is required",
//       });
//     }

//     const post = await ScheduledSocialPost.findById(id);

//     if (!post) {
//       return res.status(404).json({
//         success: false,
//         message: "Social post not found",
//       });
//     }

//     if (status) post.status = status;

//     if (facebookPostId) {
//       const ids = getSocialPostIds(post);
//       ids.facebook = String(facebookPostId);
//       post.socialPostIds = ids;
//     }

//     await post.save();

//     return res.json({
//       success: true,
//       message: "Facebook post status updated",
//       post: serializeSocialPost(post),
//     });
//   } catch (error) {
//     console.error("FACEBOOK STATUS UPDATE ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to update Facebook status",
//     });
//   }
// });

// // ============================================================
// // GET FACEBOOK POSTS
// // ============================================================

// router.get("/facebook-posts", async (req, res) => {
//   try {
//     const posts = await ScheduledSocialPost.find({})
//       .sort({ publishDate: -1, createdAt: -1 })
//       .lean();

//     const facebookPosts = posts.filter((post) => {
//       const ids = getSocialPostIds(post);

//       return (
//         normalizePostPlatforms(post.platforms).includes("facebook") ||
//         Boolean(ids.facebook || ids.facebookPostId)
//       );
//     });

//     return res.json({
//       success: true,
//       posts: facebookPosts.map(serializeSocialPost),
//     });
//   } catch (error) {
//     console.error("GET FACEBOOK POSTS ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to retrieve Facebook posts",
//     });
//   }
// });

// // ============================================================
// // IMPORT FACEBOOK POSTS
// // ============================================================

// router.post("/import-facebook-posts", async (req, res) => {
//   try {
//     const { posts } = req.body || {};

//     if (!Array.isArray(posts) || !posts.length) {
//       return res.status(400).json({
//         success: false,
//         message: "Provide an array of Facebook posts to import",
//       });
//     }

//     const imported = [];
//     const skipped = [];

//     for (const item of posts) {
//       const facebookPostId =
//         item?.facebookPostId ||
//         item?.postId ||
//         item?.id;

//       if (!facebookPostId) {
//         skipped.push({
//           reason: "Missing Facebook post ID",
//         });
//         continue;
//       }

//       const existing = await ScheduledSocialPost.findOne({
//         "socialPostIds.facebook": String(facebookPostId),
//       });

//       if (existing) {
//         skipped.push({
//           facebookPostId,
//           reason: "Already imported",
//         });
//         continue;
//       }

//       const ids = {
//         facebook: String(facebookPostId),
//       };

//       const post = await ScheduledSocialPost.create({
//         topic: item.topic || item.message || "Facebook Post",
//         caption: item.caption || item.message || "",
//         images: normalizeImageList(
//           item.images || item.imageURL || item.full_picture
//         ),
//         platforms: ["facebook"],
//         publishDate: item.publishDate
//           ? new Date(item.publishDate)
//           : item.created_time
//             ? new Date(item.created_time)
//             : new Date(),
//         status: item.status || "published",
//         socialPostIds: ids,
//       });

//       imported.push(serializeSocialPost(post));
//     }

//     return res.json({
//       success: true,
//       message: "Facebook post import completed",
//       importedCount: imported.length,
//       skippedCount: skipped.length,
//       posts: imported,
//       skipped,
//     });
//   } catch (error) {
//     console.error("IMPORT FACEBOOK POSTS ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to import Facebook posts",
//     });
//   }
// });

// // ============================================================
// // GET SCHEDULED POSTS
// // ============================================================

// router.get("/scheduled", async (req, res) => {
//   try {
//     const posts = await ScheduledSocialPost.find({
//       status: "scheduled",
//     })
//       .sort({ publishDate: 1 })
//       .lean();

//     return res.json({
//       success: true,
//       posts: posts.map(serializeSocialPost),
//     });
//   } catch (error) {
//     console.error("GET SCHEDULED POSTS ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to retrieve scheduled posts",
//     });
//   }
// });

// // ============================================================
// // EDIT SOCIAL POST
// // ============================================================

// router.post("/edit/:id", async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!isValidObjectId(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid social post ID",
//       });
//     }

//     const post = await ScheduledSocialPost.findById(id);

//     if (!post) {
//       return res.status(404).json({
//         success: false,
//         message: "Social post not found",
//       });
//     }

//     if (post.status === "published") {
//       return res.status(400).json({
//         success: false,
//         message: "Published posts cannot be edited through this endpoint",
//       });
//     }

//     const {
//       topic,
//       caption,
//       images,
//       imageURL,
//       platforms,
//       publishDate,
//       status,
//     } = req.body || {};

//     if (topic !== undefined) post.topic = topic;
//     if (caption !== undefined) post.caption = caption;

//     if (images !== undefined || imageURL !== undefined) {
//       post.images = normalizeImageList(images || imageURL);
//     }

//     if (platforms !== undefined) {
//       post.platforms = normalizePostPlatforms(platforms);
//     }

//     if (publishDate !== undefined) {
//       const date = new Date(publishDate);

//       if (Number.isNaN(date.getTime())) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid publish date",
//         });
//       }

//       post.publishDate = date;
//     }

//     if (status !== undefined) post.status = status;

//     await post.save();

//     return res.json({
//       success: true,
//       message: "Social post updated successfully",
//       post: serializeSocialPost(post),
//     });
//   } catch (error) {
//     console.error("EDIT SOCIAL POST ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to edit social post",
//     });
//   }
// });

// // ============================================================
// // REMOVE SOCIAL POST
// // ============================================================

// router.post("/remove/:id", async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!isValidObjectId(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid social post ID",
//       });
//     }

//     const post = await ScheduledSocialPost.findByIdAndDelete(id);

//     if (!post) {
//       return res.status(404).json({
//         success: false,
//         message: "Social post not found",
//       });
//     }

//     return res.json({
//       success: true,
//       message: "Social post removed successfully",
//       id,
//     });
//   } catch (error) {
//     console.error("REMOVE SOCIAL POST ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to remove social post",
//     });
//   }
// });

// // ============================================================
// // DELETE SOCIAL POST
// // Keep parameterized routes near the end of the file.
// // ============================================================

// router.delete("/:id", async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!isValidObjectId(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid social post ID",
//       });
//     }

//     const post = await ScheduledSocialPost.findByIdAndDelete(id);

//     if (!post) {
//       return res.status(404).json({
//         success: false,
//         message: "Social post not found",
//       });
//     }

//     return res.json({
//       success: true,
//       message: "Social post deleted successfully",
//       id,
//     });
//   } catch (error) {
//     console.error("DELETE SOCIAL POST ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to delete social post",
//     });
//   }
// });

// // ============================================================
// // GET ONE SOCIAL POST
// // Must remain after the named routes above.
// // ============================================================

// router.get("/:id", async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!isValidObjectId(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid social post ID",
//       });
//     }

//     const post = await findSocialPostById(id);

//     if (!post) {
//       return res.status(404).json({
//         success: false,
//         message: "Social post not found",
//       });
//     }

//     return res.json({
//       success: true,
//       post: serializeSocialPost(post),
//     });
//   } catch (error) {
//     console.error("GET SOCIAL POST ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to retrieve social post",
//     });
//   }
// });

// // ============================================================
// // EXPORT ROUTER
// // ============================================================

// export default router;








































// import express from "express";
// import cors from "cors";
// import dotenv from "dotenv";
// import Groq from "groq-sdk";
// import axios from "axios";
// import multer from "multer";
// import path from "path";
// import fs from "fs";
// import { fileURLToPath } from "url";
// import { GoogleGenAI } from "@google/genai";
// import sharp from "sharp";

// import { generateImage } from "./social_manager.js";
// import ScheduledSocialPost from "../models/ScheduledSocialPost.js";

// const router = express.Router();

// // ============================================================
// // __dirname FIX
// // ============================================================

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // ============================================================
// // ENV
// // ============================================================

// const ENV_PATH = path.resolve(
//   __dirname,
//   "../../.env"
// );

// dotenv.config({
//   path: ENV_PATH,
// });

// const app = express();

// app.use(cors());
// app.use(express.json());

// // ============================================================
// // IMAGE DIRECTORY
// // ============================================================

// const IMAGE_DIR =
//   "/home/dhruvit/.openclaw/workspace/skills/blog_manager/images";

// if (!fs.existsSync(IMAGE_DIR)) {
//   fs.mkdirSync(IMAGE_DIR, {
//     recursive: true,
//   });
// }

// // ============================================================
// // MULTER STORAGE
// // ============================================================

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, IMAGE_DIR);
//   },

//   filename: (req, file, cb) => {
//     const uniqueName =
//       `upload-${Date.now()}-${Math.round(
//         Math.random() * 1e9
//       )}${path.extname(file.originalname)}`;

//     cb(null, uniqueName);
//   },
// });

// // ============================================================
// // FILE FILTER
// // ============================================================

// const fileFilter = (req, file, cb) => {
//   if (file.mimetype.startsWith("image/")) {
//     cb(null, true);
//   } else {
//     cb(
//       new Error("Only image files allowed"),
//       false
//     );
//   }
// };

// // ============================================================
// // MULTER
// // ============================================================

// const upload = multer({
//   storage,
//   fileFilter,

//   limits: {
//     fileSize: 10 * 1024 * 1024,
//   },
// });

// // ============================================================
// // WEBHOOK
// // ============================================================

// const MAKE_WEBHOOK_URL =
//   process.env.MAKE_WEBHOOK_URL;

// // ============================================================
// // GEMINI
// // ============================================================

// const ai = new GoogleGenAI({
//   apiKey: process.env.GEMINI_API_KEY,
// });

// // ============================================================
// // EXISTING GEMINI MODEL
// // ============================================================

// const MODEL = "gemini-2.5-flash";

// // ============================================================
// // AI DESIGN MODELS
// // ============================================================

// const DESIGN_ANALYSIS_MODEL =
//   "gemini-3.1-pro-preview";

// const DESIGN_IMAGE_MODEL =
//   "gemini-3.1-flash-image";

// // ============================================================
// // STARTUP LOG
// // ============================================================

// console.log(
//   "============================================================"
// );

// console.log(
//   "GEMINI DESIGN ANALYSIS MODEL:",
//   DESIGN_ANALYSIS_MODEL
// );

// console.log(
//   "GEMINI DESIGN IMAGE MODEL:",
//   DESIGN_IMAGE_MODEL
// );

// console.log(
//   "GEMINI ENV PATH:",
//   ENV_PATH
// );

// console.log(
//   "GEMINI API KEY:",
//   process.env.GEMINI_API_KEY
//     ? "LOADED"
//     : "MISSING"
// );

// console.log(
//   "============================================================"
// );

// // ============================================================
// // AI CONTENT
// // ============================================================

// async function generateSocialContent(topic) {
//   const prompt = `
// You are an expert Calgary and Airdrie real estate social media strategist.

// Create ONE unique Facebook and Instagram post.

// TOPIC:

// ${topic}

// TARGET AUDIENCE:

// - Home buyers
// - Home sellers
// - First-time buyers
// - Real estate investors
// - Alberta homeowners

// LOCATION FOCUS:

// - Calgary
// - Airdrie
// - Chestermere
// - Cochrane
// - Okotoks
// - High River
// - Strathmore

// WRITING STYLE:

// - Professional
// - Modern
// - Friendly
// - Trustworthy
// - Conversational
// - Persuasive
// - Easy to read

// CONTENT REQUIREMENTS:

// - 150-200 words
// - Start with a strong hook
// - Naturally use relevant emojis
// - Highlight benefits instead of features
// - Include a clear call-to-action
// - Generate different wording every time
// - Never copy previous responses
// - Mention Calgary or nearby communities naturally when relevant

// CONTACT INFORMATION

// Mention naturally:

// 📞 403-439-1555
// 🌐 www.realtorparth.ca
// ✉️ hello@realtorparth.ca

// RULES:

// - Never say "Free Consultation"
// - Instead use:
//   "Contact me for a consultation."
// - No markdown
// - No headings
// - No bullet points
// - No quotation marks
// - Plain text only

// HASHTAGS:

// Always include:

// #realtorparth

// Also include 6-10 relevant hashtags such as:

// #CalgaryRealEstate
// #AirdrieRealEstate
// #YYCRealEstate
// #CalgaryHomes
// #AirdrieHomes
// #AlbertaRealEstate
// #CalgaryRealtor
// #DreamHome
// #HomeBuying
// #HomeSelling

// Return ONLY the social media caption.
// `;

//   const response =
//     await ai.models.generateContent({
//       model: MODEL,
//       contents: prompt,
//     });

//   return (response.text || "")
//     .replace(/^caption\s*:/i, "")
//     .replace(/^post\s*:/i, "")
//     .replace(/\*\*/g, "")
//     .replace(/```/g, "")
//     .trim();
// }

// // ============================================================
// // GROQ
// // ============================================================

// const groq = new Groq({
//   apiKey: process.env.GROQ_API_KEY,
// });

// // ============================================================
// // GENERATE PROPERTY SOCIAL POST
// // ============================================================

// export async function generatePropertyPost(
//   property
// ) {
//   const prompt = `
// Create a Facebook and Instagram real estate post.

// PROPERTY INFORMATION:

// Address:
// ${property.UnparsedAddress || ""}

// MLS:
// ${property.ListingKey || property.ListingId || ""}

// Price:
// ${property.ListPrice || ""}

// Property Type:
// ${property.PropertyType || ""}

// Style:
// ${property.ArchitecturalStyle || ""}

// City:
// ${property.City || ""}

// Community:
// ${property.SubdivisionName || ""}

// Bedrooms:
// ${property.BedroomsTotal || ""}

// Bathrooms:
// ${property.BathroomsTotalInteger || ""}

// Garage:
// ${property.GarageSpaces || ""}

// Square Feet:
// ${property.BuildingAreaTotal || ""}

// Year Built:
// ${property.YearBuilt || ""}

// Description:
// ${property.PublicRemarks || ""}

// REQUIREMENTS:

// - 120-180 words
// - Professional
// - Modern
// - Friendly
// - Trustworthy
// - Conversational
// - Persuasive
// - Include relevant emojis naturally
// - Include a strong opening hook
// - Highlight the property's most appealing benefits
// - Include a clear call-to-action
// - Calgary/Airdrie focused
// - Generate a UNIQUE caption every time
// - Use different wording and hooks
// - Avoid repetitive sentence structures
// - Make the post feel natural and human-written

// CONTACT INFORMATION:

// Mention naturally:

// Ph: 403-439-1555

// www.realtorparth.ca

// hello@realtorparth.ca

// RULES:

// - Never say "Free Consultation"
// - Instead use:
//   "Contact me for a consultation."
// - Price must be written with $ followed by the number
// - No markdown
// - No headings
// - No bullet points
// - No quotation marks
// - Do not give an Open House date or time
// - Do not invent property information
// - Only use facts provided in the property information
// - Do not mention information that is not available
// - Do not say that you are an AI
// - Return ONLY the social media post

// HASHTAGS:

// Always include:

// #realtorparth

// Also include relevant real estate hashtags, such as:

// #CalgaryRealEstate
// #AirdrieRealEstate
// #YYCRealEstate
// #CalgaryHomes
// #AirdrieHomes
// #AlbertaRealEstate
// #CalgaryRealtor
// #DreamHome
// #HomeBuying
// #HomeSelling

// Return only post text.
// `;

//   try {
//     const response =
//       await ai.models.generateContent({
//         model: MODEL,
//         contents: prompt,

//         config: {
//           temperature: 1.2,
//         },
//       });

//     const caption = (response.text || "")
//       .replace(/^caption\s*:/i, "")
//       .replace(/^post\s*:/i, "")
//       .replace(/\*\*/g, "")
//       .replace(/```/g, "")
//       .trim();

//     if (!caption) {
//       throw new Error(
//         "Gemini returned an empty property caption"
//       );
//     }

//     return {
//       caption,
//       property,
//     };
//   } catch (error) {
//     console.error(
//       "GEMINI PROPERTY POST ERROR:",
//       error?.response?.data ||
//         error?.message ||
//         error
//     );

//     throw error;
//   }
// }

// // ============================================================
// // GET PROPERTY IMAGE BUFFER
// // ============================================================

// async function getPropertyImageBuffer(
//   property,
//   imageIndex = 0
// ) {
//   const sortedMedia =
//     property.Media?.sort(
//       (a, b) =>
//         (a.Order ?? 0) -
//         (b.Order ?? 0)
//     ) || [];

//   const imageMedia =
//     sortedMedia.filter((media) => {
//       const url =
//         media.MediaURL?.toLowerCase() || "";

//       return (
//         url.endsWith(".jpg") ||
//         url.endsWith(".jpeg") ||
//         url.endsWith(".png") ||
//         url.includes(
//           "ddfcdn.realtor.ca"
//         )
//       );
//     });

//   if (!imageMedia.length) {
//     throw new Error(
//       "No property images found in MLS listing"
//     );
//   }

//   const imageUrl =
//     imageMedia[
//       imageIndex % imageMedia.length
//     ]?.MediaURL;

//   if (!imageUrl) {
//     throw new Error(
//       "Property image not found"
//     );
//   }

//   console.log(
//     "📸 MLS SOURCE IMAGE:",
//     imageUrl
//   );

//   const response = await axios.get(
//     imageUrl,
//     {
//       responseType: "arraybuffer",
//       timeout: 30000,
//     }
//   );

//   return {
//     buffer: Buffer.from(response.data),
//     imageUrl,
//   };
// }

// // ============================================================
// // EXISTING PROPERTY IMAGE GENERATOR
// // ============================================================

// async function generatePropertyImage(
//   property,
//   imageIndex = 0
// ) {
//   const fileName =
//     `property-${Date.now()}.jpg`;

//   const outputDir =
//     IMAGE_DIR;

//   if (!fs.existsSync(outputDir)) {
//     fs.mkdirSync(outputDir, {
//       recursive: true,
//     });
//   }

//   const outputPath =
//     path.join(
//       outputDir,
//       fileName
//     );

//   const {
//     buffer: propertyImageBuffer,
//   } = await getPropertyImageBuffer(
//     property,
//     imageIndex
//   );

//   const price =
//     property.ListPrice
//       ? `$${Number(
//           property.ListPrice
//         ).toLocaleString()}`
//       : "Call for Price";

//   const beds =
//     property.BedroomsTotal || 0;

//   const baths =
//     property.BathroomsTotalInteger || 0;

//   const city =
//     property.City || "Calgary";

//   const address =
//     (property.UnparsedAddress || "")
//       .length > 38
//       ? property.UnparsedAddress.substring(
//           0,
//           38
//         ) + "..."
//       : property.UnparsedAddress || "";

//   const mls =
//     property.ListingId || "";

//   const sqft =
//     property.BuildingAreaTotal ||
//     property.LivingArea ||
//     "";

//   const propertyType =
//     property.PropertyType || "";

//   const realtorLogoPath =
//     path.join(
//       __dirname,
//       "assets/realtorparths_pdf",
//       "realtor_logo.svg"
//     );

//   const realtorLogoRaw =
//     await fs.promises.readFile(
//       realtorLogoPath,
//       "utf8"
//     );

//   const realtorLogoBase64 =
//     Buffer.from(
//       realtorLogoRaw
//     ).toString("base64");

//   const realtorLogoSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >
//       <image
//         href="data:image/svg+xml;base64,${realtorLogoBase64}"
//         x="55"
//         y="52"
//         width="190"
//         height="165"
//         opacity="0.35"
//         preserveAspectRatio="xMidYMid meet"
//       />
//     </svg>
//   `;

//   const addressBgSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <rect
//         x="285"
//         y="32"
//         width="647"
//         height="205"
//         rx="18"
//         ry="18"
//         fill="rgba(20,20,20,0.72)"
//       />

//       <rect
//         x="285"
//         y="32"
//         width="647"
//         height="4"
//         rx="2"
//         fill="rgba(255,255,255,0.85)"
//       />

//       <line
//         x1="285"
//         y1="55"
//         x2="285"
//         y2="214"
//         stroke="#ffffff"
//         stroke-width="1"
//         opacity="0.25"
//       />

//     </svg>
//   `;

//   const LEFT_LABEL_X = 315;
//   const LEFT_VALUE_X = 455;
//   const RIGHT_LABEL_X = 650;
//   const RIGHT_VALUE_X = 785;

//   const addressSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <style>

//         .address {
//           fill: #fff;
//           font: 800 32px Arial, Helvetica, sans-serif;
//         }

//         .mls {
//           fill: #F8F8F8;
//           font: 600 20px Arial, Helvetica, sans-serif;
//         }

//         .label {
//           fill: #CFCFCF;
//           font: 600 17px Arial, Helvetica, sans-serif;
//         }

//         .value {
//           fill: #fff;
//           font: 700 20px Arial, Helvetica, sans-serif;
//         }

//         .line {
//           stroke: #8F8F8F;
//           stroke-width: 1;
//           opacity: .45;
//         }

//       </style>

//       <text
//         x="315"
//         y="78"
//         class="address"
//       >
//         ${address}
//       </text>

//       <text
//         x="315"
//         y="110"
//         class="mls"
//       >
//         MLS® ${mls}
//       </text>

//       <line
//         x1="312"
//         y1="130"
//         x2="900"
//         y2="130"
//         class="line"
//       />

//       <text
//         x="${LEFT_LABEL_X}"
//         y="163"
//         class="label"
//       >
//         CITY
//       </text>

//       <text
//         x="${LEFT_VALUE_X}"
//         y="163"
//         class="value"
//       >
//         ${city}
//       </text>

//       <text
//         x="${LEFT_LABEL_X}"
//         y="199"
//         class="label"
//       >
//         BEDROOMS
//       </text>

//       <text
//         x="${LEFT_VALUE_X}"
//         y="199"
//         class="value"
//       >
//         ${beds}
//       </text>

//       <text
//         x="${RIGHT_LABEL_X}"
//         y="163"
//         class="label"
//       >
//         BATHROOMS
//       </text>

//       <text
//         x="${RIGHT_VALUE_X}"
//         y="163"
//         class="value"
//       >
//         ${baths}
//       </text>

//       <text
//         x="${RIGHT_LABEL_X}"
//         y="199"
//         class="label"
//       >
//         SIZE
//       </text>

//       <text
//         x="${RIGHT_VALUE_X}"
//         y="199"
//         class="value"
//       >
//         ${sqft || "-"} Sq Ft
//       </text>

//     </svg>
//   `;

//   const footerBgSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <rect
//         x="0"
//         y="1160"
//         width="280"
//         height="190"
//         fill="#ffffff"
//       />

//       <rect
//         x="280"
//         y="1160"
//         width="800"
//         height="190"
//         fill="#4b2b2b"
//       />

//     </svg>
//   `;

//   const footerTextSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <style>

//         .name {
//           fill: #fff;
//           font: 800 38px Arial, Helvetica, sans-serif;
//         }

//         .role {
//           fill: #fff;
//           font: 400 30px Arial, Helvetica, sans-serif;
//         }

//         .phone {
//           fill: #fff;
//           font: 500 38px Arial, Helvetica, sans-serif;
//         }

//         .price {
//           fill: #222;
//           font: 800 34px Arial, Helvetica, sans-serif;
//         }

//         .info {
//           fill: #444;
//           font: 21px Arial, Helvetica, sans-serif;
//         }

//       </style>

//       <text
//         x="20"
//         y="1198"
//         class="price"
//       >
//         ${price}
//       </text>

//       <text
//         x="20"
//         y="1235"
//         class="info"
//       >
//         ${beds} Bed • ${baths} Bath
//       </text>

//       <text
//         x="20"
//         y="1268"
//         class="info"
//       >
//         ${propertyType}
//       </text>

//       <text
//         x="20"
//         y="1300"
//         class="info"
//       >
//         ${sqft || ""} Sq Ft
//       </text>

//       <text
//         x="20"
//         y="1332"
//         class="info"
//       >
//         MLS® ${mls}
//       </text>

//       <text
//         x="315"
//         y="1220"
//         class="name"
//       >
//         PARTH BRAHMBHATT
//       </text>

//       <text
//         x="455"
//         y="1275"
//         class="role"
//       >
//         REALTOR
//       </text>

//       <text
//         x="340"
//         y="1330"
//         class="phone"
//       >
//         403-439-1555
//       </text>

//     </svg>
//   `;

//   const agentPath =
//     path.join(
//       __dirname,
//       "assets/realtorparths_pdf",
//       "agent12.png"
//     );

//   const agentBuffer =
//     await sharp(agentPath)
//       .resize({
//         height: 400,
//         fit: "inside",
//       })
//       .png()
//       .toBuffer();

//   const logoPath =
//     path.join(
//       __dirname,
//       "assets/realtorparths_pdf",
//       "diamond_realty.jpeg"
//     );

//   const logoBuffer =
//     await sharp(logoPath)
//       .resize({
//         width: 280,
//         height: 190,
//         fit: "fill",
//       })
//       .png()
//       .toBuffer();

//   const buffer =
//     await sharp(propertyImageBuffer)
//       .resize(
//         1080,
//         1350,
//         {
//           fit: "cover",
//         }
//       )
//       .composite([
//         {
//           input: Buffer.from(
//             addressBgSvg
//           ),
//           left: 0,
//           top: 0,
//         },

//         {
//           input: Buffer.from(
//             realtorLogoSvg
//           ),
//           left: 0,
//           top: 0,
//         },

//         {
//           input: Buffer.from(
//             addressSvg
//           ),
//           left: 0,
//           top: 0,
//         },

//         {
//           input: Buffer.from(
//             footerBgSvg
//           ),
//           left: 0,
//           top: 0,
//         },

//         {
//           input: Buffer.from(
//             footerTextSvg
//           ),
//           left: 0,
//           top: 0,
//         },

//         {
//           input: logoBuffer,
//           left: 0,
//           top: 1160,
//         },

//         {
//           input: agentBuffer,
//           left: 740,
//           top: 960,
//         },
//       ])
//       .flatten({
//         background: "#000000",
//       })
//       .jpeg({
//         quality: 84,
//         mozjpeg: true,
//       })
//       .toBuffer();

//   await fs.promises.writeFile(
//     outputPath,
//     buffer
//   );

//   return {
//     imageURL:
//       `https://realtorparth.ca/social-images/${fileName}`,

//     outputPath,
//   };
// }

// // ============================================================
// // AI DESIGN HELPERS
// // ============================================================

// function getSafeMimeType(
//   mimetype
// ) {
//   if (
//     mimetype === "image/jpeg" ||
//     mimetype === "image/png" ||
//     mimetype === "image/webp"
//   ) {
//     return mimetype;
//   }

//   return "image/jpeg";
// }

// // ============================================================
// // READ IMAGE
// // ============================================================

// async function readUploadedImage(
//   file
// ) {
//   if (!file) {
//     throw new Error(
//       "Reference image is required"
//     );
//   }

//   return fs.promises.readFile(
//     file.path
//   );
// }

// // ============================================================
// // GET GEMINI ASPECT RATIO
// // ============================================================

// async function getGeminiAspectRatio(
//   imageBuffer
// ) {
//   const metadata =
//     await sharp(imageBuffer).metadata();

//   const width =
//     metadata.width || 1;

//   const height =
//     metadata.height || 1;

//   const actualRatio =
//     width / height;

//   const ratios = [
//     {
//       name: "1:1",
//       value: 1,
//     },
//     {
//       name: "2:3",
//       value: 2 / 3,
//     },
//     {
//       name: "3:2",
//       value: 3 / 2,
//     },
//     {
//       name: "3:4",
//       value: 3 / 4,
//     },
//     {
//       name: "4:3",
//       value: 4 / 3,
//     },
//     {
//       name: "4:5",
//       value: 4 / 5,
//     },
//     {
//       name: "5:4",
//       value: 5 / 4,
//     },
//     {
//       name: "9:16",
//       value: 9 / 16,
//     },
//     {
//       name: "16:9",
//       value: 16 / 9,
//     },
//     {
//       name: "21:9",
//       value: 21 / 9,
//     },
//   ];

//   let closest =
//     ratios[0];

//   let smallestDifference =
//     Math.abs(
//       actualRatio -
//         closest.value
//     );

//   for (
//     const ratio of ratios
//   ) {
//     const difference =
//       Math.abs(
//         actualRatio -
//           ratio.value
//       );

//     if (
//       difference <
//       smallestDifference
//     ) {
//       closest = ratio;
//       smallestDifference =
//         difference;
//     }
//   }

//   return closest.name;
// }

// // ============================================================
// // EXTRACT INTERACTION TEXT
// // ============================================================

// function extractInteractionText(
//   interaction
// ) {
//   let text = "";

//   if (
//     typeof interaction?.output_text ===
//     "string"
//   ) {
//     text =
//       interaction.output_text;
//   }

//   if (
//     !text &&
//     Array.isArray(
//       interaction?.steps
//     )
//   ) {
//     for (
//       const step of interaction.steps
//     ) {
//       if (
//         step?.type !==
//         "model_output"
//       ) {
//         continue;
//       }

//       const content =
//         step?.content || [];

//       for (
//         const block of content
//       ) {
//         if (
//           block?.type === "text"
//         ) {
//           text +=
//             block.text || "";
//         }
//       }
//     }
//   }

//   return text
//     .trim()
//     .replace(
//       /^```(?:text|markdown)?/i,
//       ""
//     )
//     .replace(
//       /```$/i,
//       ""
//     )
//     .trim();
// }

// // ============================================================
// // EXTRACT INTERACTION IMAGE
// // ============================================================

// function extractInteractionImage(
//   interaction
// ) {
//   if (
//     interaction?.output_image?.data
//   ) {
//     return Buffer.from(
//       interaction.output_image.data,
//       "base64"
//     );
//   }

//   if (
//     Array.isArray(
//       interaction?.steps
//     )
//   ) {
//     for (
//       const step of interaction.steps
//     ) {
//       if (
//         step?.type !==
//         "model_output"
//       ) {
//         continue;
//       }

//       const content =
//         step?.content || [];

//       for (
//         const block of content
//       ) {
//         if (
//           block?.type === "image" &&
//           block?.data
//         ) {
//           return Buffer.from(
//             block.data,
//             "base64"
//           );
//         }

//         if (
//           block?.type ===
//             "output_image" &&
//           block?.data
//         ) {
//           return Buffer.from(
//             block.data,
//             "base64"
//           );
//         }
//       }
//     }
//   }

//   return null;
// }

// // ============================================================
// // ANALYZE DESIGN REFERENCE
// // ============================================================

// async function analyzeDesignReference(
//   referenceBuffer,
//   referenceMimeType
// ) {
//   try {
//     const base64Image =
//       referenceBuffer.toString(
//         "base64"
//       );

//     const analysisPrompt = `
// You are an expert architectural visualization designer,
// architectural drafting analyst, real-estate marketing designer,
// and image composition specialist.

// Analyze the uploaded image ONLY as a DESIGN REFERENCE.

// The property/house visible in this reference image is NOT the
// property that will be used in the final generation.

// Do NOT create a prompt that copies or reconstructs this house.

// Extract the reusable visual design language.

// Analyze:

// - overall composition
// - layout
// - color palette
// - photographic treatment
// - lighting
// - architectural blueprint style
// - CAD overlays
// - dimension lines
// - extension lines
// - arrowheads
// - measurement labels
// - callout circles
// - technical labels
// - elevation drawings
// - section drawings
// - roof tracing
// - window tracing
// - door tracing
// - wall tracing
// - line thickness
// - line opacity
// - typography
// - technical drawing placement
// - aspect ratio
// - background treatment
// - visual hierarchy

// IMPORTANT:

// Do NOT treat any numerical measurement visible in this image
// as a measurement for another property.

// Explain only the visual style of the dimensions.

// The future MLS property must remain the source of truth.

// Return ONLY a detailed reusable image-generation prompt.

// Do NOT return JSON.

// Do NOT describe the specific house as something to copy.

// Explicitly instruct the future image model that:

// - MLS property is the source of truth
// - reference image is design only
// - reference house must not be copied
// - reference architecture must not replace MLS architecture
// - reference dimensions must not be copied
// - actual MLS geometry must be preserved
// - numerical dimensions must only be used when verified
// - fabricated measurements are prohibited
// - technical overlays must follow the actual MLS property
// - final property must remain photorealistic
// `;

//     console.log(
//       "🤖 Gemini Design Analysis Model:",
//       DESIGN_ANALYSIS_MODEL
//     );

//     const interaction =
//       await ai.interactions.create({
//         model:
//           DESIGN_ANALYSIS_MODEL,

//         input: [
//           {
//             type: "image",
//             mime_type:
//               referenceMimeType,
//             data:
//               base64Image,
//           },

//           {
//             type: "text",
//             text:
//               analysisPrompt,
//           },
//         ],
//       });

//     const result =
//       extractInteractionText(
//         interaction
//       );

//     if (!result) {
//       console.error(
//         JSON.stringify(
//           interaction,
//           null,
//           2
//         )
//       );

//       throw new Error(
//         "Gemini did not return a design prompt"
//       );
//     }

//     return result;
//   } catch (error) {
//     console.error(
//       "❌ GEMINI DESIGN ANALYSIS ERROR:",
//       error?.response?.data ||
//         error?.message ||
//         error
//     );

//     throw error;
//   }
// }
// // ============================================================
// // GENERATE AI DESIGN IMAGE
// // ============================================================
// //
// // IMPORTANT:
// //
// // AI DESIGN uses the EXACT SAME FINAL LAYERING as
// // generatePropertyImage().
// //
// // FINAL:
// //
// // 1080 x 1350
// //
// // ┌───────────────────────────────────────────────────────────┐
// // │ REALTOR LOGO       ADDRESS / MLS / PROPERTY INFO         │
// // │ transparent                                               │
// // │                                                           │
// // │                                                           │
// // │                  AI GENERATED PROPERTY                    │
// // │                                                           │
// // │                                                           │
// // │                                                           │
// // ├───────────────────────────────────────────────────────────┤
// // │ PRICE / DETAILS │ PARTH BRAHMBHATT                        │
// // │                 │ REALTOR                                 │
// // │ DIAMOND LOGO    │ 403-439-1555             AGENT PHOTO    │
// // └───────────────────────────────────────────────────────────┘
// //
// // ============================================================

// async function generateAIDesignImage({
//   referenceBuffer,
//   referenceMimeType,
//   propertyBuffer,
//   designPrompt,
//   property,
// }) {
//   if (!referenceBuffer) {
//     throw new Error(
//       "Reference image is required"
//     );
//   }

//   if (!propertyBuffer) {
//     throw new Error(
//       "Property image is required"
//     );
//   }

//   if (!designPrompt) {
//     throw new Error(
//       "Design prompt is required"
//     );
//   }

//   // ==========================================================
//   // IMPORTANT
//   // ==========================================================
//   //
//   // Your normal MLS generator is 1080 x 1350.
//   //
//   // Therefore AI DESIGN will ALSO use 4:5.
//   //
//   // This makes the branding layers line up exactly.
//   //
//   // ==========================================================

//   const aspectRatio = "4:5";

//   console.log(
//     "🎨 AI DESIGN OUTPUT ASPECT RATIO:",
//     aspectRatio
//   );

//   // ==========================================================
//   // REFERENCE BASE64
//   // ==========================================================

//   const referenceBase64 =
//     referenceBuffer.toString(
//       "base64"
//     );

//   // ==========================================================
//   // NORMALIZE MLS IMAGE
//   // ==========================================================

//   const normalizedPropertyBuffer =
//     await sharp(
//       propertyBuffer
//     )
//       .rotate()
//       .jpeg({
//         quality: 94,
//         mozjpeg: true,
//       })
//       .toBuffer();

//   const propertyBase64 =
//     normalizedPropertyBuffer.toString(
//       "base64"
//     );

//   // ==========================================================
//   // PROPERTY FACTS
//   // ==========================================================

//   const propertyFacts = `
// VERIFIED MLS PROPERTY INFORMATION:

// Address:
// ${property.UnparsedAddress || "Not provided"}

// MLS:
// ${
//   property.ListingKey ||
//   property.ListingId ||
//   "Not provided"
// }

// Price:
// ${property.ListPrice || "Not provided"}

// Property Type:
// ${property.PropertyType || "Not provided"}

// Architectural Style:
// ${
//   property.ArchitecturalStyle ||
//   "Not provided"
// }

// City:
// ${property.City || "Not provided"}

// Community:
// ${
//   property.SubdivisionName ||
//   "Not provided"
// }

// Bedrooms:
// ${
//   property.BedroomsTotal ||
//   "Not provided"
// }

// Bathrooms:
// ${
//   property.BathroomsTotalInteger ||
//   "Not provided"
// }

// Garage:
// ${
//   property.GarageSpaces ||
//   "Not provided"
// }

// Building Area:
// ${
//   property.BuildingAreaTotal ||
//   "Not provided"
// }

// Living Area:
// ${
//   property.LivingArea ||
//   "Not provided"
// }

// Year Built:
// ${
//   property.YearBuilt ||
//   "Not provided"
// }
// `;

//   // ==========================================================
//   // FINAL AI PROMPT
//   // ==========================================================

//   const finalPrompt = `
// You are creating a premium professional real-estate
// architectural marketing image for RealtorParth.

// THERE ARE TWO SUPPLIED IMAGES.

// ============================================================
// IMAGE 1 — ACTUAL MLS PROPERTY PHOTO
// ============================================================

// IMAGE 1 is the ACTUAL MLS PROPERTY.

// IMAGE 1 is the absolute source of truth.

// The final image MUST preserve the actual property from
// IMAGE 1.

// ============================================================
// IMAGE 2 — DESIGN REFERENCE
// ============================================================

// IMAGE 2 is ONLY a visual design reference.

// Use it ONLY to understand:

// - architectural drawing style
// - blueprint style
// - technical linework
// - dimension-line style
// - elevation graphics
// - section graphics
// - callout graphics
// - typography
// - line opacity
// - line thickness
// - color treatment
// - visual hierarchy
// - composition

// DO NOT copy the house from IMAGE 2.

// DO NOT replace the MLS house with the reference house.

// ============================================================
// PROPERTY PRESERVATION
// ============================================================

// The house MUST remain the house from IMAGE 1.

// Preserve:

// - roof
// - roof shape
// - roof lines
// - windows
// - doors
// - garage
// - porch
// - balconies
// - siding
// - facade
// - building proportions
// - landscaping
// - driveway
// - surrounding context
// - camera perspective

// If the two images show different houses:

// ALWAYS use the house from IMAGE 1.

// ============================================================
// ARCHITECTURAL DESIGN
// ============================================================

// Apply the visual design language from IMAGE 2 onto the
// ACTUAL MLS PROPERTY.

// Technical lines must follow the actual MLS property.

// Trace only what is visibly supported by IMAGE 1:

// - roof edges
// - roof ridge
// - roof slopes
// - walls
// - windows
// - doors
// - garage
// - porch
// - balconies
// - visible architectural features

// Do NOT invent architectural elements.

// ============================================================
// DIMENSIONS
// ============================================================

// Do NOT copy numerical dimensions from IMAGE 2.

// Never copy reference numbers.

// Do not fabricate measurements.

// If actual verified measurements are not available:

// - use non-numeric dimension lines
// - use subtle technical guide lines
// - use architectural tracing
// - use callouts without fake numbers

// ============================================================
// PHOTOREALISM
// ============================================================

// The MLS property must remain photorealistic.

// Do NOT turn it into:

// - a 3D render
// - a cartoon
// - a generic house
// - a different property
// - an imaginary building

// The final result should look like a premium real-estate
// marketing photograph enhanced with architectural graphics.

// ============================================================
// USER EDITED DESIGN PROMPT
// ============================================================

// ${designPrompt}

// ============================================================
// VERIFIED MLS INFORMATION
// ============================================================

// ${propertyFacts}

// ============================================================
// FINAL FORMAT
// ============================================================

// Create ONE professional portrait real-estate image.

// Aspect ratio: 4:5

// The architectural graphics should be elegant,
// premium, subtle and professionally integrated.

// Do not create any branding, agent information,
// Realtor logo, Diamond Realty logo, phone number,
// price card or contact information.

// Those elements will be added separately by the application.

// Generate ONLY the clean AI property/design image.
// `;

//   // ==========================================================
//   // GENERATE IMAGE
//   // ==========================================================

//   console.log(
//     "============================================================"
//   );

//   console.log(
//     "🤖 AI DESIGN IMAGE GENERATION"
//   );

//   console.log(
//     "Model:",
//     DESIGN_IMAGE_MODEL
//   );

//   console.log(
//     "IMAGE 1:",
//     "ACTUAL MLS PROPERTY"
//   );

//   console.log(
//     "IMAGE 2:",
//     "DESIGN REFERENCE"
//   );

//   console.log(
//     "FINAL CANVAS:",
//     "1080x1350"
//   );

//   console.log(
//     "============================================================"
//   );

//   const interaction =
//     await ai.interactions.create({
//       model:
//         DESIGN_IMAGE_MODEL,

//       input: [
//         // ======================================================
//         // IMAGE 1 — ACTUAL MLS PROPERTY
//         // ======================================================

//         {
//           type: "image",

//           mime_type:
//             "image/jpeg",

//           data:
//             propertyBase64,
//         },

//         // ======================================================
//         // IMAGE 2 — DESIGN REFERENCE
//         // ======================================================

//         {
//           type: "image",

//           mime_type:
//             referenceMimeType,

//           data:
//             referenceBase64,
//         },

//         // ======================================================
//         // PROMPT
//         // ======================================================

//         {
//           type: "text",

//           text:
//             finalPrompt,
//         },
//       ],

//       response_format: {
//         type: "image",

//         aspect_ratio:
//           aspectRatio,

//         image_size:
//           "2K",
//       },
//     });

//   // ==========================================================
//   // EXTRACT GENERATED IMAGE
//   // ==========================================================

//   const generatedImageBuffer =
//     extractInteractionImage(
//       interaction
//     );

//   if (
//     !generatedImageBuffer
//   ) {
//     console.error(
//       "❌ Gemini image interaction returned no image:"
//     );

//     console.error(
//       JSON.stringify(
//         interaction,
//         null,
//         2
//       )
//     );

//     throw new Error(
//       "Gemini did not return a generated image"
//     );
//   }

//   // ==========================================================
//   // FORCE EXACT MLS CANVAS
//   // ==========================================================
//   //
//   // This is important.
//   //
//   // Your existing MLS generator uses:
//   //
//   // 1080 x 1350
//   //
//   // So we normalize the AI result to exactly the same
//   // dimensions BEFORE adding the branding layers.
//   //
//   // ==========================================================

//   const cleanGeneratedImage =
//     await sharp(
//       generatedImageBuffer
//     )
//       .rotate()
//       .resize(
//         1080,
//         1350,
//         {
//           fit: "cover",
//           position: "centre",
//         }
//       )
//       .png()
//       .toBuffer();

//   console.log(
//     "🎨 AI IMAGE NORMALIZED:",
//     "1080x1350"
//   );

//   // ==========================================================
//   // PROPERTY DATA
//   // ==========================================================

//   const price =
//     property.ListPrice
//       ? `$${Number(
//           property.ListPrice
//         ).toLocaleString()}`
//       : "Call for Price";

//   const beds =
//     property.BedroomsTotal ||
//     0;

//   const baths =
//     property.BathroomsTotalInteger ||
//     0;

//   const city =
//     property.City ||
//     "Calgary";

//   const address =
//     (
//       property.UnparsedAddress ||
//       ""
//     ).length > 38
//       ? property.UnparsedAddress.substring(
//           0,
//           38
//         ) + "..."
//       : property.UnparsedAddress ||
//         "";

//   const mls =
//     property.ListingId ||
//     property.ListingKey ||
//     "";

//   const sqft =
//     property.BuildingAreaTotal ||
//     property.LivingArea ||
//     "";

//   const propertyType =
//     property.PropertyType ||
//     "";

//   // ==========================================================
//   // REALTOR LOGO
//   // ==========================================================

//   const realtorLogoPath =
//     path.join(
//       __dirname,
//       "assets/realtorparths_pdf",
//       "realtor_logo.svg"
//     );

//   const realtorLogoRaw =
//     await fs.promises.readFile(
//       realtorLogoPath,
//       "utf8"
//     );

//   const realtorLogoBase64 =
//     Buffer.from(
//       realtorLogoRaw
//     ).toString(
//       "base64"
//     );

//   // ==========================================================
//   // EXACT SAME REALTOR LOGO
//   // AS YOUR MLS GENERATOR
//   // ==========================================================
//   //
//   // IMPORTANT:
//   //
//   // opacity = 0.35
//   //
//   // This makes it light / transparent.
//   //
//   // Position:
//   //
//   // x = 55
//   // y = 52
//   //
//   // ==========================================================

//   const realtorLogoSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <image
//         href="data:image/svg+xml;base64,${realtorLogoBase64}"
//         x="55"
//         y="52"
//         width="190"
//         height="165"
//         opacity="0.35"
//         preserveAspectRatio="xMidYMid meet"
//       />

//     </svg>
//   `;

//   // ==========================================================
//   // EXACT SAME ADDRESS BACKGROUND
//   // ==========================================================

//   const addressBgSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <rect
//         x="285"
//         y="32"
//         width="647"
//         height="205"
//         rx="18"
//         ry="18"
//         fill="rgba(20,20,20,0.72)"
//       />

//       <rect
//         x="285"
//         y="32"
//         width="647"
//         height="4"
//         rx="2"
//         fill="rgba(255,255,255,0.85)"
//       />

//       <line
//         x1="285"
//         y1="55"
//         x2="285"
//         y2="214"
//         stroke="#ffffff"
//         stroke-width="1"
//         opacity="0.25"
//       />

//     </svg>
//   `;

//   // ==========================================================
//   // EXACT SAME POSITIONS
//   // ==========================================================

//   const LEFT_LABEL_X =
//     315;

//   const LEFT_VALUE_X =
//     455;

//   const RIGHT_LABEL_X =
//     650;

//   const RIGHT_VALUE_X =
//     785;

//   // ==========================================================
//   // EXACT SAME ADDRESS INFORMATION
//   // ==========================================================

//   const addressSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <style>

//         .address {
//           fill: #fff;
//           font: 800 32px Arial, Helvetica, sans-serif;
//         }

//         .mls {
//           fill: #F8F8F8;
//           font: 600 20px Arial, Helvetica, sans-serif;
//         }

//         .label {
//           fill: #CFCFCF;
//           font: 600 17px Arial, Helvetica, sans-serif;
//         }

//         .value {
//           fill: #fff;
//           font: 700 20px Arial, Helvetica, sans-serif;
//         }

//         .line {
//           stroke: #8F8F8F;
//           stroke-width: 1;
//           opacity: .45;
//         }

//       </style>

//       <text
//         x="315"
//         y="78"
//         class="address"
//       >
//         ${address}
//       </text>

//       <text
//         x="315"
//         y="110"
//         class="mls"
//       >
//         MLS® ${mls}
//       </text>

//       <line
//         x1="312"
//         y1="130"
//         x2="900"
//         y2="130"
//         class="line"
//       />

//       <text
//         x="${LEFT_LABEL_X}"
//         y="163"
//         class="label"
//       >
//         CITY
//       </text>

//       <text
//         x="${LEFT_VALUE_X}"
//         y="163"
//         class="value"
//       >
//         ${city}
//       </text>

//       <text
//         x="${LEFT_LABEL_X}"
//         y="199"
//         class="label"
//       >
//         BEDROOMS
//       </text>

//       <text
//         x="${LEFT_VALUE_X}"
//         y="199"
//         class="value"
//       >
//         ${beds}
//       </text>

//       <text
//         x="${RIGHT_LABEL_X}"
//         y="163"
//         class="label"
//       >
//         BATHROOMS
//       </text>

//       <text
//         x="${RIGHT_VALUE_X}"
//         y="163"
//         class="value"
//       >
//         ${baths}
//       </text>

//       <text
//         x="${RIGHT_LABEL_X}"
//         y="199"
//         class="label"
//       >
//         SIZE
//       </text>

//       <text
//         x="${RIGHT_VALUE_X}"
//         y="199"
//         class="value"
//       >
//         ${sqft || "-"} Sq Ft
//       </text>

//     </svg>
//   `;

//   // ==========================================================
//   // EXACT SAME FOOTER BACKGROUND
//   // ==========================================================

//   const footerBgSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <rect
//         x="0"
//         y="1160"
//         width="280"
//         height="190"
//         fill="#ffffff"
//       />

//       <rect
//         x="280"
//         y="1160"
//         width="800"
//         height="190"
//         fill="#4b2b2b"
//       />

//     </svg>
//   `;

//   // ==========================================================
//   // EXACT SAME FOOTER TEXT
//   // ==========================================================

//   const footerTextSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <style>

//         .name {
//           fill: #fff;
//           font: 800 38px Arial, Helvetica, sans-serif;
//         }

//         .role {
//           fill: #fff;
//           font: 400 30px Arial, Helvetica, sans-serif;
//         }

//         .phone {
//           fill: #fff;
//           font: 500 38px Arial, Helvetica, sans-serif;
//         }

//         .price {
//           fill: #222;
//           font: 800 34px Arial, Helvetica, sans-serif;
//         }

//         .info {
//           fill: #444;
//           font: 21px Arial, Helvetica, sans-serif;
//         }

//       </style>

//       <text
//         x="20"
//         y="1198"
//         class="price"
//       >
//         ${price}
//       </text>

//       <text
//         x="20"
//         y="1235"
//         class="info"
//       >
//         ${beds} Bed • ${baths} Bath
//       </text>

//       <text
//         x="20"
//         y="1268"
//         class="info"
//       >
//         ${propertyType}
//       </text>

//       <text
//         x="20"
//         y="1300"
//         class="info"
//       >
//         ${sqft || ""} Sq Ft
//       </text>

//       <text
//         x="20"
//         y="1332"
//         class="info"
//       >
//         MLS® ${mls}
//       </text>

//       <text
//         x="315"
//         y="1220"
//         class="name"
//       >
//         PARTH BRAHMBHATT
//       </text>

//       <text
//         x="455"
//         y="1275"
//         class="role"
//       >
//         REALTOR
//       </text>

//       <text
//         x="340"
//         y="1330"
//         class="phone"
//       >
//         403-439-1555
//       </text>

//     </svg>
//   `;

//   // ==========================================================
//   // AGENT PHOTO
//   // ==========================================================

//   const agentPath =
//     path.join(
//       __dirname,
//       "assets/realtorparths_pdf",
//       "agent12.png"
//     );

//   const agentBuffer =
//     await sharp(
//       agentPath
//     )
//       .resize({
//         height: 400,
//         fit: "inside",
//       })
//       .png()
//       .toBuffer();

//   // ==========================================================
//   // DIAMOND REALTY LOGO
//   // ==========================================================

//   const logoPath =
//     path.join(
//       __dirname,
//       "assets/realtorparths_pdf",
//       "diamond_realty.jpeg"
//     );

//   const logoBuffer =
//     await sharp(
//       logoPath
//     )
//       .resize({
//         width: 280,
//         height: 190,
//         fit: "fill",
//       })
//       .png()
//       .toBuffer();

//   // ==========================================================
//   // EXACT SAME COMPOSITE ORDER
//   // AS MLS GENERATOR
//   // ==========================================================

//   const finalBuffer =
//     await sharp(
//       cleanGeneratedImage
//     )
//       .composite([
//         // ======================================================
//         // 1. ADDRESS DARK BACKGROUND
//         // ======================================================

//         {
//           input:
//             Buffer.from(
//               addressBgSvg
//             ),

//           left: 0,

//           top: 0,
//         },

//         // ======================================================
//         // 2. LIGHT REALTOR LOGO — TOP LEFT
//         // ======================================================

//         {
//           input:
//             Buffer.from(
//               realtorLogoSvg
//             ),

//           left: 0,

//           top: 0,
//         },

//         // ======================================================
//         // 3. ADDRESS / PROPERTY INFORMATION
//         // ======================================================

//         {
//           input:
//             Buffer.from(
//               addressSvg
//             ),

//           left: 0,

//           top: 0,
//         },

//         // ======================================================
//         // 4. FOOTER BACKGROUND
//         // ======================================================

//         {
//           input:
//             Buffer.from(
//               footerBgSvg
//             ),

//           left: 0,

//           top: 0,
//         },

//         // ======================================================
//         // 5. FOOTER TEXT
//         // ======================================================

//         {
//           input:
//             Buffer.from(
//               footerTextSvg
//             ),

//           left: 0,

//           top: 0,
//         },

//         // ======================================================
//         // 6. DIAMOND REALTY LOGO — BOTTOM LEFT
//         // ======================================================

//         {
//           input:
//             logoBuffer,

//           left: 0,

//           top: 1160,
//         },

//         // ======================================================
//         // 7. PARTH PHOTO — BOTTOM RIGHT
//         // ======================================================

//         {
//           input:
//             agentBuffer,

//           left: 740,

//           top: 960,
//         },
//       ])
//       .flatten({
//         background:
//           "#000000",
//       })
//       .jpeg({
//         quality: 84,
//         mozjpeg: true,
//       })
//       .toBuffer();

//   // ==========================================================
//   // SAVE
//   // ==========================================================

//   const fileName =
//     `ai-design-${Date.now()}.jpg`;

//   const outputPath =
//     path.join(
//       IMAGE_DIR,
//       fileName
//     );

//   await fs.promises.writeFile(
//     outputPath,
//     finalBuffer
//   );

//   // ==========================================================
//   // LOG
//   // ==========================================================

//   console.log(
//     "============================================================"
//   );

//   console.log(
//     "✅ AI DESIGN FINAL IMAGE SAVED"
//   );

//   console.log(
//     "Canvas:",
//     "1080x1350"
//   );

//   console.log(
//     "Realtor Logo:",
//     "TOP LEFT / opacity 0.35"
//   );

//   console.log(
//     "Address Card:",
//     "TOP RIGHT"
//   );

//   console.log(
//     "Diamond Realty:",
//     "BOTTOM LEFT"
//   );

//   console.log(
//     "Parth Photo:",
//     "BOTTOM RIGHT"
//   );

//   console.log(
//     "============================================================"
//   );

//   // ==========================================================
//   // RETURN
//   // ==========================================================

//   return {
//     imageURL:
//       `https://realtorparth.ca/social-images/${fileName}`,

//     outputPath,

//     aspectRatio,

//     model:
//       DESIGN_IMAGE_MODEL,

//     width: 1080,

//     height: 1350,
//   };
// }

// // ============================================================
// // DELETE TEMP UPLOAD
// // ============================================================

// async function deleteTempFile(
//   filePath
// ) {
//   if (!filePath) {
//     return;
//   }

//   try {
//     await fs.promises.unlink(
//       filePath
//     );
//   } catch {
//     // Ignore cleanup errors.
//   }
// }

// // ============================================================
// // ANALYZE AI DESIGN REFERENCE
// // ============================================================

// router.post(
//   "/analyze-design",
//   upload.single("referenceImage"),

//   async (req, res) => {
//     try {
//       if (!req.file) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Reference image is required",
//         });
//       }

//       console.log(
//         "🎨 AI DESIGN: analyzing reference image:",
//         req.file.originalname
//       );

//       const referenceBuffer =
//         await readUploadedImage(
//           req.file
//         );

//       const referenceMimeType =
//         getSafeMimeType(
//           req.file.mimetype
//         );

//       const prompt =
//         await analyzeDesignReference(
//           referenceBuffer,
//           referenceMimeType
//         );

//       return res.json({
//         success: true,

//         prompt,

//         model:
//           DESIGN_ANALYSIS_MODEL,
//       });
//     } catch (err) {
//       console.error(
//         "❌ AI DESIGN ANALYSIS ERROR:",
//         err?.response?.data ||
//           err?.message ||
//           err
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           err?.response?.data?.message ||
//           err?.message ||
//           "Failed to analyze design reference",
//       });
//     } finally {
//       await deleteTempFile(
//         req.file?.path
//       );
//     }
//   }
// );

// // ============================================================
// // GENERATE AI DESIGN PROPERTY IMAGE
// // ============================================================

// router.post(
//   "/generate-design",
//   upload.single("referenceImage"),

//   async (req, res) => {
//     try {
//       const {
//         mls,
//         prompt,
//       } = req.body;

//       // ======================================================
//       // VALIDATION
//       // ======================================================

//       if (!req.file) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Reference image is required",
//         });
//       }

//       if (
//         !mls ||
//         typeof mls !== "string"
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "MLS number is required",
//         });
//       }

//       if (
//         !prompt ||
//         typeof prompt !== "string" ||
//         !prompt.trim()
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Design prompt is required",
//         });
//       }

//       const cleanMLS =
//         mls.trim();

//       const cleanPrompt =
//         prompt.trim();

//       console.log(
//         "============================================================"
//       );

//       console.log(
//         "🎨 AI DESIGN GENERATION"
//       );

//       console.log(
//         "MLS:",
//         cleanMLS
//       );

//       console.log(
//         "============================================================"
//       );

//       // ======================================================
//       // REFERENCE
//       // ======================================================

//       const referenceBuffer =
//         await readUploadedImage(
//           req.file
//         );

//       const referenceMimeType =
//         getSafeMimeType(
//           req.file.mimetype
//         );

//       // ======================================================
//       // GET MLS PROPERTY
//       // ======================================================

//       console.log(
//         "🏡 Getting MLS property:",
//         cleanMLS
//       );

//       const propertyResponse =
//         await axios.get(
//           `https://realtorparth.ca/api/properties/analysis/${cleanMLS}`,
//           {
//             timeout: 30000,
//           }
//         );

//       const property =
//         propertyResponse.data?.property;

//       if (!property) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Property not found",
//         });
//       }

//       // ======================================================
//       // ALBERTA ONLY
//       // ======================================================

//       const province =
//         property.StateOrProvince ||
//         property.Province ||
//         "";

//       if (
//         province &&
//         province.toLowerCase() !==
//           "ab" &&
//         province.toLowerCase() !==
//           "alberta"
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Only Alberta properties are supported",
//         });
//       }

//       // ======================================================
//       // ACTUAL MLS IMAGE
//       // ======================================================

//       console.log(
//         "📸 Getting ACTUAL MLS property image..."
//       );

//       const {
//         buffer: propertyImageBuffer,
//         imageUrl,
//       } =
//         await getPropertyImageBuffer(
//           property,
//           0
//         );

//       console.log(
//         "✅ Actual MLS image downloaded:"
//       );

//       console.log(
//         imageUrl
//       );

//       // ======================================================
//       // CAPTION
//       // ======================================================

//       console.log(
//         "✍️ Generating property caption..."
//       );

//       const preview =
//         await generatePropertyPost(
//           property
//         );

//       // ======================================================
//       // AI DESIGN
//       // ======================================================

//       console.log(
//         "🤖 Generating AI architectural design..."
//       );

//       const generated =
//         await generateAIDesignImage({
//           referenceBuffer,

//           referenceMimeType,

//           propertyBuffer:
//             propertyImageBuffer,

//           designPrompt:
//             cleanPrompt,

//           property,
//         });

//       // ======================================================
//       // RESPONSE
//       // ======================================================

//       return res.json({
//         success: true,

//         topic:
//           property.UnparsedAddress ||
//           cleanMLS,

//         caption:
//           preview.caption,

//         imageURL:
//           generated.imageURL,

//         property,

//         prompt:
//           cleanPrompt,

//         aspectRatio:
//           generated.aspectRatio,

//         model:
//           generated.model,

//         sourcePropertyImage:
//           imageUrl,
//       });
//     } catch (err) {
//       console.error(
//         "❌ AI DESIGN GENERATION ERROR:",
//         err?.response?.data ||
//           err?.message ||
//           err
//       );

//       return res.status(500).json({
//         success: false,

//         message:
//           err?.response?.data?.message ||
//           err?.message ||
//           "Failed to generate AI property design",
//       });
//     } finally {
//       await deleteTempFile(
//         req.file?.path
//       );
//     }
//   }
// );

// // ============================================================
// // GENERATE PROPERTY SOCIAL POST
// // ============================================================

// router.post(
//   "/generate-property",

//   async (req, res) => {
//     try {
//       const {
//         mls,
//       } = req.body;

//       if (
//         !mls ||
//         typeof mls !== "string"
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "MLS number is required",
//         });
//       }

//       const cleanMLS =
//         mls.trim();

//       console.log(
//         "🏡 Generating property social post for MLS:",
//         cleanMLS
//       );

//       const propertyResponse =
//         await axios.get(
//           `https://realtorparth.ca/api/properties/analysis/${cleanMLS}`
//         );

//       const property =
//         propertyResponse.data?.property;

//       if (!property) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Property not found",
//         });
//       }

//       const province =
//         property.StateOrProvince ||
//         property.Province ||
//         "";

//       if (
//         province &&
//         province.toLowerCase() !==
//           "ab" &&
//         province.toLowerCase() !==
//           "alberta"
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Only Alberta properties are supported",
//         });
//       }

//       const preview =
//         await generatePropertyPost(
//           property
//         );

//       const {
//         imageURL,
//       } =
//         await generatePropertyImage(
//           property,
//           0
//         );

//       return res.json({
//         success: true,

//         topic:
//           property.UnparsedAddress,

//         caption:
//           preview.caption,

//         imageURL,

//         property,
//       });
//     } catch (err) {
//       console.error(
//         "PROPERTY SOCIAL POST ERROR:",
//         err?.response?.data ||
//           err?.message ||
//           err
//       );

//       return res.status(500).json({
//         success: false,

//         message:
//           err?.response?.data?.message ||
//           "Failed to generate property social post",
//       });
//     }
//   }
// );

// // ============================================================
// // GENERATE POST
// // ============================================================

// router.post(
//   "/generate",

//   async (req, res) => {
//     try {
//       const {
//         topic,
//       } = req.body;

//       if (!topic) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Topic is required",
//         });
//       }

//       console.log(
//         "📱 Generating social post:",
//         topic
//       );

//       const caption =
//         await generateSocialContent(
//           topic
//         );

//       const {
//         imageURL,
//       } =
//         await generateImage(
//           topic
//         );

//       return res.json({
//         success: true,
//         topic,
//         caption,
//         imageURL,
//       });
//     } catch (err) {
//       console.error(
//         "SOCIAL API ERROR:",
//         err?.response?.data ||
//           err?.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to generate social post",
//       });
//     }
//   }
// );

// // ============================================================
// // UPLOAD SOCIAL IMAGES
// // ============================================================

// router.post(
//   "/upload-social-images",

//   upload.array(
//     "images",
//     10
//   ),

//   async (req, res) => {
//     try {
//       const files =
//         req.files;

//       if (
//         !files ||
//         !files.length
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "No images uploaded",
//         });
//       }

//       const urls =
//         files.map(
//           (file) =>
//             `https://realtorparth.ca/social-images/${file.filename}`
//         );

//       return res.json({
//         success: true,
//         urls,
//       });
//     } catch (err) {
//       console.error(
//         "UPLOAD ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to upload images",
//       });
//     }
//   }
// );

// // ============================================================
// // GET POSTED COMMENT POSTS
// // ============================================================

// router.get(
//   "/posted-comment-posts",

//   async (req, res) => {
//     try {
//       const thirtyDaysAgo =
//         new Date();

//       thirtyDaysAgo.setDate(
//         thirtyDaysAgo.getDate() -
//           30
//       );

//       const posts =
//         await ScheduledSocialPost.find(
//           {
//             status: "posted",

//             publishDate: {
//               $gte: thirtyDaysAgo,
//             },
//           },

//           {
//             socialPostIds: 1,
//             publishDate: 1,
//             _id: 0,
//           }
//         ).sort({
//           publishDate: -1,
//         });

//       return res.json({
//         success: true,
//         count: posts.length,
//         posts,
//       });
//     } catch (err) {
//       console.error(
//         "❌ GET POSTED COMMENT POSTS ERROR:",
//         err
//       );

//       return res.status(500).json({
//         success: false,
//         count: 0,
//         posts: [],
//         message:
//           "Failed to get posted social posts",
//       });
//     }
//   }
// );

// // ============================================================
// // PLATFORM KEY
// // ============================================================

// function getPlatformKey(
//   platform
// ) {
//   const normalized =
//     String(
//       platform || ""
//     ).toLowerCase();

//   if (
//     normalized ===
//     "facebook"
//   ) {
//     return "Facebook";
//   }

//   if (
//     normalized ===
//     "instagram"
//   ) {
//     return "Instagram";
//   }

//   return null;
// }

// // ============================================================
// // CHECK REPLIED COMMENT
// // ============================================================

// router.post(
//   "/check",

//   async (req, res) => {
//     try {
//       const {
//         platform,
//         postId,
//         commentId,
//       } = req.body;

//       if (
//         !platform ||
//         !postId ||
//         !commentId
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "platform, postId and commentId are required",
//         });
//       }

//       const platformKey =
//         getPlatformKey(
//           platform
//         );

//       const normalizedPlatform =
//         platform.toLowerCase();

//       if (!platformKey) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Invalid platform",
//         });
//       }

//       const post =
//         await ScheduledSocialPost.findOne(
//           {
//             [`socialPostIds.${platformKey}`]:
//               String(postId),
//           }
//         );

//       if (!post) {
//         console.log(
//           `⚠️ CHECK POST NOT FOUND | ${platformKey} | postId=${postId}`
//         );

//         return res.status(404).json({
//           success: false,
//           message:
//             "Post not found",
//         });
//       }

//       const alreadyReplied =
//         post.repliedComments.some(
//           (item) =>
//             String(
//               item.commentId
//             ) ===
//               String(
//                 commentId
//               ) &&
//             String(
//               item.platform
//             ).toLowerCase() ===
//               normalizedPlatform
//         );

//       return res.json({
//         success: true,
//         alreadyReplied,
//       });
//     } catch (err) {
//       console.error(
//         "❌ CHECK REPLIED ERROR:",
//         err
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Server error",
//       });
//     }
//   }
// );

// // ============================================================
// // SAVE REPLIED COMMENT
// // ============================================================

// router.post(
//   "/save",

//   async (req, res) => {
//     try {
//       const {
//         platform,
//         postId,
//         commentId,
//       } = req.body;

//       if (
//         !platform ||
//         !postId ||
//         !commentId
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "platform, postId and commentId are required",
//         });
//       }

//       const platformKey =
//         getPlatformKey(
//           platform
//         );

//       const normalizedPlatform =
//         platform.toLowerCase();

//       if (!platformKey) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Invalid platform",
//         });
//       }

//       const post =
//         await ScheduledSocialPost.findOne(
//           {
//             [`socialPostIds.${platformKey}`]:
//               String(postId),
//           }
//         );

//       if (!post) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Post not found",
//         });
//       }

//       const alreadyExists =
//         post.repliedComments.some(
//           (item) =>
//             String(
//               item.commentId
//             ) ===
//               String(
//                 commentId
//               ) &&
//             String(
//               item.platform
//             ).toLowerCase() ===
//               normalizedPlatform
//         );

//       if (alreadyExists) {
//         return res.json({
//           success: true,
//           alreadyExists: true,
//         });
//       }

//       post.repliedComments.push({
//         commentId:
//           String(commentId),

//         platform:
//           normalizedPlatform,

//         repliedAt:
//           new Date(),
//       });

//       await post.save();

//       return res.json({
//         success: true,
//         alreadyExists: false,
//       });
//     } catch (err) {
//       console.error(
//         "❌ SAVE REPLIED ERROR:",
//         err
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Server error",
//       });
//     }
//   }
// );

// // ============================================================
// // SAVE PLATFORM POST ID
// // ============================================================

// router.post(
//   "/save-platform-post-id",

//   async (req, res) => {
//     try {
//       const {
//         postId,
//         platform,
//         platformPostId,
//       } = req.body;

//       const post =
//         await ScheduledSocialPost.findById(
//           postId
//         );

//       if (!post) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Post not found",
//         });
//       }

//       post.socialPostIds = {
//         ...post.socialPostIds,
//         [platform]:
//           platformPostId,
//       };

//       await post.save();

//       return res.json({
//         success: true,
//       });
//     } catch (err) {
//       console.error(
//         "SAVE PLATFORM ID ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//       });
//     }
//   }
// );

// // ============================================================
// // SCHEDULE POST
// // ============================================================

// router.post(
//   "/schedule",

//   async (req, res) => {
//     try {
//       const {
//         topic,
//         caption,
//         images,
//         platforms,
//         publishDate,
//       } = req.body;

//       const cleanImages =
//         Array.isArray(images)
//           ? images.filter(
//               (img) =>
//                 typeof img ===
//                   "string" &&
//                 img.trim()
//             )
//           : [];

//       if (
//         !topic ||
//         !caption ||
//         !cleanImages.length ||
//         !Array.isArray(
//           platforms
//         ) ||
//         !platforms.length ||
//         !publishDate
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Missing required fields",
//         });
//       }

//       const post =
//         await ScheduledSocialPost.create(
//           {
//             topic,
//             caption,
//             images:
//               cleanImages,
//             platforms,
//             publishDate,
//           }
//         );

//       return res.json({
//         success: true,
//         message:
//           "Post scheduled successfully",
//         post,
//       });
//     } catch (err) {
//       console.error(
//         "SCHEDULE ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to schedule post",
//       });
//     }
//   }
// );

// // ============================================================
// // UPDATE INSTAGRAM POST STATUS
// // ============================================================

// router.post(
//   "/update-instagram-post-status",

//   async (req, res) => {
//     try {
//       const {
//         posts,
//       } = req.body;

//       if (
//         !Array.isArray(posts)
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Posts array is required",
//         });
//       }

//       let updatedCount = 0;

//       const dbPosts =
//         await ScheduledSocialPost.find(
//           {
//             "socialPostIds.Instagram":
//               {
//                 $exists: true,
//               },
//           }
//         );

//       const instagramIds =
//         posts.map(
//           (p) =>
//             String(
//               p.id ||
//                 p["Post ID"] ||
//                 p["Instagram ID"]
//             )
//         );

//       for (
//         const post of dbPosts
//       ) {
//         const igId =
//           String(
//             post.socialPostIds
//               ?.Instagram
//           );

//         if (
//           !post.platformStatuses
//         ) {
//           post.platformStatuses =
//             {};
//         }

//         if (
//           instagramIds.includes(
//             igId
//           )
//         ) {
//           post.platformStatuses =
//             {
//               ...post.platformStatuses,
//               Instagram:
//                 "posted",
//             };
//         } else {
//           post.platformStatuses =
//             {
//               ...post.platformStatuses,
//               Instagram:
//                 "deleted",
//             };
//         }

//         const statuses =
//           Object.values(
//             post.platformStatuses ||
//               {}
//           );

//         if (
//           statuses.every(
//             (s) =>
//               s ===
//               "deleted"
//           )
//         ) {
//           post.status =
//             "deleted";
//         } else {
//           post.status =
//             "posted";
//         }

//         await post.save();

//         updatedCount++;
//       }

//       return res.json({
//         success: true,
//         updatedCount,
//       });
//     } catch (err) {
//       console.error(
//         "UPDATE INSTAGRAM STATUS ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to update Instagram post statuses",
//       });
//     }
//   }
// );

// // ============================================================
// // TRIGGER INSTAGRAM GET POSTS
// // ============================================================

// router.post(
//   "/get-instagram-posts",

//   async (req, res) => {
//     try {
//       await axios.post(
//         process.env
//           .MAKE_WEBHOOK_URL,

//         {
//           platforms: [
//             "Instagram",
//           ],

//           action: "get",
//         }
//       );

//       return res.json({
//         success: true,
//         message:
//           "Instagram import started",
//       });
//     } catch (err) {
//       console.error(
//         "GET INSTAGRAM POSTS ERROR:",
//         err?.response?.data ||
//           err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to trigger Instagram import",
//       });
//     }
//   }
// );

// // ============================================================
// // UPDATE FACEBOOK POST STATUS
// // ============================================================

// router.post(
//   "/update-facebook-post-status",

//   async (req, res) => {
//     try {
//       const {
//         posts,
//       } = req.body;

//       if (
//         !Array.isArray(posts)
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Posts array is required",
//         });
//       }

//       let updatedCount = 0;

//       const dbPosts =
//         await ScheduledSocialPost.find(
//           {
//             "socialPostIds.Facebook":
//               {
//                 $exists: true,
//               },
//           }
//         );

//       const facebookIds =
//         posts.map(
//           (p) =>
//             String(
//               p.id ||
//                 p["Post ID"]
//             )
//         );

//       for (
//         const post of dbPosts
//       ) {
//         const fbId =
//           String(
//             post.socialPostIds
//               ?.Facebook
//           );

//         if (
//           !post.platformStatuses
//         ) {
//           post.platformStatuses =
//             {};
//         }

//         if (
//           facebookIds.includes(
//             fbId
//           )
//         ) {
//           post.platformStatuses =
//             {
//               ...post.platformStatuses,
//               Facebook:
//                 "posted",
//             };
//         } else {
//           post.platformStatuses =
//             {
//               ...post.platformStatuses,
//               Facebook:
//                 "deleted",
//             };
//         }

//         const statuses =
//           Object.values(
//             post.platformStatuses ||
//               {}
//           );

//         if (
//           statuses.every(
//             (s) =>
//               s ===
//               "deleted"
//           )
//         ) {
//           post.status =
//             "deleted";
//         } else {
//           post.status =
//             "posted";
//         }

//         await post.save();

//         updatedCount++;
//       }

//       return res.json({
//         success: true,
//         updatedCount,
//       });
//     } catch (err) {
//       console.error(
//         "UPDATE FACEBOOK STATUS ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to update Facebook post statuses",
//       });
//     }
//   }
// );

// // ============================================================
// // TRIGGER FACEBOOK GET POSTS
// // ============================================================

// router.post(
//   "/get-facebook-posts",

//   async (req, res) => {
//     try {
//       await axios.post(
//         process.env
//           .MAKE_WEBHOOK_URL,

//         {
//           platforms: [
//             "Facebook",
//           ],

//           action: "get",
//         }
//       );

//       return res.json({
//         success: true,
//         message:
//           "Facebook import started",
//       });
//     } catch (err) {
//       console.error(
//         "GET FACEBOOK POSTS ERROR:",
//         err?.response?.data ||
//           err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to trigger Facebook import",
//       });
//     }
//   }
// );

// // ============================================================
// // IMPORT FACEBOOK POSTS
// // ============================================================

// router.post(
//   "/import-facebook-posts",

//   async (req, res) => {
//     try {
//       const {
//         posts,
//       } = req.body;

//       if (
//         !Array.isArray(posts)
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Posts array is required",
//         });
//       }

//       const savedPosts = [];

//       for (
//         const item of posts
//       ) {
//         const exists =
//           await ScheduledSocialPost.findOne(
//             {
//               "socialPostIds.Facebook":
//                 item.id,
//             }
//           );

//         if (exists) {
//           continue;
//         }

//         const images =
//           item.full_picture
//             ? [
//                 item.full_picture,
//               ]
//             : [];

//         const post =
//           await ScheduledSocialPost.create(
//             {
//               topic:
//                 item.message
//                   ? item.message.slice(
//                       0,
//                       80
//                     )
//                   : "Facebook Post",

//               caption:
//                 item.message ||
//                 "",

//               images,

//               platforms: [
//                 "Facebook",
//               ],

//               publishDate:
//                 item.created_time
//                   ? new Date(
//                       item.created_time
//                     )
//                   : new Date(),

//               status:
//                 "posted",

//               socialPostIds:
//                 {
//                   Facebook:
//                     item.id,
//                 },
//             }
//           );

//         savedPosts.push(
//           post
//         );
//       }

//       return res.json({
//         success: true,
//         count:
//           savedPosts.length,
//         posts:
//           savedPosts,
//       });
//     } catch (err) {
//       console.error(
//         "IMPORT FACEBOOK POSTS ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to import Facebook posts",
//       });
//     }
//   }
// );

// // ============================================================
// // GET ALL POSTS
// // ============================================================

// router.get(
//   "/scheduled",

//   async (req, res) => {
//     try {
//       const posts =
//         await ScheduledSocialPost.find()
//           .sort({
//             publishDate: 1,
//           });

//       return res.json({
//         success: true,
//         posts,
//       });
//     } catch (err) {
//       console.error(
//         "GET SCHEDULED POSTS ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to fetch scheduled posts",
//       });
//     }
//   }
// );

// // ============================================================
// // DELETE SCHEDULED POST
// // ============================================================

// router.delete(
//   "/:id",

//   async (req, res) => {
//     try {
//       const {
//         id,
//       } = req.params;

//       await ScheduledSocialPost.findByIdAndDelete(
//         id
//       );

//       return res.json({
//         success: true,
//         message:
//           "Scheduled post deleted",
//       });
//     } catch (err) {
//       console.error(
//         "DELETE POST ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to delete post",
//       });
//     }
//   }
// );

// // ============================================================
// // REMOVE POST FROM SOCIALS
// // ============================================================

// router.post(
//   "/remove/:id",

//   async (req, res) => {
//     try {
//       const {
//         id,
//       } = req.params;

//       const post =
//         await ScheduledSocialPost.findById(
//           id
//         );

//       if (!post) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Post not found",
//         });
//       }

//       await axios.post(
//         MAKE_WEBHOOK_URL,

//         {
//           action: "delete",

//           postId:
//             post._id,

//           topic:
//             post.topic,

//           caption:
//             post.caption,

//           images:
//             post.images,

//           platforms:
//             post.platforms,

//           socialPostIds:
//             post.socialPostIds ||
//             {},
//         }
//       );

//       post.status =
//         "deleted";

//       await post.save();

//       return res.json({
//         success: true,
//         message:
//           "Remove request sent successfully",
//       });
//     } catch (err) {
//       console.error(
//         "REMOVE POST ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to remove post",
//       });
//     }
//   }
// );

// // ============================================================
// // GET SINGLE POST
// // ============================================================

// router.get(
//   "/:id",

//   async (req, res) => {
//     try {
//       const post =
//         await ScheduledSocialPost.findById(
//           req.params.id
//         );

//       if (!post) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Post not found",
//         });
//       }

//       res.json(post);
//     } catch (err) {
//       console.error(
//         err
//       );

//       res.status(500).json({
//         success: false,
//       });
//     }
//   }
// );

// // ============================================================
// // EDIT POST
// // ============================================================

// router.post(
//   "/edit/:id",

//   async (req, res) => {
//     try {
//       const {
//         id,
//       } = req.params;

//       const {
//         topic,
//         caption,
//         images,
//         publishDate,
//       } = req.body;

//       const post =
//         await ScheduledSocialPost.findById(
//           id
//         );

//       if (!post) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Post not found",
//         });
//       }

//       const wasPosted =
//         post.status ===
//         "posted";

//       post.topic =
//         topic ||
//         post.topic;

//       post.caption =
//         caption ||
//         post.caption;

//       post.images =
//         images?.length
//           ? images
//           : post.images;

//       if (publishDate) {
//         const parsedDate =
//           new Date(
//             publishDate
//           );

//         if (
//           isNaN(
//             parsedDate.getTime()
//           )
//         ) {
//           return res.status(400).json({
//             success: false,
//             message:
//               "Invalid publish date",
//           });
//         }

//         post.publishDate =
//           parsedDate;

//         if (!wasPosted) {
//           post.status =
//             "scheduled";
//         }
//       }

//       await post.save();

//       if (
//         wasPosted &&
//         post.platforms.includes(
//           "Facebook"
//         )
//       ) {
//         await axios.post(
//           MAKE_WEBHOOK_URL,

//           {
//             action: "edit",

//             postId:
//               post._id,

//             topic:
//               post.topic,

//             caption:
//               post.caption,

//             photos:
//               post.images.map(
//                 (img) => ({
//                   url: img,
//                   type: "url",
//                 })
//               ),

//             publishDate:
//               post.publishDate,

//             platforms:
//               post.platforms,

//             socialPostIds:
//               post.socialPostIds ||
//               {},
//           }
//         );
//       }

//       return res.json({
//         success: true,

//         message:
//           wasPosted
//             ? "Live social post updated successfully"
//             : "Scheduled post updated successfully",

//         post,
//       });
//     } catch (err) {
//       console.error(
//         "EDIT POST ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to edit post",
//       });
//     }
//   }
// );

// // ============================================================
// // EXPORT
// // ============================================================

// export default router;






































// import express from "express";
// import cors from "cors";
// import dotenv from "dotenv";
// import Groq from "groq-sdk";
// import axios from "axios";
// import multer from "multer";
// import path from "path";
// import fs from "fs";
// import { fileURLToPath } from "url";
// import { GoogleGenAI } from "@google/genai";
// import sharp from "sharp";

// import { generateImage } from "./social_manager.js";
// import ScheduledSocialPost from "../models/ScheduledSocialPost.js";

// const router = express.Router();

// // ============================================================
// // __dirname FIX
// // ============================================================

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // ============================================================
// // ENV
// // ============================================================
// //
// // Use absolute path so PM2 working directory cannot cause
// // the wrong .env file to be loaded.
// // ============================================================

// const ENV_PATH = path.resolve(
//   __dirname,
//   "../../.env"
// );

// dotenv.config({
//   path: ENV_PATH,
// });

// // ============================================================
// // APP
// // ============================================================

// const app = express();

// app.use(cors());
// app.use(express.json());

// // ============================================================
// // IMAGE DIRECTORY
// // ============================================================

// const IMAGE_DIR =
//   "/home/dhruvit/.openclaw/workspace/skills/blog_manager/images";

// if (!fs.existsSync(IMAGE_DIR)) {
//   fs.mkdirSync(IMAGE_DIR, {
//     recursive: true,
//   });
// }

// // ============================================================
// // MULTER STORAGE
// // ============================================================

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, IMAGE_DIR);
//   },

//   filename: (req, file, cb) => {
//     const uniqueName =
//       `upload-${Date.now()}-${Math.round(
//         Math.random() * 1e9
//       )}${path.extname(file.originalname)}`;

//     cb(null, uniqueName);
//   },
// });

// // ============================================================
// // FILE FILTER
// // ============================================================

// const fileFilter = (req, file, cb) => {
//   if (file.mimetype.startsWith("image/")) {
//     cb(null, true);
//   } else {
//     cb(
//       new Error("Only image files allowed"),
//       false
//     );
//   }
// };

// // ============================================================
// // MULTER
// // ============================================================
// //
// // 10MB maximum upload size.
// // ============================================================

// const upload = multer({
//   storage,
//   fileFilter,

//   limits: {
//     fileSize: 10 * 1024 * 1024,
//   },
// });

// // ============================================================
// // ENV
// // ============================================================

// const MAKE_WEBHOOK_URL =
//   process.env.MAKE_WEBHOOK_URL;

// // ============================================================
// // GEMINI
// // ============================================================

// const ai = new GoogleGenAI({
//   apiKey: process.env.GEMINI_API_KEY,
// });

// // ============================================================
// // EXISTING GEMINI MODEL
// // ============================================================
// //
// // Used by existing Topic + MLS caption generation.
// //
// // We are NOT changing this workflow.
// // ============================================================

// const MODEL = "gemini-2.5-flash";

// // ============================================================
// // AI DESIGN MODELS
// // ============================================================
// //
// // IMPORTANT:
// //
// // These are intentionally fixed here.
// //
// // This prevents an old environment variable such as:
// //
// // GEMINI_DESIGN_ANALYSIS_MODEL=gemini-2.5-pro
// //
// // from accidentally forcing the backend to use the retired
// // model.
// //
// // Gemini 3.1 Pro Preview is used for design analysis.
// // Gemini 3.1 Flash Image is used for image generation.
// // ============================================================

// const DESIGN_ANALYSIS_MODEL =
//   "gemini-3.1-pro-preview";

// const DESIGN_IMAGE_MODEL =
//   "gemini-3.1-flash-image";

// // ============================================================
// // STARTUP MODEL LOG
// // ============================================================

// console.log(
//   "============================================================"
// );

// console.log(
//   "GEMINI DESIGN ANALYSIS MODEL:",
//   DESIGN_ANALYSIS_MODEL
// );

// console.log(
//   "GEMINI DESIGN IMAGE MODEL:",
//   DESIGN_IMAGE_MODEL
// );

// console.log(
//   "GEMINI ENV PATH:",
//   ENV_PATH
// );

// console.log(
//   "GEMINI API KEY:",
//   process.env.GEMINI_API_KEY
//     ? "LOADED"
//     : "MISSING"
// );

// console.log(
//   "============================================================"
// );

// // ============================================================
// // AI CONTENT
// // ============================================================

// async function generateSocialContent(topic) {
//   const prompt = `
// You are an expert Calgary and Airdrie real estate social media strategist.

// Create ONE unique Facebook and Instagram post.

// TOPIC:

// ${topic}

// TARGET AUDIENCE:

// - Home buyers
// - Home sellers
// - First-time buyers
// - Real estate investors
// - Alberta homeowners

// LOCATION FOCUS:

// - Calgary
// - Airdrie
// - Chestermere
// - Cochrane
// - Okotoks
// - High River
// - Strathmore

// WRITING STYLE:

// - Professional
// - Modern
// - Friendly
// - Trustworthy
// - Conversational
// - Persuasive
// - Easy to read

// CONTENT REQUIREMENTS:

// - 150-200 words
// - Start with a strong hook
// - Naturally use relevant emojis
// - Highlight benefits instead of features
// - Include a clear call-to-action
// - Generate different wording every time
// - Never copy previous responses
// - Mention Calgary or nearby communities naturally when relevant

// CONTACT INFORMATION

// Mention naturally:

// 📞 403-439-1555
// 🌐 www.realtorparth.ca
// ✉️ hello@realtorparth.ca

// RULES:

// - Never say "Free Consultation"
// - Instead use:
//   "Contact me for a consultation."
// - No markdown
// - No headings
// - No bullet points
// - No quotation marks
// - Plain text only

// HASHTAGS:

// Always include:

// #realtorparth

// Also include 6-10 relevant hashtags such as:

// #CalgaryRealEstate
// #AirdrieRealEstate
// #YYCRealEstate
// #CalgaryHomes
// #AirdrieHomes
// #AlbertaRealEstate
// #CalgaryRealtor
// #DreamHome
// #HomeBuying
// #HomeSelling

// Return ONLY the social media caption.
// `;

//   const response =
//     await ai.models.generateContent({
//       model: MODEL,
//       contents: prompt,
//     });

//   return (response.text || "")
//     .replace(/^caption\s*:/i, "")
//     .replace(/^post\s*:/i, "")
//     .replace(/\*\*/g, "")
//     .replace(/```/g, "")
//     .trim();
// }

// // ============================================================
// // GROQ
// // ============================================================

// const groq = new Groq({
//   apiKey: process.env.GROQ_API_KEY,
// });

// // ============================================================
// // GENERATE PROPERTY SOCIAL POST
// // ============================================================

// export async function generatePropertyPost(
//   property
// ) {
//   const prompt = `
// Create a Facebook and Instagram real estate post.

// PROPERTY INFORMATION:

// Address:
// ${property.UnparsedAddress || ""}

// MLS:
// ${property.ListingKey || property.ListingId || ""}

// Price:
// ${property.ListPrice || ""}

// Property Type:
// ${property.PropertyType || ""}

// Style:
// ${property.ArchitecturalStyle || ""}

// City:
// ${property.City || ""}

// Community:
// ${property.SubdivisionName || ""}

// Bedrooms:
// ${property.BedroomsTotal || ""}

// Bathrooms:
// ${property.BathroomsTotalInteger || ""}

// Garage:
// ${property.GarageSpaces || ""}

// Square Feet:
// ${property.BuildingAreaTotal || ""}

// Year Built:
// ${property.YearBuilt || ""}

// Description:
// ${property.PublicRemarks || ""}

// REQUIREMENTS:

// - 120-180 words
// - Professional
// - Modern
// - Friendly
// - Trustworthy
// - Conversational
// - Persuasive
// - Include relevant emojis naturally
// - Include a strong opening hook
// - Highlight the property's most appealing benefits
// - Include a clear call-to-action
// - Calgary/Airdrie focused
// - Generate a UNIQUE caption every time
// - Use different wording and hooks
// - Avoid repetitive sentence structures
// - Make the post feel natural and human-written

// CONTACT INFORMATION:

// Mention naturally:

// Ph: 403-439-1555

// www.realtorparth.ca

// hello@realtorparth.ca

// RULES:

// - Never say "Free Consultation"
// - Instead use:
//   "Contact me for a consultation."
// - Price must be written with $ followed by the number
// - No markdown
// - No headings
// - No bullet points
// - No quotation marks
// - Do not give an Open House date or time
// - Do not invent property information
// - Only use facts provided in the property information
// - Do not mention information that is not available
// - Do not say that you are an AI
// - Return ONLY the social media post

// HASHTAGS:

// Always include:

// #realtorparth

// Also include relevant real estate hashtags, such as:

// #CalgaryRealEstate
// #AirdrieRealEstate
// #YYCRealEstate
// #CalgaryHomes
// #AirdrieHomes
// #AlbertaRealEstate
// #CalgaryRealtor
// #DreamHome
// #HomeBuying
// #HomeSelling

// Return only post text.
// `;

//   try {
//     const response =
//       await ai.models.generateContent({
//         model: MODEL,
//         contents: prompt,

//         config: {
//           temperature: 1.2,
//         },
//       });

//     const caption = (response.text || "")
//       .replace(/^caption\s*:/i, "")
//       .replace(/^post\s*:/i, "")
//       .replace(/\*\*/g, "")
//       .replace(/```/g, "")
//       .trim();

//     if (!caption) {
//       throw new Error(
//         "Gemini returned an empty property caption"
//       );
//     }

//     return {
//       caption,
//       property,
//     };
//   } catch (error) {
//     console.error(
//       "GEMINI PROPERTY POST ERROR:",
//       error?.response?.data ||
//         error?.message ||
//         error
//     );

//     throw error;
//   }
// }

// // ============================================================
// // GET PROPERTY IMAGE BUFFER
// // ============================================================

// async function getPropertyImageBuffer(
//   property,
//   imageIndex = 0
// ) {
//   const sortedMedia =
//     property.Media?.sort(
//       (a, b) =>
//         (a.Order ?? 0) -
//         (b.Order ?? 0)
//     ) || [];

//   const imageMedia =
//     sortedMedia.filter((media) => {
//       const url =
//         media.MediaURL?.toLowerCase() || "";

//       return (
//         url.endsWith(".jpg") ||
//         url.endsWith(".jpeg") ||
//         url.endsWith(".png") ||
//         url.includes(
//           "ddfcdn.realtor.ca"
//         )
//       );
//     });

//   if (!imageMedia.length) {
//     throw new Error(
//       "No property images found in MLS listing"
//     );
//   }

//   const imageUrl =
//     imageMedia[
//       imageIndex % imageMedia.length
//     ]?.MediaURL;

//   if (!imageUrl) {
//     throw new Error(
//       "Property image not found"
//     );
//   }

//   console.log(
//     "📸 MLS SOURCE IMAGE:",
//     imageUrl
//   );

//   const response = await axios.get(
//     imageUrl,
//     {
//       responseType: "arraybuffer",
//       timeout: 30000,
//     }
//   );

//   return {
//     buffer: Buffer.from(response.data),
//     imageUrl,
//   };
// }

// // ============================================================
// // EXISTING PROPERTY IMAGE GENERATOR
// // ============================================================

// async function generatePropertyImage(
//   property,
//   imageIndex = 0
// ) {
//   const fileName =
//     `property-${Date.now()}.jpg`;

//   const outputDir =
//     IMAGE_DIR;

//   if (!fs.existsSync(outputDir)) {
//     fs.mkdirSync(outputDir, {
//       recursive: true,
//     });
//   }

//   const outputPath =
//     path.join(
//       outputDir,
//       fileName
//     );

//   // =========================================================
//   // PROPERTY IMAGE
//   // =========================================================

//   const {
//     buffer: propertyImageBuffer,
//   } = await getPropertyImageBuffer(
//     property,
//     imageIndex
//   );

//   // =========================================================
//   // PROPERTY DATA
//   // =========================================================

//   const price =
//     property.ListPrice
//       ? `$${Number(
//           property.ListPrice
//         ).toLocaleString()}`
//       : "Call for Price";

//   const beds =
//     property.BedroomsTotal || 0;

//   const baths =
//     property.BathroomsTotalInteger || 0;

//   const city =
//     property.City || "Calgary";

//   const address =
//     (property.UnparsedAddress || "")
//       .length > 38
//       ? property.UnparsedAddress.substring(
//           0,
//           38
//         ) + "..."
//       : property.UnparsedAddress || "";

//   const mls =
//     property.ListingId || "";

//   const sqft =
//     property.BuildingAreaTotal ||
//     property.LivingArea ||
//     "";

//   const propertyType =
//     property.PropertyType || "";

//   // =========================================================
//   // REALTOR® SVG LOGO
//   // =========================================================

//   const realtorLogoPath =
//     path.join(
//       __dirname,
//       "assets/realtorparths_pdf",
//       "realtor_logo.svg"
//     );

//   const realtorLogoRaw =
//     await fs.promises.readFile(
//       realtorLogoPath,
//       "utf8"
//     );

//   const realtorLogoBase64 =
//     Buffer.from(
//       realtorLogoRaw
//     ).toString("base64");

//   // =========================================================
//   // REALTOR® LOGO OVERLAY
//   // =========================================================

//   const realtorLogoSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >
//       <image
//         href="data:image/svg+xml;base64,${realtorLogoBase64}"
//         x="55"
//         y="52"
//         width="190"
//         height="165"
//         opacity="0.35"
//         preserveAspectRatio="xMidYMid meet"
//       />
//     </svg>
//   `;

//   // =========================================================
//   // TOP PROPERTY DETAILS BACKGROUND
//   // =========================================================

//   const addressBgSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <rect
//         x="285"
//         y="32"
//         width="647"
//         height="205"
//         rx="18"
//         ry="18"
//         fill="rgba(20,20,20,0.72)"
//       />

//       <rect
//         x="285"
//         y="32"
//         width="647"
//         height="4"
//         rx="2"
//         fill="rgba(255,255,255,0.85)"
//       />

//       <line
//         x1="285"
//         y1="55"
//         x2="285"
//         y2="214"
//         stroke="#ffffff"
//         stroke-width="1"
//         opacity="0.25"
//       />

//     </svg>
//   `;

//   // =========================================================
//   // PROPERTY DETAILS TEXT
//   // =========================================================

//   const LEFT_LABEL_X = 315;
//   const LEFT_VALUE_X = 455;
//   const RIGHT_LABEL_X = 650;
//   const RIGHT_VALUE_X = 785;

//   const addressSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <style>

//         .address {
//           fill: #fff;
//           font: 800 32px Arial, Helvetica, sans-serif;
//         }

//         .mls {
//           fill: #F8F8F8;
//           font: 600 20px Arial, Helvetica, sans-serif;
//         }

//         .label {
//           fill: #CFCFCF;
//           font: 600 17px Arial, Helvetica, sans-serif;
//         }

//         .value {
//           fill: #fff;
//           font: 700 20px Arial, Helvetica, sans-serif;
//         }

//         .line {
//           stroke: #8F8F8F;
//           stroke-width: 1;
//           opacity: .45;
//         }

//       </style>

//       <text
//         x="315"
//         y="78"
//         class="address"
//       >
//         ${address}
//       </text>

//       <text
//         x="315"
//         y="110"
//         class="mls"
//       >
//         MLS® ${mls}
//       </text>

//       <line
//         x1="312"
//         y1="130"
//         x2="900"
//         y2="130"
//         class="line"
//       />

//       <text
//         x="${LEFT_LABEL_X}"
//         y="163"
//         class="label"
//       >
//         CITY
//       </text>

//       <text
//         x="${LEFT_VALUE_X}"
//         y="163"
//         class="value"
//       >
//         ${city}
//       </text>

//       <text
//         x="${LEFT_LABEL_X}"
//         y="199"
//         class="label"
//       >
//         BEDROOMS
//       </text>

//       <text
//         x="${LEFT_VALUE_X}"
//         y="199"
//         class="value"
//       >
//         ${beds}
//       </text>

//       <text
//         x="${RIGHT_LABEL_X}"
//         y="163"
//         class="label"
//       >
//         BATHROOMS
//       </text>

//       <text
//         x="${RIGHT_VALUE_X}"
//         y="163"
//         class="value"
//       >
//         ${baths}
//       </text>

//       <text
//         x="${RIGHT_LABEL_X}"
//         y="199"
//         class="label"
//       >
//         SIZE
//       </text>

//       <text
//         x="${RIGHT_VALUE_X}"
//         y="199"
//         class="value"
//       >
//         ${sqft || "-"} Sq Ft
//       </text>

//     </svg>
//   `;

//   // =========================================================
//   // FOOTER BACKGROUND
//   // =========================================================

//   const footerBgSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <rect
//         x="0"
//         y="1160"
//         width="280"
//         height="190"
//         fill="#ffffff"
//       />

//       <rect
//         x="280"
//         y="1160"
//         width="800"
//         height="190"
//         fill="#4b2b2b"
//       />

//     </svg>
//   `;

//   // =========================================================
//   // FOOTER TEXT
//   // =========================================================

//   const footerTextSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <style>

//         .name {
//           fill: #fff;
//           font: 800 38px Arial, Helvetica, sans-serif;
//         }

//         .role {
//           fill: #fff;
//           font: 400 30px Arial, Helvetica, sans-serif;
//         }

//         .phone {
//           fill: #fff;
//           font: 500 38px Arial, Helvetica, sans-serif;
//         }

//         .price {
//           fill: #222;
//           font: 800 34px Arial, Helvetica, sans-serif;
//         }

//         .info {
//           fill: #444;
//           font: 21px Arial, Helvetica, sans-serif;
//         }

//       </style>

//       <text
//         x="20"
//         y="1198"
//         class="price"
//       >
//         ${price}
//       </text>

//       <text
//         x="20"
//         y="1235"
//         class="info"
//       >
//         ${beds} Bed • ${baths} Bath
//       </text>

//       <text
//         x="20"
//         y="1268"
//         class="info"
//       >
//         ${propertyType}
//       </text>

//       <text
//         x="20"
//         y="1300"
//         class="info"
//       >
//         ${sqft || ""} Sq Ft
//       </text>

//       <text
//         x="20"
//         y="1332"
//         class="info"
//       >
//         MLS® ${mls}
//       </text>

//       <text
//         x="315"
//         y="1220"
//         class="name"
//       >
//         PARTH BRAHMBHATT
//       </text>

//       <text
//         x="455"
//         y="1275"
//         class="role"
//       >
//         REALTOR
//       </text>

//       <text
//         x="340"
//         y="1330"
//         class="phone"
//       >
//         403-439-1555
//       </text>

//     </svg>
//   `;

//   // =========================================================
//   // AGENT IMAGE
//   // =========================================================

//   const agentPath =
//     path.join(
//       __dirname,
//       "assets/realtorparths_pdf",
//       "agent12.png"
//     );

//   const agentBuffer =
//     await sharp(agentPath)
//       .resize({
//         height: 400,
//         fit: "inside",
//       })
//       .png()
//       .toBuffer();

//   // =========================================================
//   // BROKERAGE LOGO
//   // =========================================================

//   const logoPath =
//     path.join(
//       __dirname,
//       "assets/realtorparths_pdf",
//       "diamond_realty.jpeg"
//     );

//   const logoBuffer =
//     await sharp(logoPath)
//       .resize({
//         width: 280,
//         height: 190,
//         fit: "fill",
//       })
//       .png()
//       .toBuffer();

//   // =========================================================
//   // FINAL IMAGE
//   // =========================================================

//   const buffer =
//     await sharp(propertyImageBuffer)
//       .resize(
//         1080,
//         1350,
//         {
//           fit: "cover",
//         }
//       )
//       .composite([
//         {
//           input: Buffer.from(
//             addressBgSvg
//           ),
//           left: 0,
//           top: 0,
//         },

//         {
//           input: Buffer.from(
//             realtorLogoSvg
//           ),
//           left: 0,
//           top: 0,
//         },

//         {
//           input: Buffer.from(
//             addressSvg
//           ),
//           left: 0,
//           top: 0,
//         },

//         {
//           input: Buffer.from(
//             footerBgSvg
//           ),
//           left: 0,
//           top: 0,
//         },

//         {
//           input: Buffer.from(
//             footerTextSvg
//           ),
//           left: 0,
//           top: 0,
//         },

//         {
//           input: logoBuffer,
//           left: 0,
//           top: 1160,
//         },

//         {
//           input: agentBuffer,
//           left: 740,
//           top: 960,
//         },
//       ])
//       .flatten({
//         background: "#000000",
//       })
//       .jpeg({
//         quality: 84,
//         mozjpeg: true,
//       })
//       .toBuffer();

//   // =========================================================
//   // SAVE IMAGE
//   // =========================================================

//   await fs.promises.writeFile(
//     outputPath,
//     buffer
//   );

//   // =========================================================
//   // RETURN
//   // =========================================================

//   return {
//     imageURL:
//       `https://realtorparth.ca/social-images/${fileName}`,

//     outputPath,
//   };
// }

// // ============================================================
// // AI DESIGN HELPERS
// // ============================================================

// // ============================================================
// // GET MIME TYPE
// // ============================================================

// function getSafeMimeType(
//   mimetype
// ) {
//   if (
//     mimetype === "image/jpeg" ||
//     mimetype === "image/png" ||
//     mimetype === "image/webp"
//   ) {
//     return mimetype;
//   }

//   return "image/jpeg";
// }

// // ============================================================
// // READ IMAGE BUFFER
// // ============================================================

// async function readUploadedImage(
//   file
// ) {
//   if (!file) {
//     throw new Error(
//       "Reference image is required"
//     );
//   }

//   return fs.promises.readFile(
//     file.path
//   );
// }

// // ============================================================
// // GET CLOSEST GEMINI ASPECT RATIO
// // ============================================================

// async function getGeminiAspectRatio(
//   imageBuffer
// ) {
//   const metadata =
//     await sharp(imageBuffer).metadata();

//   const width =
//     metadata.width || 1;

//   const height =
//     metadata.height || 1;

//   const actualRatio =
//     width / height;

//   const ratios = [
//     {
//       name: "1:1",
//       value: 1 / 1,
//     },

//     {
//       name: "2:3",
//       value: 2 / 3,
//     },

//     {
//       name: "3:2",
//       value: 3 / 2,
//     },

//     {
//       name: "3:4",
//       value: 3 / 4,
//     },

//     {
//       name: "4:3",
//       value: 4 / 3,
//     },

//     {
//       name: "4:5",
//       value: 4 / 5,
//     },

//     {
//       name: "5:4",
//       value: 5 / 4,
//     },

//     {
//       name: "9:16",
//       value: 9 / 16,
//     },

//     {
//       name: "16:9",
//       value: 16 / 9,
//     },

//     {
//       name: "21:9",
//       value: 21 / 9,
//     },
//   ];

//   let closest =
//     ratios[0];

//   let smallestDifference =
//     Math.abs(
//       actualRatio -
//         closest.value
//     );

//   for (
//     const ratio of ratios
//   ) {
//     const difference =
//       Math.abs(
//         actualRatio -
//           ratio.value
//       );

//     if (
//       difference <
//       smallestDifference
//     ) {
//       closest = ratio;
//       smallestDifference =
//         difference;
//     }
//   }

//   return closest.name;
// }

// // ============================================================
// // EXTRACT TEXT FROM INTERACTION
// // ============================================================

// function extractInteractionText(
//   interaction
// ) {
//   let text = "";

//   if (
//     typeof interaction?.output_text ===
//     "string"
//   ) {
//     text =
//       interaction.output_text;
//   }

//   if (
//     !text &&
//     Array.isArray(
//       interaction?.steps
//     )
//   ) {
//     for (
//       const step of interaction.steps
//     ) {
//       if (
//         step?.type !==
//         "model_output"
//       ) {
//         continue;
//       }

//       const content =
//         step?.content || [];

//       for (
//         const block of content
//       ) {
//         if (
//           block?.type === "text"
//         ) {
//           text +=
//             block.text || "";
//         }
//       }
//     }
//   }

//   return text
//     .trim()
//     .replace(
//       /^```(?:text|markdown)?/i,
//       ""
//     )
//     .replace(
//       /```$/i,
//       ""
//     )
//     .trim();
// }

// // ============================================================
// // EXTRACT IMAGE FROM INTERACTION
// // ============================================================

// function extractInteractionImage(
//   interaction
// ) {
//   // ==========================================================
//   // PRIMARY
//   // ==========================================================

//   if (
//     interaction?.output_image?.data
//   ) {
//     return Buffer.from(
//       interaction.output_image.data,
//       "base64"
//     );
//   }

//   // ==========================================================
//   // FALLBACK
//   // ==========================================================

//   if (
//     Array.isArray(
//       interaction?.steps
//     )
//   ) {
//     for (
//       const step of interaction.steps
//     ) {
//       if (
//         step?.type !==
//         "model_output"
//       ) {
//         continue;
//       }

//       const content =
//         step?.content || [];

//       for (
//         const block of content
//       ) {
//         if (
//           block?.type === "image" &&
//           block?.data
//         ) {
//           return Buffer.from(
//             block.data,
//             "base64"
//           );
//         }

//         if (
//           block?.type ===
//             "output_image" &&
//           block?.data
//         ) {
//           return Buffer.from(
//             block.data,
//             "base64"
//           );
//         }
//       }
//     }
//   }

//   return null;
// }

// // ============================================================
// // ANALYZE DESIGN REFERENCE
// // ============================================================
// //
// // IMPORTANT:
// //
// // The uploaded image is analyzed ONLY for its design language.
// //
// // We intentionally do NOT want Gemini to treat the house in the
// // reference as the target house.
// // ============================================================

// async function analyzeDesignReference(
//   referenceBuffer,
//   referenceMimeType
// ) {
//   try {
//     const base64Image =
//       referenceBuffer.toString(
//         "base64"
//       );

//     const analysisPrompt = `
// You are an expert architectural visualization designer,
// architectural drafting analyst, real-estate marketing designer,
// and image composition specialist.

// Analyze the uploaded image ONLY as a DESIGN REFERENCE.

// IMPORTANT:

// The property/house visible in this reference image is NOT the
// property that will be used in the final generation.

// Do NOT create a prompt that copies or reconstructs this house.

// Your job is to extract the reusable visual design language so
// that the exact same style can later be applied to a completely
// different MLS property photograph.

// ============================================================
// DESIGN REFERENCE ONLY
// ============================================================

// Analyze:

// - overall composition
// - layout
// - color palette
// - photographic treatment
// - lighting treatment
// - architectural blueprint style
// - CAD-style overlays
// - dimension lines
// - extension lines
// - arrowheads
// - measurement labels
// - callout circles
// - technical labels
// - elevation drawings
// - section drawings
// - roof tracing
// - window tracing
// - door tracing
// - wall tracing
// - line thickness
// - line opacity
// - line brightness
// - technical typography
// - label positioning
// - spacing
// - visual hierarchy
// - technical drawing density
// - aspect ratio
// - background treatment
// - perspective treatment

// ============================================================
// ARCHITECTURAL DIMENSIONS
// ============================================================

// Identify the STYLE of dimensions shown.

// For example:

// - horizontal dimension strings
// - vertical dimension strings
// - building width
// - roof width
// - roof height
// - window width
// - window height
// - door dimensions
// - floor dimensions
// - extension lines
// - arrows
// - measurement text
// - dimension markers

// IMPORTANT:

// Do NOT treat any numerical measurement visible in this image
// as a measurement that should be copied to another property.

// If the image contains:

// 16'0"
// 10'-3"
// 4'-6"
// 4600
// 1100

// or similar values, explain only how the numbers are visually
// presented.

// Explicitly instruct the future image generator:

// "Do not copy numerical measurements from the design reference.
// Use verified property measurements when available. If verified
// measurements are unavailable, use non-numeric architectural
// guide lines or omit numerical dimensions."

// ============================================================
// TECHNICAL DRAWINGS
// ============================================================

// Analyze:

// - elevation drawing placement
// - section drawing placement
// - roof diagrams
// - wall details
// - window details
// - door details
// - construction-style details
// - numbered markers
// - callouts
// - technical labels
// - drawing blocks

// Describe where these elements appear relative to the main
// property photograph.

// ============================================================
// OVERLAY STYLE
// ============================================================

// Analyze:

// - line color
// - line opacity
// - line thickness
// - transparency
// - brightness
// - blending
// - tracing behavior
// - which edges are emphasized
// - which elements remain photographic

// ============================================================
// PHOTO STYLE
// ============================================================

// Analyze:

// - daylight/dusk
// - interior lighting
// - sky
// - shadows
// - camera angle
// - perspective
// - lens appearance
// - framing
// - neighborhood visibility
// - contrast
// - overall color grading

// ============================================================
// COMPOSITION
// ============================================================

// Analyze:

// - position of the main property
// - empty space
// - technical drawing locations
// - upper-right elevation
// - right-side technical panel
// - middle/right section drawing
// - dimension placement
// - callouts
// - visual balance

// ============================================================
// TEXT AND LABELS
// ============================================================

// Analyze:

// - technical drafting typography
// - approximate text size
// - white/gray text
// - alignment
// - spacing
// - label placement
// - numbering
// - callout circles
// - engineering-style notation

// ============================================================
// FINAL OUTPUT
// ============================================================

// Return ONLY a detailed reusable image-generation prompt.

// Do NOT return JSON.

// Do NOT describe the specific property.

// Do NOT describe the specific house as something to copy.

// The generated prompt must tell another image model:

// 1. The MLS property image will be the source of truth.
// 2. The MLS property must remain the actual property.
// 3. The uploaded reference is ONLY for visual design.
// 4. The reference house must NOT be copied.
// 5. The reference architecture must NOT replace the MLS property.
// 6. Architectural graphics must be aligned to the actual MLS property.
// 7. Numerical dimensions from the reference must NOT be copied.
// 8. Verified MLS dimensions should be used when available.
// 9. If verified dimensions are unavailable, avoid fabricated numbers.
// 10. The final image must remain photorealistic.
// 11. The architectural overlay should be premium and professional.
// 12. The final image should look like a real-estate architectural
//     marketing creative.

// Return ONLY the reusable prompt.
// `;

//     console.log(
//       "🤖 Gemini Design Analysis Model:",
//       DESIGN_ANALYSIS_MODEL
//     );

//     const interaction =
//       await ai.interactions.create({
//         model:
//           DESIGN_ANALYSIS_MODEL,

//         input: [
//           {
//             type: "image",
//             mime_type:
//               referenceMimeType,
//             data:
//               base64Image,
//           },

//           {
//             type: "text",
//             text:
//               analysisPrompt,
//           },
//         ],
//       });

//     const result =
//       extractInteractionText(
//         interaction
//       );

//     if (!result) {
//       console.error(
//         "❌ Gemini analysis interaction returned no text:"
//       );

//       console.error(
//         JSON.stringify(
//           interaction,
//           null,
//           2
//         )
//       );

//       throw new Error(
//         "Gemini did not return a design prompt"
//       );
//     }

//     return result;
//   } catch (error) {
//     console.error(
//       "❌ GEMINI DESIGN ANALYSIS ERROR:",
//       error?.response?.data ||
//         error?.message ||
//         error
//     );

//     throw error;
//   }
// }

// // ============================================================
// // GENERATE AI DESIGN IMAGE
// // ============================================================
// //
// // VERY IMPORTANT:
// //
// // IMAGE 1 = ACTUAL MLS PROPERTY
// // IMAGE 2 = DESIGN REFERENCE
// //
// // The MLS image is deliberately supplied FIRST.
// //
// // This makes the property photo the primary visual source.
// // ============================================================

// async function generateAIDesignImage({
//   referenceBuffer,
//   referenceMimeType,
//   propertyBuffer,
//   designPrompt,
//   property,
// }) {
//   if (!referenceBuffer) {
//     throw new Error(
//       "Reference image is required"
//     );
//   }

//   if (!propertyBuffer) {
//     throw new Error(
//       "Property image is required"
//     );
//   }

//   if (!designPrompt) {
//     throw new Error(
//       "Design prompt is required"
//     );
//   }

//   // ==========================================================
//   // OUTPUT ASPECT RATIO
//   // ==========================================================

//   const aspectRatio =
//     await getGeminiAspectRatio(
//       referenceBuffer
//     );

//   console.log(
//     "🎨 AI DESIGN OUTPUT ASPECT RATIO:",
//     aspectRatio
//   );

//   // ==========================================================
//   // REFERENCE BASE64
//   // ==========================================================

//   const referenceBase64 =
//     referenceBuffer.toString(
//       "base64"
//     );

//   // ==========================================================
//   // NORMALIZE MLS IMAGE
//   // ==========================================================

//   const normalizedPropertyBuffer =
//     await sharp(
//       propertyBuffer
//     )
//       .rotate()
//       .jpeg({
//         quality: 94,
//         mozjpeg: true,
//       })
//       .toBuffer();

//   const propertyBase64 =
//     normalizedPropertyBuffer.toString(
//       "base64"
//     );

//   // ==========================================================
//   // PROPERTY FACTS
//   // ==========================================================

//   const propertyFacts = `
// VERIFIED MLS PROPERTY INFORMATION:

// Address:
// ${property.UnparsedAddress || "Not provided"}

// MLS:
// ${property.ListingKey ||
//   property.ListingId ||
//   "Not provided"}

// Price:
// ${property.ListPrice || "Not provided"}

// Property Type:
// ${property.PropertyType || "Not provided"}

// Architectural Style:
// ${property.ArchitecturalStyle || "Not provided"}

// City:
// ${property.City || "Not provided"}

// Community:
// ${property.SubdivisionName || "Not provided"}

// Bedrooms:
// ${property.BedroomsTotal || "Not provided"}

// Bathrooms:
// ${property.BathroomsTotalInteger || "Not provided"}

// Garage:
// ${property.GarageSpaces || "Not provided"}

// Building Area:
// ${property.BuildingAreaTotal || "Not provided"}

// Living Area:
// ${property.LivingArea || "Not provided"}

// Year Built:
// ${property.YearBuilt || "Not provided"}
// `;

//   // ==========================================================
//   // FINAL PROMPT
//   // ==========================================================

//   const finalPrompt = `
// You are creating a premium professional real-estate
// architectural marketing image.

// There are TWO supplied images.

// ============================================================
// IMAGE ROLES — VERY IMPORTANT
// ============================================================

// IMAGE 1 = ACTUAL MLS PROPERTY PHOTO.

// IMAGE 2 = DESIGN / ARCHITECTURAL STYLE REFERENCE.

// IMAGE 1 IS THE SOURCE OF TRUTH FOR THE PROPERTY.

// IMAGE 2 IS ONLY A DESIGN REFERENCE.

// The final image MUST show the actual property from IMAGE 1.

// ============================================================
// ABSOLUTE PROPERTY PRESERVATION
// ============================================================

// DO NOT replace the house from IMAGE 1 with the house from IMAGE 2.

// DO NOT copy the house from IMAGE 2.

// DO NOT use IMAGE 2 as the architectural source for the building.

// DO NOT reconstruct the property from IMAGE 2.

// DO NOT change the MLS property's:

// - roof shape
// - roof pitch
// - roof ridge
// - building width
// - building height
// - number of floors
// - windows
// - window positions
// - window proportions
// - doors
// - door positions
// - garage
// - garage position
// - porch
// - balconies
// - siding
// - exterior materials
// - facade
// - building extensions
// - architectural massing
// - driveway
// - visible landscaping
// - neighboring buildings
// - property perspective

// The final image should immediately be recognizable as the
// same property shown in IMAGE 1.

// If IMAGE 1 and IMAGE 2 show different houses, ALWAYS use
// the house from IMAGE 1.

// ============================================================
// WHAT IMAGE 2 IS ALLOWED TO PROVIDE
// ============================================================

// Use IMAGE 2 ONLY for:

// - visual style
// - composition style
// - architectural drafting style
// - blueprint treatment
// - technical linework
// - dimension-line appearance
// - elevation drawing style
// - section drawing style
// - annotation style
// - typography style
// - line opacity
// - line thickness
// - technical graphic placement
// - overall marketing aesthetic
// - color treatment
// - visual hierarchy

// Do NOT use IMAGE 2 to determine:

// - house shape
// - roof design
// - windows
// - doors
// - garage
// - balconies
// - building dimensions
// - floor count
// - landscaping
// - property architecture

// ============================================================
// PRIMARY TASK
// ============================================================

// Take the REAL MLS PROPERTY PHOTOGRAPH from IMAGE 1.

// Keep that property photorealistic.

// Then apply the architectural drafting / blueprint visual
// treatment from IMAGE 2.

// The final image should communicate:

// ACTUAL MLS PROPERTY
// +
// ARCHITECTURAL CAD OVERLAY
// +
// TECHNICAL DIMENSION STYLE
// +
// ELEVATION GRAPHICS
// +
// SECTION GRAPHICS
// +
// ARCHITECTURAL CALLOUTS.

// ============================================================
// DESIGN PROMPT
// ============================================================

// The following is the editable design prompt generated from
// the uploaded reference image.

// Use it for STYLE ONLY.

// Do NOT allow it to override the MLS property.

// ------------------------------------------------------------

// ${designPrompt}

// ------------------------------------------------------------

// ============================================================
// VERIFIED PROPERTY INFORMATION
// ============================================================

// ${propertyFacts}

// Use this information only for factual property context.

// ============================================================
// MEASUREMENT SAFETY
// ============================================================

// This is extremely important.

// NEVER copy numerical measurements from IMAGE 2.

// Any measurements visible in IMAGE 2 belong to the design
// reference and MUST NOT be transferred to the MLS property.

// For example, if IMAGE 2 contains:

// 16'0"
// 10'-3"
// 4'-6"
// 4600
// 1100
// 19'6"

// do NOT place those numbers on the MLS property.

// If actual verified property measurements are available,
// use only those verified measurements.

// If verified measurements are NOT available:

// - use non-numeric dimension lines,
// - use architectural guide lines,
// - use subtle measurement markers,
// - or omit numerical measurements.

// NEVER fabricate property measurements.

// ============================================================
// ARCHITECTURAL OVERLAY
// ============================================================

// Apply technical architectural graphics to the actual MLS house.

// Trace the actual visible geometry from IMAGE 1:

// - roof edges
// - roof ridge
// - roof slopes
// - major walls
// - windows
// - doors
// - garage
// - porch
// - balconies
// - visible architectural features

// The overlay should align with the actual property.

// Use:

// - thin white CAD lines
// - subtle transparency
// - precise extension lines
// - dimension markers
// - architectural callouts
// - technical labels
// - circles
// - engineering-style annotation

// The technical graphics must appear intentionally integrated
// with the photograph.

// Do not place random lines over the property.

// ============================================================
// DIMENSION STYLE
// ============================================================

// Recreate the visual STYLE of the reference dimensions:

// - horizontal dimension strings
// - vertical dimension strings
// - extension lines
// - arrowheads
// - measurement markers
// - architectural callouts
// - technical labels
// - numbered markers

// However:

// DO NOT COPY THE NUMERICAL VALUES FROM THE REFERENCE.

// Dimension lines should correspond visually to the actual
// MLS property geometry.

// ============================================================
// ELEVATION GRAPHICS
// ============================================================

// If the design reference contains elevation drawings,
// create a similar technical elevation graphic.

// The elevation must be based on the actual MLS property.

// It must NOT be a copy of the reference house.

// Place it in approximately the same compositional region
// as the reference.

// Keep it subtle and professional.

// ============================================================
// SECTION GRAPHICS
// ============================================================

// If the reference contains a section drawing, create a similar
// architectural section-style graphic.

// Keep the graphic visually consistent with the reference.

// Do NOT invent factual construction details.

// Do NOT invent wall assemblies.

// Do NOT invent floor dimensions.

// Do NOT invent structural specifications.

// ============================================================
// PHOTO PRESERVATION
// ============================================================

// The underlying MLS property photograph must remain
// photorealistic.

// Preserve:

// - actual house
// - actual materials
// - actual windows
// - actual doors
// - actual roof
// - actual garage
// - actual landscaping
// - actual surroundings
// - actual perspective
// - actual lighting

// Do not transform the property into:

// - a 3D render
// - a cartoon
// - a completely different architectural model
// - a generic house
// - a new building

// ============================================================
// COLOR AND LIGHTING
// ============================================================

// Match the reference design's:

// - blue/gray architectural atmosphere
// - white technical linework
// - subtle technical contrast
// - professional real-estate presentation
// - photographic realism
// - lighting balance

// The architectural graphics should enhance the MLS photograph,
// not cover it completely.

// ============================================================
// COMPOSITION
// ============================================================

// The actual MLS property should remain the dominant subject.

// Technical drawings should be secondary.

// Maintain:

// - strong visual hierarchy
// - readable property
// - clean technical graphics
// - premium composition
// - balanced negative space
// - professional architectural presentation

// Do not let the reference property's architecture dominate.

// ============================================================
// IMPORTANT FINAL CHECK
// ============================================================

// Before producing the final image, verify all of the following:

// 1. The house is the house from IMAGE 1.
// 2. The roof is from IMAGE 1.
// 3. The windows are from IMAGE 1.
// 4. The doors are from IMAGE 1.
// 5. The garage is from IMAGE 1.
// 6. The facade is from IMAGE 1.
// 7. The property proportions are from IMAGE 1.
// 8. The perspective is from IMAGE 1.
// 9. IMAGE 2 is being used only for design/style.
// 10. No house from IMAGE 2 has been copied.
// 11. No reference dimensions have been copied.
// 12. No fake numerical measurements have been added.
// 13. The architectural overlay follows IMAGE 1.
// 14. The property remains photorealistic.
// 15. The result looks like a premium real-estate architectural
//     marketing creative.

// If there is any conflict between IMAGE 1 and IMAGE 2:

// ALWAYS PRIORITIZE IMAGE 1 FOR THE PROPERTY.

// ALWAYS PRIORITIZE IMAGE 2 FOR THE DESIGN STYLE.

// ============================================================
// OUTPUT
// ============================================================

// Generate ONE final image.

// Use this aspect ratio:

// ${aspectRatio}

// The final image must be a premium professional
// real-estate architectural visualization.
// `;

//   // ==========================================================
//   // LOG
//   // ==========================================================

//   console.log(
//     "============================================================"
//   );

//   console.log(
//     "🤖 AI DESIGN IMAGE GENERATION"
//   );

//   console.log(
//     "Model:",
//     DESIGN_IMAGE_MODEL
//   );

//   console.log(
//     "IMAGE 1:",
//     "ACTUAL MLS PROPERTY"
//   );

//   console.log(
//     "IMAGE 2:",
//     "DESIGN REFERENCE"
//   );

//   console.log(
//     "============================================================"
//   );

//   // ==========================================================
//   // GEMINI INTERACTIONS IMAGE GENERATION
//   // ==========================================================
//   //
//   // IMPORTANT:
//   //
//   // MLS PROPERTY IS FIRST.
//   //
//   // DESIGN REFERENCE IS SECOND.
//   //
//   // This ordering matches the role definitions in the prompt.
//   // ==========================================================

//   const interaction =
//     await ai.interactions.create({
//       model:
//         DESIGN_IMAGE_MODEL,

//       input: [
//         // ======================================================
//         // IMAGE 1 — ACTUAL MLS PROPERTY
//         // ======================================================

//         {
//           type: "image",
//           mime_type:
//             "image/jpeg",
//           data:
//             propertyBase64,
//         },

//         // ======================================================
//         // IMAGE 2 — DESIGN REFERENCE
//         // ======================================================

//         {
//           type: "image",
//           mime_type:
//             referenceMimeType,
//           data:
//             referenceBase64,
//         },

//         // ======================================================
//         // INSTRUCTIONS
//         // ======================================================

//         {
//           type: "text",
//           text:
//             finalPrompt,
//         },
//       ],

//       response_format: {
//         type: "image",

//         aspect_ratio:
//           aspectRatio,

//         image_size:
//           "2K",
//       },
//     });

//   // ==========================================================
//   // EXTRACT GENERATED IMAGE
//   // ==========================================================

//   const generatedImageBuffer =
//     extractInteractionImage(
//       interaction
//     );

//   if (
//     !generatedImageBuffer
//   ) {
//     console.error(
//       "❌ Gemini image interaction returned no image:"
//     );

//     console.error(
//       JSON.stringify(
//         interaction,
//         null,
//         2
//       )
//     );

//     throw new Error(
//       "Gemini did not return a generated image"
//     );
//   }

//   // ==========================================================
//   // OUTPUT FILE
//   // ==========================================================

//   const fileName =
//     `ai-design-${Date.now()}.jpg`;

//   const outputPath =
//     path.join(
//       IMAGE_DIR,
//       fileName
//     );

//   // ==========================================================
//   // SHARP PROCESSING
//   // ==========================================================
//   //
//   // We do NOT apply the old 1080x1350 property footer.
//   //
//   // AI Design keeps the generated architectural composition.
//   // ==========================================================

//   const realtorLogoPath =
//     path.join(
//       __dirname,
//       "assets/realtorparths_pdf",
//       "realtor_logo.svg"
//     );

//   let finalBuffer =
//     generatedImageBuffer;

//   if (
//     fs.existsSync(
//       realtorLogoPath
//     )
//   ) {
//     try {
//       const logoRaw =
//         await fs.promises.readFile(
//           realtorLogoPath,
//           "utf8"
//         );

//       const logoBase64 =
//         Buffer.from(
//           logoRaw
//         ).toString(
//           "base64"
//         );

//       const logoSvg = `
//         <svg
//           width="300"
//           height="220"
//           xmlns="http://www.w3.org/2000/svg"
//         >
//           <image
//             href="data:image/svg+xml;base64,${logoBase64}"
//             x="35"
//             y="30"
//             width="220"
//             height="180"
//             opacity="0.45"
//             preserveAspectRatio="xMidYMid meet"
//           />
//         </svg>
//       `;

//       finalBuffer =
//         await sharp(
//           generatedImageBuffer
//         )
//           .composite([
//             {
//               input:
//                 Buffer.from(
//                   logoSvg
//                 ),
//               left: 0,
//               top: 0,
//             },
//           ])
//           .jpeg({
//             quality: 92,
//             mozjpeg: true,
//           })
//           .toBuffer();
//     } catch (logoError) {
//       console.warn(
//         "AI DESIGN LOGO OVERLAY WARNING:",
//         logoError?.message ||
//           logoError
//       );

//       finalBuffer =
//         await sharp(
//           generatedImageBuffer
//         )
//           .jpeg({
//             quality: 92,
//             mozjpeg: true,
//           })
//           .toBuffer();
//     }
//   } else {
//     finalBuffer =
//       await sharp(
//         generatedImageBuffer
//       )
//         .jpeg({
//           quality: 92,
//           mozjpeg: true,
//         })
//         .toBuffer();
//   }

//   // ==========================================================
//   // SAVE
//   // ==========================================================

//   await fs.promises.writeFile(
//     outputPath,
//     finalBuffer
//   );

//   console.log(
//     "✅ AI DESIGN IMAGE SAVED:",
//     outputPath
//   );

//   // ==========================================================
//   // RETURN
//   // ==========================================================

//   return {
//     imageURL:
//       `https://realtorparth.ca/social-images/${fileName}`,

//     outputPath,

//     aspectRatio,

//     model:
//       DESIGN_IMAGE_MODEL,
//   };
// }

// // ============================================================
// // DELETE TEMP UPLOAD
// // ============================================================

// async function deleteTempFile(
//   filePath
// ) {
//   if (!filePath) {
//     return;
//   }

//   try {
//     await fs.promises.unlink(
//       filePath
//     );
//   } catch {
//     // Ignore cleanup errors.
//   }
// }

// // ============================================================
// // ANALYZE AI DESIGN REFERENCE
// // ============================================================

// router.post(
//   "/analyze-design",
//   upload.single("referenceImage"),

//   async (req, res) => {
//     try {
//       // ======================================================
//       // VALIDATION
//       // ======================================================

//       if (!req.file) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Reference image is required",
//         });
//       }

//       console.log(
//         "🎨 AI DESIGN: analyzing reference image:",
//         req.file.originalname
//       );

//       // ======================================================
//       // READ IMAGE
//       // ======================================================

//       const referenceBuffer =
//         await readUploadedImage(
//           req.file
//         );

//       const referenceMimeType =
//         getSafeMimeType(
//           req.file.mimetype
//         );

//       // ======================================================
//       // GEMINI ANALYSIS
//       // ======================================================

//       const prompt =
//         await analyzeDesignReference(
//           referenceBuffer,
//           referenceMimeType
//         );

//       // ======================================================
//       // RESPONSE
//       // ======================================================

//       return res.json({
//         success: true,

//         prompt,

//         model:
//           DESIGN_ANALYSIS_MODEL,
//       });
//     } catch (err) {
//       console.error(
//         "❌ AI DESIGN ANALYSIS ERROR:",
//         err?.response?.data ||
//           err?.message ||
//           err
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           err?.response?.data?.message ||
//           err?.message ||
//           "Failed to analyze design reference",
//       });
//     } finally {
//       await deleteTempFile(
//         req.file?.path
//       );
//     }
//   }
// );

// // ============================================================
// // GENERATE AI DESIGN PROPERTY IMAGE
// // ============================================================

// router.post(
//   "/generate-design",
//   upload.single("referenceImage"),

//   async (req, res) => {
//     try {
//       const {
//         mls,
//         prompt,
//       } = req.body;

//       // ======================================================
//       // VALIDATION
//       // ======================================================

//       if (!req.file) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Reference image is required",
//         });
//       }

//       if (
//         !mls ||
//         typeof mls !== "string"
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "MLS number is required",
//         });
//       }

//       if (
//         !prompt ||
//         typeof prompt !== "string" ||
//         !prompt.trim()
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Design prompt is required",
//         });
//       }

//       const cleanMLS =
//         mls.trim();

//       const cleanPrompt =
//         prompt.trim();

//       console.log(
//         "============================================================"
//       );

//       console.log(
//         "🎨 AI DESIGN GENERATION"
//       );

//       console.log(
//         "MLS:",
//         cleanMLS
//       );

//       console.log(
//         "============================================================"
//       );

//       // ======================================================
//       // READ REFERENCE IMAGE
//       // ======================================================

//       const referenceBuffer =
//         await readUploadedImage(
//           req.file
//         );

//       const referenceMimeType =
//         getSafeMimeType(
//           req.file.mimetype
//         );

//       // ======================================================
//       // GET PROPERTY
//       // ======================================================

//       console.log(
//         "🏡 Getting MLS property:",
//         cleanMLS
//       );

//       const propertyResponse =
//         await axios.get(
//           `https://realtorparth.ca/api/properties/analysis/${cleanMLS}`,
//           {
//             timeout: 30000,
//           }
//         );

//       const property =
//         propertyResponse.data?.property;

//       if (!property) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Property not found",
//         });
//       }

//       // ======================================================
//       // ALBERTA ONLY
//       // ======================================================

//       const province =
//         property.StateOrProvince ||
//         property.Province ||
//         "";

//       if (
//         province &&
//         province.toLowerCase() !==
//           "ab" &&
//         province.toLowerCase() !==
//           "alberta"
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Only Alberta properties are supported",
//         });
//       }

//       // ======================================================
//       // GET ACTUAL MLS PROPERTY IMAGE
//       // ======================================================

//       console.log(
//         "📸 Getting ACTUAL MLS property image..."
//       );

//       const {
//         buffer: propertyImageBuffer,
//         imageUrl,
//       } =
//         await getPropertyImageBuffer(
//           property,
//           0
//         );

//       console.log(
//         "✅ Actual MLS image downloaded:"
//       );

//       console.log(
//         imageUrl
//       );

//       // ======================================================
//       // GENERATE PROPERTY CAPTION
//       // ======================================================

//       console.log(
//         "✍️ Generating property caption..."
//       );

//       const preview =
//         await generatePropertyPost(
//           property
//         );

//       // ======================================================
//       // GENERATE AI DESIGN IMAGE
//       // ======================================================

//       console.log(
//         "🤖 Generating AI architectural design..."
//       );

//       const generated =
//         await generateAIDesignImage({
//           referenceBuffer,

//           referenceMimeType,

//           propertyBuffer:
//             propertyImageBuffer,

//           designPrompt:
//             cleanPrompt,

//           property,
//         });

//       // ======================================================
//       // RESPONSE
//       // ======================================================

//       return res.json({
//         success: true,

//         topic:
//           property.UnparsedAddress ||
//           cleanMLS,

//         caption:
//           preview.caption,

//         imageURL:
//           generated.imageURL,

//         property,

//         prompt:
//           cleanPrompt,

//         aspectRatio:
//           generated.aspectRatio,

//         model:
//           generated.model,

//         sourcePropertyImage:
//           imageUrl,
//       });
//     } catch (err) {
//       console.error(
//         "❌ AI DESIGN GENERATION ERROR:",
//         err?.response?.data ||
//           err?.message ||
//           err
//       );

//       return res.status(500).json({
//         success: false,

//         message:
//           err?.response?.data?.message ||
//           err?.message ||
//           "Failed to generate AI property design",
//       });
//     } finally {
//       await deleteTempFile(
//         req.file?.path
//       );
//     }
//   }
// );

// // ============================================================
// // GENERATE PROPERTY SOCIAL POST
// // ============================================================

// router.post(
//   "/generate-property",

//   async (req, res) => {
//     try {
//       const {
//         mls,
//       } = req.body;

//       if (
//         !mls ||
//         typeof mls !== "string"
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "MLS number is required",
//         });
//       }

//       const cleanMLS =
//         mls.trim();

//       console.log(
//         "🏡 Generating property social post for MLS:",
//         cleanMLS
//       );

//       const propertyResponse =
//         await axios.get(
//           `https://realtorparth.ca/api/properties/analysis/${cleanMLS}`
//         );

//       const property =
//         propertyResponse.data?.property;

//       if (!property) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Property not found",
//         });
//       }

//       const province =
//         property.StateOrProvince ||
//         property.Province ||
//         "";

//       if (
//         province &&
//         province.toLowerCase() !==
//           "ab" &&
//         province.toLowerCase() !==
//           "alberta"
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Only Alberta properties are supported",
//         });
//       }

//       const preview =
//         await generatePropertyPost(
//           property
//         );

//       const {
//         imageURL,
//       } =
//         await generatePropertyImage(
//           property,
//           0
//         );

//       return res.json({
//         success: true,

//         topic:
//           property.UnparsedAddress,

//         caption:
//           preview.caption,

//         imageURL,

//         property,
//       });
//     } catch (err) {
//       console.error(
//         "PROPERTY SOCIAL POST ERROR:",
//         err?.response?.data ||
//           err?.message ||
//           err
//       );

//       return res.status(500).json({
//         success: false,

//         message:
//           err?.response?.data?.message ||
//           "Failed to generate property social post",
//       });
//     }
//   }
// );

// // ============================================================
// // GENERATE POST
// // ============================================================

// router.post(
//   "/generate",

//   async (req, res) => {
//     try {
//       const {
//         topic,
//       } = req.body;

//       if (!topic) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Topic is required",
//         });
//       }

//       console.log(
//         "📱 Generating social post:",
//         topic
//       );

//       const caption =
//         await generateSocialContent(
//           topic
//         );

//       const {
//         imageURL,
//       } =
//         await generateImage(
//           topic
//         );

//       return res.json({
//         success: true,
//         topic,
//         caption,
//         imageURL,
//       });
//     } catch (err) {
//       console.error(
//         "SOCIAL API ERROR:",
//         err?.response?.data ||
//           err?.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to generate social post",
//       });
//     }
//   }
// );

// // ============================================================
// // UPLOAD SOCIAL IMAGES
// // ============================================================

// router.post(
//   "/upload-social-images",

//   upload.array(
//     "images",
//     10
//   ),

//   async (req, res) => {
//     try {
//       const files =
//         req.files;

//       if (
//         !files ||
//         !files.length
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "No images uploaded",
//         });
//       }

//       const urls =
//         files.map(
//           (file) =>
//             `https://realtorparth.ca/social-images/${file.filename}`
//         );

//       return res.json({
//         success: true,
//         urls,
//       });
//     } catch (err) {
//       console.error(
//         "UPLOAD ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to upload images",
//       });
//     }
//   }
// );

// // ============================================================
// // GET POSTED COMMENT POSTS
// // ============================================================

// router.get(
//   "/posted-comment-posts",

//   async (req, res) => {
//     try {
//       const thirtyDaysAgo =
//         new Date();

//       thirtyDaysAgo.setDate(
//         thirtyDaysAgo.getDate() -
//           30
//       );

//       const posts =
//         await ScheduledSocialPost.find(
//           {
//             status: "posted",

//             publishDate: {
//               $gte: thirtyDaysAgo,
//             },
//           },

//           {
//             socialPostIds: 1,
//             publishDate: 1,
//             _id: 0,
//           }
//         ).sort({
//           publishDate: -1,
//         });

//       return res.json({
//         success: true,
//         count: posts.length,
//         posts,
//       });
//     } catch (err) {
//       console.error(
//         "❌ GET POSTED COMMENT POSTS ERROR:",
//         err
//       );

//       return res.status(500).json({
//         success: false,
//         count: 0,
//         posts: [],
//         message:
//           "Failed to get posted social posts",
//       });
//     }
//   }
// );

// // ============================================================
// // PLATFORM KEY
// // ============================================================

// function getPlatformKey(
//   platform
// ) {
//   const normalized =
//     String(
//       platform || ""
//     ).toLowerCase();

//   if (
//     normalized ===
//     "facebook"
//   ) {
//     return "Facebook";
//   }

//   if (
//     normalized ===
//     "instagram"
//   ) {
//     return "Instagram";
//   }

//   return null;
// }

// // ============================================================
// // CHECK REPLIED COMMENT
// // ============================================================

// router.post(
//   "/check",

//   async (req, res) => {
//     try {
//       const {
//         platform,
//         postId,
//         commentId,
//       } = req.body;

//       if (
//         !platform ||
//         !postId ||
//         !commentId
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "platform, postId and commentId are required",
//         });
//       }

//       const platformKey =
//         getPlatformKey(
//           platform
//         );

//       const normalizedPlatform =
//         platform.toLowerCase();

//       if (!platformKey) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Invalid platform",
//         });
//       }

//       const post =
//         await ScheduledSocialPost.findOne(
//           {
//             [`socialPostIds.${platformKey}`]:
//               String(postId),
//           }
//         );

//       if (!post) {
//         console.log(
//           `⚠️ CHECK POST NOT FOUND | ${platformKey} | postId=${postId}`
//         );

//         return res.status(404).json({
//           success: false,
//           message:
//             "Post not found",
//         });
//       }

//       const alreadyReplied =
//         post.repliedComments.some(
//           (item) =>
//             String(
//               item.commentId
//             ) ===
//               String(
//                 commentId
//               ) &&
//             String(
//               item.platform
//             ).toLowerCase() ===
//               normalizedPlatform
//         );

//       console.log(
//         `🔍 CHECK REPLY | ${platformKey} | comment=${commentId} | alreadyReplied=${alreadyReplied}`
//       );

//       return res.json({
//         success: true,
//         alreadyReplied,
//       });
//     } catch (err) {
//       console.error(
//         "❌ CHECK REPLIED ERROR:",
//         err
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Server error",
//       });
//     }
//   }
// );

// // ============================================================
// // SAVE REPLIED COMMENT
// // ============================================================

// router.post(
//   "/save",

//   async (req, res) => {
//     try {
//       const {
//         platform,
//         postId,
//         commentId,
//       } = req.body;

//       if (
//         !platform ||
//         !postId ||
//         !commentId
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "platform, postId and commentId are required",
//         });
//       }

//       const platformKey =
//         getPlatformKey(
//           platform
//         );

//       const normalizedPlatform =
//         platform.toLowerCase();

//       if (!platformKey) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Invalid platform",
//         });
//       }

//       const post =
//         await ScheduledSocialPost.findOne(
//           {
//             [`socialPostIds.${platformKey}`]:
//               String(postId),
//           }
//         );

//       if (!post) {
//         console.log(
//           `⚠️ SAVE POST NOT FOUND | ${platformKey} | postId=${postId}`
//         );

//         return res.status(404).json({
//           success: false,
//           message:
//             "Post not found",
//         });
//       }

//       const alreadyExists =
//         post.repliedComments.some(
//           (item) =>
//             String(
//               item.commentId
//             ) ===
//               String(
//                 commentId
//               ) &&
//             String(
//               item.platform
//             ).toLowerCase() ===
//               normalizedPlatform
//         );

//       if (alreadyExists) {
//         console.log(
//           `⏭️ ALREADY SAVED | ${platformKey} | comment=${commentId}`
//         );

//         return res.json({
//           success: true,
//           alreadyExists: true,
//         });
//       }

//       post.repliedComments.push({
//         commentId:
//           String(commentId),

//         platform:
//           normalizedPlatform,

//         repliedAt:
//           new Date(),
//       });

//       await post.save();

//       console.log(
//         `💾 REPLIED COMMENT SAVED | ${platformKey} | comment=${commentId}`
//       );

//       return res.json({
//         success: true,
//         alreadyExists: false,
//       });
//     } catch (err) {
//       console.error(
//         "❌ SAVE REPLIED ERROR:",
//         err
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Server error",
//       });
//     }
//   }
// );

// // ============================================================
// // SAVE PLATFORM POST ID
// // ============================================================

// router.post(
//   "/save-platform-post-id",

//   async (req, res) => {
//     try {
//       const {
//         postId,
//         platform,
//         platformPostId,
//       } = req.body;

//       const post =
//         await ScheduledSocialPost.findById(
//           postId
//         );

//       if (!post) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Post not found",
//         });
//       }

//       post.socialPostIds = {
//         ...post.socialPostIds,
//         [platform]:
//           platformPostId,
//       };

//       await post.save();

//       return res.json({
//         success: true,
//       });
//     } catch (err) {
//       console.error(
//         "SAVE PLATFORM ID ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//       });
//     }
//   }
// );

// // ============================================================
// // SCHEDULE POST
// // ============================================================

// router.post(
//   "/schedule",

//   async (req, res) => {
//     try {
//       const {
//         topic,
//         caption,
//         images,
//         platforms,
//         publishDate,
//       } = req.body;

//       const cleanImages =
//         Array.isArray(images)
//           ? images.filter(
//               (img) =>
//                 typeof img ===
//                   "string" &&
//                 img.trim()
//             )
//           : [];

//       if (
//         !topic ||
//         !caption ||
//         !cleanImages.length ||
//         !Array.isArray(
//           platforms
//         ) ||
//         !platforms.length ||
//         !publishDate
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Missing required fields",
//         });
//       }

//       const post =
//         await ScheduledSocialPost.create(
//           {
//             topic,
//             caption,
//             images:
//               cleanImages,
//             platforms,
//             publishDate,
//           }
//         );

//       return res.json({
//         success: true,
//         message:
//           "Post scheduled successfully",
//         post,
//       });
//     } catch (err) {
//       console.error(
//         "SCHEDULE ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to schedule post",
//       });
//     }
//   }
// );

// // ============================================================
// // UPDATE INSTAGRAM POST STATUS
// // ============================================================

// router.post(
//   "/update-instagram-post-status",

//   async (req, res) => {
//     try {
//       const {
//         posts,
//       } = req.body;

//       if (
//         !Array.isArray(posts)
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Posts array is required",
//         });
//       }

//       let updatedCount = 0;

//       const dbPosts =
//         await ScheduledSocialPost.find(
//           {
//             "socialPostIds.Instagram":
//               {
//                 $exists: true,
//               },
//           }
//         );

//       const instagramIds =
//         posts.map(
//           (p) =>
//             String(
//               p.id ||
//                 p["Post ID"] ||
//                 p["Instagram ID"]
//             )
//         );

//       for (
//         const post of dbPosts
//       ) {
//         const igId =
//           String(
//             post.socialPostIds
//               ?.Instagram
//           );

//         if (
//           !post.platformStatuses
//         ) {
//           post.platformStatuses =
//             {};
//         }

//         if (
//           instagramIds.includes(
//             igId
//           )
//         ) {
//           post.platformStatuses =
//             {
//               ...post.platformStatuses,
//               Instagram:
//                 "posted",
//             };
//         } else {
//           post.platformStatuses =
//             {
//               ...post.platformStatuses,
//               Instagram:
//                 "deleted",
//             };
//         }

//         const statuses =
//           Object.values(
//             post.platformStatuses ||
//               {}
//           );

//         if (
//           statuses.every(
//             (s) =>
//               s ===
//               "deleted"
//           )
//         ) {
//           post.status =
//             "deleted";
//         } else {
//           post.status =
//             "posted";
//         }

//         await post.save();

//         updatedCount++;
//       }

//       return res.json({
//         success: true,
//         updatedCount,
//       });
//     } catch (err) {
//       console.error(
//         "UPDATE INSTAGRAM STATUS ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to update Instagram post statuses",
//       });
//     }
//   }
// );

// // ============================================================
// // TRIGGER INSTAGRAM GET POSTS
// // ============================================================

// router.post(
//   "/get-instagram-posts",

//   async (req, res) => {
//     try {
//       await axios.post(
//         process.env
//           .MAKE_WEBHOOK_URL,

//         {
//           platforms: [
//             "Instagram",
//           ],

//           action: "get",
//         }
//       );

//       return res.json({
//         success: true,
//         message:
//           "Instagram import started",
//       });
//     } catch (err) {
//       console.error(
//         "GET INSTAGRAM POSTS ERROR:",
//         err?.response?.data ||
//           err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to trigger Instagram import",
//       });
//     }
//   }
// );

// // ============================================================
// // UPDATE FACEBOOK POST STATUS
// // ============================================================

// router.post(
//   "/update-facebook-post-status",

//   async (req, res) => {
//     try {
//       const {
//         posts,
//       } = req.body;

//       if (
//         !Array.isArray(posts)
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Posts array is required",
//         });
//       }

//       let updatedCount = 0;

//       const dbPosts =
//         await ScheduledSocialPost.find(
//           {
//             "socialPostIds.Facebook":
//               {
//                 $exists: true,
//               },
//           }
//         );

//       const facebookIds =
//         posts.map(
//           (p) =>
//             String(
//               p.id ||
//                 p["Post ID"]
//             )
//         );

//       for (
//         const post of dbPosts
//       ) {
//         const fbId =
//           String(
//             post.socialPostIds
//               ?.Facebook
//           );

//         if (
//           !post.platformStatuses
//         ) {
//           post.platformStatuses =
//             {};
//         }

//         if (
//           facebookIds.includes(
//             fbId
//           )
//         ) {
//           post.platformStatuses =
//             {
//               ...post.platformStatuses,
//               Facebook:
//                 "posted",
//             };
//         } else {
//           post.platformStatuses =
//             {
//               ...post.platformStatuses,
//               Facebook:
//                 "deleted",
//             };
//         }

//         const statuses =
//           Object.values(
//             post.platformStatuses ||
//               {}
//           );

//         if (
//           statuses.every(
//             (s) =>
//               s ===
//               "deleted"
//           )
//         ) {
//           post.status =
//             "deleted";
//         } else {
//           post.status =
//             "posted";
//         }

//         await post.save();

//         updatedCount++;
//       }

//       return res.json({
//         success: true,
//         updatedCount,
//       });
//     } catch (err) {
//       console.error(
//         "UPDATE FACEBOOK STATUS ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to update Facebook post statuses",
//       });
//     }
//   }
// );

// // ============================================================
// // TRIGGER FACEBOOK GET POSTS
// // ============================================================

// router.post(
//   "/get-facebook-posts",

//   async (req, res) => {
//     try {
//       await axios.post(
//         process.env
//           .MAKE_WEBHOOK_URL,

//         {
//           platforms: [
//             "Facebook",
//           ],

//           action: "get",
//         }
//       );

//       return res.json({
//         success: true,
//         message:
//           "Facebook import started",
//       });
//     } catch (err) {
//       console.error(
//         "GET FACEBOOK POSTS ERROR:",
//         err?.response?.data ||
//           err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to trigger Facebook import",
//       });
//     }
//   }
// );

// // ============================================================
// // IMPORT FACEBOOK POSTS
// // ============================================================

// router.post(
//   "/import-facebook-posts",

//   async (req, res) => {
//     try {
//       const {
//         posts,
//       } = req.body;

//       if (
//         !Array.isArray(posts)
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Posts array is required",
//         });
//       }

//       const savedPosts = [];

//       for (
//         const item of posts
//       ) {
//         const exists =
//           await ScheduledSocialPost.findOne(
//             {
//               "socialPostIds.Facebook":
//                 item.id,
//             }
//           );

//         if (exists) {
//           continue;
//         }

//         const images =
//           item.full_picture
//             ? [
//                 item.full_picture,
//               ]
//             : [];

//         const post =
//           await ScheduledSocialPost.create(
//             {
//               topic:
//                 item.message
//                   ? item.message.slice(
//                       0,
//                       80
//                     )
//                   : "Facebook Post",

//               caption:
//                 item.message ||
//                 "",

//               images,

//               platforms: [
//                 "Facebook",
//               ],

//               publishDate:
//                 item.created_time
//                   ? new Date(
//                       item.created_time
//                     )
//                   : new Date(),

//               status:
//                 "posted",

//               socialPostIds:
//                 {
//                   Facebook:
//                     item.id,
//                 },
//             }
//           );

//         savedPosts.push(
//           post
//         );
//       }

//       return res.json({
//         success: true,
//         count:
//           savedPosts.length,
//         posts:
//           savedPosts,
//       });
//     } catch (err) {
//       console.error(
//         "IMPORT FACEBOOK POSTS ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to import Facebook posts",
//       });
//     }
//   }
// );

// // ============================================================
// // GET ALL POSTS
// // ============================================================

// router.get(
//   "/scheduled",

//   async (req, res) => {
//     try {
//       const posts =
//         await ScheduledSocialPost.find()
//           .sort({
//             publishDate: 1,
//           });

//       return res.json({
//         success: true,
//         posts,
//       });
//     } catch (err) {
//       console.error(
//         "GET SCHEDULED POSTS ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to fetch scheduled posts",
//       });
//     }
//   }
// );

// // ============================================================
// // DELETE SCHEDULED POST
// // ============================================================

// router.delete(
//   "/:id",

//   async (req, res) => {
//     try {
//       const {
//         id,
//       } = req.params;

//       await ScheduledSocialPost.findByIdAndDelete(
//         id
//       );

//       return res.json({
//         success: true,
//         message:
//           "Scheduled post deleted",
//       });
//     } catch (err) {
//       console.error(
//         "DELETE POST ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to delete post",
//       });
//     }
//   }
// );

// // ============================================================
// // REMOVE POST FROM SOCIALS
// // ============================================================

// router.post(
//   "/remove/:id",

//   async (req, res) => {
//     try {
//       const {
//         id,
//       } = req.params;

//       const post =
//         await ScheduledSocialPost.findById(
//           id
//         );

//       if (!post) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Post not found",
//         });
//       }

//       await axios.post(
//         MAKE_WEBHOOK_URL,

//         {
//           action: "delete",

//           postId:
//             post._id,

//           topic:
//             post.topic,

//           caption:
//             post.caption,

//           images:
//             post.images,

//           platforms:
//             post.platforms,

//           socialPostIds:
//             post.socialPostIds ||
//             {},
//         }
//       );

//       post.status =
//         "deleted";

//       await post.save();

//       return res.json({
//         success: true,
//         message:
//           "Remove request sent successfully",
//       });
//     } catch (err) {
//       console.error(
//         "REMOVE POST ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to remove post",
//       });
//     }
//   }
// );

// // ============================================================
// // GET SINGLE POST
// // ============================================================

// router.get(
//   "/:id",

//   async (req, res) => {
//     try {
//       const post =
//         await ScheduledSocialPost.findById(
//           req.params.id
//         );

//       if (!post) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Post not found",
//         });
//       }

//       res.json(post);
//     } catch (err) {
//       console.error(
//         err
//       );

//       res.status(500).json({
//         success: false,
//       });
//     }
//   }
// );

// // ============================================================
// // EDIT POST
// // ============================================================

// router.post(
//   "/edit/:id",

//   async (req, res) => {
//     try {
//       const {
//         id,
//       } = req.params;

//       const {
//         topic,
//         caption,
//         images,
//         publishDate,
//       } = req.body;

//       const post =
//         await ScheduledSocialPost.findById(
//           id
//         );

//       if (!post) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Post not found",
//         });
//       }

//       // ======================================================
//       // STORE ORIGINAL STATUS
//       // ======================================================

//       const wasPosted =
//         post.status ===
//         "posted";

//       // ======================================================
//       // UPDATE FIELDS
//       // ======================================================

//       post.topic =
//         topic ||
//         post.topic;

//       post.caption =
//         caption ||
//         post.caption;

//       post.images =
//         images?.length
//           ? images
//           : post.images;

//       // ======================================================
//       // UPDATE PUBLISH DATE
//       // ======================================================

//       if (publishDate) {
//         const parsedDate =
//           new Date(
//             publishDate
//           );

//         if (
//           isNaN(
//             parsedDate.getTime()
//           )
//         ) {
//           return res.status(400).json({
//             success: false,
//             message:
//               "Invalid publish date",
//           });
//         }

//         post.publishDate =
//           parsedDate;

//         if (!wasPosted) {
//           post.status =
//             "scheduled";
//         }
//       }

//       // ======================================================
//       // SAVE CHANGES
//       // ======================================================

//       await post.save();

//       // ======================================================
//       // UPDATE LIVE FACEBOOK POSTS ONLY
//       // ======================================================

//       if (
//         wasPosted &&
//         post.platforms.includes(
//           "Facebook"
//         )
//       ) {
//         await axios.post(
//           MAKE_WEBHOOK_URL,

//           {
//             action: "edit",

//             postId:
//               post._id,

//             topic:
//               post.topic,

//             caption:
//               post.caption,

//             photos:
//               post.images.map(
//                 (img) => ({
//                   url: img,
//                   type: "url",
//                 })
//               ),

//             publishDate:
//               post.publishDate,

//             platforms:
//               post.platforms,

//             socialPostIds:
//               post.socialPostIds ||
//               {},
//           }
//         );
//       }

//       return res.json({
//         success: true,

//         message:
//           wasPosted
//             ? "Live social post updated successfully"
//             : "Scheduled post updated successfully",

//         post,
//       });
//     } catch (err) {
//       console.error(
//         "EDIT POST ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to edit post",
//       });
//     }
//   }
// );

// // ============================================================
// // EXPORT
// // ============================================================

// export default router;







































// import express from "express";
// import cors from "cors";
// import dotenv from "dotenv";
// import Groq from "groq-sdk";
// import axios from "axios";
// import multer from "multer";
// import path from "path";
// import fs from "fs";
// import { fileURLToPath } from "url";
// import { GoogleGenAI } from "@google/genai";
// import sharp from "sharp";
// import { generateImage, } from "./social_manager.js";
// import ScheduledSocialPost from "../models/ScheduledSocialPost.js";
// const router = express.Router();

// // ===============================
// // __dirname FIX
// // ===============================
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// // ===============================
// // ENV
// // ===============================
// dotenv.config({ path: "../../.env", });
// const app = express();
// app.use(cors());
// app.use(express.json());
// // ===============================
// // IMAGE DIRECTORY
// // ===============================
// const IMAGE_DIR = "/home/dhruvit/.openclaw/workspace/skills/blog_manager/images";
// // CREATE FOLDER IF NOT EXISTS
// if (!fs.existsSync(IMAGE_DIR)) {
//   fs.mkdirSync(IMAGE_DIR, {
//     recursive: true
//   });
// }

// // ===============================
// // MULTER STORAGE
// // ===============================
// const storage = multer.diskStorage({
//   destination:
//     (req, file, cb) => {
//       cb(null, IMAGE_DIR);
//     },
//   filename:
//     (req, file, cb) => {
//       const uniqueName =
//         `upload-${Date.now()}-${Math.round(
//           Math.random() * 1E9
//         )}${path.extname(file.originalname)}`;
//       cb(null, uniqueName);
//     }
// });

// // ===============================
// // FILE FILTER
// // ===============================

// const fileFilter = (req, file, cb) => {
//   if (file.mimetype.startsWith("image/")) {
//     cb(null, true);
//   } else {
//     cb(
//       new Error("Only image files allowed"),
//       false
//     );
//   }
// };
// // ===============================
// // MULTER
// // ===============================
// const upload = multer({
//   storage,
//   fileFilter,
//   limits: {
//     // 5MB
//     fileSize: 5 * 1024 * 1024
//   }
// });
// // ===============================
// // ENV
// // ===============================
// const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
// // ===============================
// // GROQ & GEMINI
// // ===============================
// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// const MODEL = "gemini-2.5-flash";
// // ===============================
// // AI CONTENT
// // ===============================
// async function generateSocialContent(topic) {
//   const prompt = `
// You are an expert Calgary and Airdrie real estate social media strategist.

// Create ONE unique Facebook and Instagram post.

// TOPIC:
// ${topic}

// TARGET AUDIENCE:
// - Home buyers
// - Home sellers
// - First-time buyers
// - Real estate investors
// - Alberta homeowners

// LOCATION FOCUS:
// - Calgary
// - Airdrie
// - Chestermere
// - Cochrane
// - Okotoks
// - High River
// - Strathmore

// WRITING STYLE:
// - Professional
// - Modern
// - Friendly
// - Trustworthy
// - Conversational
// - Persuasive
// - Easy to read

// CONTENT REQUIREMENTS:
// - 150-200 words
// - Start with a strong hook
// - Naturally use relevant emojis
// - Highlight benefits instead of features
// - Include a clear call-to-action
// - Generate different wording every time
// - Never copy previous responses
// - Mention Calgary or nearby communities naturally when relevant

// CONTACT INFORMATION
// Mention naturally:

// 📞 403-439-1555
// 🌐 www.realtorparth.ca
// ✉️ hello@realtorparth.ca

// RULES:
// - Never say "Free Consultation"
// - Instead use:
//   "Contact me for a consultation."
// - No markdown
// - No headings
// - No bullet points
// - No quotation marks
// - Plain text only

// HASHTAGS:
// Always include:
// #realtorparth

// Also include 6-10 relevant hashtags such as:
// #CalgaryRealEstate
// #AirdrieRealEstate
// #YYCRealEstate
// #CalgaryHomes
// #AirdrieHomes
// #AlbertaRealEstate
// #CalgaryRealtor
// #DreamHome
// #HomeBuying
// #HomeSelling

// Return ONLY the social media caption.
// `;
//   const response = await ai.models.generateContent({
//     model: MODEL,
//     contents: prompt
//   });
//   return (response.text || "")
//     .replace(/^caption\s*:/i, "")
//     .replace(/^post\s*:/i, "")
//     .replace(/\*\*/g, "")
//     .replace(/```/g, "")
//     .trim();
// }

// const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// export async function generatePropertyPost(property) {

//   const prompt = `
// Create a Facebook and Instagram real estate post.

// PROPERTY INFORMATION:

// Address:
// ${property.UnparsedAddress || ""}

// MLS:
// ${property.ListingKey || property.ListingId || ""}

// Price:
// ${property.ListPrice || ""}

// Property Type:
// ${property.PropertyType || ""}

// Style:
// ${property.ArchitecturalStyle || ""}

// City:
// ${property.City || ""}

// Community:
// ${property.SubdivisionName || ""}

// Bedrooms:
// ${property.BedroomsTotal || ""}

// Bathrooms:
// ${property.BathroomsTotalInteger || ""}

// Garage:
// ${property.GarageSpaces || ""}

// Square Feet:
// ${property.BuildingAreaTotal || ""}

// Year Built:
// ${property.YearBuilt || ""}

// Description:
// ${property.PublicRemarks || ""}


// REQUIREMENTS:

// - 120-180 words
// - Professional
// - Modern
// - Friendly
// - Trustworthy
// - Conversational
// - Persuasive
// - Include relevant emojis naturally
// - Include a strong opening hook
// - Highlight the property's most appealing benefits
// - Include a clear call-to-action
// - Calgary/Airdrie focused
// - Generate a UNIQUE caption every time
// - Use different wording and hooks
// - Avoid repetitive sentence structures
// - Make the post feel natural and human-written


// CONTACT INFORMATION:

// Mention naturally:

// Ph: 403-439-1555

// www.realtorparth.ca

// hello@realtorparth.ca


// RULES:

// - Never say "Free Consultation"
// - Instead use:
//   "Contact me for a consultation."
// - Price must be written with $ followed by the number
// - No markdown
// - No headings
// - No bullet points
// - No quotation marks
// - Do not give an Open House date or time
// - Do not invent property information
// - Only use facts provided in the property information
// - Do not mention information that is not available
// - Do not say that you are an AI
// - Return ONLY the social media post


// HASHTAGS:

// Always include:

// #realtorparth

// Also include relevant real estate hashtags, such as:

// #CalgaryRealEstate
// #AirdrieRealEstate
// #YYCRealEstate
// #CalgaryHomes
// #AirdrieHomes
// #AlbertaRealEstate
// #CalgaryRealtor
// #DreamHome
// #HomeBuying
// #HomeSelling

// Return only post text.
// `;

//   try {
//     const response = await ai.models.generateContent({
//       model: MODEL,
//       contents: prompt,
//       config: {
//         temperature: 1.2
//       }
//     });

//     const caption = (response.text || "")
//       .replace(/^caption\s*:/i, "")
//       .replace(/^post\s*:/i, "")
//       .replace(/\*\*/g, "")
//       .replace(/```/g, "")
//       .trim();

//     if (!caption) {
//       throw new Error("Gemini returned an empty property caption");
//     }

//     return {
//       caption,
//       property
//     };

//   } catch (error) {
//     console.error("GEMINI PROPERTY POST ERROR:", error?.response?.data || error?.message || error);
//     throw error;
//   }
// }


// async function generatePropertyImage(property, imageIndex = 0) {
//   const fileName = `property-${Date.now()}.jpg`;
//   const outputDir = "/home/dhruvit/.openclaw/workspace/skills/blog_manager/images";
//   if (!fs.existsSync(outputDir)) {
//     fs.mkdirSync(outputDir, {
//       recursive: true
//     });
//   }
//   const outputPath = path.join(outputDir, fileName);
//   // =========================================================
//   // PROPERTY IMAGE
//   // =========================================================
//   const sortedMedia = property.Media?.sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0)) || [];
//   const imageMedia = sortedMedia.filter(
//       (media) => {
//         const url = media.MediaURL?.toLowerCase() || "";
//         return (
//           url.endsWith(".jpg") ||
//           url.endsWith(".jpeg") ||
//           url.endsWith(".png") ||
//           url.includes("ddfcdn.realtor.ca")
//         );
//       }
//     );

//   const imageUrl = imageMedia[imageIndex % imageMedia.length]?.MediaURL;
//   if (!imageUrl) {
//     throw new Error("Property image not found");
//   }

//   const response =
//     await axios.get(
//       imageUrl,
//       {
//         responseType: "arraybuffer"
//       }
//     );

//   // =========================================================
//   // PROPERTY DATA
//   // =========================================================

//   const price =
//     property.ListPrice
//       ? `$${Number(
//         property.ListPrice
//       ).toLocaleString()}`
//       : "Call for Price";
//   const beds = property.BedroomsTotal || 0;
//   const baths = property.BathroomsTotalInteger || 0;
//   const city = property.City || "Calgary";
//   const address =
//     (property.UnparsedAddress || "").length > 38
//       ? property.UnparsedAddress.substring(
//         0,
//         38
//       ) + "..."
//       : property.UnparsedAddress || "";
//   const mls = property.ListingId || "";
//   const sqft = property.BuildingAreaTotal || property.LivingArea || "";
//   const propertyType = property.PropertyType || "";

//   // =========================================================
//   // REALTOR® SVG LOGO
//   // =========================================================
//   //
//   // The REALTOR® logo is completely separate from
//   // the property-details background.
//   //
//   // LEFT SIDE  = REALTOR® LOGO
//   // RIGHT SIDE = PROPERTY DETAILS
//   //
//   // =========================================================

//   const realtorLogoPath =
//     path.join(
//       __dirname,
//       "assets/realtorparths_pdf",
//       "realtor_logo.svg"
//     );

//   const realtorLogoRaw =
//     await fs.promises.readFile(
//       realtorLogoPath,
//       "utf8"
//     );

//   const realtorLogoBase64 =
//     Buffer.from(
//       realtorLogoRaw
//     ).toString("base64");

//   // =========================================================
//   // REALTOR® LOGO OVERLAY
//   // =========================================================
//   //
//   // Change opacity here:
//   //
//   // 0.20 = very subtle
//   // 0.30 = subtle
//   // 0.35 = recommended
//   // 0.50 = strong
//   // 1.00 = fully visible
//   //
//   // =========================================================

//   const realtorLogoSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <image
//         href="data:image/svg+xml;base64,${realtorLogoBase64}"
//         x="55"
//         y="52"
//         width="190"
//         height="165"
//         opacity="0.35"
//         preserveAspectRatio="xMidYMid meet"
//       />

//     </svg>
//   `;

//   // =========================================================
//   // TOP PROPERTY DETAILS BACKGROUND
//   // =========================================================
//   //
//   // IMPORTANT:
//   //
//   // The background ONLY exists on the RIGHT side.
//   //
//   // LEFT 0 - 285px:
//   // REALTOR® LOGO
//   //
//   // RIGHT 285 - 932px:
//   // PROPERTY DETAILS
//   //
//   // =========================================================

//   const addressBgSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <!-- ================================================= -->
//       <!-- RIGHT-SIDE PROPERTY DETAILS BACKGROUND -->
//       <!-- ================================================= -->

//       <rect
//         x="285"
//         y="32"
//         width="647"
//         height="205"
//         rx="18"
//         ry="18"
//         fill="rgba(20,20,20,0.72)"
//       />


//       <!-- ================================================= -->
//       <!-- TOP HIGHLIGHT -->
//       <!-- ================================================= -->

//       <rect
//         x="285"
//         y="32"
//         width="647"
//         height="4"
//         rx="2"
//         fill="rgba(255,255,255,0.85)"
//       />


//       <!-- ================================================= -->
//       <!-- VERTICAL DIVIDER -->
//       <!-- ================================================= -->

//       <line
//         x1="285"
//         y1="55"
//         x2="285"
//         y2="214"
//         stroke="#ffffff"
//         stroke-width="1"
//         opacity="0.25"
//       />

//     </svg>
//   `;

//   // =========================================================
//   // PROPERTY DETAILS TEXT
//   // =========================================================

//   const LEFT_LABEL_X = 315;
//   const LEFT_VALUE_X = 455;
//   const RIGHT_LABEL_X = 650;
//   const RIGHT_VALUE_X = 785;

//   const addressSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <style>

//         .address {
//           fill: #fff;
//           font: 800 32px Arial, Helvetica, sans-serif;
//         }

//         .mls {
//           fill: #F8F8F8;
//           font: 600 20px Arial, Helvetica, sans-serif;
//         }

//         .label {
//           fill: #CFCFCF;
//           font: 600 17px Arial, Helvetica, sans-serif;
//         }

//         .value {
//           fill: #fff;
//           font: 700 20px Arial, Helvetica, sans-serif;
//         }

//         .line {
//           stroke: #8F8F8F;
//           stroke-width: 1;
//           opacity: .45;
//         }

//       </style>


//       <!-- ================================================= -->
//       <!-- ADDRESS -->
//       <!-- ================================================= -->

//       <text
//         x="315"
//         y="78"
//         class="address"
//       >
//         ${address}
//       </text>


//       <!-- ================================================= -->
//       <!-- MLS -->
//       <!-- ================================================= -->

//       <text
//         x="315"
//         y="110"
//         class="mls"
//       >
//         MLS® ${mls}
//       </text>


//       <!-- ================================================= -->
//       <!-- HORIZONTAL DIVIDER -->
//       <!-- ================================================= -->

//       <line
//         x1="312"
//         y1="130"
//         x2="900"
//         y2="130"
//         class="line"
//       />


//       <!-- ================================================= -->
//       <!-- LEFT COLUMN -->
//       <!-- ================================================= -->

//       <text
//         x="${LEFT_LABEL_X}"
//         y="163"
//         class="label"
//       >
//         CITY
//       </text>

//       <text
//         x="${LEFT_VALUE_X}"
//         y="163"
//         class="value"
//       >
//         ${city}
//       </text>


//       <text
//         x="${LEFT_LABEL_X}"
//         y="199"
//         class="label"
//       >
//         BEDROOMS
//       </text>

//       <text
//         x="${LEFT_VALUE_X}"
//         y="199"
//         class="value"
//       >
//         ${beds}
//       </text>


//       <!-- ================================================= -->
//       <!-- RIGHT COLUMN -->
//       <!-- ================================================= -->

//       <text
//         x="${RIGHT_LABEL_X}"
//         y="163"
//         class="label"
//       >
//         BATHROOMS
//       </text>

//       <text
//         x="${RIGHT_VALUE_X}"
//         y="163"
//         class="value"
//       >
//         ${baths}
//       </text>


//       <text
//         x="${RIGHT_LABEL_X}"
//         y="199"
//         class="label"
//       >
//         SIZE
//       </text>

//       <text
//         x="${RIGHT_VALUE_X}"
//         y="199"
//         class="value"
//       >
//         ${sqft || "-"} Sq Ft
//       </text>

//     </svg>
//   `;

//   // =========================================================
//   // FOOTER BACKGROUND
//   // =========================================================

//   const footerBgSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <rect
//         x="0"
//         y="1160"
//         width="280"
//         height="190"
//         fill="#ffffff"
//       />

//       <rect
//         x="280"
//         y="1160"
//         width="800"
//         height="190"
//         fill="#4b2b2b"
//       />

//     </svg>
//   `;

//   // =========================================================
//   // FOOTER TEXT
//   // =========================================================

//   const footerTextSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <style>

//         .name {
//           fill: #fff;
//           font: 800 38px Arial, Helvetica, sans-serif;
//         }

//         .role {
//           fill: #fff;
//           font: 400 30px Arial, Helvetica, sans-serif;
//         }

//         .phone {
//           fill: #fff;
//           font: 500 38px Arial, Helvetica, sans-serif;
//         }

//         .price {
//           fill: #222;
//           font: 800 34px Arial, Helvetica, sans-serif;
//         }

//         .info {
//           fill: #444;
//           font: 21px Arial, Helvetica, sans-serif;
//         }

//       </style>


//       <!-- ================================================= -->
//       <!-- PRICE -->
//       <!-- ================================================= -->

//       <text
//         x="20"
//         y="1198"
//         class="price"
//       >
//         ${price}
//       </text>


//       <!-- ================================================= -->
//       <!-- BED / BATH -->
//       <!-- ================================================= -->

//       <text
//         x="20"
//         y="1235"
//         class="info"
//       >
//         ${beds} Bed • ${baths} Bath
//       </text>


//       <!-- ================================================= -->
//       <!-- PROPERTY TYPE -->
//       <!-- ================================================= -->

//       <text
//         x="20"
//         y="1268"
//         class="info"
//       >
//         ${propertyType}
//       </text>


//       <!-- ================================================= -->
//       <!-- SQ FT -->
//       <!-- ================================================= -->

//       <text
//         x="20"
//         y="1300"
//         class="info"
//       >
//         ${sqft || ""} Sq Ft
//       </text>


//       <!-- ================================================= -->
//       <!-- MLS -->
//       <!-- ================================================= -->

//       <text
//         x="20"
//         y="1332"
//         class="info"
//       >
//         MLS® ${mls}
//       </text>


//       <!-- ================================================= -->
//       <!-- AGENT NAME -->
//       <!-- ================================================= -->

//       <text
//         x="315"
//         y="1220"
//         class="name"
//       >
//         PARTH BRAHMBHATT
//       </text>


//       <!-- ================================================= -->
//       <!-- REALTOR -->
//       <!-- ================================================= -->

//       <text
//         x="455"
//         y="1275"
//         class="role"
//       >
//         REALTOR
//       </text>


//       <!-- ================================================= -->
//       <!-- PHONE -->
//       <!-- ================================================= -->

//       <text
//         x="340"
//         y="1330"
//         class="phone"
//       >
//         403-439-1555
//       </text>

//     </svg>
//   `;

//   // =========================================================
//   // AGENT IMAGE
//   // =========================================================

//   const agentPath =
//     path.join(
//       __dirname,
//       "assets/realtorparths_pdf",
//       "agent12.png"
//     );

//   const agentBuffer =
//     await sharp(agentPath)
//       .resize({
//         height: 400,
//         fit: "inside"
//       })
//       .png()
//       .toBuffer();

//   // =========================================================
//   // BROKERAGE LOGO
//   // =========================================================

//   const logoPath =
//     path.join(
//       __dirname,
//       "assets/realtorparths_pdf",
//       "diamond_realty.jpeg"
//     );

//   const logoBuffer =
//     await sharp(logoPath)
//       .resize({
//         width: 280,
//         height: 190,
//         fit: "fill"
//       })
//       .png()
//       .toBuffer();

//   // =========================================================
//   // FINAL IMAGE
//   // =========================================================

//   const buffer =
//     await sharp(response.data)
//       .resize(
//         1080,
//         1350,
//         {
//           fit: "cover"
//         }
//       )
//       .composite([

//         // =====================================================
//         // 1. RIGHT-SIDE PROPERTY DETAILS BACKGROUND
//         // =====================================================

//         {
//           input: Buffer.from(
//             addressBgSvg
//           ),
//           left: 0,
//           top: 0
//         },


//         // =====================================================
//         // 2. REALTOR® SVG LOGO
//         // =====================================================
//         //
//         // Logo is on the LEFT.
//         //
//         // There is NO dark background behind it.
//         //
//         // =====================================================

//         {
//           input: Buffer.from(
//             realtorLogoSvg
//           ),
//           left: 0,
//           top: 0
//         },


//         // =====================================================
//         // 3. PROPERTY DETAILS TEXT
//         // =====================================================

//         {
//           input: Buffer.from(
//             addressSvg
//           ),
//           left: 0,
//           top: 0
//         },


//         // =====================================================
//         // 4. FOOTER BACKGROUND
//         // =====================================================

//         {
//           input: Buffer.from(
//             footerBgSvg
//           ),
//           left: 0,
//           top: 0
//         },


//         // =====================================================
//         // 5. FOOTER TEXT
//         // =====================================================

//         {
//           input: Buffer.from(
//             footerTextSvg
//           ),
//           left: 0,
//           top: 0
//         },


//         // =====================================================
//         // 6. BROKERAGE LOGO
//         // =====================================================

//         {
//           input: logoBuffer,
//           left: 0,
//           top: 1160
//         },


//         // =====================================================
//         // 7. AGENT IMAGE
//         // =====================================================

//         {
//           input: agentBuffer,
//           left: 740,
//           top: 960
//         }

//       ])
//       .flatten({
//         background: "#000000"
//       })
//       .jpeg({
//         quality: 84,
//         mozjpeg: true
//       })
//       .toBuffer();

//   // =========================================================
//   // SAVE IMAGE
//   // =========================================================

//   await fs.promises.writeFile(
//     outputPath,
//     buffer
//   );

//   // =========================================================
//   // RETURN
//   // =========================================================

//   return {
//     imageURL:
//       `https://realtorparth.ca/social-images/${fileName}`,

//     outputPath
//   };
// }

// // ===============================
// // GENERATE PROPERTY SOCIAL POST
// // ===============================

// router.post("/generate-property",
//   async (req, res) => {
//     try {
//       const { mls } = req.body;
//       // ===============================
//       // VALIDATION
//       // ===============================
//       if (!mls || typeof mls !== "string") {
//         return res.status(400).json({
//           success: false,
//           message: "MLS number is required"
//         });
//       }
//       const cleanMLS = mls.trim();
//       console.log("🏡 Generating property social post for MLS:", cleanMLS);
//       // ===============================
//       // GET PROPERTY
//       // ===============================

//       const propertyResponse = await axios.get(`https://realtorparth.ca/api/properties/analysis/${cleanMLS}`);
//       const property = propertyResponse.data?.property;
//       if (!property) {
//         return res.status(404).json({
//           success: false,
//           message: "Property not found"
//         });
//       }
//       // ===============================
//       // ALBERTA ONLY (OPTIONAL)
//       // ===============================
//       const province = property.StateOrProvince || property.Province || "";
//       if ( province && province.toLowerCase() !== "ab" && province.toLowerCase() !== "alberta") {
//         return res.status(400).json({
//           success: false,
//           message: "Only Alberta properties are supported"
//         });
//       }

//       // ===============================
//       // GENERATE AI CAPTION
//       // ===============================
//       const preview = await generatePropertyPost(property);
//       // ===============================
//       // GENERATE IMAGE
//       // ===============================
//       const {imageURL} = await generatePropertyImage(property, 0);
//       // ===============================
//       // RESPONSE
//       // ===============================

//       return res.json({
//         success: true,
//         topic: property.UnparsedAddress,
//         caption: preview.caption,
//         imageURL,
//         property
//       });
//     } catch (err) {
//       console.error("PROPERTY SOCIAL POST ERROR:", err?.response?.data || err?.message || err);
//       return res.status(500).json({
//         success: false,
//         message: err?.response?.data?.message || "Failed to generate property social post"
//       });
//     }
//   }
// );


// // ===============================
// // GENERATE POST
// // ===============================
// router.post("/generate",
//   async (req, res) => {
//     try {
//       const { topic } = req.body;
//       if (!topic) {
//         return res.status(400).json({
//           success: false,
//           message: "Topic is required"
//         });
//       }
//       console.log("📱 Generating social post:", topic);
//       // AI caption
//       const caption = await generateSocialContent(topic);
//       // AI image
//       const { imageURL } = await generateImage(topic);
//       return res.json({
//         success: true,
//         topic,
//         caption,
//         imageURL,
//       });
//     } catch (err) {
//       console.error("SOCIAL API ERROR:", err.response?.data || err.message);
//       return res.status(500).json({
//         success: false,
//         message: "Failed to generate social post"
//       });
//     }
//   }
// );

// // ===============================
// // UPLOAD SOCIAL IMAGES
// // ===============================

// router.post("/upload-social-images",
//   upload.array("images", 10),
//   async (req, res) => {
//     try {
//       const files = req.files;
//       if (!files || !files.length) {
//         return res.status(400).json({
//           success: false,
//           message: "No images uploaded"
//         });
//       }
//       const urls = files.map((file) => {
//           return `https://realtorparth.ca/social-images/${file.filename}`;
//         });

//       return res.json({
//         success: true,
//         urls
//       });
//     } catch (err) {
//       console.error("UPLOAD ERROR:", err.message);
//       return res.status(500).json({
//         success: false,
//         message: "Failed to upload images"
//       });
//     }
//   }
// );


// router.get("/posted-comment-posts", async (req, res) => {
//   try {
//     // ==========================================
//     // ONLY CHECK POSTS FROM LAST 14 DAYS
//     // ==========================================
//     const thirtyDaysAgo = new Date();
//     thirtyDaysAgo.setDate(
//       thirtyDaysAgo.getDate() - 30
//     );
//     // ==========================================
//     // GET RECENT POSTED SOCIAL POSTS
//     // ==========================================
//     const posts = await ScheduledSocialPost.find(
//       {
//         status: "posted",
//         publishDate: {
//           $gte: thirtyDaysAgo
//         }
//       },
//       {
//         socialPostIds: 1,
//         publishDate: 1,
//         _id: 0
//       }
//     ).sort({
//       publishDate: -1
//     });
//     return res.json({
//       success: true,
//       count: posts.length,
//       posts
//     });
//   } catch (err) {
//     console.error("❌ GET POSTED COMMENT POSTS ERROR:", err);
//     return res.status(500).json({
//       success: false,
//       count: 0,
//       posts: [],
//       message: "Failed to get posted social posts"
//     });
//   }
// });


// function getPlatformKey(platform) {
//   const normalized = String(platform || "").toLowerCase();
//   if (normalized === "facebook") {
//     return "Facebook";
//   }

//   if (normalized === "instagram") {
//     return "Instagram";
//   }

//   return null;
// }

// router.post("/check", async (req, res) => {
//   try {
//     const {platform, postId, commentId} = req.body;
//     if (!platform || !postId || !commentId) {
//       return res.status(400).json({
//         success: false,
//         message: "platform, postId and commentId are required"
//       });
//     }
//     const platformKey = getPlatformKey(platform);
//     const normalizedPlatform = platform.toLowerCase();
//     if (!platformKey) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid platform"
//       });
//     }

//     const post = await ScheduledSocialPost.findOne({
//       [`socialPostIds.${platformKey}`]: String(postId)
//     });

//     // IMPORTANT:
//     // Post not found does NOT mean "not replied"
//     if (!post) {
//       console.log(`⚠️ CHECK POST NOT FOUND | ${platformKey} | postId=${postId}`);
//       return res.status(404).json({
//         success: false,
//         message: "Post not found"
//       });
//     }

//     const alreadyReplied = post.repliedComments.some(
//       item =>
//         String(item.commentId) === String(commentId) &&
//         String(item.platform).toLowerCase() === normalizedPlatform
//     );
//     console.log(`🔍 CHECK REPLY | ${platformKey} | comment=${commentId} | alreadyReplied=${alreadyReplied}`);
//     return res.json({
//       success: true,
//       alreadyReplied
//     });
//   } catch (err) {
//     console.error("❌ CHECK REPLIED ERROR:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Server error"
//     });
//   }
// });


// router.post("/save", async (req, res) => {
//   try {
//     const {
//       platform,
//       postId,
//       commentId
//     } = req.body;

//     if (!platform || !postId || !commentId) {
//       return res.status(400).json({
//         success: false,
//         message: "platform, postId and commentId are required"
//       });
//     }
//     const platformKey = getPlatformKey(platform);
//     const normalizedPlatform = platform.toLowerCase();

//     if (!platformKey) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid platform"
//       });
//     }

//     const post = await ScheduledSocialPost.findOne({
//       [`socialPostIds.${platformKey}`]: String(postId)
//     });

//     if (!post) {
//       console.log(`⚠️ SAVE POST NOT FOUND | ${platformKey} | postId=${postId}`);
//       return res.status(404).json({
//         success: false,
//         message: "Post not found"
//       });
//     }

//     const alreadyExists = post.repliedComments.some(
//       item =>
//         String(item.commentId) === String(commentId) &&
//         String(item.platform).toLowerCase() === normalizedPlatform
//     );

//     if (alreadyExists) {
//       console.log(`⏭️ ALREADY SAVED | ${platformKey} | comment=${commentId}`);
//       return res.json({
//         success: true,
//         alreadyExists: true
//       });
//     }
//     post.repliedComments.push({
//       commentId: String(commentId),
//       platform: normalizedPlatform,
//       repliedAt: new Date()
//     });
//     await post.save();
//     console.log(`💾 REPLIED COMMENT SAVED | ${platformKey} | comment=${commentId}`);
//     return res.json({
//       success: true,
//       alreadyExists: false
//     });
//   } catch (err) {
//     console.error("❌ SAVE REPLIED ERROR:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Server error"
//     });
//   }
// });

// // ===============================
// // SAVE PLATFORM POST ID
// // ===============================

// router.post(
//   "/save-platform-post-id",
//   async (req, res) => {
//     try {
//       const {
//         postId,
//         platform,
//         platformPostId
//       } = req.body;
//       const post = await ScheduledSocialPost.findById(postId);
//       if (!post) {
//         return res.status(404).json({
//           success: false,
//           message: "Post not found"
//         });
//       }

//       post.socialPostIds = {
//         ...post.socialPostIds,
//         [platform]: platformPostId
//       };
//       await post.save();
//       return res.json({
//         success: true
//       });
//     } catch (err) {
//       console.error("SAVE PLATFORM ID ERROR:", err.message);
//       return res.status(500).json({
//         success: false
//       });
//     }
//   }
// );

// // ===============================
// // SCHEDULE POST
// // ===============================

// router.post("/schedule",
//   async (req, res) => {
//     try {
//       const {
//         topic,
//         caption,
//         images,
//         platforms,
//         publishDate,
//       } = req.body;

//       const cleanImages =
//         Array.isArray(images)
//           ? images.filter(
//             (img) =>
//               typeof img === "string" &&
//               img.trim()
//           )
//           : [];

//       if (!topic || !caption || !cleanImages.length || !Array.isArray(platforms) || !platforms.length || !publishDate) {
//         return res.status(400).json({
//           success: false,
//           message: "Missing required fields",
//         });
//       }

//       const post =
//         await ScheduledSocialPost.create({
//           topic,
//           caption,
//           images: cleanImages,
//           platforms,
//           publishDate,
//         });

//       return res.json({
//         success: true,
//         message: "Post scheduled successfully",
//         post,
//       });

//     } catch (err) {
//       console.error("SCHEDULE ERROR:", err.message);
//       return res.status(500).json({
//         success: false,
//         message: "Failed to schedule post",
//       });
//     }
//   }
// );


// router.post(
//   "/update-instagram-post-status",
//   async (req, res) => {
//     try {
//       const { posts } = req.body;
//       if (!Array.isArray(posts)) {
//         return res.status(400).json({
//           success: false,
//           message: "Posts array is required"
//         });
//       }
//       let updatedCount = 0;
//       // ===============================
//       // GET INSTAGRAM POSTS FROM DB
//       // ===============================
//       const dbPosts =
//         await ScheduledSocialPost.find({
//           "socialPostIds.Instagram": {
//             $exists: true
//           }
//         });

//       // ===============================
//       // INSTAGRAM IDS FROM MAKE
//       // ===============================

//       const instagramIds =
//         posts.map((p) =>
//           String(
//             p.id ||
//             p["Post ID"] ||
//             p["Instagram ID"]
//           )
//         );

//       // ===============================
//       // CHECK POSTS
//       // ===============================
//       for (const post of dbPosts) {
//         const igId = String(post.socialPostIds?.Instagram);
//         // INIT IF EMPTY
//         if (!post.platformStatuses) {
//           post.platformStatuses = {};
//         }
//         // ===============================
//         // EXISTS ON INSTAGRAM
//         // ===============================

//         if (instagramIds.includes(igId)) {
//           // UPDATE INSTAGRAM STATUS
//           post.platformStatuses = {
//             ...post.platformStatuses,
//             Instagram: "posted"
//           };
//         } else {
//           // ===============================
//           // REMOVED FROM INSTAGRAM
//           // ===============================
//           post.platformStatuses = {
//             ...post.platformStatuses,
//             Instagram: "deleted"
//           };
//         }

//         // ===============================
//         // GLOBAL STATUS
//         // ===============================

//         const statuses =
//           Object.values(
//             post.platformStatuses || {}
//           );

//         if (statuses.every((s) => s === "deleted")) {
//           post.status = "deleted";
//         } else {
//           post.status = "posted";
//         }
//         await post.save();
//         updatedCount++;
//       }
//       return res.json({
//         success: true,
//         updatedCount
//       });
//     } catch (err) {
//       console.error("UPDATE INSTAGRAM STATUS ERROR:", err.message);
//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to update Instagram post statuses"
//       });
//     }
//   }
// );


// // ===============================
// // TRIGGER INSTAGRAM GET POSTS
// // ===============================
// router.post(
//   "/get-instagram-posts",
//   async (req, res) => {
//     try {
//       await axios.post(
//         process.env.MAKE_WEBHOOK_URL,
//         {
//           platforms: ["Instagram"],
//           action: "get"
//         }
//       );

//       return res.json({
//         success: true,
//         message:
//           "Instagram import started"
//       });
//     } catch (err) {
//       console.error("GET INSTAGRAM POSTS ERROR:", err.response?.data || err.message);
//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to trigger Instagram import"
//       });
//     }
//   }
// );


// // ===============================
// // UPDATE FACEBOOK POST STATUS
// // ===============================
// router.post("/update-facebook-post-status",
//   async (req, res) => {
//     try {
//       const { posts } = req.body;
//       if (!Array.isArray(posts)) {
//         return res.status(400).json({
//           success: false,
//           message: "Posts array is required"
//         });
//       }
//       let updatedCount = 0;

//       // ===============================
//       // GET ALL FACEBOOK POSTS FROM DB
//       // ===============================

//       const dbPosts =
//         await ScheduledSocialPost.find({
//           "socialPostIds.Facebook": {
//             $exists: true
//           }
//         });

//       // ===============================
//       // FACEBOOK IDS FROM MAKE
//       // ===============================

//       const facebookIds =
//         posts.map((p) =>
//           String(
//             p.id ||
//             p["Post ID"]
//           )
//         );

//       // ===============================
//       // CHECK POSTS
//       // ===============================
//       for (const post of dbPosts) {
//         const fbId = String(post.socialPostIds?.Facebook);
//         // INIT IF EMPTY
//         if (!post.platformStatuses) {
//           post.platformStatuses = {};
//         }
//         // ===============================
//         // EXISTS ON FACEBOOK
//         // ===============================
//         if (facebookIds.includes(fbId)) {
//           // UPDATE FACEBOOK STATUS
//           post.platformStatuses = {
//             ...post.platformStatuses,
//             Facebook: "posted"
//           };
//         } else {
//           // ===============================
//           // REMOVED FROM FACEBOOK
//           // ===============================
//           post.platformStatuses = {
//             ...post.platformStatuses,
//             Facebook: "deleted"
//           };
//         }

//         // ===============================
//         // GLOBAL STATUS
//         // ===============================

//         const statuses = Object.values(post.platformStatuses || {});
//         if (statuses.every((s) => s === "deleted")) {
//           post.status = "deleted";
//         } else {
//           post.status = "posted";
//         }
//         await post.save();
//         updatedCount++;
//       }
//       return res.json({
//         success: true,
//         updatedCount
//       });
//     } catch (err) {
//       console.error("UPDATE FACEBOOK STATUS ERROR:", err.message);
//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to update Facebook post statuses"
//       });
//     }
//   }
// );


// // ===============================
// // TRIGGER FACEBOOK GET POSTS
// // ===============================
// router.post("/get-facebook-posts",
//   async (req, res) => {
//     try {
//       await axios.post(
//         process.env.MAKE_WEBHOOK_URL,
//         {
//           platforms: ["Facebook"],
//           action: "get"
//         }
//       );
//       return res.json({
//         success: true,
//         message:
//           "Facebook import started"
//       });
//     } catch (err) {
//       console.error("GET FACEBOOK POSTS ERROR:", err.response?.data || err.message);
//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to trigger Facebook import"
//       });
//     }
//   }
// );


// // ===============================
// // IMPORT FACEBOOK POSTS
// // ===============================
// router.post("/import-facebook-posts",
//   async (req, res) => {
//     try {
//       const { posts } = req.body;
//       if (!Array.isArray(posts)) {
//         return res.status(400).json({
//           success: false,
//           message: "Posts array is required"
//         });
//       }
//       const savedPosts = [];
//       for (const item of posts) {
//         // prevent duplicates
//         const exists =
//           await ScheduledSocialPost.findOne({
//             "socialPostIds.Facebook": item.id
//           });

//         if (exists) {
//           continue;
//         }
//         const images = item.full_picture ? [item.full_picture] : [];
//         const post = await ScheduledSocialPost.create({
//             topic: item.message ? item.message.slice(0, 80) : "Facebook Post",
//             caption: item.message || "",
//             images,
//             platforms: ["Facebook"],
//             publishDate: item.created_time ? new Date(item.created_time) : new Date(),
//             status: "posted",
//             socialPostIds: {
//               Facebook: item.id
//             }
//           });
//         savedPosts.push(post);
//       }
//       return res.json({
//         success: true,
//         count: savedPosts.length,
//         posts: savedPosts
//       });
//     } catch (err) {
//       console.error("IMPORT FACEBOOK POSTS ERROR:", err.message);
//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to import Facebook posts"
//       });
//     }
//   }
// );


// // ===============================
// // GET ALL POSTS
// // ===============================
// router.get("/scheduled",
//   async (req, res) => {
//     try {
//       const posts = await ScheduledSocialPost.find().sort({publishDate: 1});
//       return res.json({
//         success: true,
//         posts,
//       });
//     } catch (err) {
//       console.error("GET SCHEDULED POSTS ERROR:", err.message);
//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to fetch scheduled posts",
//       });
//     }
//   }
// );

// // ===============================
// // DELETE SCHEDULED POST
// // ===============================

// router.delete("/:id",
//   async (req, res) => {
//     try {
//       const { id } = req.params;
//       await ScheduledSocialPost.findByIdAndDelete(id);
//       return res.json({
//         success: true,
//         message:
//           "Scheduled post deleted",
//       });
//     } catch (err) {
//       console.error("DELETE POST ERROR:", err.message);
//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to delete scheduled post",
//       });
//     }
//   }
// );


// // ===============================
// // REMOVE POST FROM SOCIALS
// // ===============================
// router.post("/remove/:id",
//   async (req, res) => {
//     try {
//       const { id } = req.params;
//       const post = await ScheduledSocialPost.findById(id);
//       if (!post) {
//         return res.status(404).json({
//           success: false,
//           message: "Post not found"
//         });
//       }
//       await axios.post(
//         MAKE_WEBHOOK_URL,
//         {
//           action: "delete",
//           postId: post._id,
//           topic: post.topic,
//           caption: post.caption,
//           images: post.images,
//           platforms: post.platforms,
//           socialPostIds: post.socialPostIds || {}
//         }
//       );
//       post.status = "deleted";
//       await post.save();
//       return res.json({
//         success: true,
//         message:
//           "Remove request sent successfully"
//       });
//     } catch (err) {
//       console.error("REMOVE POST ERROR:", err.message);
//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to remove post"
//       });
//     }
//   }
// );

// router.get("/:id", async (req, res) => {
//   try {
//     const post = await ScheduledSocialPost.findById(req.params.id);
//     if (!post) {
//       return res.status(404).json({
//         success: false,
//         message: "Post not found"
//       });
//     }
//     res.json(post);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({
//       success: false
//     });
//   }
// });


// // ===============================
// // EDIT POST
// // ===============================
// router.post("/edit/:id",
//   async (req, res) => {
//     try {
//       const { id } = req.params;
//       const {
//         topic,
//         caption,
//         images,
//         publishDate,
//       } = req.body;
//       const post = await ScheduledSocialPost.findById(id);
//       if (!post) {
//         return res.status(404).json({
//           success: false,
//           message: "Post not found"
//         });
//       }

//       // ===============================
//       // STORE ORIGINAL STATUS
//       // ===============================
//       const wasPosted = post.status === "posted";
//       // ===============================
//       // UPDATE FIELDS
//       // ===============================
//       post.topic = topic || post.topic;
//       post.caption = caption || post.caption;
//       post.images = images?.length ? images : post.images;
//       // ===============================
//       // UPDATE PUBLISH DATE
//       // ===============================
//       if (publishDate) {
//         const parsedDate = new Date(publishDate);
//         // INVALID DATE CHECK
//         if (isNaN(parsedDate.getTime())) {
//           return res.status(400).json({
//             success: false,
//             message:
//               "Invalid publish date"
//           });
//         }
//         post.publishDate = parsedDate;
//         // ===============================
//         // RESET STATUS
//         // ONLY IF NOT ALREADY POSTED
//         // ===============================
//         if (!wasPosted) {
//           post.status = "scheduled";
//         }
//       }
//       // ===============================
//       // SAVE CHANGES
//       // ===============================
//       await post.save();
//       // ===============================
//       // UPDATE LIVE FACEBOOK POSTS ONLY
//       // ===============================
//       if (wasPosted && post.platforms.includes("Facebook")) {
//         await axios.post(
//           MAKE_WEBHOOK_URL,
//           {
//             action: "edit",
//             postId: post._id,
//             topic: post.topic,
//             caption: post.caption,
//             photos:
//               post.images.map(
//                 (img) => ({
//                   url: img,
//                   type: "url"
//                 })
//               ),
//             publishDate: post.publishDate,
//             platforms: post.platforms,
//             socialPostIds: post.socialPostIds || {}
//           }
//         );
//       }
//       return res.json({
//         success: true,
//         message:
//           wasPosted
//             ? "Live social post updated successfully"
//             : "Scheduled post updated successfully",
//         post
//       });
//     } catch (err) {
//       console.error("EDIT POST ERROR:", err.message);
//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to edit post"
//       });
//     }
//   }
// );

// export default router;










































// import sharp from "sharp";
// import express from "express";
// import cors from "cors";
// import dotenv from "dotenv";
// import Groq from "groq-sdk";
// import axios from "axios";
// import multer from "multer";
// import path from "path";
// import fs from "fs";
// import { fileURLToPath } from "url";

// import { GoogleGenAI } from "@google/genai";

// const router = express.Router();

// import {
//   generateImage,
// } from "./social_manager.js";

// import ScheduledSocialPost from "../models/ScheduledSocialPost.js";

// // ===============================
// // __dirname FIX
// // ===============================

// const __filename =
//   fileURLToPath(import.meta.url);

// const __dirname =
//   path.dirname(__filename);

// // ===============================
// // ENV
// // ===============================

// dotenv.config({
//   path: "../../.env",
// });

// const app = express();

// app.use(cors());

// app.use(express.json());

// // ===============================
// // IMAGE DIRECTORY
// // ===============================

// const IMAGE_DIR =
//   "/home/dhruvit/.openclaw/workspace/skills/blog_manager/images";

// // CREATE FOLDER IF NOT EXISTS
// if (!fs.existsSync(IMAGE_DIR)) {

//   fs.mkdirSync(IMAGE_DIR, {
//     recursive: true
//   });
// }

// // ===============================
// // MULTER STORAGE
// // ===============================

// const storage =
//   multer.diskStorage({

//     destination:
//       (req, file, cb) => {

//         cb(null, IMAGE_DIR);
//       },

//     filename:
//       (req, file, cb) => {

//         const uniqueName =
//           `upload-${Date.now()}-${Math.round(
//             Math.random() * 1E9
//           )}${path.extname(file.originalname)}`;

//         cb(null, uniqueName);
//       }
//   });

// // ===============================
// // FILE FILTER
// // ===============================

// const fileFilter =
//   (req, file, cb) => {

//     if (
//       file.mimetype.startsWith("image/")
//     ) {

//       cb(null, true);

//     } else {

//       cb(
//         new Error("Only image files allowed"),
//         false
//       );
//     }
//   };

// // ===============================
// // MULTER
// // ===============================

// const upload =
//   multer({

//     storage,

//     fileFilter,

//     limits: {

//       // 5MB
//       fileSize:
//         5 * 1024 * 1024
//     }
//   });

// // ===============================
// // ENV
// // ===============================

// const MAKE_WEBHOOK_URL =
//   process.env.MAKE_WEBHOOK_URL;


// // ===============================
// // GROQ & GEMINI
// // ===============================
// const ai = new GoogleGenAI({
//   apiKey: process.env.GEMINI_API_KEY
// });

// const MODEL = "gemini-2.5-flash";

// //const groq = new Groq({
// //  apiKey: process.env.GROQ_API_KEY,
// //});

// // ===============================
// // AI CONTENT
// // ===============================

// async function generateSocialContent(topic) {

//   const prompt = `
// You are an expert Calgary and Airdrie real estate social media strategist.

// Create ONE unique Facebook and Instagram post.

// TOPIC:
// ${topic}

// TARGET AUDIENCE:
// - Home buyers
// - Home sellers
// - First-time buyers
// - Real estate investors
// - Alberta homeowners

// LOCATION FOCUS:
// - Calgary
// - Airdrie
// - Chestermere
// - Cochrane
// - Okotoks
// - High River
// - Strathmore

// WRITING STYLE:
// - Professional
// - Modern
// - Friendly
// - Trustworthy
// - Conversational
// - Persuasive
// - Easy to read

// CONTENT REQUIREMENTS:
// - 150-200 words
// - Start with a strong hook
// - Naturally use relevant emojis
// - Highlight benefits instead of features
// - Include a clear call-to-action
// - Generate different wording every time
// - Never copy previous responses
// - Mention Calgary or nearby communities naturally when relevant

// CONTACT INFORMATION
// Mention naturally:

// 📞 403-439-1555
// 🌐 www.realtorparth.ca
// ✉️ hello@realtorparth.ca

// RULES:
// - Never say "Free Consultation"
// - Instead use:
//   "Contact me for a consultation."
// - No markdown
// - No headings
// - No bullet points
// - No quotation marks
// - Plain text only

// HASHTAGS:
// Always include:
// #realtorparth

// Also include 6-10 relevant hashtags such as:
// #CalgaryRealEstate
// #AirdrieRealEstate
// #YYCRealEstate
// #CalgaryHomes
// #AirdrieHomes
// #AlbertaRealEstate
// #CalgaryRealtor
// #DreamHome
// #HomeBuying
// #HomeSelling

// Return ONLY the social media caption.
// `;

//   const response =
//     await ai.models.generateContent({
//       model: MODEL,
//       contents: prompt
//     });

//   return (response.text || "")
//     .replace(/^caption\s*:/i, "")
//     .replace(/^post\s*:/i, "")
//     .replace(/\*\*/g, "")
//     .replace(/```/g, "")
//     .trim();
// }










// const groq = new Groq({
//   apiKey: process.env.GROQ_API_KEY
// });



// export async function generatePropertyPost(property) {

//   const prompt = `
// Create a Facebook and Instagram real estate post.

// PROPERTY INFORMATION:

// Address:
// ${property.UnparsedAddress || ""}

// MLS:
// ${property.ListingKey || property.ListingId || ""}

// Price:
// ${property.ListPrice || ""}

// Property Type:
// ${property.PropertyType || ""}

// Style:
// ${property.ArchitecturalStyle || ""}

// City:
// ${property.City || ""}

// Community:
// ${property.SubdivisionName || ""}

// Bedrooms:
// ${property.BedroomsTotal || ""}

// Bathrooms:
// ${property.BathroomsTotalInteger || ""}

// Garage:
// ${property.GarageSpaces || ""}

// Square Feet:
// ${property.BuildingAreaTotal || ""}

// Year Built:
// ${property.YearBuilt || ""}

// Description:
// ${property.PublicRemarks || ""}


// REQUIREMENTS:

// - 120-180 words
// - Professional
// - Modern
// - Friendly
// - Trustworthy
// - Conversational
// - Persuasive
// - Include relevant emojis naturally
// - Include a strong opening hook
// - Highlight the property's most appealing benefits
// - Include a clear call-to-action
// - Calgary/Airdrie focused
// - Generate a UNIQUE caption every time
// - Use different wording and hooks
// - Avoid repetitive sentence structures
// - Make the post feel natural and human-written


// CONTACT INFORMATION:

// Mention naturally:

// Ph: 403-439-1555

// www.realtorparth.ca

// hello@realtorparth.ca


// RULES:

// - Never say "Free Consultation"
// - Instead use:
//   "Contact me for a consultation."
// - Price must be written with $ followed by the number
// - No markdown
// - No headings
// - No bullet points
// - No quotation marks
// - Do not give an Open House date or time
// - Do not invent property information
// - Only use facts provided in the property information
// - Do not mention information that is not available
// - Do not say that you are an AI
// - Return ONLY the social media post


// HASHTAGS:

// Always include:

// #realtorparth

// Also include relevant real estate hashtags, such as:

// #CalgaryRealEstate
// #AirdrieRealEstate
// #YYCRealEstate
// #CalgaryHomes
// #AirdrieHomes
// #AlbertaRealEstate
// #CalgaryRealtor
// #DreamHome
// #HomeBuying
// #HomeSelling

// Return only post text.
// `;

//   try {

//     const response = await ai.models.generateContent({
//       model: MODEL,
//       contents: prompt,
//       config: {
//         temperature: 1.2
//       }
//     });

//     const caption = (response.text || "")
//       .replace(/^caption\s*:/i, "")
//       .replace(/^post\s*:/i, "")
//       .replace(/\*\*/g, "")
//       .replace(/```/g, "")
//       .trim();

//     if (!caption) {
//       throw new Error("Gemini returned an empty property caption");
//     }

//     return {
//       caption,
//       property
//     };

//   } catch (error) {

//     console.error(
//       "GEMINI PROPERTY POST ERROR:",
//       error?.response?.data ||
//       error?.message ||
//       error
//     );

//     throw error;
//   }
// }



// async function generatePropertyImage(property, imageIndex = 0) {
//   const fileName = `property-${Date.now()}.jpg`;

//   const outputDir =
//     "/home/dhruvit/.openclaw/workspace/skills/blog_manager/images";

//   if (!fs.existsSync(outputDir)) {
//     fs.mkdirSync(outputDir, {
//       recursive: true
//     });
//   }

//   const outputPath = path.join(
//     outputDir,
//     fileName
//   );

//   // =========================================================
//   // PROPERTY IMAGE
//   // =========================================================

//   const sortedMedia =
//     property.Media?.sort(
//       (a, b) =>
//         (a.Order ?? 0) -
//         (b.Order ?? 0)
//     ) || [];

//   const imageMedia =
//     sortedMedia.filter(
//       (media) => {
//         const url =
//           media.MediaURL?.toLowerCase() || "";

//         return (
//           url.endsWith(".jpg") ||
//           url.endsWith(".jpeg") ||
//           url.endsWith(".png") ||
//           url.includes("ddfcdn.realtor.ca")
//         );
//       }
//     );

//   const imageUrl =
//     imageMedia[
//       imageIndex %
//       imageMedia.length
//     ]?.MediaURL;

//   if (!imageUrl) {
//     throw new Error(
//       "Property image not found"
//     );
//   }

//   const response =
//     await axios.get(
//       imageUrl,
//       {
//         responseType: "arraybuffer"
//       }
//     );

//   // =========================================================
//   // PROPERTY DATA
//   // =========================================================

//   const price =
//     property.ListPrice
//       ? `$${Number(
//         property.ListPrice
//       ).toLocaleString()}`
//       : "Call for Price";

//   const beds =
//     property.BedroomsTotal || 0;

//   const baths =
//     property.BathroomsTotalInteger || 0;

//   const city =
//     property.City || "Calgary";

//   const address =
//     (property.UnparsedAddress || "").length > 38
//       ? property.UnparsedAddress.substring(
//         0,
//         38
//       ) + "..."
//       : property.UnparsedAddress || "";

//   const mls =
//     property.ListingId || "";

//   const sqft =
//     property.BuildingAreaTotal ||
//     property.LivingArea ||
//     "";

//   const propertyType =
//     property.PropertyType || "";

//   // =========================================================
//   // REALTOR® SVG LOGO
//   // =========================================================
//   //
//   // The REALTOR® logo is completely separate from
//   // the property-details background.
//   //
//   // LEFT SIDE  = REALTOR® LOGO
//   // RIGHT SIDE = PROPERTY DETAILS
//   //
//   // =========================================================

//   const realtorLogoPath =
//     path.join(
//       __dirname,
//       "assets/realtorparths_pdf",
//       "realtor_logo.svg"
//     );

//   const realtorLogoRaw =
//     await fs.promises.readFile(
//       realtorLogoPath,
//       "utf8"
//     );

//   const realtorLogoBase64 =
//     Buffer.from(
//       realtorLogoRaw
//     ).toString("base64");

//   // =========================================================
//   // REALTOR® LOGO OVERLAY
//   // =========================================================
//   //
//   // Change opacity here:
//   //
//   // 0.20 = very subtle
//   // 0.30 = subtle
//   // 0.35 = recommended
//   // 0.50 = strong
//   // 1.00 = fully visible
//   //
//   // =========================================================

//   const realtorLogoSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <image
//         href="data:image/svg+xml;base64,${realtorLogoBase64}"
//         x="55"
//         y="52"
//         width="190"
//         height="165"
//         opacity="0.35"
//         preserveAspectRatio="xMidYMid meet"
//       />

//     </svg>
//   `;

//   // =========================================================
//   // TOP PROPERTY DETAILS BACKGROUND
//   // =========================================================
//   //
//   // IMPORTANT:
//   //
//   // The background ONLY exists on the RIGHT side.
//   //
//   // LEFT 0 - 285px:
//   // REALTOR® LOGO
//   //
//   // RIGHT 285 - 932px:
//   // PROPERTY DETAILS
//   //
//   // =========================================================

//   const addressBgSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <!-- ================================================= -->
//       <!-- RIGHT-SIDE PROPERTY DETAILS BACKGROUND -->
//       <!-- ================================================= -->

//       <rect
//         x="285"
//         y="32"
//         width="647"
//         height="205"
//         rx="18"
//         ry="18"
//         fill="rgba(20,20,20,0.72)"
//       />


//       <!-- ================================================= -->
//       <!-- TOP HIGHLIGHT -->
//       <!-- ================================================= -->

//       <rect
//         x="285"
//         y="32"
//         width="647"
//         height="4"
//         rx="2"
//         fill="rgba(255,255,255,0.85)"
//       />


//       <!-- ================================================= -->
//       <!-- VERTICAL DIVIDER -->
//       <!-- ================================================= -->

//       <line
//         x1="285"
//         y1="55"
//         x2="285"
//         y2="214"
//         stroke="#ffffff"
//         stroke-width="1"
//         opacity="0.25"
//       />

//     </svg>
//   `;

//   // =========================================================
//   // PROPERTY DETAILS TEXT
//   // =========================================================

//   const LEFT_LABEL_X = 315;
//   const LEFT_VALUE_X = 455;

//   const RIGHT_LABEL_X = 650;
//   const RIGHT_VALUE_X = 785;

//   const addressSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <style>

//         .address {
//           fill: #fff;
//           font: 800 32px Arial, Helvetica, sans-serif;
//         }

//         .mls {
//           fill: #F8F8F8;
//           font: 600 20px Arial, Helvetica, sans-serif;
//         }

//         .label {
//           fill: #CFCFCF;
//           font: 600 17px Arial, Helvetica, sans-serif;
//         }

//         .value {
//           fill: #fff;
//           font: 700 20px Arial, Helvetica, sans-serif;
//         }

//         .line {
//           stroke: #8F8F8F;
//           stroke-width: 1;
//           opacity: .45;
//         }

//       </style>


//       <!-- ================================================= -->
//       <!-- ADDRESS -->
//       <!-- ================================================= -->

//       <text
//         x="315"
//         y="78"
//         class="address"
//       >
//         ${address}
//       </text>


//       <!-- ================================================= -->
//       <!-- MLS -->
//       <!-- ================================================= -->

//       <text
//         x="315"
//         y="110"
//         class="mls"
//       >
//         MLS® ${mls}
//       </text>


//       <!-- ================================================= -->
//       <!-- HORIZONTAL DIVIDER -->
//       <!-- ================================================= -->

//       <line
//         x1="312"
//         y1="130"
//         x2="900"
//         y2="130"
//         class="line"
//       />


//       <!-- ================================================= -->
//       <!-- LEFT COLUMN -->
//       <!-- ================================================= -->

//       <text
//         x="${LEFT_LABEL_X}"
//         y="163"
//         class="label"
//       >
//         CITY
//       </text>

//       <text
//         x="${LEFT_VALUE_X}"
//         y="163"
//         class="value"
//       >
//         ${city}
//       </text>


//       <text
//         x="${LEFT_LABEL_X}"
//         y="199"
//         class="label"
//       >
//         BEDROOMS
//       </text>

//       <text
//         x="${LEFT_VALUE_X}"
//         y="199"
//         class="value"
//       >
//         ${beds}
//       </text>


//       <!-- ================================================= -->
//       <!-- RIGHT COLUMN -->
//       <!-- ================================================= -->

//       <text
//         x="${RIGHT_LABEL_X}"
//         y="163"
//         class="label"
//       >
//         BATHROOMS
//       </text>

//       <text
//         x="${RIGHT_VALUE_X}"
//         y="163"
//         class="value"
//       >
//         ${baths}
//       </text>


//       <text
//         x="${RIGHT_LABEL_X}"
//         y="199"
//         class="label"
//       >
//         SIZE
//       </text>

//       <text
//         x="${RIGHT_VALUE_X}"
//         y="199"
//         class="value"
//       >
//         ${sqft || "-"} Sq Ft
//       </text>

//     </svg>
//   `;

//   // =========================================================
//   // FOOTER BACKGROUND
//   // =========================================================

//   const footerBgSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <rect
//         x="0"
//         y="1160"
//         width="280"
//         height="190"
//         fill="#ffffff"
//       />

//       <rect
//         x="280"
//         y="1160"
//         width="800"
//         height="190"
//         fill="#4b2b2b"
//       />

//     </svg>
//   `;

//   // =========================================================
//   // FOOTER TEXT
//   // =========================================================

//   const footerTextSvg = `
//     <svg
//       width="1080"
//       height="1350"
//       xmlns="http://www.w3.org/2000/svg"
//     >

//       <style>

//         .name {
//           fill: #fff;
//           font: 800 38px Arial, Helvetica, sans-serif;
//         }

//         .role {
//           fill: #fff;
//           font: 400 30px Arial, Helvetica, sans-serif;
//         }

//         .phone {
//           fill: #fff;
//           font: 500 38px Arial, Helvetica, sans-serif;
//         }

//         .price {
//           fill: #222;
//           font: 800 34px Arial, Helvetica, sans-serif;
//         }

//         .info {
//           fill: #444;
//           font: 21px Arial, Helvetica, sans-serif;
//         }

//       </style>


//       <!-- ================================================= -->
//       <!-- PRICE -->
//       <!-- ================================================= -->

//       <text
//         x="20"
//         y="1198"
//         class="price"
//       >
//         ${price}
//       </text>


//       <!-- ================================================= -->
//       <!-- BED / BATH -->
//       <!-- ================================================= -->

//       <text
//         x="20"
//         y="1235"
//         class="info"
//       >
//         ${beds} Bed • ${baths} Bath
//       </text>


//       <!-- ================================================= -->
//       <!-- PROPERTY TYPE -->
//       <!-- ================================================= -->

//       <text
//         x="20"
//         y="1268"
//         class="info"
//       >
//         ${propertyType}
//       </text>


//       <!-- ================================================= -->
//       <!-- SQ FT -->
//       <!-- ================================================= -->

//       <text
//         x="20"
//         y="1300"
//         class="info"
//       >
//         ${sqft || ""} Sq Ft
//       </text>


//       <!-- ================================================= -->
//       <!-- MLS -->
//       <!-- ================================================= -->

//       <text
//         x="20"
//         y="1332"
//         class="info"
//       >
//         MLS® ${mls}
//       </text>


//       <!-- ================================================= -->
//       <!-- AGENT NAME -->
//       <!-- ================================================= -->

//       <text
//         x="315"
//         y="1220"
//         class="name"
//       >
//         PARTH BRAHMBHATT
//       </text>


//       <!-- ================================================= -->
//       <!-- REALTOR -->
//       <!-- ================================================= -->

//       <text
//         x="455"
//         y="1275"
//         class="role"
//       >
//         REALTOR
//       </text>


//       <!-- ================================================= -->
//       <!-- PHONE -->
//       <!-- ================================================= -->

//       <text
//         x="340"
//         y="1330"
//         class="phone"
//       >
//         403-439-1555
//       </text>

//     </svg>
//   `;

//   // =========================================================
//   // AGENT IMAGE
//   // =========================================================

//   const agentPath =
//     path.join(
//       __dirname,
//       "assets/realtorparths_pdf",
//       "agent12.png"
//     );

//   const agentBuffer =
//     await sharp(agentPath)
//       .resize({
//         height: 400,
//         fit: "inside"
//       })
//       .png()
//       .toBuffer();

//   // =========================================================
//   // BROKERAGE LOGO
//   // =========================================================

//   const logoPath =
//     path.join(
//       __dirname,
//       "assets/realtorparths_pdf",
//       "diamond_realty.jpeg"
//     );

//   const logoBuffer =
//     await sharp(logoPath)
//       .resize({
//         width: 280,
//         height: 190,
//         fit: "fill"
//       })
//       .png()
//       .toBuffer();

//   // =========================================================
//   // FINAL IMAGE
//   // =========================================================

//   const buffer =
//     await sharp(response.data)
//       .resize(
//         1080,
//         1350,
//         {
//           fit: "cover"
//         }
//       )
//       .composite([

//         // =====================================================
//         // 1. RIGHT-SIDE PROPERTY DETAILS BACKGROUND
//         // =====================================================

//         {
//           input: Buffer.from(
//             addressBgSvg
//           ),
//           left: 0,
//           top: 0
//         },


//         // =====================================================
//         // 2. REALTOR® SVG LOGO
//         // =====================================================
//         //
//         // Logo is on the LEFT.
//         //
//         // There is NO dark background behind it.
//         //
//         // =====================================================

//         {
//           input: Buffer.from(
//             realtorLogoSvg
//           ),
//           left: 0,
//           top: 0
//         },


//         // =====================================================
//         // 3. PROPERTY DETAILS TEXT
//         // =====================================================

//         {
//           input: Buffer.from(
//             addressSvg
//           ),
//           left: 0,
//           top: 0
//         },


//         // =====================================================
//         // 4. FOOTER BACKGROUND
//         // =====================================================

//         {
//           input: Buffer.from(
//             footerBgSvg
//           ),
//           left: 0,
//           top: 0
//         },


//         // =====================================================
//         // 5. FOOTER TEXT
//         // =====================================================

//         {
//           input: Buffer.from(
//             footerTextSvg
//           ),
//           left: 0,
//           top: 0
//         },


//         // =====================================================
//         // 6. BROKERAGE LOGO
//         // =====================================================

//         {
//           input: logoBuffer,
//           left: 0,
//           top: 1160
//         },


//         // =====================================================
//         // 7. AGENT IMAGE
//         // =====================================================

//         {
//           input: agentBuffer,
//           left: 740,
//           top: 960
//         }

//       ])
//       .flatten({
//         background: "#000000"
//       })
//       .jpeg({
//         quality: 84,
//         mozjpeg: true
//       })
//       .toBuffer();

//   // =========================================================
//   // SAVE IMAGE
//   // =========================================================

//   await fs.promises.writeFile(
//     outputPath,
//     buffer
//   );

//   // =========================================================
//   // RETURN
//   // =========================================================

//   return {
//     imageURL:
//       `https://realtorparth.ca/social-images/${fileName}`,

//     outputPath
//   };
// }



// // ===============================
// // GENERATE PROPERTY SOCIAL POST
// // ===============================

// router.post(
//   "/generate-property",
//   async (req, res) => {

//     try {

//       const { mls } = req.body;

//       // ===============================
//       // VALIDATION
//       // ===============================

//       if (!mls || typeof mls !== "string") {

//         return res.status(400).json({
//           success: false,
//           message: "MLS number is required"
//         });

//       }

//       const cleanMLS = mls.trim();

//       console.log(
//         "🏡 Generating property social post for MLS:",
//         cleanMLS
//       );

//       // ===============================
//       // GET PROPERTY
//       // ===============================

//       const propertyResponse =
//         await axios.get(
//           `https://realtorparth.ca/api/properties/analysis/${cleanMLS}`
//         );

//       const property =
//         propertyResponse.data?.property;

//       if (!property) {

//         return res.status(404).json({
//           success: false,
//           message: "Property not found"
//         });

//       }

//       // ===============================
//       // ALBERTA ONLY (OPTIONAL)
//       // ===============================

//       const province =
//         property.StateOrProvince ||
//         property.Province ||
//         "";

//       if (
//         province &&
//         province.toLowerCase() !== "ab" &&
//         province.toLowerCase() !== "alberta"
//       ) {

//         return res.status(400).json({
//           success: false,
//           message: "Only Alberta properties are supported"
//         });

//       }

//       // ===============================
//       // GENERATE AI CAPTION
//       // ===============================

//       const preview =
//         await generatePropertyPost(property);

//       // ===============================
//       // GENERATE IMAGE
//       // ===============================

//       const {
//         imageURL
//       } =
//         await generatePropertyImage(
//           property,
//           0
//         );

//       // ===============================
//       // RESPONSE
//       // ===============================

//       return res.json({

//         success: true,

//         topic:
//           property.UnparsedAddress,

//         caption:
//           preview.caption,

//         imageURL,

//         property

//       });

//     } catch (err) {

//       console.error(
//         "PROPERTY SOCIAL POST ERROR:",
//         err?.response?.data ||
//         err?.message ||
//         err
//       );

//       return res.status(500).json({

//         success: false,

//         message:
//           err?.response?.data?.message ||
//           "Failed to generate property social post"

//       });

//     }

//   }
// );















// // ===============================
// // GENERATE POST
// // ===============================

// router.post(
//   "/generate",
//   async (req, res) => {

//     try {

//       const { topic } = req.body;

//       if (!topic) {

//         return res.status(400).json({
//           success: false,
//           message: "Topic is required"
//         });
//       }

//       console.log(
//         "📱 Generating social post:",
//         topic
//       );

//       // AI caption
//       const caption =
//         await generateSocialContent(topic);

//       // AI image
//       const { imageURL } =
//         await generateImage(topic);

//       return res.json({
//         success: true,
//         topic,
//         caption,
//         imageURL,
//       });

//     } catch (err) {

//       console.error(
//         "SOCIAL API ERROR:",
//         err.response?.data || err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message: "Failed to generate social post"
//       });
//     }
//   }
// );

// // ===============================
// // UPLOAD SOCIAL IMAGES
// // ===============================

// router.post(
//   "/upload-social-images",

//   upload.array("images", 10),

//   async (req, res) => {

//     try {

//       const files = req.files;

//       if (
//         !files ||
//         !files.length
//       ) {

//         return res.status(400).json({
//           success: false,
//           message: "No images uploaded"
//         });
//       }

//       const urls =
//         files.map((file) => {

//           return `https://realtorparth.ca/social-images/${file.filename}`;
//         });

//       return res.json({
//         success: true,
//         urls
//       });

//     } catch (err) {

//       console.error(
//         "UPLOAD ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message: "Failed to upload images"
//       });
//     }
//   }
// );




// router.get("/posted-comment-posts", async (req, res) => {
//     try {
//         // ==========================================
//         // ONLY CHECK POSTS FROM LAST 14 DAYS
//         // ==========================================
//         const thirtyDaysAgo = new Date();
//         thirtyDaysAgo.setDate(
//             thirtyDaysAgo.getDate() - 30
//         );
//         // ==========================================
//         // GET RECENT POSTED SOCIAL POSTS
//         // ==========================================
//         const posts = await ScheduledSocialPost.find(
//             {
//                 status: "posted",
//                 publishDate: {
//                     $gte: thirtyDaysAgo
//                 }
//             },
//             {
//                 socialPostIds: 1,
//                 publishDate: 1,
//                 _id: 0
//             }
//         ).sort({
//             publishDate: -1
//         });
//         return res.json({
//             success: true,
//             count: posts.length,
//             posts
//         });
//     } catch (err) {
//         console.error("❌ GET POSTED COMMENT POSTS ERROR:", err);
//         return res.status(500).json({
//             success: false,
//             count: 0,
//             posts: [],
//             message: "Failed to get posted social posts"
//         });
//     }
// });





// function getPlatformKey(platform) {
//     const normalized = String(platform || "").toLowerCase();

//     if (normalized === "facebook") {
//         return "Facebook";
//     }

//     if (normalized === "instagram") {
//         return "Instagram";
//     }

//     return null;
// }


// router.post("/check", async (req, res) => {
//     try {
//         const {
//             platform,
//             postId,
//             commentId
//         } = req.body;

//         if (!platform || !postId || !commentId) {
//             return res.status(400).json({
//                 success: false,
//                 message: "platform, postId and commentId are required"
//             });
//         }

//         const platformKey = getPlatformKey(platform);
//         const normalizedPlatform = platform.toLowerCase();

//         if (!platformKey) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Invalid platform"
//             });
//         }

//         const post = await ScheduledSocialPost.findOne({
//             [`socialPostIds.${platformKey}`]: String(postId)
//         });

//         // IMPORTANT:
//         // Post not found does NOT mean "not replied"
//         if (!post) {
//             console.log(
//                 `⚠️ CHECK POST NOT FOUND | ${platformKey} | postId=${postId}`
//             );

//             return res.status(404).json({
//                 success: false,
//                 message: "Post not found"
//             });
//         }

//         const alreadyReplied = post.repliedComments.some(
//             item =>
//                 String(item.commentId) === String(commentId) &&
//                 String(item.platform).toLowerCase() === normalizedPlatform
//         );

//         console.log(
//             `🔍 CHECK REPLY | ${platformKey} | comment=${commentId} | alreadyReplied=${alreadyReplied}`
//         );

//         return res.json({
//             success: true,
//             alreadyReplied
//         });

//     } catch (err) {
//         console.error(
//             "❌ CHECK REPLIED ERROR:",
//             err
//         );

//         return res.status(500).json({
//             success: false,
//             message: "Server error"
//         });
//     }
// });


// router.post("/save", async (req, res) => {
//     try {
//         const {
//             platform,
//             postId,
//             commentId
//         } = req.body;

//         if (!platform || !postId || !commentId) {
//             return res.status(400).json({
//                 success: false,
//                 message: "platform, postId and commentId are required"
//             });
//         }

//         const platformKey = getPlatformKey(platform);
//         const normalizedPlatform = platform.toLowerCase();

//         if (!platformKey) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Invalid platform"
//             });
//         }

//         const post = await ScheduledSocialPost.findOne({
//             [`socialPostIds.${platformKey}`]: String(postId)
//         });

//         if (!post) {
//             console.log(
//                 `⚠️ SAVE POST NOT FOUND | ${platformKey} | postId=${postId}`
//             );

//             return res.status(404).json({
//                 success: false,
//                 message: "Post not found"
//             });
//         }

//         const alreadyExists = post.repliedComments.some(
//             item =>
//                 String(item.commentId) === String(commentId) &&
//                 String(item.platform).toLowerCase() === normalizedPlatform
//         );

//         if (alreadyExists) {
//             console.log(
//                 `⏭️ ALREADY SAVED | ${platformKey} | comment=${commentId}`
//             );

//             return res.json({
//                 success: true,
//                 alreadyExists: true
//             });
//         }

//         post.repliedComments.push({
//             commentId: String(commentId),
//             platform: normalizedPlatform,
//             repliedAt: new Date()
//         });

//         await post.save();

//         console.log(
//             `💾 REPLIED COMMENT SAVED | ${platformKey} | comment=${commentId}`
//         );

//         return res.json({
//             success: true,
//             alreadyExists: false
//         });

//     } catch (err) {
//         console.error(
//             "❌ SAVE REPLIED ERROR:",
//             err
//         );

//         return res.status(500).json({
//             success: false,
//             message: "Server error"
//         });
//     }
// });



// // ===============================
// // SAVE PLATFORM POST ID
// // ===============================

// router.post(
//   "/save-platform-post-id",
//   async (req, res) => {

//     try {

//       const {
//         postId,
//         platform,
//         platformPostId
//       } = req.body;

//       const post =
//         await ScheduledSocialPost.findById(postId);

//       if (!post) {

//         return res.status(404).json({
//           success: false,
//           message: "Post not found"
//         });
//       }

//       post.socialPostIds = {
//         ...post.socialPostIds,
//         [platform]: platformPostId
//       };

//       await post.save();

//       return res.json({
//         success: true
//       });

//     } catch (err) {

//       console.error(
//         "SAVE PLATFORM ID ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false
//       });
//     }
//   }
// );

// // ===============================
// // SCHEDULE POST
// // ===============================

// router.post(
//   "/schedule",
//   async (req, res) => {

//     try {

//       const {
//         topic,
//         caption,
//         images,
//         platforms,
//         publishDate,
//       } = req.body;

//       const cleanImages =
//         Array.isArray(images)
//           ? images.filter(
//             (img) =>
//               typeof img === "string" &&
//               img.trim()
//           )
//           : [];

//       if (
//         !topic ||
//         !caption ||
//         !cleanImages.length ||
//         !Array.isArray(platforms) ||
//         !platforms.length ||
//         !publishDate
//       ) {

//         return res.status(400).json({
//           success: false,
//           message: "Missing required fields",
//         });
//       }

//       const post =
//         await ScheduledSocialPost.create({
//           topic,
//           caption,
//           images: cleanImages,
//           platforms,
//           publishDate,
//         });

//       return res.json({
//         success: true,
//         message: "Post scheduled successfully",
//         post,
//       });

//     } catch (err) {

//       console.error(
//         "SCHEDULE ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message: "Failed to schedule post",
//       });
//     }
//   }
// );








// router.post(
//   "/update-instagram-post-status",
//   async (req, res) => {

//     try {

//       const { posts } = req.body;

//       if (!Array.isArray(posts)) {

//         return res.status(400).json({
//           success: false,
//           message: "Posts array is required"
//         });
//       }

//       let updatedCount = 0;

//       // ===============================
//       // GET INSTAGRAM POSTS FROM DB
//       // ===============================

//       const dbPosts =
//         await ScheduledSocialPost.find({
//           "socialPostIds.Instagram": {
//             $exists: true
//           }
//         });

//       // ===============================
//       // INSTAGRAM IDS FROM MAKE
//       // ===============================

//       const instagramIds =
//         posts.map((p) =>
//           String(
//             p.id ||
//             p["Post ID"] ||
//             p["Instagram ID"]
//           )
//         );

//       // ===============================
//       // CHECK POSTS
//       // ===============================

//       for (const post of dbPosts) {

//         const igId =
//           String(
//             post.socialPostIds?.Instagram
//           );

//         // INIT IF EMPTY

//         if (!post.platformStatuses) {

//           post.platformStatuses = {};
//         }

//         // ===============================
//         // EXISTS ON INSTAGRAM
//         // ===============================

//         if (
//           instagramIds.includes(igId)
//         ) {

//           // UPDATE INSTAGRAM STATUS

//           post.platformStatuses = {
//             ...post.platformStatuses,
//             Instagram: "posted"
//           };

//         } else {

//           // ===============================
//           // REMOVED FROM INSTAGRAM
//           // ===============================

//           post.platformStatuses = {
//             ...post.platformStatuses,
//             Instagram: "deleted"
//           };
//         }

//         // ===============================
//         // GLOBAL STATUS
//         // ===============================

//         const statuses =
//           Object.values(
//             post.platformStatuses || {}
//           );

//         if (
//           statuses.every(
//             (s) => s === "deleted"
//           )
//         ) {

//           post.status = "deleted";

//         } else {

//           post.status = "posted";
//         }

//         await post.save();

//         updatedCount++;
//       }

//       return res.json({
//         success: true,
//         updatedCount
//       });

//     } catch (err) {

//       console.error(
//         "UPDATE INSTAGRAM STATUS ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to update Instagram post statuses"
//       });
//     }
//   }
// );


// // ===============================
// // TRIGGER INSTAGRAM GET POSTS
// // ===============================

// router.post(
//   "/get-instagram-posts",
//   async (req, res) => {

//     try {

//       await axios.post(
//         process.env.MAKE_WEBHOOK_URL,
//         {
//           platforms: ["Instagram"],
//           action: "get"
//         }
//       );

//       return res.json({
//         success: true,
//         message:
//           "Instagram import started"
//       });

//     } catch (err) {

//       console.error(
//         "GET INSTAGRAM POSTS ERROR:",
//         err.response?.data ||
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to trigger Instagram import"
//       });
//     }
//   }
// );




// // ===============================
// // UPDATE FACEBOOK POST STATUS
// // ===============================


// router.post(
//   "/update-facebook-post-status",
//   async (req, res) => {

//     try {

//       const { posts } = req.body;

//       if (!Array.isArray(posts)) {

//         return res.status(400).json({
//           success: false,
//           message: "Posts array is required"
//         });
//       }

//       let updatedCount = 0;

//       // ===============================
//       // GET ALL FACEBOOK POSTS FROM DB
//       // ===============================

//       const dbPosts =
//         await ScheduledSocialPost.find({
//           "socialPostIds.Facebook": {
//             $exists: true
//           }
//         });

//       // ===============================
//       // FACEBOOK IDS FROM MAKE
//       // ===============================

//       const facebookIds =
//         posts.map((p) =>
//           String(
//             p.id ||
//             p["Post ID"]
//           )
//         );

//       // ===============================
//       // CHECK POSTS
//       // ===============================

//       for (const post of dbPosts) {

//         const fbId =
//           String(
//             post.socialPostIds?.Facebook
//           );

//         // INIT IF EMPTY

//         if (!post.platformStatuses) {

//           post.platformStatuses = {};
//         }

//         // ===============================
//         // EXISTS ON FACEBOOK
//         // ===============================

//         if (
//           facebookIds.includes(fbId)
//         ) {

//           // UPDATE FACEBOOK STATUS

//           post.platformStatuses = {
//             ...post.platformStatuses,
//             Facebook: "posted"
//           };

//         } else {

//           // ===============================
//           // REMOVED FROM FACEBOOK
//           // ===============================

//           post.platformStatuses = {
//             ...post.platformStatuses,
//             Facebook: "deleted"
//           };
//         }

//         // ===============================
//         // GLOBAL STATUS
//         // ===============================

//         const statuses =
//           Object.values(
//             post.platformStatuses || {}
//           );

//         if (
//           statuses.every(
//             (s) => s === "deleted"
//           )
//         ) {

//           post.status = "deleted";

//         } else {

//           post.status = "posted";
//         }

//         await post.save();

//         updatedCount++;
//       }

//       return res.json({
//         success: true,
//         updatedCount
//       });

//     } catch (err) {

//       console.error(
//         "UPDATE FACEBOOK STATUS ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to update Facebook post statuses"
//       });
//     }
//   }
// );



// // ===============================
// // TRIGGER FACEBOOK GET POSTS
// // ===============================

// router.post(
//   "/get-facebook-posts",
//   async (req, res) => {

//     try {

//       await axios.post(
//         process.env.MAKE_WEBHOOK_URL,
//         {
//           platforms: ["Facebook"],
//           action: "get"
//         }
//       );

//       return res.json({
//         success: true,
//         message:
//           "Facebook import started"
//       });

//     } catch (err) {

//       console.error(
//         "GET FACEBOOK POSTS ERROR:",
//         err.response?.data ||
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to trigger Facebook import"
//       });
//     }
//   }
// );


// // ===============================
// // IMPORT FACEBOOK POSTS
// // ===============================

// router.post(
//   "/import-facebook-posts",
//   async (req, res) => {

//     try {

//       const { posts } = req.body;

//       if (!Array.isArray(posts)) {

//         return res.status(400).json({
//           success: false,
//           message: "Posts array is required"
//         });
//       }

//       const savedPosts = [];

//       for (const item of posts) {

//         // prevent duplicates
//         const exists =
//           await ScheduledSocialPost.findOne({
//             "socialPostIds.Facebook": item.id
//           });

//         if (exists) {
//           continue;
//         }

//         const images =
//           item.full_picture
//             ? [item.full_picture]
//             : [];

//         const post =
//           await ScheduledSocialPost.create({

//             topic:
//               item.message
//                 ? item.message.slice(0, 80)
//                 : "Facebook Post",

//             caption:
//               item.message || "",

//             images,

//             platforms: [
//               "Facebook"
//             ],

//             publishDate:
//               item.created_time
//                 ? new Date(item.created_time)
//                 : new Date(),

//             status: "posted",

//             socialPostIds: {
//               Facebook: item.id
//             }
//           });

//         savedPosts.push(post);
//       }

//       return res.json({
//         success: true,
//         count: savedPosts.length,
//         posts: savedPosts
//       });

//     } catch (err) {

//       console.error(
//         "IMPORT FACEBOOK POSTS ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to import Facebook posts"
//       });
//     }
//   }
// );





// // ===============================
// // GET ALL POSTS
// // ===============================

// router.get(
//   "/scheduled",
//   async (req, res) => {

//     try {

//       const posts =
//         await ScheduledSocialPost
//           .find()
//           .sort({
//             publishDate: 1
//           });

//       return res.json({
//         success: true,
//         posts,
//       });

//     } catch (err) {

//       console.error(
//         "GET SCHEDULED POSTS ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to fetch scheduled posts",
//       });
//     }
//   }
// );

// // ===============================
// // DELETE SCHEDULED POST
// // ===============================

// router.delete(
//   "/:id",
//   async (req, res) => {

//     try {

//       const { id } =
//         req.params;

//       await ScheduledSocialPost
//         .findByIdAndDelete(id);

//       return res.json({
//         success: true,
//         message:
//           "Scheduled post deleted",
//       });

//     } catch (err) {

//       console.error(
//         "DELETE POST ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to delete scheduled post",
//       });
//     }
//   }
// );






// router.get("/:id", async (req, res) => {
//   try {

//     const post =
//       await ScheduledSocialPost.findById(
//         req.params.id
//       );

//     if (!post) {
//       return res.status(404).json({
//         success: false,
//         message: "Post not found"
//       });
//     }

//     res.json(post);

//   } catch (err) {

//     console.error(err);

//     res.status(500).json({
//       success: false
//     });
//   }
// });





// // ===============================
// // REMOVE POST FROM SOCIALS
// // ===============================

// router.post(
//   "/remove/:id",
//   async (req, res) => {
//     try {

//       const { id } =
//         req.params;

//       const post =
//         await ScheduledSocialPost.findById(id);

//       if (!post) {

//         return res.status(404).json({
//           success: false,
//           message: "Post not found"
//         });
//       }

//       await axios.post(
//         MAKE_WEBHOOK_URL,
//         {
//           action: "delete",

//           postId: post._id,

//           topic: post.topic,

//           caption: post.caption,

//           images: post.images,

//           platforms: post.platforms,

//           socialPostIds:
//             post.socialPostIds || {}
//         }
//       );

//       post.status = "deleted";

//       await post.save();

//       return res.json({
//         success: true,
//         message:
//           "Remove request sent successfully"
//       });

//     } catch (err) {

//       console.error(
//         "REMOVE POST ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to remove post"
//       });
//     }
//   }
// );

// // ===============================
// // EDIT POST
// // ===============================

// router.post(
//   "/edit/:id",
//   async (req, res) => {

//     try {

//       const { id } =
//         req.params;

//       const {
//         topic,
//         caption,
//         images,
//         publishDate,
//       } = req.body;

//       const post =
//         await ScheduledSocialPost.findById(id);

//       if (!post) {

//         return res.status(404).json({
//           success: false,
//           message: "Post not found"
//         });
//       }

//       // ===============================
//       // STORE ORIGINAL STATUS
//       // ===============================

//       const wasPosted =
//         post.status === "posted";

//       // ===============================
//       // UPDATE FIELDS
//       // ===============================

//       post.topic =
//         topic || post.topic;

//       post.caption =
//         caption || post.caption;

//       post.images =
//         images?.length
//           ? images
//           : post.images;

//       // ===============================
//       // UPDATE PUBLISH DATE
//       // ===============================

//       if (publishDate) {

//         const parsedDate =
//           new Date(publishDate);

//         // INVALID DATE CHECK

//         if (
//           isNaN(parsedDate.getTime())
//         ) {

//           return res.status(400).json({
//             success: false,
//             message:
//               "Invalid publish date"
//           });
//         }

//         post.publishDate =
//           parsedDate;

//         // ===============================
//         // RESET STATUS
//         // ONLY IF NOT ALREADY POSTED
//         // ===============================

//         if (!wasPosted) {

//           post.status =
//             "scheduled";
//         }
//       }

//       // ===============================
//       // SAVE CHANGES
//       // ===============================

//       await post.save();

//       // ===============================
//       // UPDATE LIVE FACEBOOK POSTS ONLY
//       // ===============================

//       if (
//         wasPosted &&
//         post.platforms.includes("Facebook")
//       ) {

//         await axios.post(
//           MAKE_WEBHOOK_URL,
//           {
//             action: "edit",

//             postId: post._id,

//             topic: post.topic,

//             caption: post.caption,

//             photos:
//               post.images.map(
//                 (img) => ({
//                   url: img,
//                   type: "url"
//                 })
//               ),

//             publishDate:
//               post.publishDate,

//             platforms:
//               post.platforms,

//             socialPostIds:
//               post.socialPostIds || {}
//           }
//         );
//       }

//       return res.json({
//         success: true,
//         message:
//           wasPosted
//             ? "Live social post updated successfully"
//             : "Scheduled post updated successfully",
//         post
//       });

//     } catch (err) {

//       console.error(
//         "EDIT POST ERROR:",
//         err.message
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Failed to edit post"
//       });
//     }
//   }
// );


// export default router;