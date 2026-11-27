import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ============================================================
// EMPTY RESULT
// ============================================================

const emptyResult = (
  reason = "Unable to analyze document."
) => ({
  validDocument: false,

  confidence: 0,

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

  reason,
});

// ============================================================
// CLEAN BASE64
// ============================================================

const cleanBase64 = (base64Image) => {
  if (
    !base64Image ||
    typeof base64Image !== "string"
  ) {
    return "";
  }

  return base64Image
    .replace(
      /^data:image\/[\w.+-]+;base64,/i,
      ""
    )
    .trim();
};

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
// NORMALIZE CONFIDENCE
// ============================================================

const normalizeConfidence = (value) => {
  const number =
    Number(value);

  if (
    Number.isNaN(number)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      number
    )
  );
};

// ============================================================
// NORMALIZE DOCUMENT NUMBER
//
// This does NOT change the stored value.
// It is only useful for internal validation/logging.
//
// Example:
// "AB 123456"
// "AB123456"
//
// Both normalize to:
// "AB123456"
// ============================================================

const normalizeDocumentNumberForComparison = (
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
// NORMALIZE DATE FOR VALIDATION
//
// We intentionally DO NOT convert the date into another format.
// This is only used to determine whether the AI returned
// something obviously empty/invalid.
// ============================================================

const hasUsableDate = (
  value
) => {
  const date =
    normalizeString(value);

  if (!date) {
    return false;
  }

  return /\d/.test(date);
};

// ============================================================
// NORMALIZE RAW OBJECT
// ============================================================

const normalizeRaw = (
  value
) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value;
};

// ============================================================
// EXTRACT DOCUMENT DATA
//
// Purpose:
//
// 1. Determine whether image is a supported identity document.
// 2. Determine document type.
// 3. Extract readable identity information.
// 4. Preserve OCR information for later selfie comparison.
// ============================================================

