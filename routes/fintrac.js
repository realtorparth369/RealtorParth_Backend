import axios from "axios";
import express from "express";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import Fintrac from "../models/FintracModel.js";
import Transaction from "../models/Transaction.js";
import TransactionParty from "../models/TransactionParty.js";
import mongoose from "mongoose";


const router = express.Router();
const PDF_PATH = path.join(process.cwd(), "Individual Identification Information Record.pdf");
/*
|--------------------------------------------------------------------------
| CONFIGURATION
|--------------------------------------------------------------------------
|
| Required:
|
| DILISENSE_API_KEY=your_api_key
|
| Optional:
|
| DILISENSE_API_BASE_URL=https://api.dilisense.com/v1
| DILISENSE_INCLUDES=
|
| If DILISENSE_INCLUDES is empty or not configured,
| DiliSense uses the sources included with your API key.
|
|--------------------------------------------------------------------------
*/

const DILISENSE_API_KEY =
  String(process.env.DILISENSE_API_KEY || "").trim();

const DILISENSE_API_BASE_URL =
  String(
    process.env.DILISENSE_API_BASE_URL ||
    "https://api.dilisense.com/v1"
  ).trim();

const DILISENSE_INCLUDES =
  String(process.env.DILISENSE_INCLUDES || "").trim();

/*
 * DiliSense requests should not hang forever.
 */
const DILISENSE_TIMEOUT_MS = 30_000;


/* =========================================================================
   HELPERS
   ========================================================================= */

/**
 * Safely convert unknown value to string.
 */
function safeString(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}


/**
 * Safely convert unknown value to array.
 */
function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}


/**
 * Normalize DOB into DiliSense format.
 *
 * DiliSense accepts:
 *
 * dd/mm/yyyy
 * 00/00/yyyy
 * 00/mm/yyyy
 * dd/00/yyyy
 *
 * Supported input:
 *
 * YYYY-MM-DD
 * DD-MM-YYYY
 * DD/MM/YYYY
 * DD.MM.YYYY
 *
 * IMPORTANT:
 *
 * We intentionally do not guess ambiguous
 * MM/DD/YYYY vs DD/MM/YYYY values.
 */
function normalizeDiliSenseDob(value) {
  if (!value) {
    return "";
  }

  const input =
    safeString(value);

  if (!input) {
    return "";
  }

  /*
   * YYYY-MM-DD
   */
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      input
    )
  ) {
    const [
      year,
      month,
      day
    ] =
      input.split("-");

    return `${day}/${month}/${year}`;
  }

  /*
   * DD-MM-YYYY
   */
  if (
    /^\d{2}-\d{2}-\d{4}$/.test(
      input
    )
  ) {
    const [
      day,
      month,
      year
    ] =
      input.split("-");

    return `${day}/${month}/${year}`;
  }

  /*
   * DD.MM.YYYY
   */
  if (
    /^\d{2}\.\d{2}\.\d{4}$/.test(
      input
    )
  ) {
    const [
      day,
      month,
      year
    ] =
      input.split(".");

    return `${day}/${month}/${year}`;
  }

  /*
   * DD/MM/YYYY or MM/DD/YYYY.
   *
   * We cannot safely determine which one it is
   * when both day and month are <= 12.
   *
   * Do not guess.
   */
  if (
    /^\d{2}\/\d{2}\/\d{4}$/.test(
      input
    )
  ) {
    return input;
  }

  /*
   * If the value is already in another supported
   * DiliSense format, preserve it.
   */
  return input;
}


/**
 * Normalize gender.
 */
function normalizeDiliSenseGender(value) {
  if (!value) {
    return "";
  }

  const gender =
    safeString(value)
      .toLowerCase();

  if (
    gender === "m" ||
    gender === "male"
  ) {
    return "male";
  }

  if (
    gender === "f" ||
    gender === "female"
  ) {
    return "female";
  }

  return "";
}


/**
 * Determine which FINTRAC answers triggered AML.
 *
 * ANY "yes" triggers screening.
 */
function getAmlTriggerQuestions({
  politicallyExposed,
  familyPoliticallyExposed,
  thirdPartyConducted
}) {
  const triggeredBy = [];

  if (
    politicallyExposed === "yes"
  ) {
    triggeredBy.push(
      "politicallyExposed"
    );
  }

  if (
    familyPoliticallyExposed === "yes"
  ) {
    triggeredBy.push(
      "familyPoliticallyExposed"
    );
  }

  if (
    thirdPartyConducted === "yes"
  ) {
    triggeredBy.push(
      "thirdPartyConducted"
    );
  }

  return triggeredBy;
}


/**
 * Determine whether AML screening is required.
 */
function isAmlRequired(
  triggeredBy
) {
  return (
    Array.isArray(triggeredBy) &&
    triggeredBy.length > 0
  );
}


/**
 * Build DiliSense URL.
 */
function buildDiliSenseUrl(
  endpoint,
  params
) {
  if (
    !DILISENSE_API_BASE_URL
  ) {
    throw new Error(
      "DiliSense AML API base URL is not configured."
    );
  }

  const cleanBaseUrl =
    DILISENSE_API_BASE_URL
      .replace(/\/+$/, "");

  const cleanEndpoint =
    safeString(endpoint)
      .replace(/^\/+/, "");

  const queryString =
    params instanceof URLSearchParams
      ? params.toString()
      : "";

  return queryString
    ? `${cleanBaseUrl}/${cleanEndpoint}?${queryString}`
    : `${cleanBaseUrl}/${cleanEndpoint}`;
}


/**
 * Call DiliSense.
 */
async function callDiliSense(
  endpoint,
  params
) {
  if (
    !DILISENSE_API_KEY
  ) {
    throw new Error(
      "DiliSense AML API key is not configured."
    );
  }

  const url =
    buildDiliSenseUrl(
      endpoint,
      params
    );

  console.log(
    "DiliSense request:",
    {
      endpoint,
      parameters:
        Object.fromEntries(
          params.entries()
        )
    }
  );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      DILISENSE_TIMEOUT_MS
    );

  let response;

  try {
    response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {
            "x-api-key":
              DILISENSE_API_KEY,

            Accept:
              "application/json"
          },

          signal:
            controller.signal
        }
      );
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      throw new Error(
        `DiliSense ${endpoint} request timed out after ${DILISENSE_TIMEOUT_MS / 1000} seconds.`
      );
    }

    throw new Error(
      `Unable to connect to DiliSense ${endpoint}: ${error?.message || "Network error"}`
    );
  } finally {
    clearTimeout(timeout);
  }

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `DiliSense ${endpoint} returned HTTP ${response.status}: ${responseText}`
    );
  }

  return {
    response,
    text: responseText
  };
}


/**
 * Parse DiliSense JSON.
 */
function parseDiliSenseJson(
  responseText
) {
  try {
    return JSON.parse(
      responseText
    );
  } catch {
    throw new Error(
      "DiliSense AML Screening API returned invalid JSON."
    );
  }
}


/**
 * Normalize DiliSense AML response.
 *
 * Documented DiliSense response:
 *
 * {
 *   timestamp,
 *   total_hits,
 *   found_records
 * }
 */
function normalizeAmlResult(
  result
) {
  if (
    !result ||
    typeof result !== "object"
  ) {
    return {
      timestamp: null,
      totalHits: 0,
      foundRecords: []
    };
  }

  return {
    timestamp:
      result.timestamp ||
      null,

    totalHits:
      Number(
        result.total_hits || 0
      ),

    foundRecords:
      safeArray(
        result.found_records
      )
  };
}


/**
 * Extract Base64 PDF.
 *
 * DiliSense generateIndividualReport
 * returns a Base64 encoded PDF string.
 */
function extractBase64Pdf(
  responseText
) {
  if (!responseText) {
    return "";
  }

  let base64Pdf =
    String(
      responseText
    ).trim();

  /*
   * Defensive support for JSON wrappers.
   */
  try {
    const parsed =
      JSON.parse(
        responseText
      );

    if (
      typeof parsed ===
      "string"
    ) {
      base64Pdf =
        parsed;
    } else if (
      parsed &&
      typeof parsed ===
      "object"
    ) {
      if (
        typeof parsed.data ===
        "string"
      ) {
        base64Pdf =
          parsed.data;
      } else if (
        typeof parsed.pdf ===
        "string"
      ) {
        base64Pdf =
          parsed.pdf;
      } else if (
        typeof parsed.report ===
        "string"
      ) {
        base64Pdf =
          parsed.report;
      }
    }
  } catch {
    /*
     * Expected when response is
     * a raw Base64 string.
     */
  }

  /*
   * Remove data URI prefix.
   */
  base64Pdf =
    base64Pdf.replace(
      /^data:application\/pdf;base64,/i,
      ""
    );

  return base64Pdf.trim();
}


/**
 * Convert Base64 PDF to Buffer.
 */
