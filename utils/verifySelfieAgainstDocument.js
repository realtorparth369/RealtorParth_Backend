import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ============================================================
// EMPTY EXTRACTED DOCUMENT DATA
// ============================================================

const emptyExtractedDocumentData = () => ({
  documentType: "",

  fullName: "",
  firstName: "",
  lastName: "",

  documentNumber: "",

  dateOfBirth: "",
  issueDate: "",
  expiryDate: "",

  nationality: "",

  issuingCountry: "",
  issuingProvince: "",

  address: "",

  sex: "",
  placeOfBirth: "",

  class: "",
  restrictions: "",

  raw: {},
});

// ============================================================
// EMPTY COMPARISON
// ============================================================

const emptyComparison = () => ({
  documentNumberMatch: false,

  nameMatch: false,
  dateOfBirthMatch: false,
  expiryDateMatch: false,

  documentTypeMatch: false,

  issuingCountryMatch: false,
  nationalityMatch: false,

  faceMatch: false,
});

// ============================================================
// EMPTY RESULT
// ============================================================

const emptyResult = (reason = "") => ({
  verified: false,

  confidence: 0,

  faceDetected: false,

  documentDetected: false,

  documentHeld: false,

  documentType: "",

  documentTypeMatches: false,

  documentDataMatches: false,

  faceVisuallyConsistent: false,

  imageQualityGood: false,

  extractedDocumentData:
    emptyExtractedDocumentData(),

  comparison:
    emptyComparison(),

  reason,
});

// ============================================================
// NORMALIZE STRING
// ============================================================

const normalizeString = (value) => {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
};

// ============================================================
// NORMALIZE BOOLEAN
// ============================================================

const normalizeBoolean = (value) => {
  if (value === true) {
    return true;
  }

  if (
    typeof value === "string"
  ) {
    const normalized =
      value
        .trim()
        .toLowerCase();

    if (
      normalized === "true" ||
      normalized === "yes" ||
      normalized === "1"
    ) {
      return true;
    }

    if (
      normalized === "false" ||
      normalized === "no" ||
      normalized === "0"
    ) {
      return false;
    }
  }

  if (
    typeof value === "number"
  ) {
    return value === 1;
  }

  return false;
};

// ============================================================
// NORMALIZE DOCUMENT TYPE
// ============================================================

const normalizeDocumentType = (value) => {
  const type =
    normalizeString(value)
      .toLowerCase();

  if (
    type.includes("passport")
  ) {
    return "passport";
  }

  if (
    type.includes("driver") ||
    type.includes("licen") ||
    type.includes("license")
  ) {
    return "license";
  }

  return "";
};

// ============================================================
// NORMALIZE DOCUMENT NUMBER
//
// Removes spaces and punctuation.
//
// Example:
//
// AB 123-456
//
// becomes:
//
// AB123456
// ============================================================

const normalizeDocumentNumber = (
  value
) => {
  return normalizeString(value)
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/g,
      ""
    );
};

// ============================================================
// NORMALIZE EXTRACTED DOCUMENT DATA
// ============================================================

const normalizeExtractedDocumentData = (
  data
) => {
  if (
    !data ||
    typeof data !== "object"
  ) {
    return emptyExtractedDocumentData();
  }

  return {
    documentType:
      normalizeDocumentType(
        data.documentType
      ),

    fullName:
      normalizeString(
        data.fullName
      ),

    firstName:
      normalizeString(
        data.firstName
      ),

    lastName:
      normalizeString(
        data.lastName
      ),

    documentNumber:
      normalizeString(
        data.documentNumber
      ),

    dateOfBirth:
      normalizeString(
        data.dateOfBirth
      ),

    issueDate:
      normalizeString(
        data.issueDate
      ),

    expiryDate:
      normalizeString(
        data.expiryDate
      ),

    nationality:
      normalizeString(
        data.nationality
      ),

    issuingCountry:
      normalizeString(
        data.issuingCountry
      ),

    issuingProvince:
      normalizeString(
        data.issuingProvince
      ),

    address:
      normalizeString(
        data.address
      ),

    sex:
      normalizeString(
        data.sex
      ),

    placeOfBirth:
      normalizeString(
        data.placeOfBirth
      ),

    class:
      normalizeString(
        data.class
      ),

    restrictions:
      normalizeString(
        data.restrictions
      ),

    raw:
      data.raw &&
      typeof data.raw === "object"
        ? data.raw
        : {},
  };
};

// ============================================================
// NORMALIZE COMPARISON
// ============================================================

const normalizeComparison = (
  comparison
) => {
  if (
    !comparison ||
    typeof comparison !== "object"
  ) {
    return emptyComparison();
  }

  return {
    documentNumberMatch:
      normalizeBoolean(
        comparison.documentNumberMatch
      ),

    nameMatch:
      normalizeBoolean(
        comparison.nameMatch
      ),

    dateOfBirthMatch:
      normalizeBoolean(
        comparison.dateOfBirthMatch
      ),

    expiryDateMatch:
      normalizeBoolean(
        comparison.expiryDateMatch
      ),

    documentTypeMatch:
      normalizeBoolean(
        comparison.documentTypeMatch
      ),

    issuingCountryMatch:
      normalizeBoolean(
        comparison.issuingCountryMatch
      ),

    nationalityMatch:
      normalizeBoolean(
        comparison.nationalityMatch
      ),

    faceMatch:
      normalizeBoolean(
        comparison.faceMatch
      ),
  };
};

// ============================================================
// CLEAN BASE64
// ============================================================

const cleanBase64 = (
  base64
) => {
  if (
    !base64 ||
    typeof base64 !== "string"
  ) {
    return "";
  }

  return base64
    .replace(
      /^data:image\/[\w.+-]+;base64,/i,
      ""
    )
    .trim();
};

// ============================================================
// DOCUMENT NUMBER MATCH
// ============================================================

const documentNumbersMatch = (
  originalValue,
  selfieValue
) => {
  const original =
    normalizeDocumentNumber(
      originalValue
    );

  const selfie =
    normalizeDocumentNumber(
      selfieValue
    );

  if (
    !original ||
    !selfie
  ) {
    return false;
  }

  return (
    original === selfie
  );
};

// ============================================================
// CALCULATE CONFIDENCE
//
// ONLY TWO DOCUMENT IDENTIFIERS:
//
// 1. Document type
// 2. Document number
//
// Plus:
//
// 3. Face consistency
// 4. Physical document
// 5. Document held
// 6. Image quality
//
// Gemini's own confidence number is NOT used.
// ============================================================

const calculateConfidence = ({
  verified,

  faceDetected,

  documentDetected,

  documentHeld,

  documentTypeMatches,

  documentNumberMatch,

  faceVisuallyConsistent,

  imageQualityGood,

  documentNumberConflict,
}) => {
  // ----------------------------------------------------------
  // HARD FAILURE
  // ----------------------------------------------------------

  if (
    documentNumberConflict
  ) {
    return 0;
  }

  let score = 0;

  // ----------------------------------------------------------
  // DOCUMENT TYPE
  //
  // Very important.
  // ----------------------------------------------------------

  if (
    documentTypeMatches
  ) {
    score += 25;
  }

  // ----------------------------------------------------------
  // DOCUMENT NUMBER
  //
  // Most important document identifier.
  // ----------------------------------------------------------

  if (
    documentNumberMatch
  ) {
    score += 35;
  }

  // ----------------------------------------------------------
  // FACE
  // ----------------------------------------------------------

  if (
    faceDetected
  ) {
    score += 10;
  }

  // ----------------------------------------------------------
  // PHYSICAL DOCUMENT
  // ----------------------------------------------------------

  if (
    documentDetected
  ) {
    score += 5;
  }

  // ----------------------------------------------------------
  // PERSON HOLDING DOCUMENT
  // ----------------------------------------------------------

  if (
    documentHeld
  ) {
    score += 10;
  }

  // ----------------------------------------------------------
  // FACE CONSISTENCY
  // ----------------------------------------------------------

  if (
    faceVisuallyConsistent
  ) {
    score += 10;
  }

  // ----------------------------------------------------------
  // IMAGE QUALITY
  // ----------------------------------------------------------

  if (
    imageQualityGood
  ) {
    score += 5;
  }

  // ----------------------------------------------------------
  // NORMALIZE
  // ----------------------------------------------------------

  score = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        score
      )
    )
  );

  // ----------------------------------------------------------
  // COMPLETE VERIFICATION
  //
  // If all required evidence passes:
  //
  // 25 type
  // 35 number
  // 10 face detected
  // 5 document
  // 10 holding
  // 10 face consistency
  // 5 quality
  //
  // = 100
  // ----------------------------------------------------------

  if (
    verified &&
    documentTypeMatches &&
    documentNumberMatch &&
    faceDetected &&
    documentDetected &&
    documentHeld &&
    faceVisuallyConsistent &&
    imageQualityGood
  ) {
    return 100;
  }

  return score;
};