export default async function extractDocumentData(
  base64Image
) {
  try {
    // ==========================================================
    // VALIDATE IMAGE
    // ==========================================================

    if (!base64Image) {
      return emptyResult(
        "No document image was provided."
      );
    }

    // ==========================================================
    // REMOVE BASE64 PREFIX
    // ==========================================================

    const imageData =
      cleanBase64(
        base64Image
      );

    if (!imageData) {
      return emptyResult(
        "Invalid document image data."
      );
    }

    // ==========================================================
    // PROMPT
    // ==========================================================

    const prompt = `
You are an expert identity-document OCR and document-validation
AI.

Analyze ONE uploaded image.

The image is intended to contain ONE supported identity document.

============================================================
SUPPORTED DOCUMENTS
============================================================

Only these two document types are supported:

1. Passport
2. Driver's Licence / Driving License

Normalize the result to:

"passport"

or:

"license"

No other document type is accepted.

============================================================
UNSUPPORTED DOCUMENTS
============================================================

Reject:

- Selfie without an identity document
- Face photograph
- Aadhaar
- PAN card
- Voter card
- Health card
- Provincial health card
- Social insurance card
- Credit card
- Debit card
- Student card
- Employee card
- Work permit
- Immigration document
- Visa
- Birth certificate
- Marriage certificate
- Random paper
- Screenshot
- Computer screen
- Phone screen
- Photograph of a screen
- Blank image
- Non-document image

Do not relabel an unsupported document as a passport or
driver's licence.

============================================================
IMPORTANT — INSPECT THE ENTIRE IMAGE
============================================================

Before deciding that the image is invalid:

1. Inspect the complete image.
2. Identify the physical document boundaries.
3. Inspect the top, middle and bottom portions.
4. Inspect both sides if both sides are present.
5. Look for document title and country/province indicators.
6. Look for photograph.
7. Look for document number.
8. Look for dates.
9. Look for address.
10. Look for MRZ when applicable.

Do not reject a valid document merely because one field is
blurry or unavailable.

============================================================
DOCUMENT VALIDITY
============================================================

Set:

"validDocument": true

when the image reasonably appears to contain a usable
passport or driver's licence.

The document does NOT need to have every field readable.

For example, a valid document may have:

- glare over one field
- a finger covering one corner
- one field too small to read
- mild blur
- moderate lighting differences

as long as the document itself can still reasonably be
identified and enough information is visible to establish that
it is a supported identity document.

Set:

"validDocument": false

when the document itself cannot reasonably be identified or the
image is so poor that the application cannot use it.

Do NOT claim government-level or cryptographic authenticity.

This is document classification and OCR usability only.

============================================================
DOCUMENT TYPE
============================================================

Return EXACTLY one:

"passport"

"license"

""

If the image is a passport:

documentType = "passport"

If the image is a driver's licence:

documentType = "license"

============================================================
DOCUMENT NUMBER — VERY IMPORTANT
============================================================

The document number is one of the most important identity
fields because it may later be compared against a selfie.

Look carefully for the document number.

For passports, inspect:

- passport number field
- machine-readable zone (MRZ)
- other visible passport identifiers

For driver's licences, inspect:

- licence number
- driver's licence number
- card number
- identifier field

Return the number exactly as visibly printed.

Do NOT:

- invent digits
- guess characters
- add missing characters
- silently replace characters
- use the person's name
- use date of birth as document number
- use an unrelated number

Preserve the original visible formatting where possible.

For example:

"AB 123456"

may be returned as:

"AB 123456"

Do not intentionally insert or remove spaces.

If the document number cannot be reliably read:

"documentNumber": ""

============================================================
OCR RULE
============================================================

Only extract information that is actually visible/readable.

NEVER guess.

NEVER infer.

NEVER copy a value from another field.

NEVER use general knowledge to fill a missing value.

If a field cannot be reliably read:

return:

""

============================================================
NAME
============================================================

Extract:

- fullName
- firstName
- lastName

If the document clearly separates given name and surname,
extract them separately.

If only a full name is visible:

put it into:

"fullName"

and leave firstName/lastName empty if they cannot be reliably
determined.

Do not invent name components.

============================================================
DATE OF BIRTH
============================================================

Extract the date exactly as printed.

Do NOT convert the date format.

For example, if the document shows:

1990-05-21

return:

"1990-05-21"

If the document shows:

21 MAY 1990

return:

"21 MAY 1990"

Do not convert one into the other.

If unreadable:

""

============================================================
ISSUE DATE
============================================================

Extract exactly as visible.

Do not infer.

Do not calculate.

If unavailable:

""

============================================================
EXPIRY DATE
============================================================

Extract exactly as visible.

Do not infer.

Do not calculate.

If unavailable:

""

============================================================
NATIONALITY
============================================================

Only extract nationality when it is explicitly visible.

Do NOT infer nationality from:

- issuing country
- address
- province
- document design

If not explicitly visible:

""

============================================================
ISSUING COUNTRY
============================================================

Extract the issuing country when visible.

Do not infer it from nationality.

If not visible:

""

============================================================
ISSUING PROVINCE / STATE
============================================================

For driver's licences, inspect carefully for the issuing
province or state.

Examples can include:

- Ontario
- Alberta
- British Columbia
- Quebec
- Manitoba
- Saskatchewan
- Nova Scotia

Only return the province/state if supported by the image.

Do not infer province from address or city.

============================================================
ADDRESS
============================================================

Extract the address only if actually visible.

Do not construct an address from:

- city
- province
- postal code
- country

If incomplete, return only what is actually readable.

============================================================
SEX
============================================================

Extract only when explicitly visible.

Do not infer.

============================================================
PLACE OF BIRTH
============================================================

Primarily relevant to passports.

Extract only if visible.

============================================================
DRIVER'S LICENCE FIELDS
============================================================

For a driver's licence, inspect for:

- licence number
- full name
- date of birth
- issue date
- expiry date
- address
- province/state
- sex
- class
- restrictions

For class:

Examples:

G

G2

5

7

Class 1

Class 5

etc.

Return what is actually visible.

For restrictions:

Return visible restriction information only.

Do not invent.

============================================================
PASSPORT FIELDS
============================================================

For passports, inspect for:

- full name
- first name
- last name
- passport number
- date of birth
- issue date
- expiry date
- nationality
- issuing country
- sex
- place of birth
- address if visible
- MRZ

============================================================
MRZ
============================================================

For passports, carefully inspect the machine-readable zone.

If visible and readable, use it as an additional source of
information.

Do not fabricate an MRZ.

If MRZ and printed information conflict, do not silently choose
one.

Return the clearly visible values and mention the conflict in
raw if appropriate.

============================================================
OCR QUALITY
============================================================

A document can still be valid even if some OCR fields are empty.

Do not make:

validDocument=false

only because one field is unreadable.

The validity decision is primarily about whether this is a
supported identity document that can reasonably be used by the
application.

============================================================
CONFIDENCE
============================================================

Return confidence from 0 to 100.

Confidence should represent confidence in:

- document classification
- document visibility
- OCR reliability

Suggested interpretation:

90-100:
Very clear supported document with strong OCR.

75-89:
Clearly identifiable document with mostly reliable OCR.

60-74:
Supported document but some fields are difficult to read.

40-59:
Weak document quality or significant OCR uncertainty.

0-39:
Document cannot reliably be identified or read.

Do not automatically return 100.

============================================================
RAW
============================================================

raw may contain additional useful information that does not
fit the standard fields.

Examples:

- MRZ
- visible card title
- issuing authority
- other document identifiers
- OCR notes
- detected field labels

Do not duplicate every standard field unnecessarily.

============================================================
IMPORTANT SECURITY RULE
============================================================

Do not claim:

- government-level authenticity
- cryptographic authenticity
- guaranteed document authenticity
- biometric verification
- liveness verification

You are performing document classification and OCR only.

============================================================
RETURN FORMAT
============================================================

Return JSON ONLY.

No markdown.

No explanation.

No code fences.

For a valid document:

{
  "validDocument": true,
  "confidence": 0,
  "documentType": "passport",

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

  "raw": {},

  "reason": ""
}

For an invalid document:

{
  "validDocument": false,
  "confidence": 0,
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

  "raw": {},

  "reason": ""
}

============================================================
FINAL REQUIREMENT
============================================================

Return ONLY valid JSON.
`;

    // ==========================================================
    // GEMINI REQUEST
    // ==========================================================

    const response =
      await ai.models.generateContent({
        model: "gemini-2.5-flash",

        contents: [
          // ----------------------------------------------------
          // DOCUMENT IMAGE
          // ----------------------------------------------------

          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageData,
            },
          },

          // ----------------------------------------------------
          // INSTRUCTIONS
          // ----------------------------------------------------

          {
            text: prompt,
          },
        ],

        config: {
          responseMimeType:
            "application/json",

          temperature: 0,
        },
      });

    // ==========================================================
    // GET RESPONSE TEXT
    // ==========================================================

    let text =
      response?.text?.trim();

    if (!text) {
      throw new Error(
        "Gemini returned an empty response."
      );
    }

    // ==========================================================
    // CLEAN POSSIBLE MARKDOWN
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
    } catch (parseError) {
      console.error(
        "Gemini Document JSON Parse Error:",
        parseError
      );

      console.error(
        "Gemini Document Raw Response:",
        text
      );

      return emptyResult(
        "Unable to read the AI document verification response."
      );
    }

    // ==========================================================
    // NORMALIZE DOCUMENT TYPE
    // ==========================================================

    const documentType =
      normalizeDocumentType(
        data?.documentType
      );

    // ==========================================================
    // NORMALIZE CONFIDENCE
    // ==========================================================

    const confidence =
      normalizeConfidence(
        data?.confidence
      );

    // ==========================================================
    // NORMALIZE OCR VALUES
    // ==========================================================

    const fullName =
      normalizeString(
        data?.fullName
      );

    const firstName =
      normalizeString(
        data?.firstName
      );

    const lastName =
      normalizeString(
        data?.lastName
      );

    const documentNumber =
      normalizeString(
        data?.documentNumber
      );

    const dateOfBirth =
      normalizeString(
        data?.dateOfBirth
      );

    const issueDate =
      normalizeString(
        data?.issueDate
      );

    const expiryDate =
      normalizeString(
        data?.expiryDate
      );

    const nationality =
      normalizeString(
        data?.nationality
      );

    const issuingCountry =
      normalizeString(
        data?.issuingCountry
      );

    const issuingProvince =
      normalizeString(
        data?.issuingProvince
      );

    const address =
      normalizeString(
        data?.address
      );

    const sex =
      normalizeString(
        data?.sex
      );

    const placeOfBirth =
      normalizeString(
        data?.placeOfBirth
      );

    const licenceClass =
      normalizeString(
        data?.class
      );

    const restrictions =
      normalizeString(
        data?.restrictions
      );

    const raw =
      normalizeRaw(
        data?.raw
      );

    // ==========================================================
    // VALID DOCUMENT FLAG
    // ==========================================================

    const aiValidDocument =
      data?.validDocument === true;

    // ==========================================================
    // DOCUMENT TYPE VALIDATION
    // ==========================================================

    if (
      !aiValidDocument ||
      !documentType
    ) {
      return {
        validDocument: false,

        confidence,

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

        raw,

        reason:
          normalizeString(
            data?.reason
          ) ||
          "Uploaded image is not a valid Passport or Driver's Licence.",
      };
    }

    // ==========================================================
    // BASIC DOCUMENT NUMBER SANITY CHECK
    //
    // We don't reject the document because a number is missing.
    //
    // However, if Gemini returned something that is clearly
    // unusable, do not pretend it is a reliable number.
    // ==========================================================

    let finalDocumentNumber =
      documentNumber;

    if (
      finalDocumentNumber
    ) {
      const normalizedNumber =
        normalizeDocumentNumberForComparison(
          finalDocumentNumber
        );

      if (
        normalizedNumber.length < 2
      ) {
        finalDocumentNumber = "";
      }
    }

    // ==========================================================
    // DATE SANITY
    //
    // We do not transform dates.
    //
    // This only protects against obviously empty/invalid
    // values being treated as meaningful.
    // ==========================================================

    const finalDateOfBirth =
      hasUsableDate(
        dateOfBirth
      )
        ? dateOfBirth
        : "";

    const finalIssueDate =
      hasUsableDate(
        issueDate
      )
        ? issueDate
        : "";

    const finalExpiryDate =
      hasUsableDate(
        expiryDate
      )
        ? expiryDate
        : "";

    // ==========================================================
    // FINAL RESULT
    // ==========================================================

    return {
      validDocument: true,

      confidence,

      // --------------------------------------------------------
      // DOCUMENT TYPE
      // --------------------------------------------------------

      documentType,

      // --------------------------------------------------------
      // NAME
      // --------------------------------------------------------

      fullName,

      firstName,

      lastName,

      // --------------------------------------------------------
      // DOCUMENT NUMBER
      // --------------------------------------------------------

      documentNumber:
        finalDocumentNumber,

      // --------------------------------------------------------
      // DATES
      // --------------------------------------------------------

      dateOfBirth:
        finalDateOfBirth,

      issueDate:
        finalIssueDate,

      expiryDate:
        finalExpiryDate,

      // --------------------------------------------------------
      // NATIONALITY
      // --------------------------------------------------------

      nationality,

      // --------------------------------------------------------
      // ISSUING INFORMATION
      // --------------------------------------------------------

      issuingCountry,

      issuingProvince,

      // --------------------------------------------------------
      // ADDRESS
      // --------------------------------------------------------

      address,

      // --------------------------------------------------------
      // PERSONAL
      // --------------------------------------------------------

      sex,

      placeOfBirth,

      // --------------------------------------------------------
      // LICENCE
      // --------------------------------------------------------

      class:
        licenceClass,

      restrictions,

      // --------------------------------------------------------
      // RAW
      // --------------------------------------------------------

      raw,

      // --------------------------------------------------------
      // REASON
      // --------------------------------------------------------

      reason:
        normalizeString(
          data?.reason
        ),
    };
  } catch (err) {
    // ==========================================================
    // ERROR
    // ==========================================================

    console.error(
      "Gemini Document OCR Error:",
      err
    );

    return emptyResult(
      err?.message ||
        "Unable to analyze document."
    );
  }
}