function createPdfBuffer(
  base64Pdf
) {
  if (!base64Pdf) {
    throw new Error(
      "DiliSense returned an empty AML report."
    );
  }

  let pdfBuffer;

  try {
    pdfBuffer =
      Buffer.from(
        base64Pdf,
        "base64"
      );
  } catch {
    throw new Error(
      "Unable to decode DiliSense AML report."
    );
  }

  if (
    !pdfBuffer ||
    !pdfBuffer.length
  ) {
    throw new Error(
      "DiliSense returned an invalid AML PDF."
    );
  }

  const pdfHeader =
    pdfBuffer
      .subarray(0, 4)
      .toString("utf8");

  if (
    pdfHeader !== "%PDF"
  ) {
    console.warn(
      "Warning: DiliSense report does not start with %PDF."
    );
  }

  return pdfBuffer;
}


/**
 * Get preferred identity.
 *
 * Preference:
 *
 * 1. Passport with fullName + documentNumber
 * 2. Licence with fullName + documentNumber
 * 3. Passport with fullName
 * 4. Licence with fullName
 */
function getPreferredIdentity(
  party
) {
  const passport =
    party?.identityData?.passport;

  const license =
    party?.identityData?.license;

  if (
    passport &&
    safeString(
      passport.fullName
    ) &&
    safeString(
      passport.documentNumber
    )
  ) {
    return {
      ...passport,
      source: "passport"
    };
  }

  if (
    license &&
    safeString(
      license.fullName
    ) &&
    safeString(
      license.documentNumber
    )
  ) {
    return {
      ...license,
      source: "license"
    };
  }

  if (
    passport &&
    safeString(
      passport.fullName
    )
  ) {
    return {
      ...passport,
      source: "passport"
    };
  }

  if (
    license &&
    safeString(
      license.fullName
    )
  ) {
    return {
      ...license,
      source: "license"
    };
  }

  return null;
}


/**
 * Build DiliSense report URL.
 */
function getReportUrl(
  partyId
) {
  return `/api/fintracpdf/client/${partyId}/dilisense-report`;
}


/**
 * Build a consistent empty report object.
 */
function createDiliSenseReport({
  status,
  triggeredBy = [],
  searchedName = "",
  searchedDob = "",
  searchedGender = "",
  identitySource = "",
  totalHits = 0,
  screeningTimestamp = null,
  generatedAt = null,
  error = "",
  screeningResult = null,
  pdf = null
}) {
  return {
    generated:
      status === "generated",

    status,

    triggeredBy,

    searchedName,

    searchedDob,

    searchedGender,

    identitySource,

    totalHits,

    screeningTimestamp,

    generatedAt,

    error,

    screeningResult,

    pdf
  };
}


/* =========================================================================
   GET DILISENSE PDF REPORT
   ========================================================================= */

/**
 * GET
 *
 * /client/:partyId/dilisense-report
 */
router.get(
  "/client/:partyId/dilisense-report",
  async (
    req,
    res
  ) => {
    try {
      const {
        partyId
      } = req.params;

      if (!partyId) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Party ID is required"
          });
      }

      if (
        !mongoose.Types.ObjectId.isValid(
          partyId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid party ID"
          });
      }

      const fintrac =
        await Fintrac.findOne({
          partyId
        });

      if (!fintrac) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "FINTRAC record not found"
          });
      }

      const report =
        fintrac.dilisenseReport;

      if (
        !report ||
        !report.generated ||
        !report.pdf
      ) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "DiliSense AML report not available"
          });
      }

      let pdfBuffer;

      if (
        Buffer.isBuffer(
          report.pdf
        )
      ) {
        pdfBuffer =
          report.pdf;
      } else if (
        report.pdf?.buffer
      ) {
        pdfBuffer =
          Buffer.from(
            report.pdf.buffer
          );
      } else if (
        report.pdf?.data
      ) {
        pdfBuffer =
          Buffer.from(
            report.pdf.data
          );
      } else {
        pdfBuffer =
          Buffer.from(
            report.pdf
          );
      }

      res.setHeader(
        "Content-Type",
        "application/pdf"
      );

      res.setHeader(
        "Content-Disposition",
        `inline; filename="DiliSense_AML_Report_${partyId}.pdf"`
      );

      res.setHeader(
        "Content-Length",
        pdfBuffer.length
      );

      return res.send(
        pdfBuffer
      );
    } catch (error) {
      console.error(
        "DiliSense AML report download error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Unable to retrieve DiliSense AML report"
        });
    }
  }
);


/* =========================================================================
   GET DILISENSE SCREENING
   ========================================================================= */


// ============================================================
// ADMIN MANUAL DILISENSE AML SCREENING + REPORT
//
// POST
// /api/fintracpdf/client/:partyId/dilisense-admin-generate
//
// This is intentionally independent from the FINTRAC answers.
//
// Example:
//
// PEP                = no
// Family Government = no
// Third Party        = no
//
// Admin can still manually run AML screening.
//
// Flow:
//
// Admin clicks button
//        ↓
// Find party
//        ↓
// Find verified identity
//        ↓
// DiliSense checkIndividual
//        ↓
// Save screening result
//        ↓
// DiliSense generateIndividualReport
//        ↓
// Save PDF in MongoDB
//        ↓
// status = generated
// ============================================================