// ============================================================
// MAIN FUNCTION
// ============================================================

export default async function verifySelfieAgainstDocument({
  selfieImage,
  originalDocumentImage,
  originalDocumentData,
  documentType,
}) {
  try {
    // ==========================================================
    // VALIDATE SELFIE
    // ==========================================================

    if (!selfieImage) {
      return emptyResult(
        "No selfie image was provided."
      );
    }

    // ==========================================================
    // VALIDATE ORIGINAL DOCUMENT
    // ==========================================================

    if (!originalDocumentImage) {
      return emptyResult(
        "Original verified document image was not provided."
      );
    }

    // ==========================================================
    // VALIDATE ORIGINAL DATA
    // ==========================================================

    if (
      !originalDocumentData ||
      typeof originalDocumentData !==
        "object"
    ) {
      return emptyResult(
        "Original verified document data was not provided."
      );
    }

    // ==========================================================
    // EXPECTED DOCUMENT TYPE
    // ==========================================================

    const expectedDocumentType =
      normalizeDocumentType(
        documentType
      );

    if (
      expectedDocumentType !==
        "license" &&
      expectedDocumentType !==
        "passport"
    ) {
      return emptyResult(
        "Invalid document type. Expected license or passport."
      );
    }

    // ==========================================================
    // CLEAN IMAGES
    // ==========================================================

    const selfieData =
      cleanBase64(
        selfieImage
      );

    const originalImageData =
      cleanBase64(
        originalDocumentImage
      );

    if (!selfieData) {
      return emptyResult(
        "Invalid selfie image data."
      );
    }

    if (!originalImageData) {
      return emptyResult(
        "Invalid original document image data."
      );
    }

    // ==========================================================
    // NORMALIZE ORIGINAL DOCUMENT DATA
    // ==========================================================

    const normalizedOriginalData =
      normalizeExtractedDocumentData(
        originalDocumentData
      );

    // ==========================================================
    // ORIGINAL DOCUMENT TYPE
    // ==========================================================

    const originalDocumentType =
      normalizeDocumentType(
        normalizedOriginalData.documentType
      );

    // ==========================================================
    // ORIGINAL DOCUMENT NUMBER
    // ==========================================================

    const originalDocumentNumber =
      normalizeDocumentNumber(
        normalizedOriginalData.documentNumber
      );

    // ==========================================================
    // ORIGINAL DOCUMENT MUST HAVE TYPE + NUMBER
    //
    // These are the two identifiers we are going to compare.
    // ==========================================================

    if (
      originalDocumentType !==
      expectedDocumentType
    ) {
      return emptyResult(
        "The original verified document type does not match the selected document."
      );
    }

    if (
      !originalDocumentNumber
    ) {
      return emptyResult(
        "The original verified document number is missing."
      );
    }

    // ==========================================================
    // PROMPT
    // ==========================================================

    const prompt = `
You are an identity-document and selfie verification AI.

You have TWO images.

IMAGE 1:
A selfie of a person physically holding an identity document.

IMAGE 2:
The ORIGINAL identity document that was already verified.

Expected document type:

"${expectedDocumentType}"

============================================================
VERY IMPORTANT
============================================================

For this verification, document identity is intentionally
based on ONLY TWO document fields:

1. DOCUMENT TYPE
2. DOCUMENT NUMBER

Do NOT use name, date of birth, expiry date, nationality,
address, sex, or other OCR fields to determine whether the
physical document is the same document.

The application will compare the document type and document
number separately.

Your job is to carefully determine:

- what physical document is visible
- whether the person is holding it
- what type of document it is
- what document number can actually be read
- whether a face is visible
- whether the face is visually consistent with the original
- whether the image quality is sufficient

============================================================
ORIGINAL VERIFIED DOCUMENT
============================================================

Expected document type:

"${expectedDocumentType}"

Original verified document number:

"${originalDocumentNumber}"

IMPORTANT:

The original document number above is reference information.

DO NOT simply copy it into the selfie OCR.

Read the document number from IMAGE 1 independently.

If the number cannot actually be read from IMAGE 1,
return an empty string.

============================================================
DOCUMENT TYPE
============================================================

The expected type is:

"${expectedDocumentType}"

Identify the physical document in IMAGE 1.

Return exactly:

"passport"

or

"license"

or

""

Set:

"documentTypeMatches": true

ONLY when the physical document appears to be the expected
type.

Do not confuse:

- passport with driver's licence
- driver's licence with passport
- phone screen with physical document

============================================================
DOCUMENT NUMBER
============================================================

This is extremely important.

Read the document number directly from the physical document
in IMAGE 1.

DO NOT copy the original document number from the prompt.

DO NOT guess.

DO NOT invent characters.

If the number is clearly readable, return it.

If the number is partially readable but some characters are
uncertain, return only what can be reliably established.

If the number cannot be reliably read, return:

""

Set:

"documentNumberMatch": true

ONLY if the document number actually visible in IMAGE 1
matches the original verified document number.

Ignore harmless formatting differences such as:

spaces
hyphens
punctuation

For example:

"AB 123456"

and:

"AB123456"

can represent the same number.

If the visible number clearly differs from the original:

"documentNumberMatch": false

This is a HARD MISMATCH.

============================================================
PHYSICAL DOCUMENT
============================================================

Set:

"documentDetected": true

when a REAL physical identity document is visible.

The document does not need perfect OCR.

It may be:

- tilted
- partially covered
- slightly small
- affected by mild glare
- held at an angle

Do NOT count:

- phone screens
- computer screens
- screenshots
- digital overlays
- photographs displayed on another device

============================================================
DOCUMENT HELD
============================================================

Determine whether the person is physically holding the
document.

Look for:

- hand
- fingers
- grip
- contact
- natural positioning

Set:

"documentHeld": true

when the person appears to physically hold the document.

============================================================
FACE DETECTION
============================================================

Set:

"faceDetected": true

when a real human face is sufficiently visible.

Normal:

- lighting
- glasses
- expression
- angle
- compression

do not automatically fail detection.

============================================================
FACE VISUAL CONSISTENCY
============================================================

Compare the person's face in IMAGE 1 with the portrait
photograph in IMAGE 2.

Consider:

- face shape
- eyes
- nose
- mouth
- jaw
- eyebrows
- facial structure

Normal lighting, expression, angle and compression differences
should not automatically fail.

Set:

"faceVisuallyConsistent": true

when the faces appear visually consistent.

Set:

"faceMatch": true

when the faces appear visually consistent.

This is a visual consistency assessment only.

Do NOT claim:

- biometric certainty
- government-grade verification
- cryptographic verification
- liveness certification
- anti-spoof certification

============================================================
IMAGE QUALITY
============================================================

Evaluate IMAGE 1.

Set:

"imageQualityGood": true

when the image is sufficiently clear to assess:

- face
- physical document
- document type
- document number

The document text does not need to be perfectly readable if
the required document number can still be reliably determined.

Set false if the image is too poor for reliable verification.

============================================================
FINAL VERIFICATION
============================================================

The application will determine the final result.

The essential document identity checks are:

1. documentTypeMatches
2. documentNumberMatch

A DIFFERENT document number means the physical document is
NOT the original verified document.

Therefore:

Different document number = FAIL.

Do NOT let a matching face override a different document
number.

Do NOT let the same document type override a different
document number.

Example:

Original:
license
ABC123456

Selfie:
license
XYZ987654

Result:

documentTypeMatches = true

documentNumberMatch = false

This must NOT be considered the same document.

============================================================
CONFIDENCE
============================================================

DO NOT calculate confidence.

Return:

"confidence": 0

The backend calculates the final evidence score.

============================================================
FAILURE REASON
============================================================

If verification evidence fails, return one concise reason.

Possible reasons:

"Face was not clearly detected."

"Identity document was not detected."

"The identity document does not appear to be physically held."

"The selfie document type does not match the expected document."

"The document number does not match the verified document."

"The document number could not be reliably read."

"The face is not visually consistent with the verified document photograph."

"Image quality is insufficient for verification."

============================================================
RETURN JSON ONLY
============================================================

{
  "verified": false,
  "confidence": 0,

  "faceDetected": false,

  "documentDetected": false,

  "documentHeld": false,

  "documentType": "",

  "documentTypeMatches": false,

  "documentDataMatches": false,

  "faceVisuallyConsistent": false,

  "imageQualityGood": false,

  "extractedDocumentData": {
    "documentType": "",

    "fullName": "",
    "firstName": "",
    "lastName": "",

    "documentNumber": "",

    "dateOfBirth": "",
    "issueDate": "",
    "expiryDate": "",

    "nationality": "",

    "issuingCountry": "",
    "issuingProvince": "",

    "address": "",

    "sex": "",
    "placeOfBirth": "",

    "class": "",
    "restrictions": "",

    "raw": {}
  },

  "comparison": {
    "documentNumberMatch": false,

    "nameMatch": false,
    "dateOfBirthMatch": false,
    "expiryDateMatch": false,

    "documentTypeMatch": false,

    "issuingCountryMatch": false,
    "nationalityMatch": false,

    "faceMatch": false
  },

  "reason": ""
}

Return ONLY valid JSON.
`;

    // ==========================================================
    // GEMINI REQUEST
    // ==========================================================

    const response =
      await ai.models.generateContent({
        model: "gemini-2.5-flash",

        contents: [
          // ====================================================
          // IMAGE 1
          // SELFIE
          // ====================================================

          {
            inlineData: {
              mimeType:
                "image/jpeg",
              data:
                selfieData,
            },
          },

          // ====================================================
          // IMAGE 2
          // ORIGINAL VERIFIED DOCUMENT
          // ====================================================

          {
            inlineData: {
              mimeType:
                "image/jpeg",
              data:
                originalImageData,
            },
          },

          // ====================================================
          // PROMPT
          // ====================================================

          {
            text:
              prompt,
          },
        ],

        config: {
          responseMimeType:
            "application/json",

          temperature: 0,
        },
      });

    // ==========================================================
    // GET RESPONSE
    // ==========================================================

    let text =
      response?.text?.trim();

    if (!text) {
      throw new Error(
        "Gemini returned an empty response."
      );
    }

    // ==========================================================
    // CLEAN MARKDOWN
    // ==========================================================

    text = text
      .replace(
        /^```json\s*/i,
        ""
      )
      .replace(
        /^```\s*/i,
        ""
      )
      .replace(
        /\s*```$/i,
        ""
      )
      .trim();

    // ==========================================================
    // PARSE JSON
    // ==========================================================

    let data;

    try {
      data =
        JSON.parse(text);
    } catch (error) {
      console.error(
        "Gemini Selfie JSON Parse Error:",
        error
      );

      console.error(
        "Gemini Selfie Raw Response:",
        text
      );

      return emptyResult(
        "Unable to read the AI selfie verification response."
      );
    }

    // ==========================================================
    // NORMALIZE AI RESPONSE
    // ==========================================================

    const detectedDocumentType =
      normalizeDocumentType(
        data?.documentType
      );

    const extractedDocumentData =
      normalizeExtractedDocumentData(
        data?.extractedDocumentData
      );

    const comparison =
      normalizeComparison(
        data?.comparison
      );

    // ==========================================================
    // BASIC CHECKS
    // ==========================================================

    const faceDetected =
      normalizeBoolean(
        data?.faceDetected
      );

    const documentDetected =
      normalizeBoolean(
        data?.documentDetected
      );

    const documentHeld =
      normalizeBoolean(
        data?.documentHeld
      );

    const aiDocumentTypeMatches =
      normalizeBoolean(
        data?.documentTypeMatches
      );

    const faceVisuallyConsistent =
      normalizeBoolean(
        data?.faceVisuallyConsistent
      );

    const imageQualityGood =
      normalizeBoolean(
        data?.imageQualityGood
      );

    // ==========================================================
    // BACKEND DOCUMENT TYPE MATCH
    //
    // Do not rely only on Gemini's boolean.
    // ==========================================================

    const backendDocumentTypeMatches =
      detectedDocumentType ===
      expectedDocumentType;

    // ==========================================================
    // SELFIE DOCUMENT NUMBER
    // ==========================================================

    const selfieDocumentNumber =
      normalizeDocumentNumber(
        extractedDocumentData.documentNumber
      );

    // ==========================================================
    // ORIGINAL DOCUMENT NUMBER
    // ==========================================================

    const originalNumber =
      normalizeDocumentNumber(
        normalizedOriginalData.documentNumber
      );

    // ==========================================================
    // DOCUMENT NUMBER READABILITY
    // ==========================================================

    const originalNumberReadable =
      originalNumber.length > 0;

    const selfieNumberReadable =
      selfieDocumentNumber.length > 0;

    // ==========================================================
    // DOCUMENT NUMBER MATCH
    //
    // THIS IS THE MOST IMPORTANT CHECK.
    // ==========================================================

    let documentNumberMatch =
      false;

    let documentNumberConflict =
      false;

    // ----------------------------------------------------------
    // BOTH NUMBERS AVAILABLE
    // ----------------------------------------------------------

    if (
      originalNumberReadable &&
      selfieNumberReadable
    ) {
      documentNumberMatch =
        documentNumbersMatch(
          originalNumber,
          selfieDocumentNumber
        );

      if (
        !documentNumberMatch
      ) {
        documentNumberConflict =
          true;
      }
    }

    // ----------------------------------------------------------
    // SELFIE NUMBER UNREADABLE
    // ----------------------------------------------------------

    else if (
      originalNumberReadable &&
      !selfieNumberReadable
    ) {
      documentNumberMatch =
        false;

      documentNumberConflict =
        false;
    }

    // ----------------------------------------------------------
    // ORIGINAL NUMBER SHOULD ALREADY EXIST
    // ----------------------------------------------------------

    else {
      documentNumberMatch =
        false;
    }

    // ==========================================================
    // FORCE COMPARISON RESULT
    // ==========================================================

    comparison.documentNumberMatch =
      documentNumberMatch;

    comparison.documentTypeMatch =
      backendDocumentTypeMatches &&
      aiDocumentTypeMatches;

    // ==========================================================
    // DOCUMENT DATA MATCH
    //
    // ONLY TWO DOCUMENT FIELDS:
    //
    // 1. TYPE
    // 2. NUMBER
    // ==========================================================

    let documentDataMatches =
      false;

    // ----------------------------------------------------------
    // BOTH TYPE AND NUMBER MUST MATCH
    // ----------------------------------------------------------

    if (
      backendDocumentTypeMatches &&
      aiDocumentTypeMatches &&
      documentNumberMatch &&
      !documentNumberConflict
    ) {
      documentDataMatches =
        true;
    }

    // ----------------------------------------------------------
    // HARD FAILURE IF NUMBER CONFLICT
    // ----------------------------------------------------------

    if (
      documentNumberConflict
    ) {
      documentDataMatches =
        false;
    }

    // ==========================================================
    // FINAL CRITICAL CHECKS
    //
    // ALL must pass.
    // ==========================================================

    const criticalChecksPassed =
      faceDetected === true &&
      documentDetected === true &&
      documentHeld === true &&
      backendDocumentTypeMatches === true &&
      aiDocumentTypeMatches === true &&
      documentNumberMatch === true &&
      documentDataMatches === true &&
      faceVisuallyConsistent === true &&
      comparison.faceMatch === true &&
      imageQualityGood === true;

    // ==========================================================
    // FINAL VERIFIED RESULT
    // ==========================================================

    const verified =
      criticalChecksPassed &&
      !documentNumberConflict;

    // ==========================================================
    // CONFIDENCE
    // ==========================================================

    const confidence =
      calculateConfidence({
        verified,

        faceDetected,

        documentDetected,

        documentHeld,

        documentTypeMatches:
          backendDocumentTypeMatches &&
          aiDocumentTypeMatches,

        documentNumberMatch,

        faceVisuallyConsistent,

        imageQualityGood,

        documentNumberConflict,
      });

    // ==========================================================
    // FAILURE REASON
    // ==========================================================

    let reason =
      normalizeString(
        data?.reason
      );

    if (!verified) {
      // --------------------------------------------------------
      // FACE
      // --------------------------------------------------------

      if (
        !faceDetected
      ) {
        reason =
          "Face was not clearly detected.";
      }

      // --------------------------------------------------------
      // DOCUMENT
      // --------------------------------------------------------

      else if (
        !documentDetected
      ) {
        reason =
          "Identity document was not detected in the selfie.";
      }

      // --------------------------------------------------------
      // HOLDING
      // --------------------------------------------------------

      else if (
        !documentHeld
      ) {
        reason =
          "The identity document does not appear to be physically held.";
      }

      // --------------------------------------------------------
      // TYPE
      // --------------------------------------------------------

      else if (
        !backendDocumentTypeMatches ||
        !aiDocumentTypeMatches
      ) {
        reason =
          `The selfie document type does not match the expected ${expectedDocumentType}.`;
      }

      // --------------------------------------------------------
      // NUMBER CONFLICT
      //
      // THIS COMES BEFORE FACE.
      // --------------------------------------------------------

      else if (
        documentNumberConflict
      ) {
        reason =
          "The document number in the selfie does not match the verified document.";
      }

      // --------------------------------------------------------
      // NUMBER MISSING
      // --------------------------------------------------------

      else if (
        !selfieNumberReadable
      ) {
        reason =
          "The document number could not be reliably read from the selfie.";
      }

      // --------------------------------------------------------
      // DOCUMENT DATA
      // --------------------------------------------------------

      else if (
        !documentDataMatches
      ) {
        reason =
          "The selfie document type and document number do not sufficiently match the verified document.";
      }

      // --------------------------------------------------------
      // FACE
      // --------------------------------------------------------

      else if (
        !faceVisuallyConsistent ||
        !comparison.faceMatch
      ) {
        reason =
          "The face is not visually consistent with the photograph on the verified document.";
      }

      // --------------------------------------------------------
      // QUALITY
      // --------------------------------------------------------

      else if (
        !imageQualityGood
      ) {
        reason =
          "Selfie image quality is insufficient for verification.";
      }

      // --------------------------------------------------------
      // FALLBACK
      // --------------------------------------------------------

      else {
        reason =
          "Selfie verification failed.";
      }
    } else {
      reason = "";
    }

    // ==========================================================
    // DEBUG LOG
    // ==========================================================

    console.log(
      "============================================================"
    );

    console.log(
      "SELFIE DOCUMENT VERIFICATION"
    );

    console.log(
      "============================================================"
    );

    console.log({
      verified,

      confidence,

      expectedDocumentType,

      detectedDocumentType,

      originalDocumentNumber:
        originalNumber,

      selfieDocumentNumber,

      originalNumberReadable,

      selfieNumberReadable,

      documentNumberMatch,

      documentNumberConflict,

      documentTypeMatches:
        backendDocumentTypeMatches &&
        aiDocumentTypeMatches,

      documentDataMatches,

      faceDetected,

      faceVisuallyConsistent,

      faceMatch:
        comparison.faceMatch,

      documentDetected,

      documentHeld,

      imageQualityGood,

      reason,
    });

    console.log(
      "============================================================"
    );

    // ==========================================================
    // FINAL RESPONSE
    // ==========================================================

    return {
      verified,

      confidence,

      // --------------------------------------------------------
      // DETECTION
      // --------------------------------------------------------

      faceDetected,

      documentDetected,

      documentHeld,

      // --------------------------------------------------------
      // DOCUMENT TYPE
      // --------------------------------------------------------

      documentType:
        detectedDocumentType,

      documentTypeMatches:
        backendDocumentTypeMatches &&
        aiDocumentTypeMatches,

      // --------------------------------------------------------
      // DOCUMENT DATA
      // --------------------------------------------------------

      documentDataMatches:
        documentDataMatches &&
        !documentNumberConflict,

      // --------------------------------------------------------
      // FACE
      // --------------------------------------------------------

      faceVisuallyConsistent,

      // --------------------------------------------------------
      // QUALITY
      // --------------------------------------------------------

      imageQualityGood,

      // --------------------------------------------------------
      // SELFIE OCR
      // --------------------------------------------------------

      extractedDocumentData,

      // --------------------------------------------------------
      // COMPARISON
      // --------------------------------------------------------

      comparison,

      // --------------------------------------------------------
      // REASON
      // --------------------------------------------------------

      reason,
    };
  } catch (err) {
    // ==========================================================
    // ERROR
    // ==========================================================

    console.error(
      "Gemini Selfie Verification Error:",
      err
    );

    return emptyResult(
      err?.message ||
        "Unable to analyze selfie."
    );
  }
}












































// import { GoogleGenAI } from "@google/genai";

// const ai = new GoogleGenAI({
//   apiKey: process.env.GEMINI_API_KEY,
// });

// // ============================================================
// // EMPTY EXTRACTED DOCUMENT DATA
// // ============================================================

// const emptyExtractedDocumentData = () => ({
//   documentType: "",

//   fullName: "",
//   firstName: "",
//   lastName: "",

//   documentNumber: "",

//   dateOfBirth: "",
//   issueDate: "",
//   expiryDate: "",

//   nationality: "",

//   issuingCountry: "",
//   issuingProvince: "",

//   address: "",

//   sex: "",
//   placeOfBirth: "",

//   class: "",
//   restrictions: "",

//   raw: {},
// });

// // ============================================================
// // EMPTY COMPARISON
// // ============================================================

// const emptyComparison = () => ({
//   documentNumberMatch: false,
//   nameMatch: false,
//   dateOfBirthMatch: false,
//   expiryDateMatch: false,
//   documentTypeMatch: false,
//   issuingCountryMatch: false,
//   nationalityMatch: false,
//   faceMatch: false,
// });

// // ============================================================
// // EMPTY RESULT
// // ============================================================

// const emptyResult = (reason = "") => ({
//   verified: false,

//   confidence: 0,

//   faceDetected: false,

//   documentDetected: false,

//   documentHeld: false,

//   documentType: "",

//   documentTypeMatches: false,

//   documentDataMatches: false,

//   faceVisuallyConsistent: false,

//   imageQualityGood: false,

//   extractedDocumentData:
//     emptyExtractedDocumentData(),

//   comparison:
//     emptyComparison(),

//   reason,
// });

// // ============================================================
// // NORMALIZE STRING
// // ============================================================

// const normalizeString = (value) => {
//   if (
//     value === null ||
//     value === undefined
//   ) {
//     return "";
//   }

//   return String(value).trim();
// };

// // ============================================================
// // NORMALIZE BOOLEAN
// // ============================================================

// const normalizeBoolean = (value) => {
//   if (value === true) {
//     return true;
//   }

//   if (typeof value === "string") {
//     const normalized =
//       value.trim().toLowerCase();

//     if (
//       normalized === "true" ||
//       normalized === "yes" ||
//       normalized === "1"
//     ) {
//       return true;
//     }

//     if (
//       normalized === "false" ||
//       normalized === "no" ||
//       normalized === "0"
//     ) {
//       return false;
//     }
//   }

//   if (typeof value === "number") {
//     return value === 1;
//   }

//   return false;
// };

// // ============================================================
// // NORMALIZE DOCUMENT TYPE
// // ============================================================

// const normalizeDocumentType = (value) => {
//   const type =
//     normalizeString(value).toLowerCase();

//   if (type.includes("passport")) {
//     return "passport";
//   }

//   if (
//     type.includes("driver") ||
//     type.includes("licen") ||
//     type.includes("license")
//   ) {
//     return "license";
//   }

//   return "";
// };

// // ============================================================
// // NORMALIZE EXTRACTED DOCUMENT DATA
// // ============================================================

// const normalizeExtractedDocumentData = (
//   data
// ) => {
//   if (
//     !data ||
//     typeof data !== "object"
//   ) {
//     return emptyExtractedDocumentData();
//   }

//   return {
//     documentType:
//       normalizeDocumentType(
//         data.documentType
//       ),

//     fullName:
//       normalizeString(
//         data.fullName
//       ),

//     firstName:
//       normalizeString(
//         data.firstName
//       ),

//     lastName:
//       normalizeString(
//         data.lastName
//       ),

//     documentNumber:
//       normalizeString(
//         data.documentNumber
//       ),

//     dateOfBirth:
//       normalizeString(
//         data.dateOfBirth
//       ),

//     issueDate:
//       normalizeString(
//         data.issueDate
//       ),

//     expiryDate:
//       normalizeString(
//         data.expiryDate
//       ),

//     nationality:
//       normalizeString(
//         data.nationality
//       ),

//     issuingCountry:
//       normalizeString(
//         data.issuingCountry
//       ),

//     issuingProvince:
//       normalizeString(
//         data.issuingProvince
//       ),

//     address:
//       normalizeString(
//         data.address
//       ),

//     sex:
//       normalizeString(
//         data.sex
//       ),

//     placeOfBirth:
//       normalizeString(
//         data.placeOfBirth
//       ),

//     class:
//       normalizeString(
//         data.class
//       ),

//     restrictions:
//       normalizeString(
//         data.restrictions
//       ),

//     raw:
//       data.raw &&
//       typeof data.raw === "object"
//         ? data.raw
//         : {},
//   };
// };

// // ============================================================
// // NORMALIZE COMPARISON
// // ============================================================

// const normalizeComparison = (
//   comparison
// ) => {
//   if (
//     !comparison ||
//     typeof comparison !== "object"
//   ) {
//     return emptyComparison();
//   }

//   return {
//     documentNumberMatch:
//       normalizeBoolean(
//         comparison.documentNumberMatch
//       ),

//     nameMatch:
//       normalizeBoolean(
//         comparison.nameMatch
//       ),

//     dateOfBirthMatch:
//       normalizeBoolean(
//         comparison.dateOfBirthMatch
//       ),

//     expiryDateMatch:
//       normalizeBoolean(
//         comparison.expiryDateMatch
//       ),

//     documentTypeMatch:
//       normalizeBoolean(
//         comparison.documentTypeMatch
//       ),

//     issuingCountryMatch:
//       normalizeBoolean(
//         comparison.issuingCountryMatch
//       ),

//     nationalityMatch:
//       normalizeBoolean(
//         comparison.nationalityMatch
//       ),

//     faceMatch:
//       normalizeBoolean(
//         comparison.faceMatch
//       ),
//   };
// };

// // ============================================================
// // CLEAN BASE64
// // ============================================================

// const cleanBase64 = (base64) => {
//   if (
//     !base64 ||
//     typeof base64 !== "string"
//   ) {
//     return "";
//   }

//   return base64
//     .replace(
//       /^data:image\/[\w.+-]+;base64,/i,
//       ""
//     )
//     .trim();
// };

// // ============================================================
// // NORMALIZE DOCUMENT NUMBER
// //
// // Removes spaces/punctuation but preserves actual characters.
// //
// // Example:
// //
// // AB 123-456
// //
// // becomes:
// //
// // AB123456
// // ============================================================

// const normalizeDocumentNumber = (
//   value
// ) => {
//   return normalizeString(value)
//     .toUpperCase()
//     .replace(/[^A-Z0-9]/g, "");
// };

// // ============================================================
// // NORMALIZE GENERAL COMPARISON STRING
// // ============================================================

// const normalizeComparisonString = (
//   value
// ) => {
//   return normalizeString(value)
//     .toUpperCase()
//     .replace(/[^A-Z0-9]/g, "");
// };

// // ============================================================
// // NORMALIZE DATE
// // ============================================================

// const normalizeDate = (
//   value
// ) => {
//   return normalizeString(value)
//     .replace(/[./]/g, "-")
//     .replace(/\s+/g, "")
//     .toUpperCase();
// };

// // ============================================================
// // FIELD MATCH
// //
// // Only returns true when BOTH values are available and equal.
// // ============================================================

// const fieldsMatch = (
//   originalValue,
//   selfieValue
// ) => {
//   const original =
//     normalizeComparisonString(
//       originalValue
//     );

//   const selfie =
//     normalizeComparisonString(
//       selfieValue
//     );

//   if (!original || !selfie) {
//     return false;
//   }

//   return original === selfie;
// };

// // ============================================================
// // DATE MATCH
// // ============================================================

// const datesMatch = (
//   originalValue,
//   selfieValue
// ) => {
//   const original =
//     normalizeDate(
//       originalValue
//     );

//   const selfie =
//     normalizeDate(
//       selfieValue
//     );

//   if (!original || !selfie) {
//     return false;
//   }

//   return original === selfie;
// };

// // ============================================================
// // DOCUMENT NUMBER MATCH
// // ============================================================

// const documentNumbersMatch = (
//   originalValue,
//   selfieValue
// ) => {
//   const original =
//     normalizeDocumentNumber(
//       originalValue
//     );

//   const selfie =
//     normalizeDocumentNumber(
//       selfieValue
//     );

//   if (
//     !original ||
//     !selfie
//   ) {
//     return false;
//   }

//   return original === selfie;
// };

// // ============================================================
// // SELFIE DOCUMENT DATA AVAILABILITY
// // ============================================================

// const hasUsefulSelfieDocumentData = (
//   extractedData
// ) => {
//   if (!extractedData) {
//     return false;
//   }

//   const fields = [
//     extractedData.documentNumber,
//     extractedData.fullName,
//     extractedData.firstName,
//     extractedData.lastName,
//     extractedData.dateOfBirth,
//     extractedData.expiryDate,
//   ];

//   return (
//     fields.filter(
//       (value) =>
//         normalizeString(value) !== ""
//     ).length > 0
//   );
// };

// // ============================================================
// // COUNT INDEPENDENT MATCHES
// //
// // Document number is deliberately excluded because it has its
// // own stronger security rule.
// // ============================================================

// const countIndependentMatches = (
//   comparison
// ) => {
//   if (!comparison) {
//     return 0;
//   }

//   const checks = [
//     comparison.nameMatch,
//     comparison.dateOfBirthMatch,
//     comparison.expiryDateMatch,
//     comparison.issuingCountryMatch,
//     comparison.nationalityMatch,
//   ];

//   return checks.filter(Boolean).length;
// };

// // ============================================================
// // CALCULATE CONFIDENCE
// //
// // This is an EVIDENCE SCORE.
// //
// // It is NOT a probability that identity is genuine.
// //
// // Most important:
// // - document number
// // - document data
// // - face consistency
// //
// // A successful complete verification can reach 100.
// // ============================================================

// const calculateConfidence = ({
//   verified,
//   faceDetected,
//   documentDetected,
//   documentHeld,
//   documentTypeMatches,
//   documentDataMatches,
//   faceVisuallyConsistent,
//   imageQualityGood,
//   comparison,
//   documentNumberConflict,
//   documentNumberReadable,
// }) => {
//   // ----------------------------------------------------------
//   // Hard security failure
//   // ----------------------------------------------------------

//   if (documentNumberConflict) {
//     return 0;
//   }

//   let score = 0;

//   // ----------------------------------------------------------
//   // Basic image evidence
//   // ----------------------------------------------------------

//   if (faceDetected) {
//     score += 10;
//   }

//   if (documentDetected) {
//     score += 5;
//   }

//   if (documentHeld) {
//     score += 10;
//   }

//   if (documentTypeMatches) {
//     score += 10;
//   }

//   // ----------------------------------------------------------
//   // Document number
//   //
//   // If readable and matching, give strongest weight.
//   // ----------------------------------------------------------

//   if (
//     documentNumberReadable &&
//     comparison.documentNumberMatch
//   ) {
//     score += 30;
//   }

//   // ----------------------------------------------------------
//   // Independent document fields
//   // ----------------------------------------------------------

//   const independentMatches =
//     countIndependentMatches(
//       comparison
//     );

//   if (independentMatches > 0) {
//     score += Math.min(
//       independentMatches * 3,
//       15
//     );
//   }

//   // ----------------------------------------------------------
//   // Overall document evidence
//   // ----------------------------------------------------------

//   if (documentDataMatches) {
//     score += 10;
//   }

//   // ----------------------------------------------------------
//   // Face consistency
//   // ----------------------------------------------------------

//   if (faceVisuallyConsistent) {
//     score += 15;
//   }

//   // ----------------------------------------------------------
//   // Image quality
//   // ----------------------------------------------------------

//   if (imageQualityGood) {
//     score += 5;
//   }

//   // ----------------------------------------------------------
//   // Maximum
//   // ----------------------------------------------------------

//   score = Math.round(
//     Math.min(
//       100,
//       Math.max(0, score)
//     )
//   );

//   // ----------------------------------------------------------
//   // Complete strong verification
//   //
//   // This is the ONLY situation where we explicitly allow 100.
//   // ----------------------------------------------------------

//   if (
//     verified &&
//     documentNumberReadable &&
//     comparison.documentNumberMatch === true &&
//     comparison.faceMatch === true &&
//     faceVisuallyConsistent === true &&
//     documentDataMatches === true &&
//     faceDetected === true &&
//     documentDetected === true &&
//     documentHeld === true &&
//     documentTypeMatches === true &&
//     imageQualityGood === true
//   ) {
//     return 100;
//   }

//   return score;
// };

// // ============================================================
// // MAIN VERIFICATION
// // ============================================================

// export default async function verifySelfieAgainstDocument({
//   selfieImage,
//   originalDocumentImage,
//   originalDocumentData,
//   documentType,
// }) {
//   try {
//     // ==========================================================
//     // VALIDATE INPUT
//     // ==========================================================

//     if (!selfieImage) {
//       return emptyResult(
//         "No selfie image was provided."
//       );
//     }

//     if (!originalDocumentImage) {
//       return emptyResult(
//         "Original verified document image was not provided."
//       );
//     }

//     if (
//       !originalDocumentData ||
//       typeof originalDocumentData !== "object"
//     ) {
//       return emptyResult(
//         "Original verified document data was not provided."
//       );
//     }

//     // ==========================================================
//     // EXPECTED DOCUMENT TYPE
//     // ==========================================================

//     const expectedDocumentType =
//       normalizeDocumentType(
//         documentType
//       );

//     if (
//       expectedDocumentType !==
//         "license" &&
//       expectedDocumentType !==
//         "passport"
//     ) {
//       return emptyResult(
//         "Invalid document type. Expected license or passport."
//       );
//     }

//     // ==========================================================
//     // CLEAN IMAGES
//     // ==========================================================

//     const selfieData =
//       cleanBase64(
//         selfieImage
//       );

//     const documentData =
//       cleanBase64(
//         originalDocumentImage
//       );

//     if (!selfieData) {
//       return emptyResult(
//         "Invalid selfie image data."
//       );
//     }

//     if (!documentData) {
//       return emptyResult(
//         "Invalid original document image data."
//       );
//     }

//     // ==========================================================
//     // ORIGINAL DOCUMENT OCR
//     // ==========================================================

//     const normalizedOriginalData =
//       normalizeExtractedDocumentData(
//         originalDocumentData
//       );

//     // ==========================================================
//     // IMPORTANT ORIGINAL DOCUMENT VALIDATION
//     // ==========================================================

//     if (
//       normalizeDocumentType(
//         normalizedOriginalData.documentType
//       ) &&
//       normalizeDocumentType(
//         normalizedOriginalData.documentType
//       ) !== expectedDocumentType
//     ) {
//       return emptyResult(
//         "The original document type does not match the expected document type."
//       );
//     }

//     // ==========================================================
//     // GEMINI PROMPT
//     // ==========================================================

//     const prompt = `
// You are an identity-document and selfie verification AI.

// You must carefully analyze TWO images.

// IMAGE 1:
// A selfie of a person physically holding ONE identity document.

// IMAGE 2:
// The ORIGINAL identity document that was already verified.

// Expected document type:

// "${expectedDocumentType}"

// ============================================================
// SECURITY PRINCIPLE
// ============================================================

// The physical document in IMAGE 1 must correspond to the
// ORIGINAL document in IMAGE 2.

// The person's face alone is NOT sufficient.

// A generic-looking driver's licence is NOT sufficient.

// A matching document design is NOT sufficient.

// The person holding a DIFFERENT licence must fail.

// The person holding a DIFFERENT passport must fail.

// If the document number is clearly readable and differs from
// the original, this is an ABSOLUTE DOCUMENT MISMATCH.

// Do not allow face similarity to override a document mismatch.

// ============================================================
// ORIGINAL VERIFIED OCR
// ============================================================

// ${JSON.stringify(
//   normalizedOriginalData,
//   null,
//   2
// )}

// This is REFERENCE DATA.

// Do NOT copy it into the selfie OCR.

// Analyze IMAGE 1 independently.

// If information cannot actually be read from IMAGE 1, return
// an empty string.

// ============================================================
// 1. FACE DETECTION
// ============================================================

// Set faceDetected=true when a real human face is sufficiently
// visible for comparison.

// Normal differences in:

// - lighting
// - expression
// - angle
// - glasses
// - compression

// do not automatically fail detection.

// ============================================================
// 2. PHYSICAL DOCUMENT DETECTION
// ============================================================

// Determine whether IMAGE 1 contains a REAL PHYSICAL:

// - passport
// - driver's licence
// - driving licence

// Do NOT count:

// - phone screens
// - screenshots
// - computer screens
// - digital overlays
// - photos displayed on another device

// The document may be:

// - tilted
// - partially covered
// - affected by mild glare
// - somewhat small

// and still count as detected.

// ============================================================
// 3. DOCUMENT HELD
// ============================================================

// Determine whether the person is physically holding the
// document.

// Look for:

// - fingers
// - hand
// - grip
// - contact
// - natural positioning

// Set documentHeld=true only when the physical relationship
// between person, hand and document is reasonably clear.

// ============================================================
// 4. DOCUMENT TYPE
// ============================================================

// Identify the physical document in IMAGE 1.

// Return exactly:

// "passport"

// or

// "license"

// or

// ""

// The expected type is:

// "${expectedDocumentType}"

// Set documentTypeMatches=true only if the document type
// actually appears to match.

// ============================================================
// 5. SELFIE DOCUMENT OCR
// ============================================================

// Read ONLY information actually visible in IMAGE 1.

// NEVER guess.

// NEVER copy from IMAGE 2.

// Return:

// documentType
// fullName
// firstName
// lastName
// documentNumber
// dateOfBirth
// issueDate
// expiryDate
// nationality
// issuingCountry
// issuingProvince
// address
// sex
// placeOfBirth
// class
// restrictions

// Unreadable fields MUST be:

// ""

// ============================================================
// 6. DOCUMENT NUMBER
// ============================================================

// This is the MOST IMPORTANT document identifier.

// If the document number is clearly visible in IMAGE 1:

// extract it exactly.

// Compare it with the original document.

// Ignore:

// - spaces
// - punctuation
// - harmless formatting differences

// Example:

// AB 123456

// and:

// AB123456

// may be the same number.

// If the selfie document number is clearly different from the
// original:

// documentNumberMatch=false

// DO NOT guess.

// If the number cannot be read reliably:

// documentNumberMatch=false

// Do not pretend it matched.

// ============================================================
// 7. DOCUMENT FIELD COMPARISON
// ============================================================

// Compare the physical document in IMAGE 1 with IMAGE 2 and
// the original OCR.

// Compare:

// - document number
// - full name
// - date of birth
// - expiry date
// - document type
// - issuing country
// - nationality

// Only mark a field TRUE if the available evidence supports it.

// Blank/unreadable values are NOT matches.

// ============================================================
// 8. DOCUMENT DATA MATCH
// ============================================================

// documentDataMatches means:

// "The physical document shown in the selfie is sufficiently
// supported as being the SAME document as the original verified
// document."

// Strong evidence:

// 1. Exact matching document number
// 2. Matching name
// 3. Matching date of birth
// 4. Matching expiry
// 5. Matching document type
// 6. Matching issuing information

// VERY IMPORTANT:

// If the document number is readable and differs from the
// original:

// documentDataMatches MUST be false.

// If document number is unreadable, use multiple independent
// fields.

// Do NOT use generic card appearance as proof.

// ============================================================
// 9. FACE COMPARISON
// ============================================================

// Compare the person's face in IMAGE 1 with the portrait photo
// on IMAGE 2.

// Consider visible stable characteristics:

// - face shape
// - eyes
// - nose
// - mouth
// - jaw
// - eyebrows
// - facial structure

// Normal:

// - lighting
// - angle
// - expression
// - compression

// should not automatically cause failure.

// Set:

// faceVisuallyConsistent=true

// when the faces appear reasonably consistent.

// Set:

// faceMatch=true

// when the faces appear visually consistent.

// If clearly inconsistent, return false.

// ============================================================
// 10. IMAGE QUALITY
// ============================================================

// Determine whether IMAGE 1 is good enough for the required
// verification.

// Consider:

// - face visibility
// - document visibility
// - blur
// - glare
// - lighting
// - obstruction
// - resolution
// - overall usability

// Tiny unreadable text alone does not necessarily make the
// whole image bad.

// ============================================================
// 11. OVERALL VERIFICATION
// ============================================================

// Return verified=true ONLY when:

// faceDetected=true
// AND
// documentDetected=true
// AND
// documentHeld=true
// AND
// documentTypeMatches=true
// AND
// documentDataMatches=true
// AND
// faceVisuallyConsistent=true
// AND
// imageQualityGood=true

// AND there is sufficient evidence that the physical document
// is the SAME document as IMAGE 2.

// A clearly conflicting document number MUST cause failure.

// ============================================================
// 12. CONFIDENCE
// ============================================================

// DO NOT calculate or invent a confidence score.

// The application backend calculates confidence.

// Return:

// "confidence": 0

// in the JSON structure.

// ============================================================
// 13. FAILURE REASON
// ============================================================

// If verified=false, return ONE concise reason.

// Examples:

// "Face was not clearly detected."

// "Identity document was not detected."

// "The identity document does not appear to be physically held."

// "The selfie document type does not match the expected document."

// "The document number does not match the verified document."

// "Insufficient matching document information was available."

// "The face is not visually consistent with the verified document photograph."

// "Image quality is insufficient for verification."

// ============================================================
// RETURN JSON ONLY
// ============================================================

// {
//   "verified": false,
//   "confidence": 0,

//   "faceDetected": false,
//   "documentDetected": false,
//   "documentHeld": false,

//   "documentType": "",
//   "documentTypeMatches": false,

//   "documentDataMatches": false,

//   "faceVisuallyConsistent": false,
//   "imageQualityGood": false,

//   "extractedDocumentData": {
//     "documentType": "",

//     "fullName": "",
//     "firstName": "",
//     "lastName": "",

//     "documentNumber": "",

//     "dateOfBirth": "",
//     "issueDate": "",
//     "expiryDate": "",

//     "nationality": "",

//     "issuingCountry": "",
//     "issuingProvince": "",

//     "address": "",

//     "sex": "",
//     "placeOfBirth": "",

//     "class": "",
//     "restrictions": "",

//     "raw": {}
//   },

//   "comparison": {
//     "documentNumberMatch": false,
//     "nameMatch": false,
//     "dateOfBirthMatch": false,
//     "expiryDateMatch": false,
//     "documentTypeMatch": false,
//     "issuingCountryMatch": false,
//     "nationalityMatch": false,
//     "faceMatch": false
//   },

//   "reason": ""
// }

// Return ONLY valid JSON.
// `;

//     // ==========================================================
//     // GEMINI
//     // ==========================================================

//     const response =
//       await ai.models.generateContent({
//         model: "gemini-2.5-flash",

//         contents: [
//           // IMAGE 1
//           {
//             inlineData: {
//               mimeType: "image/jpeg",
//               data: selfieData,
//             },
//           },

//           // IMAGE 2
//           {
//             inlineData: {
//               mimeType: "image/jpeg",
//               data: documentData,
//             },
//           },

//           // PROMPT
//           {
//             text: prompt,
//           },
//         ],

//         config: {
//           responseMimeType:
//             "application/json",

//           temperature: 0,
//         },
//       });

//     // ==========================================================
//     // GET TEXT
//     // ==========================================================

//     let text =
//       response?.text?.trim();

//     if (!text) {
//       throw new Error(
//         "Gemini returned an empty response."
//       );
//     }

//     // ==========================================================
//     // CLEAN MARKDOWN
//     // ==========================================================

//     text = text
//       .replace(
//         /^```json\s*/i,
//         ""
//       )
//       .replace(
//         /^```\s*/i,
//         ""
//       )
//       .replace(
//         /\s*```$/i,
//         ""
//       )
//       .trim();

//     // ==========================================================
//     // PARSE JSON
//     // ==========================================================

//     let data;

//     try {
//       data = JSON.parse(text);
//     } catch (error) {
//       console.error(
//         "Gemini Selfie JSON Parse Error:",
//         error
//       );

//       console.error(
//         "Gemini Selfie Raw Response:",
//         text
//       );

//       return emptyResult(
//         "Unable to read the AI selfie verification response."
//       );
//     }

//     // ==========================================================
//     // NORMALIZE AI RESULT
//     // ==========================================================

//     const detectedDocumentType =
//       normalizeDocumentType(
//         data?.documentType
//       );

//     const extractedDocumentData =
//       normalizeExtractedDocumentData(
//         data?.extractedDocumentData
//       );

//     const comparison =
//       normalizeComparison(
//         data?.comparison
//       );

//     // ==========================================================
//     // BASIC CHECKS
//     // ==========================================================

//     const faceDetected =
//       normalizeBoolean(
//         data?.faceDetected
//       );

//     const documentDetected =
//       normalizeBoolean(
//         data?.documentDetected
//       );

//     const documentHeld =
//       normalizeBoolean(
//         data?.documentHeld
//       );

//     const aiDocumentTypeMatches =
//       normalizeBoolean(
//         data?.documentTypeMatches
//       );

//     const aiDocumentDataMatches =
//       normalizeBoolean(
//         data?.documentDataMatches
//       );

//     const faceVisuallyConsistent =
//       normalizeBoolean(
//         data?.faceVisuallyConsistent
//       );

//     const imageQualityGood =
//       normalizeBoolean(
//         data?.imageQualityGood
//       );

//     // ==========================================================
//     // BACKEND DOCUMENT TYPE VALIDATION
//     // ==========================================================

//     const backendDocumentTypeMatches =
//       detectedDocumentType ===
//       expectedDocumentType;

//     comparison.documentTypeMatch =
//       comparison.documentTypeMatch &&
//       backendDocumentTypeMatches;

//     // ==========================================================
//     // ORIGINAL DOCUMENT NUMBER
//     // ==========================================================

//     const originalDocumentNumber =
//       normalizeDocumentNumber(
//         normalizedOriginalData.documentNumber
//       );

//     // ==========================================================
//     // SELFIE DOCUMENT NUMBER
//     // ==========================================================

//     const selfieDocumentNumber =
//       normalizeDocumentNumber(
//         extractedDocumentData.documentNumber
//       );

//     // ==========================================================
//     // DETERMINE WHETHER NUMBER IS AVAILABLE
//     // ==========================================================

//     const originalNumberReadable =
//       originalDocumentNumber.length > 0;

//     const selfieNumberReadable =
//       selfieDocumentNumber.length > 0;

//     const documentNumberReadable =
//       originalNumberReadable &&
//       selfieNumberReadable;

//     // ==========================================================
//     // HARD DOCUMENT NUMBER COMPARISON
//     //
//     // THIS IS THE CRITICAL SECURITY PART.
//     // ==========================================================

//     let documentNumberConflict =
//       false;

//     let backendDocumentNumberMatch =
//       false;

//     if (
//       originalNumberReadable &&
//       selfieNumberReadable
//     ) {
//       backendDocumentNumberMatch =
//         documentNumbersMatch(
//           originalDocumentNumber,
//           selfieDocumentNumber
//         );

//       if (
//         !backendDocumentNumberMatch
//       ) {
//         documentNumberConflict =
//           true;
//       }
//     }

//     // ==========================================================
//     // FORCE NUMBER RESULT
//     // ==========================================================

//     if (
//       documentNumberReadable
//     ) {
//       comparison.documentNumberMatch =
//         backendDocumentNumberMatch;
//     } else {
//       comparison.documentNumberMatch =
//         false;
//     }

//     // ==========================================================
//     // BACKEND NAME MATCH
//     // ==========================================================

//     const backendNameMatch =
//       fieldsMatch(
//         normalizedOriginalData.fullName,
//         extractedDocumentData.fullName
//       );

//     if (backendNameMatch) {
//       comparison.nameMatch =
//         true;
//     }

//     // ==========================================================
//     // BACKEND DOB MATCH
//     // ==========================================================

//     const backendDateOfBirthMatch =
//       datesMatch(
//         normalizedOriginalData.dateOfBirth,
//         extractedDocumentData.dateOfBirth
//       );

//     if (
//       backendDateOfBirthMatch
//     ) {
//       comparison.dateOfBirthMatch =
//         true;
//     }

//     // ==========================================================
//     // BACKEND EXPIRY MATCH
//     // ==========================================================

//     const backendExpiryDateMatch =
//       datesMatch(
//         normalizedOriginalData.expiryDate,
//         extractedDocumentData.expiryDate
//       );

//     if (
//       backendExpiryDateMatch
//     ) {
//       comparison.expiryDateMatch =
//         true;
//     }

//     // ==========================================================
//     // BACKEND ISSUING COUNTRY MATCH
//     // ==========================================================

//     const backendIssuingCountryMatch =
//       fieldsMatch(
//         normalizedOriginalData.issuingCountry,
//         extractedDocumentData.issuingCountry
//       );

//     if (
//       backendIssuingCountryMatch
//     ) {
//       comparison.issuingCountryMatch =
//         true;
//     }

//     // ==========================================================
//     // BACKEND NATIONALITY MATCH
//     // ==========================================================

//     const backendNationalityMatch =
//       fieldsMatch(
//         normalizedOriginalData.nationality,
//         extractedDocumentData.nationality
//       );

//     if (
//       backendNationalityMatch
//     ) {
//       comparison.nationalityMatch =
//         true;
//     }

//     // ==========================================================
//     // SELFIE OCR AVAILABILITY
//     // ==========================================================

//     const selfieHasUsefulDocumentData =
//       hasUsefulSelfieDocumentData(
//         extractedDocumentData
//       );

//     // ==========================================================
//     // INDEPENDENT MATCH COUNT
//     // ==========================================================

//     const independentMatchCount =
//       countIndependentMatches(
//         comparison
//       );

//     // ==========================================================
//     // STRICT DOCUMENT DATA VERIFICATION
//     //
//     // PRIORITY:
//     //
//     // 1. Document number match
//     // 2. If number unavailable, multiple independent fields
//     //
//     // IMPORTANT:
//     //
//     // Face matching NEVER participates in proving that the
//     // physical document is the same document.
//     // ==========================================================

//     let documentDataMatches =
//       false;

//     // ----------------------------------------------------------
//     // CASE 1:
//     // BOTH DOCUMENT NUMBERS AVAILABLE
//     // ----------------------------------------------------------

//     if (
//       originalNumberReadable &&
//       selfieNumberReadable
//     ) {
//       // A readable number is decisive.

//       documentDataMatches =
//         backendDocumentNumberMatch &&
//         backendDocumentTypeMatches &&
//         comparison.documentTypeMatch === true;
//     }

//     // ----------------------------------------------------------
//     // CASE 2:
//     // SELFIE NUMBER UNREADABLE
//     //
//     // We cannot claim number match.
//     //
//     // Require stronger secondary evidence.
//     // ----------------------------------------------------------

//     else if (
//       originalNumberReadable &&
//       !selfieNumberReadable
//     ) {
//       documentDataMatches =
//         selfieHasUsefulDocumentData &&
//         backendDocumentTypeMatches &&
//         comparison.documentTypeMatch === true &&
//         independentMatchCount >= 3 &&
//         aiDocumentDataMatches === true;
//     }

//     // ----------------------------------------------------------
//     // CASE 3:
//     // ORIGINAL NUMBER ALSO UNAVAILABLE
//     //
//     // Require multiple independent fields.
//     // ----------------------------------------------------------

//     else if (
//       !originalNumberReadable &&
//       selfieNumberReadable
//     ) {
//       documentDataMatches =
//         backendDocumentTypeMatches &&
//         comparison.documentTypeMatch === true &&
//         independentMatchCount >= 3;
//     }

//     // ----------------------------------------------------------
//     // CASE 4:
//     // NO DOCUMENT NUMBER AVAILABLE
//     // ----------------------------------------------------------

//     else {
//       documentDataMatches =
//         selfieHasUsefulDocumentData &&
//         backendDocumentTypeMatches &&
//         comparison.documentTypeMatch === true &&
//         independentMatchCount >= 3 &&
//         aiDocumentDataMatches === true;
//     }

//     // ==========================================================
//     // HARD SECURITY OVERRIDE
//     //
//     // A conflicting document number ALWAYS wins.
//     // ==========================================================

//     if (
//       documentNumberConflict
//     ) {
//       documentDataMatches =
//         false;
//     }

//     // ==========================================================
//     // FACE MATCH
//     //
//     // Gemini's face assessment is accepted only as a visual
//     // consistency result.
//     // ==========================================================

//     comparison.faceMatch =
//       normalizeBoolean(
//         data?.comparison?.faceMatch
//       ) &&
//       faceVisuallyConsistent;

//     // ==========================================================
//     // FINAL CRITICAL CHECKS
//     //
//     // EVERY condition must pass.
//     // ==========================================================

//     const criticalChecksPassed =
//       faceDetected === true &&
//       documentDetected === true &&
//       documentHeld === true &&
//       backendDocumentTypeMatches === true &&
//       aiDocumentTypeMatches === true &&
//       documentDataMatches === true &&
//       faceVisuallyConsistent === true &&
//       comparison.faceMatch === true &&
//       imageQualityGood === true;

//     // ==========================================================
//     // FINAL VERIFIED
//     // ==========================================================

//     const verified =
//       criticalChecksPassed &&
//       !documentNumberConflict;

//     // ==========================================================
//     // FINAL CONFIDENCE
//     //
//     // IMPORTANT:
//     //
//     // We DO NOT use Gemini's confidence.
//     //
//     // We calculate it from actual evidence.
//     // ==========================================================

//     const confidence =
//       calculateConfidence({
//         verified,

//         faceDetected,

//         documentDetected,

//         documentHeld,

//         documentTypeMatches:
//           backendDocumentTypeMatches &&
//           aiDocumentTypeMatches,

//         documentDataMatches,

//         faceVisuallyConsistent,

//         imageQualityGood,

//         comparison,

//         documentNumberConflict,

//         documentNumberReadable,
//       });

//     // ==========================================================
//     // FAILURE REASON
//     // ==========================================================

//     let reason =
//       normalizeString(
//         data?.reason
//       );

//     if (!verified) {
//       if (!faceDetected) {
//         reason =
//           "Face was not clearly detected.";
//       }

//       else if (!documentDetected) {
//         reason =
//           "Identity document was not detected in the selfie.";
//       }

//       else if (!documentHeld) {
//         reason =
//           "The identity document does not appear to be physically held.";
//       }

//       else if (
//         !backendDocumentTypeMatches ||
//         !aiDocumentTypeMatches
//       ) {
//         reason =
//           `The selfie document does not match the expected ${expectedDocumentType}.`;
//       }

//       else if (
//         documentNumberConflict
//       ) {
//         reason =
//           "The document number in the selfie does not match the verified document.";
//       }

//       else if (
//         !documentDataMatches
//       ) {
//         reason =
//           "The physical document could not be sufficiently matched to the originally verified document.";
//       }

//       else if (
//         !faceVisuallyConsistent ||
//         !comparison.faceMatch
//       ) {
//         reason =
//           "The face is not visually consistent with the photograph on the verified document.";
//       }

//       else if (
//         !imageQualityGood
//       ) {
//         reason =
//           "Selfie image quality is insufficient for verification.";
//       }

//       else if (!reason) {
//         reason =
//           "Selfie verification failed.";
//       }
//     } else {
//       reason = "";
//     }

//     // ==========================================================
//     // DEBUG LOG
//     // ==========================================================

//     console.log(
//       "============================================================"
//     );

//     console.log(
//       "SELFIE IDENTITY VERIFICATION"
//     );

//     console.log(
//       "============================================================"
//     );

//     console.log({
//       verified,

//       confidence,

//       expectedDocumentType,

//       detectedDocumentType,

//       faceDetected,

//       documentDetected,

//       documentHeld,

//       documentTypeMatches:
//         backendDocumentTypeMatches &&
//         aiDocumentTypeMatches,

//       documentDataMatches,

//       faceVisuallyConsistent,

//       faceMatch:
//         comparison.faceMatch,

//       imageQualityGood,

//       documentNumberReadable,

//       documentNumberMatch:
//         comparison.documentNumberMatch,

//       documentNumberConflict,

//       nameMatch:
//         comparison.nameMatch,

//       dateOfBirthMatch:
//         comparison.dateOfBirthMatch,

//       expiryDateMatch:
//         comparison.expiryDateMatch,

//       issuingCountryMatch:
//         comparison.issuingCountryMatch,

//       nationalityMatch:
//         comparison.nationalityMatch,

//       independentMatchCount,

//       reason,
//     });

//     console.log(
//       "============================================================"
//     );

//     // ==========================================================
//     // FINAL RESULT
//     // ==========================================================

//     return {
//       verified,

//       confidence,

//       // --------------------------------------------------------
//       // DETECTION
//       // --------------------------------------------------------

//       faceDetected,

//       documentDetected,

//       documentHeld,

//       // --------------------------------------------------------
//       // DOCUMENT TYPE
//       // --------------------------------------------------------

//       documentType:
//         detectedDocumentType,

//       documentTypeMatches:
//         backendDocumentTypeMatches &&
//         aiDocumentTypeMatches,

//       // --------------------------------------------------------
//       // DOCUMENT DATA
//       // --------------------------------------------------------

//       documentDataMatches:
//         documentDataMatches &&
//         !documentNumberConflict,

//       // --------------------------------------------------------
//       // FACE
//       // --------------------------------------------------------

//       faceVisuallyConsistent,

//       // --------------------------------------------------------
//       // QUALITY
//       // --------------------------------------------------------

//       imageQualityGood,

//       // --------------------------------------------------------
//       // SELFIE DOCUMENT OCR
//       // --------------------------------------------------------

//       extractedDocumentData,

//       // --------------------------------------------------------
//       // COMPARISON
//       // --------------------------------------------------------

//       comparison,

//       // --------------------------------------------------------
//       // REASON
//       // --------------------------------------------------------

//       reason,
//     };
//   } catch (err) {
//     // ==========================================================
//     // ERROR
//     // ==========================================================

//     console.error(
//       "Gemini Selfie Verification Error:",
//       err
//     );

//     return emptyResult(
//       err?.message ||
//         "Unable to analyze selfie."
//     );
//   }
// }