router.post(
  "/client/:partyId/dilisense-admin-generate",
  async (req, res) => {
    const { partyId } = req.params;

    try {
      // ========================================================
      // VALIDATE PARTY ID
      // ========================================================

      if (!partyId) {
        return res.status(400).json({
          success: false,
          message: "Party ID is required"
        });
      }

      if (!mongoose.Types.ObjectId.isValid(partyId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid party ID"
        });
      }

      // ========================================================
      // DILISENSE CONFIG
      // ========================================================

      const DILISENSE_API_KEY = String(
        process.env.DILISENSE_API_KEY || ""
      ).trim();

      const DILISENSE_API_BASE_URL = String(
        process.env.DILISENSE_API_BASE_URL ||
          "https://api.dilisense.com/v1"
      )
        .trim()
        .replace(/\/+$/, "");

      if (!DILISENSE_API_KEY) {
        return res.status(500).json({
          success: false,
          message: "DiliSense API key is not configured"
        });
      }

      if (!DILISENSE_API_BASE_URL) {
        return res.status(500).json({
          success: false,
          message: "DiliSense API base URL is not configured"
        });
      }

      // ========================================================
      // FIND PARTY
      // ========================================================

      const party = await TransactionParty.findById(
        partyId
      );

      if (!party) {
        return res.status(404).json({
          success: false,
          message: "Party not found"
        });
      }

      // ========================================================
      // FIND FINTRAC RECORD
      // ========================================================

      const fintrac = await Fintrac.findOne({
        partyId
      });

      if (!fintrac) {
        return res.status(404).json({
          success: false,
          message: "FINTRAC record not found"
        });
      }

      // ========================================================
      // GET IDENTITY DATA
      //
      // Prefer verified passport.
      // Otherwise verified driving licence.
      // ========================================================

      const passport =
        party.identityData?.passport || null;

      const license =
        party.identityData?.license || null;

      const passportVerified =
        party.identityVerification
          ?.documents
          ?.passport
          ?.verified === true;

      const licenseVerified =
        party.identityVerification
          ?.documents
          ?.license
          ?.verified === true;

      let identity = null;
      let identitySource = "";

      // --------------------------------------------------------
      // VERIFIED PASSPORT
      // --------------------------------------------------------

      if (
        passportVerified &&
        passport?.fullName
      ) {
        identity = passport;
        identitySource = "passport";
      }

      // --------------------------------------------------------
      // VERIFIED LICENSE
      // --------------------------------------------------------

      else if (
        licenseVerified &&
        license?.fullName
      ) {
        identity = license;
        identitySource = "license";
      }

      // --------------------------------------------------------
      // FALLBACK PASSPORT
      // --------------------------------------------------------

      else if (passport?.fullName) {
        identity = passport;
        identitySource = "passport";
      }

      // --------------------------------------------------------
      // FALLBACK LICENSE
      // --------------------------------------------------------

      else if (license?.fullName) {
        identity = license;
        identitySource = "license";
      }

      if (!identity) {
        return res.status(400).json({
          success: false,
          message:
            "No identity document is available for AML screening. Please verify the client's passport or driving licence first."
        });
      }

      // ========================================================
      // NAME
      //
      // IMPORTANT:
      //
      // DiliSense screening is NAME ONLY.
      //
      // DOB is NOT sent.
      // GENDER is NOT sent.
      // ========================================================

      const searchedName = String(
        identity.fullName || ""
      ).trim();

      if (!searchedName) {
        return res.status(400).json({
          success: false,
          message:
            "Verified identity does not contain a full name."
        });
      }

      // ========================================================
      // DO NOT SEND DOB TO DILISENSE
      //
      // We intentionally do NOT create or normalize a DOB
      // for the DiliSense request.
      //
      // This prevents:
      //
      // dob=1998-09-29
      //
      // or:
      //
      // dob=29/09/1998
      //
      // from ever being sent to DiliSense.
      // ========================================================

      const searchedDob = "";

      // ========================================================
      // DO NOT SEND GENDER TO DILISENSE
      // ========================================================

      const searchedGender = "";

      // ========================================================
      // ADMIN MANUAL TRIGGER
      //
      // IMPORTANT:
      //
      // We do NOT change:
      //
      // clientPoliticallyExposed
      // clientFamilyGovernment
      // clientThirdParty
      //
      // Those answers remain exactly as submitted.
      // ========================================================

      const triggeredBy = [
        "adminManualScreening"
      ];

      // ========================================================
      // SAVE PENDING STATUS FIRST
      // ========================================================

      fintrac.dilisenseReport = {
        ...(fintrac.dilisenseReport || {}),

        generated: false,

        status: "pending",

        triggeredBy,

        searchedName,

        /*
         * Intentionally empty.
         * DiliSense is NOT searched using DOB.
         */
        searchedDob: "",

        /*
         * Intentionally empty.
         * DiliSense is NOT searched using gender.
         */
        searchedGender: "",

        identitySource,

        generatedAt: null,

        error: "",

        pdf: null,

        totalHits: 0,

        matched: false,

        matchFound: false,

        reportAvailable: false,

        screeningTimestamp: new Date()
      };

      await fintrac.save();

      // ========================================================
      // BUILD DILISENSE SCREENING PARAMETERS
      //
      // STRICT NAME-ONLY SEARCH
      //
      // ONLY:
      //
      // names
      // fuzzy_search
      //
      // NO:
      //
      // dob
      // gender
      // ========================================================

      const screeningParams =
        new URLSearchParams();

      screeningParams.append(
        "names",
        searchedName
      );

      screeningParams.append(
        "fuzzy_search",
        "1"
      );

      // ========================================================
      // CHECK INDIVIDUAL
      // ========================================================

      const screeningUrl =
        `${DILISENSE_API_BASE_URL}/checkIndividual?${screeningParams.toString()}`;

      console.log(
        "========================================================"
      );

      console.log(
        "ADMIN MANUAL DILISENSE NAME-ONLY SCREENING"
      );

      console.log({
        partyId,
        searchedName,
        identitySource,
        url: screeningUrl
      });

      console.log(
        "DiliSense request contains ONLY:",
        screeningParams.toString()
      );

      console.log(
        "========================================================"
      );

      let screeningResponse;

      try {
        screeningResponse =
          await axios.get(
            screeningUrl,
            {
              headers: {
                "x-api-key":
                  DILISENSE_API_KEY,

                Accept:
                  "application/json"
              },

              timeout: 30000,

              validateStatus:
                () => true
            }
          );
      } catch (error) {
        console.error(
          "DiliSense checkIndividual request failed:",
          error
        );

        fintrac.dilisenseReport = {
          ...(fintrac.dilisenseReport || {}),

          generated: false,

          status: "failed",

          triggeredBy,

          searchedName,

          searchedDob: "",

          searchedGender: "",

          identitySource,

          generatedAt: null,

          error:
            error?.message ||
            "Unable to connect to DiliSense.",

          pdf: null,

          reportAvailable: false
        };

        await fintrac.save();

        return res.status(502).json({
          success: false,

          message:
            "Unable to connect to DiliSense.",

          error:
            error?.message
        });
      }

      // ========================================================
      // DILISENSE SCREENING ERROR
      // ========================================================

      if (
        screeningResponse.status < 200 ||
        screeningResponse.status >= 300
      ) {
        const providerError =
          typeof screeningResponse.data ===
          "string"
            ? screeningResponse.data
            : JSON.stringify(
                screeningResponse.data
              );

        console.error(
          "DiliSense checkIndividual error:",
          screeningResponse.status,
          providerError
        );

        fintrac.dilisenseReport = {
          ...(fintrac.dilisenseReport || {}),

          generated: false,

          status: "failed",

          triggeredBy,

          searchedName,

          searchedDob: "",

          searchedGender: "",

          identitySource,

          generatedAt: null,

          error:
            `DiliSense screening failed (${screeningResponse.status}): ${providerError}`,

          pdf: null,

          reportAvailable: false
        };

        await fintrac.save();

        return res.status(502).json({
          success: false,

          message:
            "DiliSense AML screening failed.",

          providerStatus:
            screeningResponse.status
        });
      }

      // ========================================================
      // SCREENING RESPONSE
      // ========================================================

      const screeningData =
        screeningResponse.data || {};

      const totalHits =
        Number(
          screeningData?.total_hits ??
          screeningData?.totalHits ??
          screeningData?.data?.total_hits ??
          screeningData?.data?.totalHits ??
          0
        );

      const foundRecords =
        screeningData?.found_records ??
        screeningData?.foundRecords ??
        screeningData?.data?.found_records ??
        screeningData?.data?.foundRecords ??
        [];

      const matched =
        totalHits > 0 ||
        (
          Array.isArray(foundRecords) &&
          foundRecords.length > 0
        );

      // ========================================================
      // SAVE SCREENING RESULT
      // ========================================================

      fintrac.dilisenseReport = {
        ...(fintrac.dilisenseReport || {}),

        generated: false,

        status: "pending",

        triggeredBy,

        searchedName,

        searchedDob: "",

        searchedGender: "",

        identitySource,

        generatedAt: null,

        error: "",

        totalHits,

        matched,

        matchFound: matched,

        reportAvailable: false,

        screeningTimestamp: new Date(),

        screeningResult: screeningData,

        pdf: null
      };

      await fintrac.save();

      // ========================================================
      // GENERATE INDIVIDUAL REPORT
      //
      // STRICT NAME-ONLY
      //
      // IMPORTANT:
      //
      // The report request MUST use exactly the same
      // name-only search criteria.
      //
      // NO DOB.
      // NO GENDER.
      // ========================================================

      const reportParams =
        new URLSearchParams();

      reportParams.append(
        "names",
        searchedName
      );

      // reportParams.append(
      //   "fuzzy_search",
      //   "1"
      // );

      const generateReportUrl =
        `${DILISENSE_API_BASE_URL}/generateIndividualReport?${reportParams.toString()}`;

      console.log(
        "========================================================"
      );

      console.log(
        "ADMIN MANUAL DILISENSE NAME-ONLY REPORT GENERATION"
      );

      console.log({
        partyId,
        searchedName,
        url: generateReportUrl
      });

      console.log(
        "DiliSense report request contains ONLY:",
        reportParams.toString()
      );

      console.log(
        "========================================================"
      );

      let reportResponse;

      try {
        reportResponse =
          await axios.get(
            generateReportUrl,
            {
              headers: {
                "x-api-key":
                  DILISENSE_API_KEY,

                Accept:
                  "application/json"
              },

              timeout: 60000,

              responseType:
                "text",

              validateStatus:
                () => true
            }
          );
      } catch (error) {
        console.error(
          "DiliSense report request failed:",
          error
        );

        fintrac.dilisenseReport = {
          ...(fintrac.dilisenseReport || {}),

          generated: false,

          status: "failed",

          triggeredBy,

          searchedName,

          searchedDob: "",

          searchedGender: "",

          identitySource,

          generatedAt: null,

          totalHits,

          matched,

          matchFound: matched,

          reportAvailable: false,

          error:
            error?.message ||
            "Unable to generate DiliSense report.",

          pdf: null
        };

        await fintrac.save();

        return res.status(502).json({
          success: false,

          message:
            "Unable to generate DiliSense report.",

          error:
            error?.message
        });
      }

      // ========================================================
      // REPORT GENERATION ERROR
      // ========================================================

      if (
        reportResponse.status < 200 ||
        reportResponse.status >= 300
      ) {
        const providerError =
          typeof reportResponse.data ===
          "string"
            ? reportResponse.data
            : JSON.stringify(
                reportResponse.data
              );

        console.error(
          "DiliSense generateIndividualReport error:",
          reportResponse.status,
          providerError
        );

        fintrac.dilisenseReport = {
          ...(fintrac.dilisenseReport || {}),

          generated: false,

          status: "failed",

          triggeredBy,

          searchedName,

          searchedDob: "",

          searchedGender: "",

          identitySource,

          generatedAt: null,

          totalHits,

          matched,

          matchFound: matched,

          reportAvailable: false,

          error:
            `DiliSense report generation failed (${reportResponse.status}): ${providerError}`,

          pdf: null
        };

        await fintrac.save();

        return res.status(502).json({
          success: false,

          message:
            "DiliSense report generation failed.",

          providerStatus:
            reportResponse.status
        });
      }

      // ========================================================
      // EXTRACT BASE64 PDF
      // ========================================================

      let base64Pdf = "";

      const rawReport =
        reportResponse.data;

      if (
        typeof rawReport ===
        "string"
      ) {
        base64Pdf =
          rawReport.trim();

        /*
         * Sometimes provider returns JSON
         * as a text response.
         */

        try {
          const parsed =
            JSON.parse(
              rawReport
            );

          if (
            typeof parsed ===
            "string"
          ) {
            base64Pdf =
              parsed;
          } else {
            base64Pdf =
              parsed?.pdf ||
              parsed?.data ||
              parsed?.report ||
              parsed?.pdf_base64 ||
              parsed?.base64 ||
              "";
          }
        } catch {
          /*
           * Not JSON.
           *
           * Treat it as Base64.
           */
        }
      } else if (
        rawReport &&
        typeof rawReport ===
        "object"
      ) {
        base64Pdf =
          rawReport?.pdf ||
          rawReport?.data ||
          rawReport?.report ||
          rawReport?.pdf_base64 ||
          rawReport?.base64 ||
          "";
      }

      // ========================================================
      // CLEAN DATA URL
      // ========================================================

      base64Pdf =
        String(
          base64Pdf || ""
        )
          .replace(
            /^data:application\/pdf;base64,/i,
            ""
          )
          .replace(
            /^data:.*?;base64,/i,
            ""
          )
          .trim();

      // ========================================================
      // VALIDATE PDF
      // ========================================================

      if (!base64Pdf) {
        fintrac.dilisenseReport = {
          ...(fintrac.dilisenseReport || {}),

          generated: false,

          status: "failed",

          triggeredBy,

          searchedName,

          searchedDob: "",

          searchedGender: "",

          identitySource,

          generatedAt: null,

          totalHits,

          matched,

          matchFound: matched,

          reportAvailable: false,

          error:
            "DiliSense returned an empty report PDF.",

          pdf: null
        };

        await fintrac.save();

        return res.status(502).json({
          success: false,

          message:
            "DiliSense returned an empty report PDF."
        });
      }

      const pdfBuffer =
        Buffer.from(
          base64Pdf,
          "base64"
        );

      if (
        !pdfBuffer ||
        pdfBuffer.length === 0
      ) {
        throw new Error(
          "Invalid DiliSense PDF."
        );
      }

      // ========================================================
      // IMPORTANT:
      //
      // DO NOT MODIFY THE DILISENSE PDF
      //
      // We store the exact PDF returned by DiliSense.
      //
      // We DO NOT:
      //
      // - add a name
      // - add DOB
      // - add gender
      // - add entityType
      // - add fuzzy search
      // - create our own PDF
      // - overlay text
      // - append text
      //
      // The PDF remains exactly as returned by DiliSense.
      // ========================================================

      // ========================================================
      // SAVE FINAL REPORT
      // ========================================================

      fintrac.dilisenseReport = {
        ...(fintrac.dilisenseReport || {}),

        generated: true,

        status: "generated",

        triggeredBy,

        searchedName,

        searchedDob: "",

        searchedGender: "",

        identitySource,

        generatedAt:
          new Date(),

        error: "",

        totalHits,

        matched,

        matchFound: matched,

        reportAvailable: true,

        screeningTimestamp:
          fintrac.dilisenseReport
            ?.screeningTimestamp ||
          new Date(),

        screeningResult:
          screeningData,

        /*
         * Exact DiliSense PDF.
         */
        pdf: pdfBuffer
      };

      await fintrac.save();

      // ========================================================
      // SUCCESS
      // ========================================================

      return res.json({
        success: true,

        message:
          "DiliSense AML name-only screening and report generated successfully.",

        manual: true,

        partyId,

        aml: {
          required: true,

          status: "generated",

          generated: true,

          triggeredBy,

          /*
           * This is the ONLY search identity sent
           * to DiliSense.
           */
          searchedName,

          /*
           * Intentionally empty because they were
           * NOT sent to DiliSense.
           */
          searchedDob: "",

          searchedGender: "",

          identitySource,

          totalHits,

          matched,

          matchFound: matched,

          reportAvailable: true,

          reportUrl:
            `/api/fintracpdf/client/${partyId}/dilisense-report`
        }
      });
    } catch (error) {
      console.error(
        "ADMIN MANUAL DILISENSE ERROR:",
        error
      );

      // ========================================================
      // TRY TO SAVE FAILURE STATUS
      // ========================================================

      try {
        if (
          mongoose.Types.ObjectId.isValid(
            partyId
          )
        ) {
          const fintrac =
            await Fintrac.findOne({
              partyId
            });

          if (fintrac) {
            fintrac.dilisenseReport = {
              ...(fintrac.dilisenseReport || {}),

              generated: false,

              status: "failed",

              triggeredBy: [
                "adminManualScreening"
              ],

              searchedName:
                fintrac.dilisenseReport
                  ?.searchedName ||
                "",

              searchedDob: "",

              searchedGender: "",

              error:
                error?.message ||
                "Manual DiliSense screening failed.",

              reportAvailable: false,

              pdf: null
            };

            await fintrac.save();
          }
        }
      } catch (saveError) {
        console.error(
          "Unable to save DiliSense failure:",
          saveError
        );
      }

      return res.status(500).json({
        success: false,

        message:
          error?.message ||
          "Manual DiliSense AML screening failed."
      });
    }
  }
);


/**
 * GET
 *
 * /client/:partyId/dilisense-screening
 */
router.get(
  "/client/:partyId/dilisense-screening",
  async (
    req,
    res
  ) => {
    try {
      const {
        partyId
      } = req.params;

      if (!partyId) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Party ID is required"
          });
      }

      if (
        !mongoose.Types.ObjectId.isValid(
          partyId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid party ID"
          });
      }

      const fintrac =
        await Fintrac.findOne({
          partyId
        }).lean();

      if (!fintrac) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "FINTRAC record not found"
          });
      }

      const report =
        fintrac.dilisenseReport ||
        null;

      const triggeredBy =
        safeArray(
          report?.triggeredBy
        );

      const required =
        triggeredBy.length > 0;

      const status =
        report?.status ||
        (
          required
            ? "pending"
            : "not_required"
        );

      return res.json({
        success: true,

        aml: {
          required,

          status,

          generated:
            report?.generated ===
            true,

          triggeredBy,

          searchedName:
            report?.searchedName ||
            "",

          searchedDob:
            report?.searchedDob ||
            "",

          searchedGender:
            report?.searchedGender ||
            "",

          identitySource:
            report?.identitySource ||
            "",

          totalHits:
            Number(
              report?.totalHits ||
              0
            ),

          screeningTimestamp:
            report?.screeningTimestamp ||
            null,

          generatedAt:
            report?.generatedAt ||
            null,

          reportAvailable:
            report?.generated ===
            true &&
            !!report?.pdf,

          reportUrl:
            report?.generated ===
              true &&
              report?.pdf
              ? getReportUrl(
                partyId
              )
              : null,

          matched:
            Number(
              report?.totalHits ||
              0
            ) > 0,

          error:
            report?.error ||
            ""
        }
      });
    } catch (error) {
      console.error(
        "DiliSense AML screening fetch error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Unable to retrieve DiliSense AML screening"
        });
    }
  }
);


/* =========================================================================
   POST CLIENT FINTRAC
   ========================================================================= */

/**
 * POST
 *
 * /client
 *
 * Flow:
 *
 * FINTRAC submission
 *       ↓
 * determine AML requirement
 *       ↓
 * get verified identity
 *       ↓
 * use CLIENT NAME ONLY for DiliSense
 *       ↓
 * checkIndividual
 *       ↓
 * save screening result
 *       ↓
 * generateIndividualReport
 *       ↓
 * save PDF
 *       ↓
 * generated
 */
router.post(
  "/client",
  async (req, res) => {
    let partyId = null;

    try {
      const {
        partyId: bodyPartyId,
        politicallyExposed,
        familyPoliticallyExposed,
        thirdPartyConducted
      } = req.body;

      partyId = bodyPartyId;

      /* =========================================================
         VALIDATION
         ========================================================= */

      if (!partyId) {
        return res.status(400).json({
          success: false,
          message: "Party ID is required"
        });
      }

      if (!mongoose.Types.ObjectId.isValid(partyId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid party ID"
        });
      }

      if (
        !politicallyExposed ||
        !familyPoliticallyExposed ||
        !thirdPartyConducted
      ) {
        return res.status(400).json({
          success: false,
          message: "All FINTRAC questions are required"
        });
      }

      const validAnswers = ["yes", "no"];

      if (
        !validAnswers.includes(politicallyExposed) ||
        !validAnswers.includes(familyPoliticallyExposed) ||
        !validAnswers.includes(thirdPartyConducted)
      ) {
        return res.status(400).json({
          success: false,
          message: "FINTRAC answers must be yes or no"
        });
      }

      /* =========================================================
         FIND PARTY
         ========================================================= */

      const party = await TransactionParty.findById(partyId);

      if (!party) {
        return res.status(404).json({
          success: false,
          message: "Party not found"
        });
      }

      /* =========================================================
         TRANSACTION
         ========================================================= */

      const transactionId = party.transactionId;

      /* =========================================================
         AML TRIGGERS
         ========================================================= */

      const triggeredBy = getAmlTriggerQuestions({
        politicallyExposed,
        familyPoliticallyExposed,
        thirdPartyConducted
      });

      const amlRequired = isAmlRequired(triggeredBy);

      /* =========================================================
         SAVE FINTRAC FIRST
         ========================================================= */

      const fintrac = await Fintrac.findOneAndUpdate(
        {
          partyId
        },
        {
          $set: {
            partyId,
            transactionId,

            clientPoliticallyExposed:
              politicallyExposed,

            clientFamilyGovernment:
              familyPoliticallyExposed,

            clientThirdParty:
              thirdPartyConducted
          }
        },
        {
          upsert: true,
          new: true,
          runValidators: true
        }
      );

      /* =========================================================
         AML NOT REQUIRED
         ========================================================= */

      if (!amlRequired) {
        fintrac.dilisenseReport =
          createDiliSenseReport({
            status: "not_required",

            triggeredBy: [],

            totalHits: 0,

            error: "",

            screeningResult: null,

            pdf: null
          });

        await fintrac.save();

        return res.json({
          success: true,

          message:
            "Client FINTRAC saved successfully. AML screening is not required.",

          aml: {
            required: false,

            status: "not_required",

            generated: false,

            totalHits: 0,

            reportAvailable: false,

            reportUrl: null
          },

          data: fintrac
        });
      }

      /* =========================================================
         DILISENSE CONFIGURATION
         ========================================================= */

      if (!DILISENSE_API_KEY) {
        fintrac.dilisenseReport =
          createDiliSenseReport({
            status: "failed",

            triggeredBy,

            error:
              "DiliSense AML API key is not configured."
          });

        await fintrac.save();

        return res.status(500).json({
          success: false,

          message:
            "FINTRAC was saved, but DiliSense AML API key is not configured.",

          aml: {
            required: true,

            status: "failed",

            generated: false
          }
        });
      }

      if (!DILISENSE_API_BASE_URL) {
        fintrac.dilisenseReport =
          createDiliSenseReport({
            status: "failed",

            triggeredBy,

            error:
              "DiliSense AML API base URL is not configured."
          });

        await fintrac.save();

        return res.status(500).json({
          success: false,

          message:
            "FINTRAC was saved, but DiliSense AML API base URL is not configured.",

          aml: {
            required: true,

            status: "failed",

            generated: false
          }
        });
      }

      /* =========================================================
         VERIFIED IDENTITY
         ========================================================= */

      const identity = getPreferredIdentity(party);

      /* =========================================================
         SEARCH NAME ONLY
         =========================================================
         
         IMPORTANT:
         
         DiliSense will ONLY receive the client's name.
         
         We intentionally DO NOT send:
         
         - date of birth
         - gender
         
         This keeps the DiliSense search/report based on NAME ONLY.
         ========================================================= */

      const searchedName =
        safeString(identity?.fullName) ||
        safeString(party.name);

      if (!searchedName) {
        fintrac.dilisenseReport =
          createDiliSenseReport({
            status: "failed",

            triggeredBy,

            identitySource:
              identity?.source || "",

            error:
              "Unable to perform AML screening because the client name is missing."
          });

        await fintrac.save();

        return res.status(400).json({
          success: false,

          message:
            "FINTRAC was saved, but client identity name is missing for AML screening.",

          aml: {
            required: true,

            status: "failed",

            generated: false
          }
        });
      }

      /* =========================================================
         DO NOT USE DOB / GENDER FOR DILISENSE
         =========================================================
         
         We intentionally do not calculate:
         
         searchedDob
         searchedGender
         
         because DiliSense should search ONLY by name.
         ========================================================= */

      const searchedDob = "";

      const searchedGender = "";

      /* =========================================================
         SAVE PENDING STATE
         ========================================================= */

      fintrac.dilisenseReport =
        createDiliSenseReport({
          status: "pending",

          triggeredBy,

          searchedName,

          /*
           * Keep these empty because the DiliSense
           * request does not use DOB or gender.
           */
          searchedDob: "",

          searchedGender: "",

          identitySource:
            identity?.source || "",

          totalHits: 0,

          screeningTimestamp: null,

          generatedAt: null,

          error: "",

          screeningResult: null,

          pdf: null
        });

      await fintrac.save();

      console.log(
        "Starting DiliSense NAME-ONLY AML screening:",
        {
          partyId,

          searchedName,

          identitySource:
            identity?.source || "",

          triggeredBy
        }
      );

      /* =========================================================
         BUILD CHECK REQUEST
         =========================================================
         
         ONLY:
         
         names
         fuzzy_search
         includes (if configured)
         
         NO:
         
         dob
         gender
         ========================================================= */

      const screeningParams =
        new URLSearchParams();

      /* ---------------------------------------------------------
         CLIENT NAME
         --------------------------------------------------------- */

      screeningParams.append(
        "names",
        searchedName
      );

      /* ---------------------------------------------------------
         FUZZY SEARCH
         --------------------------------------------------------- */

      screeningParams.append(
        "fuzzy_search",
        "1"
      );

      /* ---------------------------------------------------------
         OPTIONAL INCLUDES
         --------------------------------------------------------- */

      if (DILISENSE_INCLUDES) {
        screeningParams.append(
          "includes",
          DILISENSE_INCLUDES
        );
      }

      console.log(
        "DiliSense checkIndividual request:",
        screeningParams.toString()
      );

      /* =========================================================
         RUN checkIndividual
         ========================================================= */

      const screeningResponse =
        await callDiliSense(
          "checkIndividual",
          screeningParams
        );

      const screeningJson =
        parseDiliSenseJson(
          screeningResponse.text
        );

      const normalizedAml =
        normalizeAmlResult(
          screeningJson
        );

      console.log(
        "DiliSense NAME-ONLY AML screening completed:",
        {
          partyId,

          searchedName,

          totalHits:
            normalizedAml.totalHits,

          timestamp:
            normalizedAml.timestamp
        }
      );

      /* =========================================================
         SAVE SCREENING RESULT
         ========================================================= */

      fintrac.dilisenseReport =
        createDiliSenseReport({
          status: "pending",

          triggeredBy,

          searchedName,

          searchedDob: "",

          searchedGender: "",

          identitySource:
            identity?.source || "",

          totalHits:
            normalizedAml.totalHits,

          screeningTimestamp:
            normalizedAml.timestamp,

          generatedAt: null,

          error: "",

          screeningResult:
            normalizedAml.foundRecords,

          pdf: null
        });

      await fintrac.save();

      /* =========================================================
         BUILD PDF REPORT REQUEST
         =========================================================
         
         IMPORTANT:
         
         The report request MUST use the EXACT SAME
         NAME-ONLY search criteria.
         
         DO NOT send DOB.
         DO NOT send gender.
         ========================================================= */

      const reportParams =
        new URLSearchParams();

      /* ---------------------------------------------------------
         CLIENT NAME ONLY
         --------------------------------------------------------- */

      reportParams.append(
        "names",
        searchedName
      );

      /* ---------------------------------------------------------
         FUZZY SEARCH
         --------------------------------------------------------- */

      // reportParams.append(
      //   "fuzzy_search",
      //   "1"
      // );

      /* ---------------------------------------------------------
         OPTIONAL INCLUDES
         --------------------------------------------------------- */

      // if (DILISENSE_INCLUDES) {
      //   reportParams.append(
      //     "includes",
      //     DILISENSE_INCLUDES
      //   );
      // }

      console.log(
        "Generating DiliSense NAME-ONLY AML PDF:",
        {
          partyId,

          searchedName,

          totalHits:
            normalizedAml.totalHits,

          request:
            reportParams.toString()
        }
      );

      /* =========================================================
         GENERATE INDIVIDUAL REPORT
         ========================================================= */

      const reportResponse =
        await callDiliSense(
          "generateIndividualReport",
          reportParams
        );

      /* =========================================================
         DECODE PDF
         ========================================================= */

      const base64Pdf =
        extractBase64Pdf(
          reportResponse.text
        );

      const pdfBuffer =
        createPdfBuffer(
          base64Pdf
        );

      /* =========================================================
         SAVE COMPLETE RESULT
         ========================================================= */

      fintrac.dilisenseReport =
        createDiliSenseReport({
          status: "generated",

          triggeredBy,

          searchedName,

          searchedDob: "",

          searchedGender: "",

          identitySource:
            identity?.source || "",

          totalHits:
            normalizedAml.totalHits,

          screeningTimestamp:
            normalizedAml.timestamp,

          generatedAt:
            new Date(),

          error: "",

          screeningResult:
            normalizedAml.foundRecords,

          pdf: pdfBuffer
        });

      await fintrac.save();

      /* =========================================================
         SUCCESS
         ========================================================= */

      return res.json({
        success: true,

        message:
          "Client FINTRAC saved and DiliSense NAME-ONLY AML screening completed successfully.",

        aml: {
          required: true,

          status: "generated",

          generated: true,

          triggeredBy,

          searchedName,

          /*
           * Empty intentionally.
           * DiliSense was NOT searched using these fields.
           */
          searchedDob: "",

          searchedGender: "",

          identitySource:
            identity?.source || "",

          totalHits:
            normalizedAml.totalHits,

          screeningTimestamp:
            normalizedAml.timestamp,

          generatedAt:
            fintrac
              .dilisenseReport
              ?.generatedAt ||
            null,

          reportAvailable: true,

          reportUrl:
            getReportUrl(
              partyId
            ),

          matched:
            normalizedAml.totalHits > 0
        },

        data: fintrac
      });
    } catch (err) {
      console.error(
        "FINTRAC / DiliSense AML ERROR:",
        err
      );

      /* =========================================================
         SAVE FAILURE STATE
         ========================================================= */

      try {
        if (
          partyId &&
          mongoose.Types.ObjectId.isValid(
            partyId
          )
        ) {
          const fintrac =
            await Fintrac.findOne({
              partyId
            });

          if (fintrac) {
            const existingReport =
              fintrac.dilisenseReport ||
              {};

            fintrac.dilisenseReport =
              createDiliSenseReport({
                status: "failed",

                triggeredBy:
                  safeArray(
                    existingReport.triggeredBy
                  ),

                searchedName:
                  safeString(
                    existingReport.searchedName
                  ),

                /*
                 * Name-only DiliSense search.
                 */
                searchedDob: "",

                searchedGender: "",

                identitySource:
                  safeString(
                    existingReport.identitySource
                  ),

                totalHits:
                  Number(
                    existingReport.totalHits ||
                    0
                  ),

                screeningTimestamp:
                  existingReport.screeningTimestamp ||
                  null,

                generatedAt: null,

                error:
                  err?.message ||
                  "Unknown DiliSense AML error",

                screeningResult:
                  existingReport.screeningResult ||
                  [],

                pdf: null
              });

            await fintrac.save();
          }
        }
      } catch (saveError) {
        console.error(
          "Unable to save DiliSense AML failure:",
          saveError
        );
      }

      /* =========================================================
         RESPONSE
         ========================================================= */

      return res.status(500).json({
        success: false,

        message:
          err?.message ||
          "Failed to save FINTRAC and perform AML screening.",

        aml: {
          required: true,

          status: "failed",

          generated: false,

          reportAvailable: false
        }
      });
    }
  }
);









// router.post("/client", async (req, res) => {
//   try {
//     const {
//       partyId,
//       politicallyExposed,
//       familyPoliticallyExposed,
//       thirdPartyConducted
//     } = req.body;

//     if (!partyId) {
//       return res.status(400).json({
//         success: false,
//         message: "Party ID is required"
//       });
//     }

//     const TransactionParty = mongoose.model("TransactionParty");

//     const party = await TransactionParty.findById(partyId);

//     if (!party) {
//       return res.status(404).json({
//         success: false,
//         message: "Party not found"
//       });
//     }

//     const fintrac = await Fintrac.findOneAndUpdate(
//       { partyId },
//       {
//         $set: {
//           transactionId: party.transactionId,
//           clientPoliticallyExposed: politicallyExposed,
//           clientFamilyGovernment: familyPoliticallyExposed,
//           clientThirdParty: thirdPartyConducted
//         }
//       },
//       {
//         upsert: true,
//         new: true,
//         runValidators: true
//       }
//     );

//     return res.json({
//       success: true,
//       message: "Client FINTRAC saved successfully.",
//       data: fintrac
//     });

//   } catch (err) {
//     console.error(err);

//     return res.status(500).json({
//       success: false,
//       message: err.message
//     });
//   }
// });



router.get("/client/:partyId", async (req, res) => {
  try {
    const { partyId } = req.params;

    const fintrac = await Fintrac.findOne({ partyId });

    if (!fintrac) {
      return res.status(404).json({
        success: false,
        message: "Client FINTRAC not found"
      });
    }

    return res.json({
      success: true,
      data: {
        clientPoliticallyExposed: fintrac.clientPoliticallyExposed,
        clientFamilyGovernment: fintrac.clientFamilyGovernment,
        clientThirdParty: fintrac.clientThirdParty
      }
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});


router.post("/generate-pdf", async (req, res) => {

  try {

    const { partyId, ...data } = req.body;

    // ❗ Prevent duplicate _id error
    delete data._id;

    // ✅ VALIDATION
    if (!partyId) {
      return res.status(400).json({
        success: false,
        message: "partyId is required"
      });
    }

    /* ===============================
       GET PARTY + TRANSACTION
    =============================== */

    const party = await TransactionParty.findById(partyId);

    if (!party) {
      return res.json({
        success: false,
        message: "Invalid party"
      });
    }

    const transactionId = party.transactionId;

    /* ===============================
       (OPTIONAL) VERIFY OWNERSHIP
       👉 Only if admin flow needed
    =============================== */

    // const transaction = await Transaction.findById(transactionId);

    // if (!transaction) {
    //   return res.json({
    //     success: false,
    //     message: "Unauthorized"
    //   });
    // }

    /* ===============================
       SAVE OR UPDATE FINTRAC
    =============================== */

    const fintrac = await Fintrac.findOneAndUpdate(
      { partyId }, // 🔥 ONE FINTRAC PER PARTY
      {
        ...data,
        partyId,
        transactionId // 🔥 auto attach
      },
      {
        new: true,
        upsert: true
      }
    );

    // 👉 continue your existing PDF logic here...






    /* ===============================
       LOAD PDF TEMPLATE
    =============================== */

    const existingPdfBytes = fs.readFileSync(PDF_PATH);
    // const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pdfDoc = await PDFDocument.load(existingPdfBytes, {
      ignoreEncryption: true
    });
    const form = pdfDoc.getForm();

    // Embed font (important for appearance refresh)
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    /* =====================================================
       SECTION A – BASIC INFO
    ===================================================== */

    // Property Address (split example if needed)
    if (data.propertyStreetNum) {
      form.getTextField("txtp_streetnum")
        .setText(data.propertyStreetNum);
    }

    if (data.propertyStreet) {
      form.getTextField("txtp_street")
        .setText(data.propertyStreet);
    }

    if (data.propertyCity) {
      form.getTextField("txtp_city")
        .setText(data.propertyCity);
    }

    if (data.propertyPostalCode) {
      form.getTextField("txtp_zipcode")
        .setText(data.propertyPostalCode);
    }

    // Full Name
    if (data.representativeName) {
      form.getTextField("txtCurrentUserFullName")
        .setText(data.representativeName);
    }

    // Broker Name
    if (data.brokerName) {
      form.getTextField("txtCurrentUserOfficeName")
        .setText(data.brokerName);
    }

    if (data.dateVerified) {
      form.getTextField("txtverifieddate1_mmmm")
        .setText(data.dateVerified);
    }

    // Occupation
    if (data.fullName) {
      form.getTextField("txtindividualName")
        .setText(data.fullName);
    }

    if (data.address) {

      const maxLengthLine1 = 120; // adjust based on PDF field width

      let words = data.address.trim().split(" ");
      let line1 = "";
      let line2 = "";

      for (let i = 0; i < words.length; i++) {
        let testLine = line1 ? line1 + " " + words[i] : words[i];

        if (testLine.length <= maxLengthLine1) {
          line1 = testLine;
        } else {
          // Word doesn't fit → move it and rest to line2
          line2 = words.slice(i).join(" ");
          break;
        }
      }

      form.getTextField("txtindividualAddress1").setText(line1);
      form.getTextField("txtindividualAddress2").setText(line2);
    }

    if (data.dob) {
      form.getTextField("txtindividualDOB")
        .setText(data.dob);
    }

    if (data.occupation) {
      form.getTextField("txtnatureOfBusinessOccupation")
        .setText(data.occupation);
    }


    /* =====================================================
       A.1 – PHOTO ID RADIO GROUP
    ===================================================== */

    //    const pdfFieldMap = {
    //      driver: "checkbox_105ipvd",
    //      passport: "checkbox_106dpcp",
    //      other: "checkbox_107bgic"
    //    };
    //    if (data.idTypeDriver) {
    //      form.getCheckBox(pdfFieldMap[data.idTypeDriver]).check();
    //    }
    //    if (data.idTypePassport) {
    //      form.getCheckBox(pdfFieldMap[data.idTypePassport]).check();
    //    }
    //    if (data.idTypeOther) {
    //      form.getCheckBox(pdfFieldMap[data.idTypeOther]).check();
    //    }


    if (data.idTypeDriver) {
      form.getCheckBox("checkbox_105ipvd").check();
    }

    if (data.idTypePassport) {
      form.getCheckBox("checkbox_106dpcp").check();
    }

    if (data.idTypeOther) {
      form.getCheckBox("checkbox_107bgic").check();
    }

    // Important: update appearances
    form.updateFieldAppearances();

    if (data.idOtherExplain) {
      form.getTextField("txtidDocument")
        .setText(data.idOtherExplain);
    }

    if (data.documentNumber) {
      form.getTextField("txtdocIdentifierNumber")
        .setText(data.documentNumber);
    }

    if (data.issuingJurisdiction) {
      form.getTextField("txtissuingJurisdiction")
        .setText(data.issuingJurisdiction);
    }

    if (data.country) {
      form.getTextField("txtissuingCountry")
        .setText(data.country);
    }

    if (data.expiryDate) {
      form.getTextField("txtDocExpDate")
        .setText(data.expiryDate);
    }


    if (data.creditBureauName) {

      const maxLengthLine1 = 80; // adjust based on PDF field width

      let words = data.creditBureauName.trim().split(" ");
      let line1 = "";
      let line2 = "";

      for (let i = 0; i < words.length; i++) {
        let testLine = line1 ? line1 + " " + words[i] : words[i];

        if (testLine.length <= maxLengthLine1) {
          line1 = testLine;
        } else {
          // Word doesn't fit → move it and rest to line2
          line2 = words.slice(i).join(" ");
          break;
        }
      }

      form.getTextField("txtcreditBureau1").setText(line1);
      form.getTextField("txtcreditBureau2").setText(line2);
    }

    if (data.creditFileReferenceNumber) {
      form.getTextField("txtcreditBureauRefNum")
        .setText(data.creditFileReferenceNumber);
    }


    if (data.confrm_invdul_nm_bdt) {
      form.getCheckBox("chkOpt_dualID1").check();
    }

    if (data.dobSourceName) {
      form.getTextField("txtsourceName1")
        .setText(data.dobSourceName);
    }

    if (data.dobAccountNumber) {
      form.getTextField("txtBillNumber1")
        .setText(data.dobAccountNumber);
    }


    if (data.confrm_invdul_nm_addr) {
      form.getCheckBox("chkOpt_dualID2").check();
    }

    if (data.addressSourceName) {
      form.getTextField("txtsourceName2")
        .setText(data.addressSourceName);
    }

    if (data.addressAccountNumber) {
      form.getTextField("txtBillNumber2")
        .setText(data.addressAccountNumber);
    }


    if (data.confrm_invdul_nm_financial) {
      form.getCheckBox("chkOpt_dualID3").check();
    }

    if (data.financialSourceName) {
      form.getTextField("txtsourceName3")
        .setText(data.financialSourceName);
    }

    if (data.financialAccountType) {
      form.getTextField("txtacctType")
        .setText(data.financialAccountType);
    }

    if (data.financialAccountNumber) {
      form.getTextField("txtBillNumber3")
        .setText(data.financialAccountNumber);
    }


    /* =====================================================
       B – THIRD PARTY YES/NO
    ===================================================== */



    if (data.thirdPartyConducted) {
      try {
        const radioField = form.getRadioGroup("radio_group_109wxek");

        if (data.thirdPartyConducted === "yes") {
          radioField.select("Yes");
        }

        if (data.thirdPartyConducted === "no") {
          radioField.select("No");
        }

      } catch (err) {
        console.log("Third party radio group not found");
      }
    }


    if (data.thirdPartyReason) {
      form.getTextField("txtthirdPartyReasonsMeasuresTaken")
        .setText(data.thirdPartyReason);
    }

    if (data.thirdPartyName) {
      form.getTextField("txtthirdPartyName")
        .setText(data.thirdPartyName);
    }

    if (data.thirdPartyAddress) {
      form.getTextField("txtthirdPartyAddress1")
        .setText(data.thirdPartyAddress);
    }

    if (data.thirdPartyPhone) {
      form.getTextField("txtthirdPartyAddress2")
        .setText(data.thirdPartyPhone);
    }

    if (data.thirdPartyDOB) {
      form.getTextField("txtthirdPartyDOB")
        .setText(data.thirdPartyDOB);
    }

    if (data.thirdPartyOccupation) {
      const maxLengthLine1 = 60; // adjust based on PDF field width
      let words = data.thirdPartyOccupation.trim().split(" ");
      let line1 = "";
      let line2 = "";
      for (let i = 0; i < words.length; i++) {
        let testLine = line1 ? line1 + " " + words[i] : words[i];
        if (testLine.length <= maxLengthLine1) {
          line1 = testLine;
        } else {
          // Word doesn't fit → move it and rest to line2
          line2 = words.slice(i).join(" ");
          break;
        }
      }
      form.getTextField("txtthirdPartyBusinessOccupation1").setText(line1);
      form.getTextField("txtthirdPartyBusinessOccupation2").setText(line2);
    }


    if (data.thirdPartyRegistration) {
      const maxLengthLine1 = 60; // adjust based on PDF field width
      let words = data.thirdPartyRegistration.trim().split(" ");
      let line1 = "";
      let line2 = "";
      for (let i = 0; i < words.length; i++) {
        let testLine = line1 ? line1 + " " + words[i] : words[i];
        if (testLine.length <= maxLengthLine1) {
          line1 = testLine;
        } else {
          // Word doesn't fit → move it and rest to line2
          line2 = words.slice(i).join(" ");
          break;
        }
      }
      form.getTextField("txtthirdPartyIncorporationNumber1").setText(line1);
      form.getTextField("txtthirdPartyIncorporationNumber2").setText(line2);
    }

    if (data.thirdPartyRelationship) {
      const maxLengthLine1 = 60; // adjust based on PDF field width
      let words = data.thirdPartyRelationship.trim().split(" ");
      let line1 = "";
      let line2 = "";
      for (let i = 0; i < words.length; i++) {
        let testLine = line1 ? line1 + " " + words[i] : words[i];
        if (testLine.length <= maxLengthLine1) {
          line1 = testLine;
        } else {
          // Word doesn't fit → move it and rest to line2
          line2 = words.slice(i).join(" ");
          break;
        }
      }
      form.getTextField("txtthirdPartyRelationship1").setText(line1);
      form.getTextField("txtthirdPartyRelationship2").setText(line2);
    }

    /* =====================================================
       C – CLIENT RISK
    ===================================================== */

    const riskFieldMap = {
      1: "radio_group_154rnnu",
      2: "radio_group_156qjpb",
      3: "radio_group_160zzge",
      4: "radio_group_163krda",
      5: "radio_group_165pzoe",
      6: "radio_group_168iral",
      7: "radio_group_170slpc",
      8: "radio_group_172mbta",
      9: "radio_group_174rsic",
      10: "radio_group_177kbpv",
      11: "radio_group_179zmrm",
      12: "radio_group_181whzr",
      13: "radio_group_183idmm",
      14: "radio_group_186snjn",
      15: "radio_group_188juuy",
      16: "radio_group_190lobt",
      17: "radio_group_192yaov"
    };

    for (let i = 1; i <= 17; i++) {

      const selectedValue = data[`q${i}`];
      if (!selectedValue) continue;

      const pdfFieldName = riskFieldMap[i];
      if (!pdfFieldName) continue;

      try {

        const radioField = form.getRadioGroup(pdfFieldName);

        if (selectedValue === "yes") {
          radioField.select("Yes");
        }

        if (selectedValue === "no") {
          radioField.select("No");
        }

        if (selectedValue === "possibly") {

          // For Q5 frontend label is "Unknown"
          // But PDF export value is usually "Possibly"
          radioField.select("Possibly");
        }

      } catch (err) {
        console.log(`Radio group not found: ${pdfFieldName}`);
      }
    }


    /* =====================================================
       D – BUSINESS RELATIONSHIP CHECKBOXES
    ===================================================== */

    //    if (data.propertyTypeResidential === "residential") {
    //      form.getCheckBox("chkOpt_D1a").check();
    //    }

    //    if (data.propertyTypeIncome === "incomeResidential") {
    //      form.getCheckBox("chkOpt_D1b").check();
    //    }

    //    if (data.propertyTypeCommercial === "commercial") {
    //      form.getCheckBox("chkOpt_D1c").check();
    //    }

    //    if (data.propertyTypeLand === "landCommercial") {
    //      form.getCheckBox("chkOpt_D1d").check();
    //    }


    if (data.propertyTypeResidential) {
      form.getCheckBox("chkOpt_D1a").check();
    }

    if (data.propertyTypeIncome) {
      form.getCheckBox("chkOpt_D1b").check();
    }

    if (data.propertyTypeCommercial) {
      form.getCheckBox("chkOpt_D1c").check();
    }

    if (data.propertyTypeLand) {
      form.getCheckBox("chkOpt_D1d").check();
    }



    if (data.otherPropertyType) {
      form.getCheckBox("chkOpt_D1e").check();
      form.getTextField("txtD1explain1").setText(data.otherPropertyType);
    }

    if (data.businessDescription) {
      form.getTextField("txtthirdPartyReasonsMeasuresTaken2").setText(data.businessDescription);
    }

    if (data.monitoringMeasures) {
      form.getTextField("txtD2explain1").setText(data.monitoringMeasures);
    }

    if (data.enhancedMeasures) {
      form.getTextField("txtD2explain2").setText(data.enhancedMeasures);
    }


    /* =====================================================
       RISK SCORE (OPTIONAL IF FIELD EXISTS)
    ===================================================== */

    const riskFieldMap2 = {
      1: "radio_group_253wsii",
      2: "radio_group_256tbht",
      3: "radio_group_259xfdi",
      4: "radio_group_262olgj",
      5: "radio_group_265wpjr",
      6: "radio_group_268udyv",
      7: "radio_group_271ommo",
      8: "radio_group_274xepl",
      9: "radio_group_277nide",
      10: "radio_group_281fvsh",
      11: "radio_group_286ikll",
      12: "radio_group_289woo",
      13: "radio_group_292aqfs",
      14: "radio_group_295tcfp",
      15: "radio_group_298phcq",
      16: "radio_group_301lwy",
      17: "radio_group_304qqsd"
    };

    const scoring = {
      1: { yes: 0, no: 2, possibly: 0 },
      2: { yes: 10, no: 0, possibly: 1 },
      3: { yes: 2, no: 0, possibly: 1 },
      4: { yes: 2, no: 0, possibly: 0 },
      5: { yes: 0, no: 2, possibly: 1 },
      6: { yes: 6, no: 0, possibly: 0 },
      7: { yes: 10, no: 0, possibly: 0 },
      8: { yes: 10, no: 0, possibly: 0 },
      9: { yes: 5, no: 0, possibly: 1 },
      10: { yes: 6, no: 0, possibly: 0 },
      11: { yes: 10, no: 0, possibly: 0 },
      12: { yes: 5, no: 0, possibly: 0 },
      13: { yes: 2, no: 0, possibly: 1 },
      14: { yes: 2, no: 0, possibly: 0 },
      15: { yes: 3, no: 0, possibly: 0 },
      16: { yes: 4, no: 0, possibly: 0 },
      17: { yes: 4, no: 0, possibly: 0 }
    };

    let totalScore = 0;

    for (let i = 1; i <= 17; i++) {
      const selectedValue = data[`q${i}`];
      if (!selectedValue) continue;

      const pdfFieldName = riskFieldMap2[i];
      if (!pdfFieldName) continue;

      try {
        const radioField = form.getRadioGroup(pdfFieldName);

        if (selectedValue === "yes") {
          radioField.select("Yes");
        }

        if (selectedValue === "no") {
          radioField.select("No");
        }

        if (selectedValue === "possibly") {
          radioField.select("Possibly");
        }

        // Calculate backend score
        totalScore += scoring[i][selectedValue] || 0;

      } catch (err) {
        console.log(`Radio group not found: ${pdfFieldName}`);
      }
    }

    /* =====================================================
       TOTAL SCORE + RISK LEVEL
    ===================================================== */

    let totalYes = 0;
    let totalNo = 0;
    let totalPossibly = 0;

    for (let i = 1; i <= 17; i++) {
      const selected = data[`q${i}`];
      if (!selected) continue;

      const scoreValue = scoring[i][selected] || 0;

      if (selected === "yes") {
        totalYes += scoreValue;
      }

      if (selected === "no") {
        totalNo += scoreValue;
      }

      if (selected === "possibly") {
        totalPossibly += scoreValue;
      }
    }

    // Fill PDF fields
    try {
      form.getTextField("txtTotal1").setText(String(totalYes));
      form.getTextField("txtTotal2").setText(String(totalNo));
      form.getTextField("txtTotal3").setText(String(totalPossibly));
    } catch (e) {
      console.log("Total fields not found in PDF");
    }


    /* =====================================================
       FINALIZE
    ===================================================== */

    // 1️⃣ Regenerate all field appearances (VERY IMPORTANT)
    form.updateFieldAppearances(font);

    // 2️⃣ Flatten AFTER updating appearances
    form.flatten();

    // 3️⃣ Save with appearance refresh enabled
    const pdfBytes = await pdfDoc.save({
      updateFieldAppearances: true
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=FINTRAC_Filled.pdf"
    );

    res.send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error(error);
    res.status(500).send("Error generating PDF");
  }
});

router.get("/fintrac/user/:partyId", async (req, res) => {

  try {

    const { partyId } = req.params;

    if (!partyId) {
      return res.json({
        success: false,
        message: "partyId is required"
      });
    }

    /* ===============================
       VERIFY PARTY EXISTS
    =============================== */

    const party = await TransactionParty.findById(partyId);

    if (!party) {
      return res.json({
        success: false,
        message: "Invalid party"
      });
    }

    /* ===============================
       FETCH FINTRAC (PER PARTY)
    =============================== */

    const fintrac = await Fintrac.findOne({
      partyId
    });

    res.json({
      success: true,
      data: fintrac || null
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});

// router.get("/fintrac/:transactionId/:userId", async (req, res) => {

//   try {

//     const { transactionId, userId } = req.params;

//     /* ===============================
//        VERIFY TRANSACTION OWNERSHIP
//     =============================== */

//     const transaction = await Transaction.findOne({
//       _id: transactionId,
//       userId
//     });

//     if (!transaction) {
//       return res.json({
//         success: false,
//         message: "Unauthorized"
//       });
//     }

//     /* ===============================
//        FETCH FINTRAC BY TRANSACTION
//     =============================== */

//     const fintrac = await Fintrac.findOne({
//       transactionId   // ✅ KEY FIX
//     });

//     res.json({
//       success: true,
//       data: fintrac || null
//     });

//   } catch (error) {

//     console.error(error);

//     res.status(500).json({
//       success: false,
//       message: "Server error"
//     });

//   }

// });



router.get(
  "/fintrac/:transactionId/:userId",
  async (req, res) => {
    try {
      const {
        transactionId,
        userId
      } = req.params;

      // ========================================================
      // VALIDATE TRANSACTION ID
      // ========================================================

      if (
        !mongoose.Types.ObjectId.isValid(
          transactionId
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid transaction ID"
        });
      }

      // ========================================================
      // VALIDATE USER ID
      // ========================================================

      if (
        !mongoose.Types.ObjectId.isValid(
          userId
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID"
        });
      }

      // ========================================================
      // VERIFY TRANSACTION OWNERSHIP
      // ========================================================

      const transaction =
        await Transaction.findOne({
          _id: transactionId,
          userId
        });

      if (!transaction) {
        return res.json({
          success: false,
          message: "Unauthorized"
        });
      }

      // ========================================================
      // FETCH FINTRAC
      // ========================================================

      const fintrac =
        await Fintrac.findOne({
          transactionId
        });

      return res.json({
        success: true,
        data: fintrac || null
      });

    } catch (error) {
      console.error(
        "GET FINTRAC TRANSACTION ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Server error"
      });
    }
  }
);


// router.put("/fintrac/:transactionId/:userId", async (req, res) => {

//   try {

//     const { transactionId, userId } = req.params;

//     /* ===============================
//        VERIFY TRANSACTION OWNERSHIP
//     =============================== */

//     const transaction = await Transaction.findOne({
//       _id: transactionId,
//       userId
//     });

//     if (!transaction) {
//       return res.json({
//         success: false,
//         message: "Unauthorized"
//       });
//     }

//     /* ===============================
//        UPDATE FINTRAC (PER TRANSACTION)
//     =============================== */

//     const updated = await Fintrac.findOneAndUpdate(
//       { transactionId },          // ✅ KEY FIX
//       { $set: req.body },
//       { new: true }
//     );

//     res.json({
//       success: true,
//       message: "FINTRAC updated",
//       data: updated
//     });

//   } catch (error) {

//     console.error(error);

//     res.status(500).json({
//       success: false,
//       message: "Server error"
//     });

//   }

// });


router.put(
  "/fintrac/:transactionId/:userId",
  async (req, res) => {
    try {
      const {
        transactionId,
        userId
      } = req.params;

      // ========================================================
      // VALIDATE TRANSACTION ID
      // ========================================================

      if (
        !mongoose.Types.ObjectId.isValid(
          transactionId
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid transaction ID"
        });
      }

      // ========================================================
      // VALIDATE USER ID
      // ========================================================

      if (
        !mongoose.Types.ObjectId.isValid(
          userId
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID"
        });
      }

      // ========================================================
      // VERIFY TRANSACTION OWNERSHIP
      // ========================================================

      const transaction =
        await Transaction.findOne({
          _id: transactionId,
          userId
        });

      if (!transaction) {
        return res.json({
          success: false,
          message: "Unauthorized"
        });
      }

      // ========================================================
      // UPDATE FINTRAC
      // ========================================================

      const updated =
        await Fintrac.findOneAndUpdate(
          { transactionId },
          {
            $set: req.body
          },
          {
            new: true
          }
        );

      return res.json({
        success: true,
        message: "FINTRAC updated",
        data: updated
      });

    } catch (error) {
      console.error(
        "UPDATE FINTRAC TRANSACTION ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Server error"
      });
    }
  }
);

export default router;