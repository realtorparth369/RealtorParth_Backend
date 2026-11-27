import express from "express";
import nodemailer from "nodemailer";
import sharp from "sharp";

import Transaction from "../models/Transaction.js";
import TransactionParty from "../models/TransactionParty.js";

import extractDocumentData from "../utils/extractDocumentData.js";
import verifySelfieAgainstDocument from "../utils/verifySelfieAgainstDocument.js";

import multer from "multer";


const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
  },
});

const router = express.Router();

// ============================================================
// EMAIL SETUP
//
// IMPORTANT:
// Keep SMTP credentials in environment variables.
//
// .env example:
//
// BREVO_SMTP_HOST=smtp-relay.brevo.com
// BREVO_SMTP_PORT=587
// BREVO_SMTP_SECURE=false
// BREVO_SMTP_USER=your-smtp-user
// BREVO_SMTP_PASSWORD=your-smtp-password
// EMAIL_FROM="RealtorParth <noreply@yourdomain.com>"
// FRONTEND_URL=https://realtorparth.ca
// ============================================================

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_PASSWORD,
  },
});


// ============================================================
// SEND PARTY EMAIL
// ============================================================

const sendPartyEmail = async (party) => {
  try {
    const frontendUrl =
      process.env.FRONTEND_URL || "https://realtorparth.ca";

    const link =
      `${frontendUrl}/party/onboarding/${party._id}`;

    await transporter.sendMail({
      from:
        process.env.EMAIL_FROM ||
        '"RealtorParth" <hello@realtorparth.ca>',

      to: party.email,

      subject:
        "Complete Your Transaction Verification",

      html: `
<!DOCTYPE html>
<html>

<head>
  <meta charset="UTF-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f4f6f9;
    font-family:Arial,Helvetica,sans-serif;
  "
>

<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  style="
    background:#f4f6f9;
    padding:40px 0;
  "
>

<tr>

<td align="center">

<table
  width="600"
  cellpadding="0"
  cellspacing="0"
  style="
    max-width:600px;
    width:100%;
    background:#ffffff;
    border-radius:12px;
    overflow:hidden;
    box-shadow:0 6px 20px rgba(0,0,0,.08);
  "
>

<!-- HEADER -->

<tr>

<td
  style="
    background:#0f4c81;
    padding:28px;
    text-align:center;
  "
>

<h1
  style="
    margin:0;
    color:#ffffff;
    font-size:28px;
    font-weight:700;
  "
>
RealtorParth
</h1>

</td>

</tr>

<!-- BODY -->

<tr>

<td style="padding:40px;">

<h2
  style="
    margin-top:0;
    color:#222;
    font-size:26px;
  "
>
Hello ${party.name},
</h2>

<p
  style="
    font-size:16px;
    color:#555;
    line-height:28px;
  "
>
You have been added as a participant in a
<strong>RealtorParth transaction</strong>.
</p>

<p
  style="
    font-size:16px;
    color:#555;
    line-height:28px;
  "
>
Before accessing your transaction documents,
we need to verify your identity.

Please click the button below to securely
complete your verification.
</p>

<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  style="margin:35px 0;"
>

<tr>

<td align="center">

<a
  href="${link}"
  style="
    background:#0f4c81;
    color:#ffffff;
    text-decoration:none;
    padding:16px 36px;
    border-radius:8px;
    display:inline-block;
    font-size:16px;
    font-weight:600;
  "
>
Verify Your Identity
</a>

</td>

</tr>

</table>

<div
  style="
    background:#f8f9fb;
    border-left:4px solid #0f4c81;
    padding:18px;
    border-radius:6px;
  "
>

<p
  style="
    margin:0;
    color:#555;
    font-size:15px;
    line-height:24px;
  "
>
If the button above does not work, copy and
paste the following link into your browser:
</p>

<p
  style="
    margin-top:12px;
    word-break:break-all;
  "
>

<a
  href="${link}"
  style="color:#0f4c81;"
>
${link}
</a>

</p>

</div>

<p
  style="
    margin-top:35px;
    font-size:15px;
    color:#555;
    line-height:26px;
  "
>

<strong>Important:</strong>
This verification link is unique to you and
should not be shared with anyone else.

</p>

<p
  style="
    margin-top:15px;
    font-size:15px;
    color:#555;
    line-height:26px;
  "
>
Once your identity has been verified, you will
be able to review and complete any required
documents for your transaction.
</p>

<p
  style="
    margin-top:35px;
    font-size:16px;
    color:#222;
  "
>
Kind Regards,<br>

<strong>RealtorParth Team</strong>

</p>

</td>

</tr>

<!-- FOOTER -->

<tr>

<td
  style="
    background:#f7f7f7;
    padding:22px;
    text-align:center;
    color:#777;
    font-size:13px;
    line-height:22px;
  "
>

This is an automated email from RealtorParth.
<br>

Please do not reply directly to this email.

</td>

</tr>

</table>

</td>

</tr>

</table>

</body>

</html>
`,
    });

    console.log("================================");
    console.log("EMAIL SEND RESULT");
    console.log("TO:", party.email);
    console.log("MESSAGE ID:", info.messageId);
    console.log("RESPONSE:", info.response);
    console.log("ACCEPTED:", info.accepted);
    console.log("REJECTED:", info.rejected);
    console.log("================================");
    console.log(
      `Verification email sent to ${party.email}`
    );
  } catch (error) {
    console.error(
      "SEND PARTY EMAIL ERROR:",
      error
    );
  }
};





// ========================================================
// SEND EMAIL FROM TRANSACTION PARTY PANEL
// POST /send-email
//
// Final URL:
// POST /api/transactions/parties/send-email
// ========================================================

router.post(
  "/send-email",
  upload.array("attachments"),
  async (req, res) => {
    try {
      console.log("================================");
      console.log("TRANSACTION PARTY SEND EMAIL");
      console.log("================================");

      const {
        subject,
        message,
        transactionId,
      } = req.body;

      // ----------------------------------------------------
      // GET RECIPIENTS
      //
      // Frontend sends:
      //
      // formData.append("to", email)
      // formData.append("to", email)
      //
      // So req.body.to can be either:
      // string
      // OR
      // array
      // ----------------------------------------------------

      let recipients = [];

      if (Array.isArray(req.body.to)) {
        recipients = req.body.to;
      } else if (req.body.to) {
        recipients = [req.body.to];
      }

      // ----------------------------------------------------
      // VALIDATE RECIPIENTS
      // ----------------------------------------------------

      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one recipient is required.",
        });
      }

      // ----------------------------------------------------
      // CLEAN EMAILS
      // ----------------------------------------------------

      recipients = recipients
        .map((email) => String(email).trim())
        .filter(Boolean);

      // ----------------------------------------------------
      // VALIDATE EMAIL FORMAT
      // ----------------------------------------------------

      const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      const invalidEmails =
        recipients.filter(
          (email) => !emailRegex.test(email)
        );

      if (invalidEmails.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid email address.",
          invalidEmails,
        });
      }

      // ----------------------------------------------------
      // SUBJECT
      // ----------------------------------------------------

      if (!subject || !String(subject).trim()) {
        return res.status(400).json({
          success: false,
          message: "Email subject is required.",
        });
      }

      // ----------------------------------------------------
      // MESSAGE
      // ----------------------------------------------------

      if (!message || !String(message).trim()) {
        return res.status(400).json({
          success: false,
          message: "Email message is required.",
        });
      }

      // ----------------------------------------------------
      // OPTIONAL TRANSACTION VALIDATION
      // ----------------------------------------------------

      let transaction = null;

      if (transactionId) {
        if (
          !mongoose.Types.ObjectId.isValid(
            transactionId
          )
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid transaction ID.",
          });
        }

        transaction =
          await Transaction.findById(
            transactionId
          );

        if (!transaction) {
          return res.status(404).json({
            success: false,
            message: "Transaction not found.",
          });
        }
      }

      // ----------------------------------------------------
      // ATTACHMENTS
      // ----------------------------------------------------

      const files = req.files || [];

      const attachments = files.map(
        (file) => ({
          filename: file.originalname,
          content: file.buffer,
          contentType: file.mimetype,
        })
      );

      // ----------------------------------------------------
      // EMAIL HTML
      // ----------------------------------------------------

      const htmlMessage =
        String(message)
          .replace(/\r\n/g, "\n")
          .replace(/\n/g, "<br>");

      // ----------------------------------------------------
      // SEND EMAIL
      // ----------------------------------------------------

      const info =
        await transporter.sendMail({
          from:
            process.env.EMAIL_FROM
              ? `"RealtorParth" <${process.env.EMAIL_FROM}>`
              : '"RealtorParth" <hello@realtorparth.ca>',

          to: recipients,

          subject:
            String(subject).trim(),

          text:
            String(message).trim(),

          html: `
            <div
              style="
                font-family: Arial, sans-serif;
                font-size: 16px;
                line-height: 1.6;
                color: #333;
              "
            >
              ${htmlMessage}
            </div>
          `,

          attachments,
        });

      // ----------------------------------------------------
      // LOG
      // ----------------------------------------------------

      console.log(
        "EMAIL SENT SUCCESSFULLY"
      );

      console.log(
        "Recipients:",
        recipients
      );

      console.log(
        "Subject:",
        subject
      );

      console.log(
        "Transaction ID:",
        transactionId || "N/A"
      );

      console.log(
        "Attachments:",
        files.map(
          (file) =>
            `${file.originalname} (${file.size} bytes)`
        )
      );

      console.log(
        "Message ID:",
        info.messageId
      );

      console.log(
        "Response:",
        info.response
      );

      console.log("================================");

      // ----------------------------------------------------
      // RESPONSE
      // ----------------------------------------------------

      return res.status(200).json({
        success: true,
        message:
          "Email sent successfully.",

        messageId:
          info.messageId || null,

        recipients,

        attachmentCount:
          attachments.length,

        transactionId:
          transactionId || null,
      });
    } catch (error) {
      console.error(
        "================================"
      );

      console.error(
        "SEND TRANSACTION EMAIL ERROR:"
      );

      console.error(error);

      console.error(
        "================================"
      );

      return res.status(500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to send email.",
      });
    }
  }
);


// ============================================================
// SAVE PARTIES
// ============================================================

router.post(
  "/save",
  async (req, res) => {
    try {
      const {
        transactionId,
        parties,
        userId,
      } = req.body;

      // ======================================================
      // VALIDATE INPUT
      // ======================================================

      if (!transactionId) {
        return res.status(400).json({
          success: false,
          message: "Missing transactionId",
        });
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "Missing userId",
        });
      }

      if (!Array.isArray(parties)) {
        return res.status(400).json({
          success: false,
          message: "Invalid parties data",
        });
      }

      // ======================================================
      // FIND TRANSACTION
      // ======================================================

      const transaction =
        await Transaction.findOne({
          _id: transactionId,
          userId,
        });

      if (!transaction) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const savedParties = [];

      // ======================================================
      // LOOP PARTIES
      // ======================================================

      for (const p of parties) {
        let party;

        // ====================================================
        // UPDATE EXISTING PARTY
        // ====================================================

        if (p._id) {
          party =
            await TransactionParty.findOneAndUpdate(
              {
                _id: p._id,
                transactionId,
                userId,
              },
              {
                name: p.name,
                email: p.email,
                phone: p.phone,
                role: p.role,
                userId,
              },
              {
                new: true,
              }
            );
        }

        // ====================================================
        // CREATE NEW PARTY
        // ====================================================

        else {
          party =
            await TransactionParty.create({
              transactionId,
              userId,
              name: p.name,
              email: p.email,
              phone: p.phone,
              role: p.role,
            });

          // ==================================================
          // SEND EMAIL ONLY FOR NEW PARTY
          // ==================================================

          sendPartyEmail(party);
        }

        if (party) {
          savedParties.push(party);
        }
      }

      return res.json({
        success: true,
        parties: savedParties,
      });

    } catch (error) {
      console.error(
        "SAVE PARTIES ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Failed to save parties",
      });
    }
  }
);

// ============================================================
// GET PARTY SETTINGS
// ============================================================

router.get(
  "/transactionParty/settings/:partyId",
  async (req, res) => {
    try {
      const partysettings =
        await TransactionParty.findById(
          req.params.partyId
        );

      if (!partysettings) {
        return res.status(404).json({
          success: false,
          message: "Party not found",
        });
      }

      return res.json({
        success: true,
        data: partysettings,
      });

    } catch (err) {
      console.error(
        "GET PARTY SETTINGS ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        message:
          err.message ||
          "Unable to load party settings",
      });
    }
  }
);

// ============================================================
// GET SINGLE PARTY
// ============================================================

router.get(
  "/party/:id",
  async (req, res) => {
    try {
      const party =
        await TransactionParty.findById(
          req.params.id
        );

      if (!party) {
        return res.status(404).json({
          success: false,
          message: "Invalid link",
        });
      }

      return res.json({
        success: true,
        party,
      });

    } catch (error) {
      console.error(
        "GET PARTY ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Unable to load party",
      });
    }
  }
);

// ============================================================
// GET PARTIES
// ============================================================

router.get(
  "/:transactionId/:userId",
  async (req, res) => {
    try {
      const transaction =
        await Transaction.findOne({
          _id: req.params.transactionId,
          userId: req.params.userId,
        });

      if (!transaction) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const parties =
        await TransactionParty.find({
          transactionId:
            req.params.transactionId,
        });

      return res.json({
        success: true,
        parties,
      });

    } catch (error) {
      console.error(
        "GET PARTIES ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Unable to load parties",
      });
    }
  }
);

// ============================================================
// DELETE PARTY
// ============================================================

router.delete(
  "/:id/:userId",
  async (req, res) => {
    try {
      const party =
        await TransactionParty.findById(
          req.params.id
        );

      if (!party) {
        return res.status(404).json({
          success: false,
          message: "Party not found",
        });
      }

      const transaction =
        await Transaction.findOne({
          _id: party.transactionId,
          userId: req.params.userId,
        });

      if (!transaction) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized",
        });
      }

      await TransactionParty.findByIdAndDelete(
        req.params.id
      );

      return res.json({
        success: true,
      });

    } catch (error) {
      console.error(
        "DELETE PARTY ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Unable to delete party",
      });
    }
  }
);

// ============================================================
// HELPER — EMPTY DOCUMENT DATA
// ============================================================

const emptyDocumentData = () => ({
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

  reason: "",
});

// ============================================================
// HELPER — EMPTY DOCUMENT VERIFICATION
// ============================================================

const emptyDocumentVerification = () => ({
  uploaded: false,

  verified: false,

  confidence: 0,

  verifiedAt: null,
});

// ============================================================
// HELPER — NORMALIZE DOCUMENT TYPE
// ============================================================

const normalizeDocumentType = (value) => {
  const type =
    String(value || "")
      .trim()
      .toLowerCase();

  if (type.includes("passport")) {
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
// HELPER — REMOVE BASE64 PREFIX
// ============================================================

const cleanBase64 = (base64) => {
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
// HELPER — COMPRESS DOCUMENT IMAGE
//
// Documents:
// - max width 1000px
// - JPEG quality 70
// ============================================================

const compressDocumentImage = async (base64) => {
  if (!base64) {
    return "";
  }

  try {
    const clean =
      cleanBase64(base64);

    if (!clean) {
      throw new Error(
        "Invalid image data"
      );
    }

    const buffer =
      Buffer.from(
        clean,
        "base64"
      );

    if (!buffer.length) {
      throw new Error(
        "Invalid image data"
      );
    }

    const compressed =
      await sharp(buffer)
        .resize({
          width: 1000,
          withoutEnlargement: true,
        })
        .jpeg({
          quality: 70,
          mozjpeg: true,
        })
        .toBuffer();

    return (
      "data:image/jpeg;base64," +
      compressed.toString("base64")
    );

  } catch (error) {
    console.error(
      "DOCUMENT IMAGE COMPRESSION ERROR:",
      error
    );

    throw new Error(
      "Unable to process uploaded document image."
    );
  }
};

// ============================================================
// HELPER — COMPRESS SELFIE IMAGE
//
// Selfie:
// - max width 1600px
// - JPEG quality 88
// ============================================================

const compressSelfieImage = async (base64) => {
  if (!base64) {
    return "";
  }

  try {
    const clean =
      cleanBase64(base64);

    if (!clean) {
      throw new Error(
        "Invalid selfie image data"
      );
    }

    const buffer =
      Buffer.from(
        clean,
        "base64"
      );

    if (!buffer.length) {
      throw new Error(
        "Invalid selfie image data"
      );
    }

    const compressed =
      await sharp(buffer)
        .resize({
          width: 1600,
          withoutEnlargement: true,
        })
        .jpeg({
          quality: 88,
          mozjpeg: true,
        })
        .toBuffer();

    return (
      "data:image/jpeg;base64," +
      compressed.toString("base64")
    );

  } catch (error) {
    console.error(
      "SELFIE IMAGE COMPRESSION ERROR:",
      error
    );

    throw new Error(
      "Unable to process selfie image."
    );
  }
};

// ============================================================
// HELPER — EMPTY SELFIE VERIFICATION
//
// There is ALWAYS exactly ONE selfie.
//
// IMPORTANT:
// selfieImage is also cleared when the selfie is invalidated.
// ============================================================

const emptySelfieVerification = () => ({
  // Actual saved selfie image
  selfieImage: "",

  uploaded: false,

  verified: false,

  documentType: null,

  faceDetected: false,

  documentDetected: false,

  documentHeld: false,

  documentTypeMatches: false,

  documentDataMatches: false,

  faceVisuallyConsistent: false,

  imageQualityGood: false,

  confidence: 0,

  extractedDocumentData: {
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
  },

  comparison: {
    documentNumberMatch: false,
    nameMatch: false,
    dateOfBirthMatch: false,
    expiryDateMatch: false,
    documentTypeMatch: false,
    issuingCountryMatch: false,
    nationalityMatch: false,
    faceMatch: false,
  },

  verifiedAt: null,
});

// ============================================================
// UPLOAD + AUTOMATICALLY VERIFY DOCUMENTS
//
// Flow:
//
// Upload document
//      ↓
// Compress image
//      ↓
// AI OCR / verification
//      ↓
// Save verified document
//      ↓
// Reset old selfie
//      ↓
// Selfie required
// ============================================================

router.post(
  "/upload-documents",
  async (req, res) => {
    try {
      const {
        partyId,
        licenseImage,
        passportImage,
      } = req.body;

      // ======================================================
      // VALIDATE PARTY ID
      // ======================================================

      if (!partyId) {
        return res.status(400).json({
          success: false,
          message: "Missing partyId",
        });
      }

      // ======================================================
      // FIND PARTY
      // ======================================================

      const party =
        await TransactionParty.findById(
          partyId
        );

      if (!party) {
        return res.status(404).json({
          success: false,
          message: "Party not found",
        });
      }

      // ======================================================
      // AT LEAST ONE IMAGE
      // ======================================================

      if (
        !licenseImage &&
        !passportImage
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Please upload at least one identity document.",
        });
      }

      // ======================================================
      // COMPRESS SUBMITTED IMAGES
      // ======================================================

      let compressedLicense = "";
      let compressedPassport = "";

      try {
        [
          compressedLicense,
          compressedPassport,
        ] = await Promise.all([
          licenseImage
            ? compressDocumentImage(
                licenseImage
              )
            : Promise.resolve(""),

          passportImage
            ? compressDocumentImage(
                passportImage
              )
            : Promise.resolve(""),
        ]);

      } catch (error) {
        return res.status(400).json({
          success: false,
          message:
            error.message ||
            "Unable to process uploaded images.",
        });
      }

      // ======================================================
      // AI EXTRACTION
      // ======================================================

      let licenseData =
        emptyDocumentData();

      let passportData =
        emptyDocumentData();

      // ======================================================
      // AUTOMATIC LICENCE VERIFICATION
      // ======================================================

      if (compressedLicense) {
        try {
          console.log(
            `Starting automatic Driving Licence verification for party ${partyId}`
          );

          licenseData =
            await extractDocumentData(
              compressedLicense
            );

          console.log(
            "Driving Licence AI verification completed."
          );

        } catch (error) {
          console.error(
            "LICENSE OCR FAILED:",
            error
          );

          licenseData = {
            ...emptyDocumentData(),

            reason:
              "Unable to analyze Driving Licence.",
          };
        }
      }

      // ======================================================
      // AUTOMATIC PASSPORT VERIFICATION
      // ======================================================

      if (compressedPassport) {
        try {
          console.log(
            `Starting automatic Passport verification for party ${partyId}`
          );

          passportData =
            await extractDocumentData(
              compressedPassport
            );

          console.log(
            "Passport AI verification completed."
          );

        } catch (error) {
          console.error(
            "PASSPORT OCR FAILED:",
            error
          );

          passportData = {
            ...emptyDocumentData(),

            reason:
              "Unable to analyze Passport.",
          };
        }
      }

      // ======================================================
      // RESULT OBJECT
      // ======================================================

      const documentResults = {
        license: {
          uploaded: false,
          valid: false,
          verified: false,
          confidence: 0,
          message: "",
        },

        passport: {
          uploaded: false,
          valid: false,
          verified: false,
          confidence: 0,
          message: "",
        },
      };

      // ======================================================
      // VALIDATE LICENCE RESULT
      // ======================================================

      if (compressedLicense) {
        documentResults.license.uploaded =
          true;

        const validDocument =
          licenseData?.validDocument === true;

        const detectedType =
          normalizeDocumentType(
            licenseData?.documentType
          );

        const correctType =
          detectedType === "license";

        const valid =
          validDocument &&
          correctType;

        documentResults.license.valid =
          valid;

        documentResults.license.verified =
          valid;

        documentResults.license.confidence =
          Number(
            licenseData?.confidence
          ) || 0;

        if (!validDocument) {
          documentResults.license.message =
            licenseData?.reason ||
            "Please upload a valid Driving Licence.";

        } else if (!correctType) {
          documentResults.license.message =
            "The uploaded document is not a Driving Licence.";

        } else {
          documentResults.license.message =
            "Driving Licence verified successfully.";
        }
      }

      // ======================================================
      // VALIDATE PASSPORT RESULT
      // ======================================================

      if (compressedPassport) {
        documentResults.passport.uploaded =
          true;

        const validDocument =
          passportData?.validDocument === true;

        const detectedType =
          normalizeDocumentType(
            passportData?.documentType
          );

        const correctType =
          detectedType === "passport";

        const valid =
          validDocument &&
          correctType;

        documentResults.passport.valid =
          valid;

        documentResults.passport.verified =
          valid;

        documentResults.passport.confidence =
          Number(
            passportData?.confidence
          ) || 0;

        if (!validDocument) {
          documentResults.passport.message =
            passportData?.reason ||
            "Please upload a valid Passport.";

        } else if (!correctType) {
          documentResults.passport.message =
            "The uploaded document is not a Passport.";

        } else {
          documentResults.passport.message =
            "Passport verified successfully.";
        }
      }

      // ======================================================
      // CHECK NEW DOCUMENTS
      // ======================================================

      const licenseValid =
        documentResults.license.valid === true;

      const passportValid =
        documentResults.passport.valid === true;

      const atLeastOneNewDocumentValid =
        licenseValid ||
        passportValid;

      // ======================================================
      // EXISTING VERIFIED DOCUMENTS
      // ======================================================

      const existingLicenseVerified =
        Boolean(
          party.identityVerification
            ?.documents
            ?.license
            ?.verified
        );

      const existingPassportVerified =
        Boolean(
          party.identityVerification
            ?.documents
            ?.passport
            ?.verified
        );

      // ======================================================
      // IF NOTHING NEW PASSED
      //
      // IMPORTANT:
      //
      // Do NOT destroy the previous verified document.
      // ======================================================

      if (!atLeastOneNewDocumentValid) {
        const hasExistingVerifiedDocument =
          existingLicenseVerified ||
          existingPassportVerified;

        return res.status(400).json({
          success: false,

          message:
            hasExistingVerifiedDocument
              ? "The new document could not be verified. Your previously verified document remains unchanged."
              : "No valid identity document was uploaded.",

          documents:
            documentResults,

          identityVerification:
            party.identityVerification || null,

          nextStep:
            hasExistingVerifiedDocument
              ? "selfie"
              : "document",
        });
      }

      // ======================================================
      // INITIALIZE IDENTITY DATA
      // ======================================================

      if (!party.identityData) {
        party.identityData = {};
      }

      if (!party.identityData.passport) {
        party.identityData.passport =
          emptyDocumentData();
      }

      if (!party.identityData.license) {
        party.identityData.license =
          emptyDocumentData();
      }

      // ======================================================
      // INITIALIZE IDENTITY VERIFICATION
      // ======================================================

      if (!party.identityVerification) {
        party.identityVerification = {};
      }

      if (
        !party.identityVerification.documents
      ) {
        party.identityVerification.documents =
          {};
      }

      if (
        !party.identityVerification.documents
          .license
      ) {
        party.identityVerification.documents.license =
          emptyDocumentVerification();
      }

      if (
        !party.identityVerification.documents
          .passport
      ) {
        party.identityVerification.documents.passport =
          emptyDocumentVerification();
      }

      // ======================================================
      // RESET SINGLE SELFIE
      //
      // A changed/replaced verified document requires a new
      // selfie.
      //
      // This ALSO clears the old actual selfie image.
      // ======================================================

      party.identityVerification.selfie =
        emptySelfieVerification();

      // ======================================================
      // SAVE VERIFIED LICENCE
      // ======================================================

      if (
        compressedLicense &&
        licenseValid
      ) {
        party.licenseImage =
          compressedLicense;

        party.identityData.license =
          licenseData;

        party.identityVerification.documents.license =
          {
            uploaded: true,

            verified: true,

            confidence:
              Number(
                licenseData?.confidence
              ) || 0,

            verifiedAt:
              new Date(),
          };

        console.log(
          "Driving Licence saved as VERIFIED."
        );

        console.log(
          "Licence OCR:",
          licenseData
        );
      }

      // ======================================================
      // SAVE VERIFIED PASSPORT
      // ======================================================

      if (
        compressedPassport &&
        passportValid
      ) {
        party.passportImage =
          compressedPassport;

        party.identityData.passport =
          passportData;

        party.identityVerification.documents.passport =
          {
            uploaded: true,

            verified: true,

            confidence:
              Number(
                passportData?.confidence
              ) || 0,

            verifiedAt:
              new Date(),
          };

        console.log(
          "Passport saved as VERIFIED."
        );

        console.log(
          "Passport OCR:",
          passportData
        );
      }

      // ======================================================
      // DETERMINE FINAL VERIFIED DOCUMENTS
      // ======================================================

      const verifiedLicense =
        Boolean(
          party.identityVerification
            ?.documents
            ?.license
            ?.verified
        );

      const verifiedPassport =
        Boolean(
          party.identityVerification
            ?.documents
            ?.passport
            ?.verified
        );

      // ======================================================
      // FINAL SAFETY CHECK
      // ======================================================

      if (
        !verifiedLicense &&
        !verifiedPassport
      ) {
        return res.status(400).json({
          success: false,

          message:
            "No verified identity document is available.",

          documents:
            documentResults,
        });
      }

      // ======================================================
      // DOCUMENT VERIFICATION COMPLETE
      //
      // Exactly ONE selfie is now required.
      // ======================================================

      party.identityVerification.status =
        "selfie_pending";

      party.identityVerification.failureReason =
        "";

      party.identityVerification.verifiedAt =
        null;

      // ======================================================
      // SAVE
      // ======================================================

      await party.save();

      // ======================================================
      // RESPONSE
      // ======================================================

      return res.json({
        success: true,

        message:
          "Document verification completed. Please complete the required selfie verification.",

        documents:
          documentResults,

        identityData:
          party.identityData,

        identityVerification: {
          status:
            party.identityVerification.status,

          documents:
            party.identityVerification.documents,

          selfie:
            party.identityVerification.selfie,
        },

        nextStep:
          "selfie",
      });

    } catch (error) {
      console.error(
        "UPLOAD DOCUMENTS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          error.message ||
          "Internal Server Error",
      });
    }
  }
);

// ============================================================
// VALIDATE ONE SELFIE
//
// EXACT FLOW:
//
// Verified Document(s)
//        ↓
// Choose ONE verified document
//        ↓
// Take ONE selfie
//        ↓
// AI verification
//        ↓
// Save selfie image + result
//        ↓
// VERIFIED
//        ↓
// FINTRAC
// ============================================================

router.post(
  "/validate-selfie",
  async (req, res) => {
    try {
      const {
        partyId,
        documentType,
        selfie,
      } = req.body;

      // ======================================================
      // VALIDATE PARTY ID
      // ======================================================

      if (!partyId) {
        return res.status(400).json({
          success: false,
          message: "Missing partyId.",
        });
      }

      // ======================================================
      // VALIDATE SELFIE
      // ======================================================

      if (!selfie) {
        return res.status(400).json({
          success: false,
          message:
            "Please provide a selfie image.",
        });
      }

      // ======================================================
      // NORMALIZE DOCUMENT TYPE
      // ======================================================

      const normalizedDocumentType =
        normalizeDocumentType(
          documentType
        );

      if (
        normalizedDocumentType !== "license" &&
        normalizedDocumentType !== "passport"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "documentType must be either license or passport.",
        });
      }

      // ======================================================
      // FIND PARTY
      // ======================================================

      const party =
        await TransactionParty.findById(
          partyId
        );

      if (!party) {
        return res.status(404).json({
          success: false,
          message: "Party not found.",
        });
      }

      // ======================================================
      // CHECK IDENTITY VERIFICATION
      // ======================================================

      if (
        !party.identityVerification
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Identity verification has not been started.",
          nextStep: "document",
        });
      }

      // ======================================================
      // CHECK SELECTED DOCUMENT
      //
      // The selected document MUST already be verified.
      // ======================================================

      const selectedDocumentVerification =
        party.identityVerification
          ?.documents
          ?.[normalizedDocumentType];

      if (
        !selectedDocumentVerification
          ?.verified
      ) {
        return res.status(400).json({
          success: false,

          message:
            `The selected ${normalizedDocumentType} has not been verified. Please submit a verified document first.`,

          nextStep:
            "document",
        });
      }

      // ======================================================
      // GET ORIGINAL VERIFIED DOCUMENT IMAGE
      // ======================================================

      const originalDocumentImage =
        normalizedDocumentType === "license"
          ? party.licenseImage
          : party.passportImage;

      if (!originalDocumentImage) {
        return res.status(400).json({
          success: false,

          message:
            "Original verified document image was not found.",
        });
      }

      // ======================================================
      // GET ORIGINAL OCR DATA
      // ======================================================

      const originalDocumentData =
        party.identityData
          ?.[normalizedDocumentType];

      if (!originalDocumentData) {
        return res.status(400).json({
          success: false,

          message:
            "Original verified document data was not found.",
        });
      }

      // ======================================================
      // COMPRESS SELFIE
      // ======================================================

      let compressedSelfie = "";

      try {
        compressedSelfie =
          await compressSelfieImage(
            selfie
          );
      } catch (error) {
        return res.status(400).json({
          success: false,

          message:
            error.message ||
            "Unable to process selfie image.",
        });
      }

      if (!compressedSelfie) {
        return res.status(400).json({
          success: false,

          message:
            "Unable to process selfie image.",
        });
      }

      // ======================================================
      // AUTOMATIC AI SELFIE VERIFICATION
      // ======================================================

      console.log(
        `Starting automatic selfie verification for party ${partyId}`
      );

      console.log(
        `Selfie document type: ${normalizedDocumentType}`
      );

      let verificationResult;

      try {
        verificationResult =
          await verifySelfieAgainstDocument({
            selfieImage:
              compressedSelfie,

            originalDocumentImage:
              originalDocumentImage,

            originalDocumentData:
              originalDocumentData,

            documentType:
              normalizedDocumentType,
          });

        console.log(
          "Automatic selfie AI verification completed."
        );

        console.log(
          "Selfie verification result:",
          verificationResult
        );

      } catch (error) {
        console.error(
          "SELFIE AI VERIFICATION ERROR:",
          error
        );

        return res.status(500).json({
          success: false,

          message:
            "Unable to verify selfie at this time.",
        });
      }

      // ======================================================
      // NORMALIZE RESULT
      // ======================================================

      const result =
        verificationResult || {};

      const confidence =
        Math.max(
          0,
          Math.min(
            100,
            Number(
              result.confidence
            ) || 0
          )
        );

      const extracted =
        result.extractedDocumentData ||
        {};

      const comparison =
        result.comparison ||
        {};

      // ======================================================
      // BUILD SINGLE SELFIE OBJECT
      // ======================================================

      const selfieVerification = {
        // ====================================================
        // ACTUAL IMAGE
        //
        // This will also be assigned explicitly below.
        // ====================================================

        selfieImage:
          compressedSelfie,

        uploaded: true,

        verified:
          result.verified === true,

        documentType:
          normalizedDocumentType,

        faceDetected:
          result.faceDetected === true,

        documentDetected:
          result.documentDetected === true,

        documentHeld:
          result.documentHeld === true,

        documentTypeMatches:
          result.documentTypeMatches === true,

        documentDataMatches:
          result.documentDataMatches === true,

        faceVisuallyConsistent:
          result.faceVisuallyConsistent === true,

        imageQualityGood:
          result.imageQualityGood === true,

        confidence,

        extractedDocumentData: {
          documentType:
            normalizeDocumentType(
              extracted.documentType
            ),

          fullName:
            String(
              extracted.fullName || ""
            ).trim(),

          firstName:
            String(
              extracted.firstName || ""
            ).trim(),

          lastName:
            String(
              extracted.lastName || ""
            ).trim(),

          documentNumber:
            String(
              extracted.documentNumber || ""
            ).trim(),

          dateOfBirth:
            String(
              extracted.dateOfBirth || ""
            ).trim(),

          issueDate:
            String(
              extracted.issueDate || ""
            ).trim(),

          expiryDate:
            String(
              extracted.expiryDate || ""
            ).trim(),

          nationality:
            String(
              extracted.nationality || ""
            ).trim(),

          issuingCountry:
            String(
              extracted.issuingCountry || ""
            ).trim(),

          issuingProvince:
            String(
              extracted.issuingProvince || ""
            ).trim(),

          address:
            String(
              extracted.address || ""
            ).trim(),

          sex:
            String(
              extracted.sex || ""
            ).trim(),

          placeOfBirth:
            String(
              extracted.placeOfBirth || ""
            ).trim(),

          class:
            String(
              extracted.class || ""
            ).trim(),

          restrictions:
            String(
              extracted.restrictions || ""
            ).trim(),

          raw:
            extracted.raw &&
            typeof extracted.raw === "object"
              ? extracted.raw
              : {},
        },

        comparison: {
          documentNumberMatch:
            comparison.documentNumberMatch === true,

          nameMatch:
            comparison.nameMatch === true,

          dateOfBirthMatch:
            comparison.dateOfBirthMatch === true,

          expiryDateMatch:
            comparison.expiryDateMatch === true,

          documentTypeMatch:
            comparison.documentTypeMatch === true,

          issuingCountryMatch:
            comparison.issuingCountryMatch === true,

          nationalityMatch:
            comparison.nationalityMatch === true,

          faceMatch:
            comparison.faceMatch === true,
        },

        verifiedAt:
          result.verified === true
            ? new Date()
            : null,
      };

      // ======================================================
      // SAVE SINGLE SELFIE
      //
      // IMPORTANT:
      //
      // The actual compressed selfie is saved here.
      //
      // MongoDB:
      //
      // identityVerification.selfie.selfieImage
      // ======================================================

      party.identityVerification.selfie = {
        ...selfieVerification,

        selfieImage:
          compressedSelfie,
      };

      // ======================================================
      // SELFIE PASSED
      // ======================================================

      if (
        selfieVerification.verified
      ) {
        party.identityVerification.status =
          "verified";

        party.identityVerification.failureReason =
          "";

        party.identityVerification.verifiedAt =
          new Date();

        console.log(
          "Selfie verification PASSED."
        );

        console.log(
          "Actual verified selfie image saved to MongoDB."
        );
      }

      // ======================================================
      // SELFIE FAILED
      //
      // IMPORTANT:
      //
      // We KEEP the submitted selfie image.
      //
      // This means the frontend can display the submitted
      // selfie even when verification fails.
      //
      // Documents remain independently verified.
      // ======================================================

      else {
        party.identityVerification.status =
          "failed";

        party.identityVerification.failureReason =
          result.reason ||
          "Selfie verification failed.";

        party.identityVerification.verifiedAt =
          null;

        console.log(
          "Selfie verification FAILED."
        );

        console.log(
          "Failed selfie image also saved to MongoDB."
        );
      }

      // ======================================================
      // SAVE PARTY
      // ======================================================

      await party.save();

      // ======================================================
      // SELFIE FAILED RESPONSE
      // ======================================================

      if (
        !selfieVerification.verified
      ) {
        return res.status(400).json({
          success: false,

          verified: false,

          message:
            result.reason ||
            "Selfie verification failed. Please retake your selfie and try again.",

          selfie:
            party.identityVerification.selfie,

          identityVerification: {
            status:
              party.identityVerification.status,

            failureReason:
              party.identityVerification
                .failureReason,

            documents:
              party.identityVerification
                .documents,

            selfie:
              party.identityVerification
                .selfie,
          },

          nextStep:
            "selfie",
        });
      }

      // ======================================================
      // SELFIE SUCCESS RESPONSE
      // ======================================================

      return res.json({
        success: true,

        verified: true,

        message:
          "Identity verification completed successfully.",

        selfie:
          party.identityVerification.selfie,

        identityVerification: {
          status:
            party.identityVerification.status,

          verifiedAt:
            party.identityVerification
              .verifiedAt,

          documents:
            party.identityVerification
              .documents,

          selfie:
            party.identityVerification
              .selfie,
        },

        nextStep:
          "fintrac",
      });

    } catch (error) {
      console.error(
        "VALIDATE SELFIE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          error.message ||
          "Internal Server Error",
      });
    }
  }
);

// ============================================================
// GET IDENTITY VERIFICATION STATUS
//
// Returns:
//
// - current status
// - verified documents
// - single selfie
// - actual selfie image
// - failure reason
// - next step
//
// nextStep:
//
// document
// selfie
// fintrac
// ============================================================

router.get(
  "/identity-verification/:partyId",
  async (req, res) => {
    try {
      const party =
        await TransactionParty.findById(
          req.params.partyId
        );

      if (!party) {
        return res.status(404).json({
          success: false,

          message:
            "Party not found.",
        });
      }

      const identityVerification =
        party.identityVerification;

      // ======================================================
      // DOCUMENT STATUS
      // ======================================================

      const licenseVerified =
        Boolean(
          identityVerification
            ?.documents
            ?.license
            ?.verified
        );

      const passportVerified =
        Boolean(
          identityVerification
            ?.documents
            ?.passport
            ?.verified
        );

      // ======================================================
      // SELFIE STATUS
      // ======================================================

      const selfieVerified =
        Boolean(
          identityVerification
            ?.selfie
            ?.verified
        );

      // ======================================================
      // DETERMINE NEXT STEP
      // ======================================================

      let nextStep =
        "document";

      // ======================================================
      // AT LEAST ONE DOCUMENT VERIFIED
      // ======================================================

      if (
        licenseVerified ||
        passportVerified
      ) {
        nextStep =
          "selfie";
      }

      // ======================================================
      // SELFIE VERIFIED
      // ======================================================

      if (
        selfieVerified
      ) {
        nextStep =
          "fintrac";
      }

      // ======================================================
      // RESPONSE
      // ======================================================

      return res.json({
        success: true,

        status:
          identityVerification?.status ||
          "pending",

        nextStep,

        documents:
          identityVerification
            ?.documents || {
              license:
                emptyDocumentVerification(),

              passport:
                emptyDocumentVerification(),
            },

        // ====================================================
        // ACTUAL SELFIE IMAGE
        //
        // This is returned after page refresh.
        // ====================================================

        selfie:
          identityVerification
            ?.selfie || {
              ...emptySelfieVerification(),
            },

        failureReason:
          identityVerification
            ?.failureReason || "",

        verifiedAt:
          identityVerification
            ?.verifiedAt || null,
      });

    } catch (error) {
      console.error(
        "GET IDENTITY VERIFICATION ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          error.message ||
          "Unable to get verification status.",
      });
    }
  }
);

// ============================================================
// DELETE SAVED IDENTITY DOCUMENT
//
// Endpoint:
//
// DELETE
// /delete-document/:partyId/:documentType
//
// documentType:
//   license
//   passport
//
// IMPORTANT:
//
// Removing a verified document INVALIDATES the one selfie,
// because the selfie was verified against that document.
//
// The actual saved selfie image is also removed.
//
// If another verified document remains:
//
// status = selfie_pending
//
// If no verified document remains:
//
// status = pending
// ============================================================

router.delete(
  "/delete-document/:partyId/:documentType",
  async (req, res) => {
    try {
      const {
        partyId,
        documentType,
      } = req.params;

      // ======================================================
      // VALIDATE PARTY ID
      // ======================================================

      if (!partyId) {
        return res.status(400).json({
          success: false,

          message:
            "Missing partyId.",
        });
      }

      // ======================================================
      // NORMALIZE DOCUMENT TYPE
      // ======================================================

      const normalizedDocumentType =
        normalizeDocumentType(
          documentType
        );

      if (
        normalizedDocumentType !== "license" &&
        normalizedDocumentType !== "passport"
      ) {
        return res.status(400).json({
          success: false,

          message:
            "documentType must be either license or passport.",
        });
      }

      // ======================================================
      // FIND PARTY
      // ======================================================

      const party =
        await TransactionParty.findById(
          partyId
        );

      if (!party) {
        return res.status(404).json({
          success: false,

          message:
            "Party not found.",
        });
      }

      // ======================================================
      // INITIALIZE IDENTITY DATA
      // ======================================================

      if (!party.identityData) {
        party.identityData = {};
      }

      if (!party.identityData.license) {
        party.identityData.license =
          emptyDocumentData();
      }

      if (!party.identityData.passport) {
        party.identityData.passport =
          emptyDocumentData();
      }

      // ======================================================
      // INITIALIZE IDENTITY VERIFICATION
      // ======================================================

      if (!party.identityVerification) {
        party.identityVerification = {};
      }

      if (
        !party.identityVerification.documents
      ) {
        party.identityVerification.documents =
          {};
      }

      if (
        !party.identityVerification.documents
          .license
      ) {
        party.identityVerification.documents.license =
          emptyDocumentVerification();
      }

      if (
        !party.identityVerification.documents
          .passport
      ) {
        party.identityVerification.documents.passport =
          emptyDocumentVerification();
      }

      // ======================================================
      // REMOVE DOCUMENT IMAGE
      // ======================================================

      if (
        normalizedDocumentType === "license"
      ) {
        party.licenseImage = "";
      }

      if (
        normalizedDocumentType === "passport"
      ) {
        party.passportImage = "";
      }

      // ======================================================
      // REMOVE OCR DATA
      // ======================================================

      if (
        normalizedDocumentType === "license"
      ) {
        party.identityData.license =
          emptyDocumentData();
      }

      if (
        normalizedDocumentType === "passport"
      ) {
        party.identityData.passport =
          emptyDocumentData();
      }

      // ======================================================
      // RESET DOCUMENT VERIFICATION
      // ======================================================

      party.identityVerification.documents[
        normalizedDocumentType
      ] =
        emptyDocumentVerification();

      // ======================================================
      // RESET SINGLE SELFIE
      //
      // IMPORTANT:
      //
      // This clears the actual saved selfie image too.
      // ======================================================

      party.identityVerification.selfie =
        emptySelfieVerification();

      // ======================================================
      // CHECK REMAINING VERIFIED DOCUMENTS
      // ======================================================

      const licenseStillVerified =
        Boolean(
          party.identityVerification
            ?.documents
            ?.license
            ?.verified
        );

      const passportStillVerified =
        Boolean(
          party.identityVerification
            ?.documents
            ?.passport
            ?.verified
        );

      // ======================================================
      // SET NEXT STATUS
      // ======================================================

      if (
        licenseStillVerified ||
        passportStillVerified
      ) {
        // Another verified document remains.
        //
        // A NEW selfie is required.

        party.identityVerification.status =
          "selfie_pending";

        party.identityVerification.failureReason =
          "";

        party.identityVerification.verifiedAt =
          null;

      } else {
        // No verified documents remain.

        party.identityVerification.status =
          "pending";

        party.identityVerification.failureReason =
          "";

        party.identityVerification.verifiedAt =
          null;
      }

      // ======================================================
      // SAVE
      // ======================================================

      await party.save();

      // ======================================================
      // RESPONSE
      // ======================================================

      return res.json({
        success: true,

        message:
          normalizedDocumentType === "license"
            ? "Driving Licence removed successfully."
            : "Passport removed successfully.",

        removedDocument:
          normalizedDocumentType,

        identityVerification: {
          status:
            party.identityVerification.status,

          documents:
            party.identityVerification.documents,

          // ==================================================
          // selfieImage is empty because removing a document
          // invalidates the selfie.
          // ==================================================

          selfie:
            party.identityVerification.selfie,

          failureReason:
            party.identityVerification
              .failureReason || "",

          verifiedAt:
            party.identityVerification
              .verifiedAt || null,
        },

        nextStep:
          licenseStillVerified ||
          passportStillVerified
            ? "selfie"
            : "document",
      });

    } catch (error) {
      console.error(
        "DELETE IDENTITY DOCUMENT ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          error.message ||
          "Unable to remove identity document.",
      });
    }
  }
);

// ============================================================
// EXPORT ROUTER
// ============================================================

export default router;


































// import express from "express";
// import nodemailer from "nodemailer";
// import sharp from "sharp";

// import Transaction from "../models/Transaction.js";
// import TransactionParty from "../models/TransactionParty.js";

// import extractDocumentData from "../utils/extractDocumentData.js";
// import verifySelfieAgainstDocument from "../utils/verifySelfieAgainstDocument.js";

// const router = express.Router();

// // ============================================================
// // EMAIL SETUP
// //
// // IMPORTANT:
// // Keep SMTP credentials in environment variables.
// // Do NOT hardcode SMTP passwords in source code.
// // ============================================================


// const transporter = nodemailer.createTransport({
//   host: "smtp-relay.brevo.com",
//   port: 587,
//   secure: false,
//   auth: {
//     user: 'axxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.com',
//     pass: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxJOL',
//   },
// });


// // ============================================================
// // SEND PARTY EMAIL
// // ============================================================

// const sendPartyEmail = async (party) => {
//   try {
//     const frontendUrl =
//       process.env.FRONTEND_URL ||
//       "https://yourdomain.com";

//     const link =
//       `${frontendUrl}/party/onboarding/${party._id}`;

//     await transporter.sendMail({
//       from:
//         process.env.EMAIL_FROM ||
//         '"RealtorParth" <noreply@yourdomain.com>',

//       to: party.email,

//       subject:
//         "Complete Your Transaction Verification",

//       html: `
// <!DOCTYPE html>
// <html>

// <head>
//   <meta charset="UTF-8" />

//   <meta
//     name="viewport"
//     content="width=device-width, initial-scale=1.0"
//   />
// </head>

// <body
//   style="
//     margin:0;
//     padding:0;
//     background:#f4f6f9;
//     font-family:Arial,Helvetica,sans-serif;
//   "
// >

// <table
//   width="100%"
//   cellpadding="0"
//   cellspacing="0"
//   style="
//     background:#f4f6f9;
//     padding:40px 0;
//   "
// >

// <tr>

// <td align="center">

// <table
//   width="600"
//   cellpadding="0"
//   cellspacing="0"
//   style="
//     max-width:600px;
//     width:100%;
//     background:#ffffff;
//     border-radius:12px;
//     overflow:hidden;
//     box-shadow:0 6px 20px rgba(0,0,0,.08);
//   "
// >

// <!-- HEADER -->

// <tr>

// <td
//   style="
//     background:#0f4c81;
//     padding:28px;
//     text-align:center;
//   "
// >

// <h1
//   style="
//     margin:0;
//     color:#ffffff;
//     font-size:28px;
//     font-weight:700;
//   "
// >
// RealtorParth
// </h1>

// </td>

// </tr>

// <!-- BODY -->

// <tr>

// <td style="padding:40px;">

// <h2
//   style="
//     margin-top:0;
//     color:#222;
//     font-size:26px;
//   "
// >
// Hello ${party.name},
// </h2>

// <p
//   style="
//     font-size:16px;
//     color:#555;
//     line-height:28px;
//   "
// >
// You have been added as a participant in a
// <strong>RealtorParth transaction</strong>.
// </p>

// <p
//   style="
//     font-size:16px;
//     color:#555;
//     line-height:28px;
//   "
// >
// Before accessing your transaction documents,
// we need to verify your identity.

// Please click the button below to securely
// complete your verification.
// </p>

// <table
//   width="100%"
//   cellpadding="0"
//   cellspacing="0"
//   style="margin:35px 0;"
// >

// <tr>

// <td align="center">

// <a
//   href="${link}"
//   style="
//     background:#0f4c81;
//     color:#ffffff;
//     text-decoration:none;
//     padding:16px 36px;
//     border-radius:8px;
//     display:inline-block;
//     font-size:16px;
//     font-weight:600;
//   "
// >
// Verify Your Identity
// </a>

// </td>

// </tr>

// </table>

// <div
//   style="
//     background:#f8f9fb;
//     border-left:4px solid #0f4c81;
//     padding:18px;
//     border-radius:6px;
//   "
// >

// <p
//   style="
//     margin:0;
//     color:#555;
//     font-size:15px;
//     line-height:24px;
//   "
// >
// If the button above does not work, copy and
// paste the following link into your browser:
// </p>

// <p
//   style="
//     margin-top:12px;
//     word-break:break-all;
//   "
// >

// <a
//   href="${link}"
//   style="color:#0f4c81;"
// >
// ${link}
// </a>

// </p>

// </div>

// <p
//   style="
//     margin-top:35px;
//     font-size:15px;
//     color:#555;
//     line-height:26px;
//   "
// >

// <strong>Important:</strong>
// This verification link is unique to you and
// should not be shared with anyone else.

// </p>

// <p
//   style="
//     margin-top:15px;
//     font-size:15px;
//     color:#555;
//     line-height:26px;
//   "
// >
// Once your identity has been verified, you will
// be able to review and complete any required
// documents for your transaction.
// </p>

// <p
//   style="
//     margin-top:35px;
//     font-size:16px;
//     color:#222;
//   "
// >
// Kind Regards,<br>

// <strong>RealtorParth Team</strong>

// </p>

// </td>

// </tr>

// <!-- FOOTER -->

// <tr>

// <td
//   style="
//     background:#f7f7f7;
//     padding:22px;
//     text-align:center;
//     color:#777;
//     font-size:13px;
//     line-height:22px;
//   "
// >

// This is an automated email from RealtorParth.
// <br>

// Please do not reply directly to this email.

// </td>

// </tr>

// </table>

// </td>

// </tr>

// </table>

// </body>

// </html>
// `,
//     });

//     console.log(
//       `Verification email sent to ${party.email}`
//     );

//   } catch (error) {
//     console.error(
//       "SEND PARTY EMAIL ERROR:",
//       error
//     );
//   }
// };

// // ============================================================
// // SAVE PARTIES
// // ============================================================

// router.post(
//   "/save",
//   async (req, res) => {
//     try {
//       const {
//         transactionId,
//         parties,
//         userId,
//       } = req.body;

//       // ======================================================
//       // VALIDATE INPUT
//       // ======================================================

//       if (!transactionId) {
//         return res.status(400).json({
//           success: false,
//           message: "Missing transactionId",
//         });
//       }

//       if (!userId) {
//         return res.status(400).json({
//           success: false,
//           message: "Missing userId",
//         });
//       }

//       if (!Array.isArray(parties)) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid parties data",
//         });
//       }

//       // ======================================================
//       // FIND TRANSACTION
//       // ======================================================

//       const transaction =
//         await Transaction.findOne({
//           _id: transactionId,
//           userId,
//         });

//       if (!transaction) {
//         return res.json({
//           success: false,
//           message: "Unauthorized",
//         });
//       }

//       const savedParties = [];

//       // ======================================================
//       // LOOP PARTIES
//       // ======================================================

//       for (const p of parties) {
//         let party;

//         // ====================================================
//         // UPDATE EXISTING PARTY
//         // ====================================================

//         if (p._id) {
//           party =
//             await TransactionParty.findOneAndUpdate(
//               {
//                 _id: p._id,
//                 transactionId,
//                 userId,
//               },
//               {
//                 name: p.name,
//                 email: p.email,
//                 phone: p.phone,
//                 role: p.role,
//                 userId,
//               },
//               {
//                 new: true,
//               }
//             );
//         }

//         // ====================================================
//         // CREATE NEW PARTY
//         // ====================================================

//         else {
//           party =
//             await TransactionParty.create({
//               transactionId,
//               userId,
//               name: p.name,
//               email: p.email,
//               phone: p.phone,
//               role: p.role,
//             });

//           // ==================================================
//           // SEND EMAIL ONLY FOR NEW PARTY
//           // ==================================================

//           sendPartyEmail(party);
//         }

//         if (party) {
//           savedParties.push(party);
//         }
//       }

//       return res.json({
//         success: true,
//         parties: savedParties,
//       });

//     } catch (error) {
//       console.error(
//         "SAVE PARTIES ERROR:",
//         error
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           error.message ||
//           "Failed to save parties",
//       });
//     }
//   }
// );

// // ============================================================
// // GET PARTY SETTINGS
// // ============================================================

// router.get(
//   "/transactionParty/settings/:partyId",
//   async (req, res) => {
//     try {
//       const partysettings =
//         await TransactionParty.findById(
//           req.params.partyId
//         );

//       if (!partysettings) {
//         return res.json({
//           success: false,
//           message: "Party not found",
//         });
//       }

//       return res.json({
//         success: true,
//         data: partysettings,
//       });

//     } catch (err) {
//       console.error(
//         "GET PARTY SETTINGS ERROR:",
//         err
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           err.message ||
//           "Unable to load party settings",
//       });
//     }
//   }
// );

// // ============================================================
// // GET SINGLE PARTY
// // ============================================================

// router.get(
//   "/party/:id",
//   async (req, res) => {
//     try {
//       const party =
//         await TransactionParty.findById(
//           req.params.id
//         );

//       if (!party) {
//         return res.status(404).json({
//           success: false,
//           message: "Invalid link",
//         });
//       }

//       return res.json({
//         success: true,
//         party,
//       });

//     } catch (error) {
//       console.error(
//         "GET PARTY ERROR:",
//         error
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           error.message ||
//           "Unable to load party",
//       });
//     }
//   }
// );

// // ============================================================
// // GET PARTIES
// // ============================================================

// router.get(
//   "/:transactionId/:userId",
//   async (req, res) => {
//     try {
//       const transaction =
//         await Transaction.findOne({
//           _id: req.params.transactionId,
//           userId: req.params.userId,
//         });

//       if (!transaction) {
//         return res.json({
//           success: false,
//           message: "Unauthorized",
//         });
//       }

//       const parties =
//         await TransactionParty.find({
//           transactionId:
//             req.params.transactionId,
//         });

//       return res.json({
//         success: true,
//         parties,
//       });

//     } catch (error) {
//       console.error(
//         "GET PARTIES ERROR:",
//         error
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           error.message ||
//           "Unable to load parties",
//       });
//     }
//   }
// );

// // ============================================================
// // DELETE PARTY
// // ============================================================

// router.delete(
//   "/:id/:userId",
//   async (req, res) => {
//     try {
//       const party =
//         await TransactionParty.findById(
//           req.params.id
//         );

//       if (!party) {
//         return res.json({
//           success: false,
//           message: "Party not found",
//         });
//       }

//       const transaction =
//         await Transaction.findOne({
//           _id: party.transactionId,
//           userId: req.params.userId,
//         });

//       if (!transaction) {
//         return res.json({
//           success: false,
//           message: "Unauthorized",
//         });
//       }

//       await TransactionParty.findByIdAndDelete(
//         req.params.id
//       );

//       return res.json({
//         success: true,
//       });

//     } catch (error) {
//       console.error(
//         "DELETE PARTY ERROR:",
//         error
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           error.message ||
//           "Unable to delete party",
//       });
//     }
//   }
// );

// // ============================================================
// // HELPER — EMPTY DOCUMENT DATA
// // ============================================================

// const emptyDocumentData = () => ({
//   validDocument: false,

//   confidence: 0,

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

//   reason: "",
// });

// // ============================================================
// // HELPER — EMPTY DOCUMENT VERIFICATION
// // ============================================================

// const emptyDocumentVerification = () => ({
//   uploaded: false,

//   verified: false,

//   confidence: 0,

//   verifiedAt: null,
// });

// // ============================================================
// // HELPER — NORMALIZE DOCUMENT TYPE
// // ============================================================

// const normalizeDocumentType = (
//   value
// ) => {
//   const type =
//     String(value || "")
//       .trim()
//       .toLowerCase();

//   if (
//     type.includes("passport")
//   ) {
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
// // HELPER — REMOVE BASE64 PREFIX
// // ============================================================

// const cleanBase64 = (
//   base64
// ) => {
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
// // HELPER — COMPRESS DOCUMENT IMAGE
// //
// // Used for uploaded identity documents.
// //
// // Settings:
// // - max width: 1000px
// // - JPEG quality: 70
// //
// // This is intentionally separate from selfie compression.
// // ============================================================

// const compressDocumentImage = async (
//   base64
// ) => {
//   if (!base64) {
//     return "";
//   }

//   try {
//     const clean =
//       cleanBase64(
//         base64
//       );

//     if (!clean) {
//       throw new Error(
//         "Invalid image data"
//       );
//     }

//     const buffer =
//       Buffer.from(
//         clean,
//         "base64"
//       );

//     if (!buffer.length) {
//       throw new Error(
//         "Invalid image data"
//       );
//     }

//     const compressed =
//       await sharp(buffer)
//         .resize({
//           width: 1000,
//           withoutEnlargement: true,
//         })
//         .jpeg({
//           quality: 70,
//           mozjpeg: true,
//         })
//         .toBuffer();

//     return (
//       "data:image/jpeg;base64," +
//       compressed.toString("base64")
//     );

//   } catch (error) {
//     console.error(
//       "DOCUMENT IMAGE COMPRESSION ERROR:",
//       error
//     );

//     throw new Error(
//       "Unable to process uploaded document image."
//     );
//   }
// };

// // ============================================================
// // HELPER — COMPRESS SELFIE IMAGE
// //
// // IMPORTANT:
// //
// // Selfie verification needs more resolution because the identity
// // document occupies only a portion of the selfie.
// //
// // Settings:
// // - max width: 1600px
// // - JPEG quality: 88
// //
// // This gives Gemini more pixels for:
// //
// // - face detection
// // - physical document detection
// // - document type detection
// // - document OCR
// // ============================================================

// const compressSelfieImage = async (
//   base64
// ) => {
//   if (!base64) {
//     return "";
//   }

//   try {
//     const clean =
//       cleanBase64(
//         base64
//       );

//     if (!clean) {
//       throw new Error(
//         "Invalid selfie image data"
//       );
//     }

//     const buffer =
//       Buffer.from(
//         clean,
//         "base64"
//       );

//     if (!buffer.length) {
//       throw new Error(
//         "Invalid selfie image data"
//       );
//     }

//     const compressed =
//       await sharp(buffer)
//         .resize({
//           width: 1600,
//           withoutEnlargement: true,
//         })
//         .jpeg({
//           quality: 88,
//           mozjpeg: true,
//         })
//         .toBuffer();

//     return (
//       "data:image/jpeg;base64," +
//       compressed.toString("base64")
//     );

//   } catch (error) {
//     console.error(
//       "SELFIE IMAGE COMPRESSION ERROR:",
//       error
//     );

//     throw new Error(
//       "Unable to process selfie image."
//     );
//   }
// };

// // ============================================================
// // UPLOAD + AI VALIDATE DOCUMENTS
// //
// // FLOW:
// //
// // Upload Licence / Passport
// //          ↓
// // AI OCR + Document Verification
// //          ↓
// // At least one valid document
// //          ↓
// // SELFIE_PENDING
// //          ↓
// // User takes ONE selfie
// //          ↓
// // Selfie holds ONE verified document
// // ============================================================

// router.post(
//   "/upload-documents",
//   async (req, res) => {
//     try {
//       const {
//         partyId,
//         licenseImage,
//         passportImage,
//       } = req.body;

//       // ======================================================
//       // VALIDATE PARTY ID
//       // ======================================================

//       if (!partyId) {
//         return res.status(400).json({
//           success: false,
//           message: "Missing partyId",
//         });
//       }

//       // ======================================================
//       // FIND PARTY
//       // ======================================================

//       const party =
//         await TransactionParty.findById(
//           partyId
//         );

//       if (!party) {
//         return res.status(404).json({
//           success: false,
//           message: "Party not found",
//         });
//       }

//       // ======================================================
//       // AT LEAST ONE DOCUMENT
//       // ======================================================

//       if (
//         !licenseImage &&
//         !passportImage
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Please upload at least one identity document.",
//         });
//       }

//       // ======================================================
//       // COMPRESS DOCUMENT IMAGES
//       // ======================================================

//       let compressedLicense = "";
//       let compressedPassport = "";

//       try {
//         [
//           compressedLicense,
//           compressedPassport,
//         ] = await Promise.all([
//           licenseImage
//             ? compressDocumentImage(
//                 licenseImage
//               )
//             : Promise.resolve(""),

//           passportImage
//             ? compressDocumentImage(
//                 passportImage
//               )
//             : Promise.resolve(""),
//         ]);

//       } catch (error) {
//         return res.status(400).json({
//           success: false,
//           message:
//             error.message ||
//             "Unable to process uploaded images.",
//         });
//       }

//       // ======================================================
//       // AI OCR VARIABLES
//       // ======================================================

//       let licenseData =
//         emptyDocumentData();

//       let passportData =
//         emptyDocumentData();

//       // ======================================================
//       // LICENSE AI VALIDATION
//       // ======================================================

//       if (compressedLicense) {
//         try {
//           licenseData =
//             await extractDocumentData(
//               compressedLicense
//             );
//         } catch (error) {
//           console.error(
//             "LICENSE OCR FAILED:",
//             error
//           );

//           licenseData = {
//             ...emptyDocumentData(),

//             reason:
//               "Unable to analyze Driving Licence.",
//           };
//         }
//       }

//       // ======================================================
//       // PASSPORT AI VALIDATION
//       // ======================================================

//       if (compressedPassport) {
//         try {
//           passportData =
//             await extractDocumentData(
//               compressedPassport
//             );
//         } catch (error) {
//           console.error(
//             "PASSPORT OCR FAILED:",
//             error
//           );

//           passportData = {
//             ...emptyDocumentData(),

//             reason:
//               "Unable to analyze Passport.",
//           };
//         }
//       }

//       // ======================================================
//       // RESULT OBJECT
//       // ======================================================

//       const documentResults = {
//         license: {
//           uploaded: false,
//           valid: false,
//           confidence: 0,
//           message: "",
//         },

//         passport: {
//           uploaded: false,
//           valid: false,
//           confidence: 0,
//           message: "",
//         },
//       };

//       // ======================================================
//       // VALIDATE LICENSE
//       // ======================================================

//       if (compressedLicense) {
//         documentResults.license.uploaded =
//           true;

//         if (
//           !licenseData ||
//           licenseData.validDocument !== true
//         ) {
//           documentResults.license.valid =
//             false;

//           documentResults.license.confidence =
//             Number(
//               licenseData?.confidence
//             ) || 0;

//           documentResults.license.message =
//             licenseData?.reason ||
//             "Please upload a valid Driving Licence.";

//         } else {
//           const type =
//             normalizeDocumentType(
//               licenseData.documentType
//             );

//           if (type !== "license") {
//             documentResults.license.valid =
//               false;

//             documentResults.license.confidence =
//               Number(
//                 licenseData?.confidence
//               ) || 0;

//             documentResults.license.message =
//               "The uploaded document is not a Driving Licence.";

//           } else {
//             documentResults.license.valid =
//               true;

//             documentResults.license.confidence =
//               Number(
//                 licenseData.confidence
//               ) || 0;

//             documentResults.license.message =
//               "Driving Licence verified.";
//           }
//         }
//       }

//       // ======================================================
//       // VALIDATE PASSPORT
//       // ======================================================

//       if (compressedPassport) {
//         documentResults.passport.uploaded =
//           true;

//         if (
//           !passportData ||
//           passportData.validDocument !== true
//         ) {
//           documentResults.passport.valid =
//             false;

//           documentResults.passport.confidence =
//             Number(
//               passportData?.confidence
//             ) || 0;

//           documentResults.passport.message =
//             passportData?.reason ||
//             "Please upload a valid Passport.";

//         } else {
//           const type =
//             normalizeDocumentType(
//               passportData.documentType
//             );

//           if (type !== "passport") {
//             documentResults.passport.valid =
//               false;

//             documentResults.passport.confidence =
//               Number(
//                 passportData?.confidence
//               ) || 0;

//             documentResults.passport.message =
//               "The uploaded document is not a Passport.";

//           } else {
//             documentResults.passport.valid =
//               true;

//             documentResults.passport.confidence =
//               Number(
//                 passportData.confidence
//               ) || 0;

//             documentResults.passport.message =
//               "Passport verified.";
//           }
//         }
//       }

//       // ======================================================
//       // CHECK VALID DOCUMENT
//       // ======================================================

//       const licenseValid =
//         documentResults.license.valid;

//       const passportValid =
//         documentResults.passport.valid;

//       const atLeastOneValid =
//         licenseValid ||
//         passportValid;

//       // ======================================================
//       // NO VALID DOCUMENT
//       // ======================================================

//       if (!atLeastOneValid) {
//         return res.status(400).json({
//           success: false,

//           message:
//             "No valid identity document was uploaded.",

//           documents:
//             documentResults,
//         });
//       }

//       // ======================================================
//       // INITIALIZE IDENTITY DATA
//       // ======================================================

//       if (!party.identityData) {
//         party.identityData = {};
//       }

//       // ======================================================
//       // INITIALIZE IDENTITY VERIFICATION
//       // ======================================================

//       if (!party.identityVerification) {
//         party.identityVerification = {};
//       }

//       if (
//         !party.identityVerification.documents
//       ) {
//         party.identityVerification.documents =
//           {};
//       }

//       // ======================================================
//       // MAKE SURE BOTH DOCUMENT VERIFICATION OBJECTS EXIST
//       // ======================================================

//       if (
//         !party.identityVerification.documents
//           .license
//       ) {
//         party.identityVerification.documents.license =
//           emptyDocumentVerification();
//       }

//       if (
//         !party.identityVerification.documents
//           .passport
//       ) {
//         party.identityVerification.documents.passport =
//           emptyDocumentVerification();
//       }

//       // ======================================================
//       // RESET SINGLE SELFIE
//       //
//       // Any successful document upload can change the verified
//       // document set.
//       //
//       // Therefore an old selfie must never remain verified.
//       // ======================================================

//       party.identityVerification.selfie = {
//         uploaded: false,

//         verified: false,

//         documentType: null,

//         faceDetected: false,

//         documentDetected: false,

//         documentHeld: false,

//         documentTypeMatches: false,

//         documentDataMatches: false,

//         faceVisuallyConsistent: false,

//         imageQualityGood: false,

//         confidence: 0,

//         extractedDocumentData: {
//           documentType: "",

//           fullName: "",
//           firstName: "",
//           lastName: "",

//           documentNumber: "",

//           dateOfBirth: "",
//           issueDate: "",
//           expiryDate: "",

//           nationality: "",

//           issuingCountry: "",
//           issuingProvince: "",

//           address: "",

//           sex: "",
//           placeOfBirth: "",

//           class: "",
//           restrictions: "",

//           raw: {},
//         },

//         comparison: {
//           documentNumberMatch: false,
//           nameMatch: false,
//           dateOfBirthMatch: false,
//           expiryDateMatch: false,
//           documentTypeMatch: false,
//           issuingCountryMatch: false,
//           nationalityMatch: false,
//           faceMatch: false,
//         },

//         verifiedAt: null,
//       };

//       // ======================================================
//       // SAVE LICENSE ONLY IF VALID
//       // ======================================================

//       if (
//         compressedLicense &&
//         licenseValid
//       ) {
//         party.licenseImage =
//           compressedLicense;

//         party.identityData.license =
//           licenseData;

//         party.identityVerification.documents.license =
//           {
//             uploaded: true,

//             verified: true,

//             confidence:
//               Number(
//                 licenseData?.confidence
//               ) || 0,

//             verifiedAt:
//               new Date(),
//           };

//         console.log(
//           "Driving Licence verified."
//         );

//         console.log(
//           "Licence OCR:",
//           licenseData
//         );
//       }

//       // ======================================================
//       // SAVE PASSPORT ONLY IF VALID
//       // ======================================================

//       if (
//         compressedPassport &&
//         passportValid
//       ) {
//         party.passportImage =
//           compressedPassport;

//         party.identityData.passport =
//           passportData;

//         party.identityVerification.documents.passport =
//           {
//             uploaded: true,

//             verified: true,

//             confidence:
//               Number(
//                 passportData?.confidence
//               ) || 0,

//             verifiedAt:
//               new Date(),
//           };

//         console.log(
//           "Passport verified."
//         );

//         console.log(
//           "Passport OCR:",
//           passportData
//         );
//       }

//       // ======================================================
//       // DETERMINE VERIFIED DOCUMENTS
//       // ======================================================

//       const verifiedLicense =
//         Boolean(
//           party.identityVerification
//             ?.documents
//             ?.license
//             ?.verified
//         );

//       const verifiedPassport =
//         Boolean(
//           party.identityVerification
//             ?.documents
//             ?.passport
//             ?.verified
//         );

//       // ======================================================
//       // FINAL DOCUMENT CHECK
//       // ======================================================

//       if (
//         !verifiedLicense &&
//         !verifiedPassport
//       ) {
//         return res.status(400).json({
//           success: false,

//           message:
//             "No verified identity document is available.",

//           documents:
//             documentResults,
//         });
//       }

//       // ======================================================
//       // DOCUMENTS VERIFIED
//       //
//       // Identity is NOT fully verified yet.
//       //
//       // User must complete ONE selfie.
//       // ======================================================

//       party.identityVerification.status =
//         "selfie_pending";

//       // ======================================================
//       // CLEAR FAILURE
//       // ======================================================

//       party.identityVerification.failureReason =
//         "";

//       // ======================================================
//       // SAVE PARTY
//       // ======================================================

//       await party.save();

//       // ======================================================
//       // RESPONSE
//       // ======================================================

//       return res.json({
//         success: true,

//         message:
//           "Documents verified. Please complete the required selfie verification.",

//         documents:
//           documentResults,

//         identityData:
//           party.identityData,

//         identityVerification: {
//           status:
//             party.identityVerification.status,

//           documents:
//             party.identityVerification.documents,

//           selfie:
//             party.identityVerification.selfie,
//         },

//         nextStep:
//           "selfie",
//       });

//     } catch (error) {
//       console.error(
//         "UPLOAD DOCUMENTS ERROR:",
//         error
//       );

//       return res.status(500).json({
//         success: false,

//         message:
//           error.message ||
//           "Internal Server Error",
//       });
//     }
//   }
// );

// // ============================================================
// // VALIDATE ONE SELFIE
// //
// // FLOW:
// //
// // Verified Licence/Passport
// //          ↓
// // User chooses ONE verified document
// //          ↓
// // Takes ONE selfie holding that document
// //          ↓
// // Higher quality selfie compression
// //          ↓
// // AI verification
// //          ↓
// // VERIFIED
// //          ↓
// // FINTRAC
// // ============================================================

// router.post(
//   "/validate-selfie",
//   async (req, res) => {
//     try {
//       const {
//         partyId,
//         documentType,
//         selfie,
//       } = req.body;

//       // ======================================================
//       // VALIDATE PARTY ID
//       // ======================================================

//       if (!partyId) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Missing partyId.",
//         });
//       }

//       // ======================================================
//       // VALIDATE SELFIE
//       // ======================================================

//       if (!selfie) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Please provide a selfie image.",
//         });
//       }

//       // ======================================================
//       // NORMALIZE DOCUMENT TYPE
//       // ======================================================

//       const normalizedDocumentType =
//         normalizeDocumentType(
//           documentType
//         );

//       if (
//         normalizedDocumentType !== "license" &&
//         normalizedDocumentType !== "passport"
//       ) {
//         return res.status(400).json({
//           success: false,

//           message:
//             "documentType must be either license or passport.",
//         });
//       }

//       // ======================================================
//       // FIND PARTY
//       // ======================================================

//       const party =
//         await TransactionParty.findById(
//           partyId
//         );

//       if (!party) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Party not found.",
//         });
//       }

//       // ======================================================
//       // CHECK IDENTITY VERIFICATION OBJECT
//       // ======================================================

//       if (
//         !party.identityVerification
//       ) {
//         return res.status(400).json({
//           success: false,

//           message:
//             "Identity verification has not been started.",

//           nextStep:
//             "document",
//         });
//       }

//       // ======================================================
//       // CHECK SELECTED DOCUMENT
//       // ======================================================

//       const selectedDocumentVerification =
//         party.identityVerification
//           ?.documents
//           ?.[normalizedDocumentType];

//       if (
//         !selectedDocumentVerification
//           ?.verified
//       ) {
//         return res.status(400).json({
//           success: false,

//           message:
//             `The selected ${normalizedDocumentType} has not been verified. Please verify the document first.`,

//           nextStep:
//             "document",
//         });
//       }

//       // ======================================================
//       // GET ORIGINAL VERIFIED DOCUMENT IMAGE
//       // ======================================================

//       const originalDocumentImage =
//         normalizedDocumentType ===
//         "license"
//           ? party.licenseImage
//           : party.passportImage;

//       if (!originalDocumentImage) {
//         return res.status(400).json({
//           success: false,

//           message:
//             "Original verified document image was not found.",
//         });
//       }

//       // ======================================================
//       // GET ORIGINAL OCR DATA
//       // ======================================================

//       const originalDocumentData =
//         party.identityData
//           ?.[normalizedDocumentType];

//       if (
//         !originalDocumentData
//       ) {
//         return res.status(400).json({
//           success: false,

//           message:
//             "Original verified document data was not found.",
//         });
//       }

//       // ======================================================
//       // COMPRESS SELFIE
//       //
//       // IMPORTANT:
//       //
//       // Do NOT use document compression here.
//       //
//       // The selfie needs higher resolution because the physical
//       // identity document may occupy only a small portion of
//       // the selfie image.
//       // ======================================================

//       let compressedSelfie = "";

//       try {
//         compressedSelfie =
//           await compressSelfieImage(
//             selfie
//           );

//       } catch (error) {
//         return res.status(400).json({
//           success: false,

//           message:
//             error.message ||
//             "Unable to process selfie image.",
//         });
//       }

//       if (!compressedSelfie) {
//         return res.status(400).json({
//           success: false,

//           message:
//             "Unable to process selfie image.",
//         });
//       }

//       // ======================================================
//       // AI SELFIE VERIFICATION
//       // ======================================================

//       let verificationResult;

//       try {
//         verificationResult =
//           await verifySelfieAgainstDocument({
//             selfieImage:
//               compressedSelfie,

//             originalDocumentImage:
//               originalDocumentImage,

//             originalDocumentData:
//               originalDocumentData,

//             documentType:
//               normalizedDocumentType,
//           });

//       } catch (error) {
//         console.error(
//           "SELFIE AI VERIFICATION ERROR:",
//           error
//         );

//         return res.status(500).json({
//           success: false,

//           message:
//             "Unable to verify selfie at this time.",
//         });
//       }

//       // ======================================================
//       // NORMALIZE RESULT
//       // ======================================================

//       const result =
//         verificationResult || {};

//       const confidence =
//         Math.max(
//           0,
//           Math.min(
//             100,
//             Number(
//               result.confidence
//             ) || 0
//           )
//         );

//       const extracted =
//         result.extractedDocumentData ||
//         {};

//       const comparison =
//         result.comparison ||
//         {};

//       // ======================================================
//       // BUILD SINGLE SELFIE OBJECT
//       // ======================================================

//       const selfieVerification = {
//         uploaded: true,

//         verified:
//           result.verified === true,

//         documentType:
//           normalizedDocumentType,

//         faceDetected:
//           result.faceDetected === true,

//         documentDetected:
//           result.documentDetected === true,

//         documentHeld:
//           result.documentHeld === true,

//         documentTypeMatches:
//           result.documentTypeMatches === true,

//         documentDataMatches:
//           result.documentDataMatches === true,

//         faceVisuallyConsistent:
//           result.faceVisuallyConsistent === true,

//         imageQualityGood:
//           result.imageQualityGood === true,

//         confidence,

//         extractedDocumentData: {
//           documentType:
//             normalizeDocumentType(
//               extracted.documentType
//             ),

//           fullName:
//             String(
//               extracted.fullName || ""
//             ).trim(),

//           firstName:
//             String(
//               extracted.firstName || ""
//             ).trim(),

//           lastName:
//             String(
//               extracted.lastName || ""
//             ).trim(),

//           documentNumber:
//             String(
//               extracted.documentNumber || ""
//             ).trim(),

//           dateOfBirth:
//             String(
//               extracted.dateOfBirth || ""
//             ).trim(),

//           issueDate:
//             String(
//               extracted.issueDate || ""
//             ).trim(),

//           expiryDate:
//             String(
//               extracted.expiryDate || ""
//             ).trim(),

//           nationality:
//             String(
//               extracted.nationality || ""
//             ).trim(),

//           issuingCountry:
//             String(
//               extracted.issuingCountry || ""
//             ).trim(),

//           issuingProvince:
//             String(
//               extracted.issuingProvince || ""
//             ).trim(),

//           address:
//             String(
//               extracted.address || ""
//             ).trim(),

//           sex:
//             String(
//               extracted.sex || ""
//             ).trim(),

//           placeOfBirth:
//             String(
//               extracted.placeOfBirth || ""
//             ).trim(),

//           class:
//             String(
//               extracted.class || ""
//             ).trim(),

//           restrictions:
//             String(
//               extracted.restrictions || ""
//             ).trim(),

//           raw:
//             extracted.raw &&
//             typeof extracted.raw === "object"
//               ? extracted.raw
//               : {},
//         },

//         comparison: {
//           documentNumberMatch:
//             comparison.documentNumberMatch ===
//             true,

//           nameMatch:
//             comparison.nameMatch ===
//             true,

//           dateOfBirthMatch:
//             comparison.dateOfBirthMatch ===
//             true,

//           expiryDateMatch:
//             comparison.expiryDateMatch ===
//             true,

//           documentTypeMatch:
//             comparison.documentTypeMatch ===
//             true,

//           issuingCountryMatch:
//             comparison.issuingCountryMatch ===
//             true,

//           nationalityMatch:
//             comparison.nationalityMatch ===
//             true,

//           faceMatch:
//             comparison.faceMatch ===
//             true,
//         },

//         verifiedAt:
//           result.verified === true
//             ? new Date()
//             : null,
//       };

//       // ======================================================
//       // SAVE SINGLE SELFIE
//       // ======================================================

//       party.identityVerification.selfie =
//         selfieVerification;

//       // ======================================================
//       // DETERMINE FINAL STATUS
//       // ======================================================

//       if (
//         selfieVerification.verified
//       ) {
//         party.identityVerification.status =
//           "verified";

//         party.identityVerification.failureReason =
//           "";

//         party.identityVerification.verifiedAt =
//           new Date();

//       } else {
//         party.identityVerification.status =
//           "failed";

//         party.identityVerification.failureReason =
//           result.reason ||
//           "Selfie verification failed.";

//         // ====================================================
//         // IMPORTANT
//         //
//         // A failed selfie does NOT invalidate the verified
//         // document itself.
//         //
//         // User can retake the selfie.
//         // ====================================================
//       }

//       // ======================================================
//       // SAVE PARTY
//       // ======================================================

//       await party.save();

//       // ======================================================
//       // SELFIE FAILED
//       // ======================================================

//       if (
//         !selfieVerification.verified
//       ) {
//         return res.status(400).json({
//           success: false,

//           verified: false,

//           message:
//             result.reason ||
//             "Selfie verification failed. Please try again.",

//           selfie:
//             party.identityVerification.selfie,

//           identityVerification: {
//             status:
//               party.identityVerification.status,

//             failureReason:
//               party.identityVerification
//                 .failureReason,

//             documents:
//               party.identityVerification
//                 .documents,

//             selfie:
//               party.identityVerification
//                 .selfie,
//           },

//           nextStep:
//             "selfie",
//         });
//       }

//       // ======================================================
//       // SELFIE SUCCESS
//       // ======================================================

//       return res.json({
//         success: true,

//         verified: true,

//         message:
//           "Identity verification completed successfully.",

//         selfie:
//           party.identityVerification.selfie,

//         identityVerification: {
//           status:
//             party.identityVerification.status,

//           verifiedAt:
//             party.identityVerification
//               .verifiedAt,

//           documents:
//             party.identityVerification
//               .documents,

//           selfie:
//             party.identityVerification
//               .selfie,
//         },

//         nextStep:
//           "fintrac",
//       });

//     } catch (error) {
//       console.error(
//         "VALIDATE SELFIE ERROR:",
//         error
//       );

//       return res.status(500).json({
//         success: false,

//         message:
//           error.message ||
//           "Internal Server Error",
//       });
//     }
//   }
// );

// // ============================================================
// // GET IDENTITY VERIFICATION STATUS
// //
// // Returns:
// //
// // - document verification
// // - selfie verification
// // - current status
// // - next step
// // ============================================================

// router.get(
//   "/identity-verification/:partyId",
//   async (req, res) => {
//     try {
//       const party =
//         await TransactionParty.findById(
//           req.params.partyId
//         );

//       if (!party) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Party not found.",
//         });
//       }

//       const identityVerification =
//         party.identityVerification;

//       const licenseVerified =
//         Boolean(
//           identityVerification
//             ?.documents
//             ?.license
//             ?.verified
//         );

//       const passportVerified =
//         Boolean(
//           identityVerification
//             ?.documents
//             ?.passport
//             ?.verified
//         );

//       const selfieVerified =
//         Boolean(
//           identityVerification
//             ?.selfie
//             ?.verified
//         );

//       let nextStep =
//         "document";

//       // ======================================================
//       // AT LEAST ONE DOCUMENT VERIFIED
//       // ======================================================

//       if (
//         licenseVerified ||
//         passportVerified
//       ) {
//         nextStep =
//           "selfie";
//       }

//       // ======================================================
//       // SELFIE VERIFIED
//       // ======================================================

//       if (selfieVerified) {
//         nextStep =
//           "fintrac";
//       }

//       return res.json({
//         success: true,

//         status:
//           identityVerification?.status ||
//           "pending",

//         nextStep,

//         documents:
//           identityVerification
//             ?.documents || {},

//         selfie:
//           identityVerification
//             ?.selfie || null,

//         failureReason:
//           identityVerification
//             ?.failureReason || "",

//         verifiedAt:
//           identityVerification
//             ?.verifiedAt || null,
//       });

//     } catch (error) {
//       console.error(
//         "GET IDENTITY VERIFICATION ERROR:",
//         error
//       );

//       return res.status(500).json({
//         success: false,

//         message:
//           error.message ||
//           "Unable to get verification status.",
//       });
//     }
//   }
// );

// // ============================================================
// // EXPORT ROUTER
// // ============================================================

// export default router;






































// import express from "express";
// import nodemailer from "nodemailer";
// import sharp from "sharp";

// import Transaction from "../models/Transaction.js";
// import TransactionParty from "../models/TransactionParty.js";

// import extractDocumentData from "../utils/extractDocumentData.js";
// import verifySelfieAgainstDocument from "../utils/verifySelfieAgainstDocument.js";

// const router = express.Router();


// // ============================================================
// // EMAIL SETUP
// // ============================================================




// // ============================================================
// // SEND PARTY EMAIL
// // ============================================================

// const sendPartyEmail = async (party) => {
//   try {
//     const link =
//       `${process.env.FRONTEND_URL || "https://yourdomain.com"}` +
//       `/party/onboarding/${party._id}`;

//     await transporter.sendMail({
//       from:
//         process.env.EMAIL_FROM ||
//         '"RealtorParth" <noreply@yourdomain.com>',

//       to: party.email,

//       subject:
//         "Complete Your Transaction Verification",

//       html: `
// <!DOCTYPE html>
// <html>

// <head>
//   <meta charset="UTF-8" />
//   <meta
//     name="viewport"
//     content="width=device-width, initial-scale=1.0"
//   />
// </head>

// <body
//   style="
//     margin:0;
//     padding:0;
//     background:#f4f6f9;
//     font-family:Arial,Helvetica,sans-serif;
//   "
// >

// <table
//   width="100%"
//   cellpadding="0"
//   cellspacing="0"
//   style="
//     background:#f4f6f9;
//     padding:40px 0;
//   "
// >

// <tr>

// <td align="center">

// <table
//   width="600"
//   cellpadding="0"
//   cellspacing="0"
//   style="
//     max-width:600px;
//     width:100%;
//     background:#ffffff;
//     border-radius:12px;
//     overflow:hidden;
//     box-shadow:0 6px 20px rgba(0,0,0,.08);
//   "
// >

// <!-- HEADER -->

// <tr>

// <td
//   style="
//     background:#0f4c81;
//     padding:28px;
//     text-align:center;
//   "
// >

// <h1
//   style="
//     margin:0;
//     color:#ffffff;
//     font-size:28px;
//     font-weight:700;
//   "
// >
// RealtorParth
// </h1>

// </td>

// </tr>


// <!-- BODY -->

// <tr>

// <td style="padding:40px;">

// <h2
//   style="
//     margin-top:0;
//     color:#222;
//     font-size:26px;
//   "
// >
// Hello ${party.name},
// </h2>


// <p
//   style="
//     font-size:16px;
//     color:#555;
//     line-height:28px;
//   "
// >

// You have been added as a participant in a
// <strong>RealtorParth transaction</strong>.

// </p>


// <p
//   style="
//     font-size:16px;
//     color:#555;
//     line-height:28px;
//   "
// >

// Before accessing your transaction documents,
// we need to verify your identity.

// Please click the button below to securely
// complete your verification.

// </p>


// <table
//   width="100%"
//   cellpadding="0"
//   cellspacing="0"
//   style="margin:35px 0;"
// >

// <tr>

// <td align="center">

// <a
//   href="${link}"
//   style="
//     background:#0f4c81;
//     color:#ffffff;
//     text-decoration:none;
//     padding:16px 36px;
//     border-radius:8px;
//     display:inline-block;
//     font-size:16px;
//     font-weight:600;
//   "
// >
// Verify Your Identity
// </a>

// </td>

// </tr>

// </table>


// <div
//   style="
//     background:#f8f9fb;
//     border-left:4px solid #0f4c81;
//     padding:18px;
//     border-radius:6px;
//   "
// >

// <p
//   style="
//     margin:0;
//     color:#555;
//     font-size:15px;
//     line-height:24px;
//   "
// >

// If the button above does not work, copy and
// paste the following link into your browser:

// </p>


// <p
//   style="
//     margin-top:12px;
//     word-break:break-all;
//   "
// >

// <a
//   href="${link}"
//   style="color:#0f4c81;"
// >
// ${link}
// </a>

// </p>

// </div>


// <p
//   style="
//     margin-top:35px;
//     font-size:15px;
//     color:#555;
//     line-height:26px;
//   "
// >

// <strong>Important:</strong>
// This verification link is unique to you and
// should not be shared with anyone else.

// </p>


// <p
//   style="
//     margin-top:15px;
//     font-size:15px;
//     color:#555;
//     line-height:26px;
//   "
// >

// Once your identity has been verified, you will
// be able to review and complete any required
// documents for your transaction.

// </p>


// <p
//   style="
//     margin-top:35px;
//     font-size:16px;
//     color:#222;
//   "
// >

// Kind Regards,<br>

// <strong>RealtorParth Team</strong>

// </p>

// </td>

// </tr>


// <!-- FOOTER -->

// <tr>

// <td
//   style="
//     background:#f7f7f7;
//     padding:22px;
//     text-align:center;
//     color:#777;
//     font-size:13px;
//     line-height:22px;
//   "
// >

// This is an automated email from RealtorParth.
// <br>

// Please do not reply directly to this email.

// </td>

// </tr>

// </table>

// </td>

// </tr>

// </table>

// </body>

// </html>
// `,
//     });

//     console.log(
//       `Verification email sent to ${party.email}`
//     );

//   } catch (error) {
//     console.error(
//       "SEND PARTY EMAIL ERROR:",
//       error
//     );
//   }
// };


// // ============================================================
// // SAVE PARTIES
// // ============================================================

// router.post("/save", async (req, res) => {
//   try {
//     const {
//       transactionId,
//       parties,
//       userId,
//     } = req.body;


//     // ========================================================
//     // VALIDATE INPUT
//     // ========================================================

//     if (!transactionId) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing transactionId",
//       });
//     }

//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing userId",
//       });
//     }

//     if (!Array.isArray(parties)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid parties data",
//       });
//     }


//     // ========================================================
//     // FIND TRANSACTION
//     // ========================================================

//     const transaction =
//       await Transaction.findOne({
//         _id: transactionId,
//         userId,
//       });


//     if (!transaction) {
//       return res.json({
//         success: false,
//         message: "Unauthorized",
//       });
//     }


//     const savedParties = [];


//     // ========================================================
//     // LOOP PARTIES
//     // ========================================================

//     for (const p of parties) {
//       let party;


//       // ======================================================
//       // UPDATE EXISTING PARTY
//       // ======================================================

//       if (p._id) {
//         party =
//           await TransactionParty.findOneAndUpdate(
//             {
//               _id: p._id,
//               transactionId,
//               userId,
//             },

//             {
//               name: p.name,
//               email: p.email,
//               phone: p.phone,
//               role: p.role,
//               userId,
//             },

//             {
//               new: true,
//             }
//           );
//       }


//       // ======================================================
//       // CREATE NEW PARTY
//       // ======================================================

//       else {
//         party =
//           await TransactionParty.create({
//             transactionId,
//             userId,
//             name: p.name,
//             email: p.email,
//             phone: p.phone,
//             role: p.role,
//           });


//         // ====================================================
//         // SEND EMAIL ONLY FOR NEW PARTY
//         // ====================================================

//         sendPartyEmail(party);
//       }


//       if (party) {
//         savedParties.push(party);
//       }
//     }


//     return res.json({
//       success: true,
//       parties: savedParties,
//     });

//   } catch (error) {
//     console.error(
//       "SAVE PARTIES ERROR:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         error.message ||
//         "Failed to save parties",
//     });
//   }
// });


// // ============================================================
// // GET PARTY SETTINGS
// // ============================================================

// router.get(
//   "/transactionParty/settings/:partyId",
//   async (req, res) => {
//     try {
//       const partysettings =
//         await TransactionParty.findById(
//           req.params.partyId
//         );


//       if (!partysettings) {
//         return res.json({
//           success: false,
//           message: "Party not found",
//         });
//       }


//       return res.json({
//         success: true,
//         data: partysettings,
//       });

//     } catch (err) {
//       console.error(
//         "GET PARTY SETTINGS ERROR:",
//         err
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           err.message ||
//           "Unable to load party settings",
//       });
//     }
//   }
// );


// // ============================================================
// // GET SINGLE PARTY
// // ============================================================

// router.get(
//   "/party/:id",
//   async (req, res) => {
//     try {
//       const party =
//         await TransactionParty.findById(
//           req.params.id
//         );


//       if (!party) {
//         return res.status(404).json({
//           success: false,
//           message: "Invalid link",
//         });
//       }


//       return res.json({
//         success: true,
//         party,
//       });

//     } catch (error) {
//       console.error(
//         "GET PARTY ERROR:",
//         error
//       );


//       return res.status(500).json({
//         success: false,
//         message:
//           error.message ||
//           "Unable to load party",
//       });
//     }
//   }
// );


// // ============================================================
// // GET PARTIES
// // ============================================================

// router.get(
//   "/:transactionId/:userId",
//   async (req, res) => {
//     try {
//       const transaction =
//         await Transaction.findOne({
//           _id: req.params.transactionId,
//           userId: req.params.userId,
//         });


//       if (!transaction) {
//         return res.json({
//           success: false,
//           message: "Unauthorized",
//         });
//       }


//       const parties =
//         await TransactionParty.find({
//           transactionId:
//             req.params.transactionId,
//         });


//       return res.json({
//         success: true,
//         parties,
//       });

//     } catch (error) {
//       console.error(
//         "GET PARTIES ERROR:",
//         error
//       );


//       return res.status(500).json({
//         success: false,
//         message:
//           error.message ||
//           "Unable to load parties",
//       });
//     }
//   }
// );


// // ============================================================
// // DELETE PARTY
// // ============================================================

// router.delete(
//   "/:id/:userId",
//   async (req, res) => {
//     try {
//       const party =
//         await TransactionParty.findById(
//           req.params.id
//         );


//       if (!party) {
//         return res.json({
//           success: false,
//           message: "Party not found",
//         });
//       }


//       const transaction =
//         await Transaction.findOne({
//           _id: party.transactionId,
//           userId: req.params.userId,
//         });


//       if (!transaction) {
//         return res.json({
//           success: false,
//           message: "Unauthorized",
//         });
//       }


//       await TransactionParty.findByIdAndDelete(
//         req.params.id
//       );


//       return res.json({
//         success: true,
//       });

//     } catch (error) {
//       console.error(
//         "DELETE PARTY ERROR:",
//         error
//       );


//       return res.status(500).json({
//         success: false,
//         message:
//           error.message ||
//           "Unable to delete party",
//       });
//     }
//   }
// );


// // ============================================================
// // HELPER — EMPTY DOCUMENT DATA
// // ============================================================

// const emptyDocumentData = () => ({
//   validDocument: false,
//   confidence: 0,
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
//   reason: "",
// });


// // ============================================================
// // HELPER — EMPTY DOCUMENT VERIFICATION
// // ============================================================

// const emptyDocumentVerification = () => ({
//   uploaded: false,
//   verified: false,
//   confidence: 0,
//   verifiedAt: null,
// });


// // ============================================================
// // HELPER — COMPRESS BASE64 IMAGE
// // ============================================================

// const compressBase64 = async (base64) => {
//   if (!base64) {
//     return "";
//   }


//   try {
//     const cleanBase64 =
//       base64
//         .replace(
//           /^data:image\/[\w.+-]+;base64,/i,
//           ""
//         )
//         .trim();


//     if (!cleanBase64) {
//       throw new Error(
//         "Invalid image data"
//       );
//     }


//     const buffer =
//       Buffer.from(
//         cleanBase64,
//         "base64"
//       );


//     if (!buffer.length) {
//       throw new Error(
//         "Invalid image data"
//       );
//     }


//     const compressed =
//       await sharp(buffer)
//         .resize({
//           width: 1000,
//           withoutEnlargement: true,
//         })
//         .jpeg({
//           quality: 70,
//           mozjpeg: true,
//         })
//         .toBuffer();


//     return (
//       "data:image/jpeg;base64," +
//       compressed.toString("base64")
//     );

//   } catch (error) {
//     console.error(
//       "IMAGE COMPRESSION ERROR:",
//       error
//     );

//     throw new Error(
//       "Unable to process uploaded image."
//     );
//   }
// };


// // ============================================================
// // UPLOAD + AI VALIDATE DOCUMENTS
// //
// // FLOW:
// //
// // Upload Licence / Passport
// //       ↓
// // AI OCR + Document Verification
// //       ↓
// // At least one valid document
// //       ↓
// // SELFIE_PENDING
// //       ↓
// // User takes ONE selfie holding ONE verified document
// // ============================================================

// router.post(
//   "/upload-documents",
//   async (req, res) => {
//     try {
//       const {
//         partyId,
//         licenseImage,
//         passportImage,
//       } = req.body;


//       // ======================================================
//       // VALIDATE PARTY ID
//       // ======================================================

//       if (!partyId) {
//         return res.status(400).json({
//           success: false,
//           message: "Missing partyId",
//         });
//       }


//       // ======================================================
//       // FIND PARTY
//       // ======================================================

//       const party =
//         await TransactionParty.findById(
//           partyId
//         );


//       if (!party) {
//         return res.status(404).json({
//           success: false,
//           message: "Party not found",
//         });
//       }


//       // ======================================================
//       // AT LEAST ONE DOCUMENT
//       // ======================================================

//       if (
//         !licenseImage &&
//         !passportImage
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Please upload at least one identity document.",
//         });
//       }


//       // ======================================================
//       // COMPRESS DOCUMENT IMAGES
//       // ======================================================

//       let compressedLicense = "";
//       let compressedPassport = "";


//       try {
//         [
//           compressedLicense,
//           compressedPassport,
//         ] = await Promise.all([
//           licenseImage
//             ? compressBase64(licenseImage)
//             : Promise.resolve(""),

//           passportImage
//             ? compressBase64(passportImage)
//             : Promise.resolve(""),
//         ]);

//       } catch (error) {
//         return res.status(400).json({
//           success: false,
//           message:
//             error.message ||
//             "Unable to process uploaded images.",
//         });
//       }


//       // ======================================================
//       // AI OCR VARIABLES
//       // ======================================================

//       let licenseData =
//         emptyDocumentData();

//       let passportData =
//         emptyDocumentData();


//       // ======================================================
//       // LICENSE AI VALIDATION
//       // ======================================================

//       if (compressedLicense) {
//         try {
//           licenseData =
//             await extractDocumentData(
//               compressedLicense
//             );

//         } catch (error) {
//           console.error(
//             "License OCR Failed:",
//             error
//           );

//           licenseData = {
//             ...emptyDocumentData(),
//             reason:
//               "Unable to analyze Driving Licence.",
//           };
//         }
//       }


//       // ======================================================
//       // PASSPORT AI VALIDATION
//       // ======================================================

//       if (compressedPassport) {
//         try {
//           passportData =
//             await extractDocumentData(
//               compressedPassport
//             );

//         } catch (error) {
//           console.error(
//             "Passport OCR Failed:",
//             error
//           );

//           passportData = {
//             ...emptyDocumentData(),
//             reason:
//               "Unable to analyze Passport.",
//           };
//         }
//       }


//       // ======================================================
//       // RESULT OBJECT
//       // ======================================================

//       const documentResults = {
//         license: {
//           uploaded: false,
//           valid: false,
//           confidence: 0,
//           message: "",
//         },

//         passport: {
//           uploaded: false,
//           valid: false,
//           confidence: 0,
//           message: "",
//         },
//       };


//       // ======================================================
//       // VALIDATE LICENSE
//       // ======================================================

//       if (compressedLicense) {
//         documentResults.license.uploaded =
//           true;


//         if (
//           !licenseData ||
//           licenseData.validDocument !== true
//         ) {
//           documentResults.license.valid =
//             false;

//           documentResults.license.confidence =
//             Number(
//               licenseData?.confidence
//             ) || 0;

//           documentResults.license.message =
//             licenseData?.reason ||
//             "Please upload a valid Driving Licence.";

//         } else {
//           const type =
//             String(
//               licenseData.documentType || ""
//             )
//               .trim()
//               .toLowerCase();


//           const isLicense =
//             type === "license";


//           if (!isLicense) {
//             documentResults.license.valid =
//               false;

//             documentResults.license.confidence =
//               Number(
//                 licenseData?.confidence
//               ) || 0;

//             documentResults.license.message =
//               "The uploaded document is not a Driving Licence.";

//           } else {
//             documentResults.license.valid =
//               true;

//             documentResults.license.confidence =
//               Number(
//                 licenseData.confidence
//               ) || 0;

//             documentResults.license.message =
//               "Driving Licence verified.";
//           }
//         }
//       }


//       // ======================================================
//       // VALIDATE PASSPORT
//       // ======================================================

//       if (compressedPassport) {
//         documentResults.passport.uploaded =
//           true;


//         if (
//           !passportData ||
//           passportData.validDocument !== true
//         ) {
//           documentResults.passport.valid =
//             false;

//           documentResults.passport.confidence =
//             Number(
//               passportData?.confidence
//             ) || 0;

//           documentResults.passport.message =
//             passportData?.reason ||
//             "Please upload a valid Passport.";

//         } else {
//           const type =
//             String(
//               passportData.documentType || ""
//             )
//               .trim()
//               .toLowerCase();


//           const isPassport =
//             type === "passport";


//           if (!isPassport) {
//             documentResults.passport.valid =
//               false;

//             documentResults.passport.confidence =
//               Number(
//                 passportData?.confidence
//               ) || 0;

//             documentResults.passport.message =
//               "The uploaded document is not a Passport.";

//           } else {
//             documentResults.passport.valid =
//               true;

//             documentResults.passport.confidence =
//               Number(
//                 passportData.confidence
//               ) || 0;

//             documentResults.passport.message =
//               "Passport verified.";
//           }
//         }
//       }


//       // ======================================================
//       // CHECK VALID DOCUMENT
//       // ======================================================

//       const licenseValid =
//         documentResults.license.valid;

//       const passportValid =
//         documentResults.passport.valid;

//       const atLeastOneValid =
//         licenseValid ||
//         passportValid;


//       // ======================================================
//       // NO VALID DOCUMENT
//       // ======================================================

//       if (!atLeastOneValid) {
//         return res.status(400).json({
//           success: false,

//           message:
//             "No valid identity document was uploaded.",

//           documents:
//             documentResults,
//         });
//       }


//       // ======================================================
//       // INITIALIZE IDENTITY DATA
//       // ======================================================

//       if (!party.identityData) {
//         party.identityData = {};
//       }


//       // ======================================================
//       // INITIALIZE IDENTITY VERIFICATION
//       // ======================================================

//       if (!party.identityVerification) {
//         party.identityVerification = {};
//       }


//       if (
//         !party.identityVerification.documents
//       ) {
//         party.identityVerification.documents =
//           {};
//       }


//       // ======================================================
//       // IMPORTANT
//       //
//       // If a document is uploaded again, the old selfie
//       // must not remain verified because the selfie may have
//       // been holding the previous version of the document.
//       //
//       // We therefore reset the SINGLE selfie.
//       // ======================================================

//       party.identityVerification.selfie = {
//         uploaded: false,
//         verified: false,

//         documentType: null,

//         faceDetected: false,
//         documentDetected: false,
//         documentHeld: false,
//         documentTypeMatches: false,
//         documentDataMatches: false,
//         faceVisuallyConsistent: false,
//         imageQualityGood: false,

//         confidence: 0,

//         extractedDocumentData: {
//           documentType: "",
//           fullName: "",
//           firstName: "",
//           lastName: "",
//           documentNumber: "",
//           dateOfBirth: "",
//           issueDate: "",
//           expiryDate: "",
//           nationality: "",
//           issuingCountry: "",
//           issuingProvince: "",
//           address: "",
//           sex: "",
//           placeOfBirth: "",
//           class: "",
//           restrictions: "",
//           raw: {},
//         },

//         comparison: {
//           documentNumberMatch: false,
//           nameMatch: false,
//           dateOfBirthMatch: false,
//           expiryDateMatch: false,
//           documentTypeMatch: false,
//           issuingCountryMatch: false,
//           nationalityMatch: false,
//           faceMatch: false,
//         },

//         verifiedAt: null,
//       };


//       // ======================================================
//       // SAVE LICENSE ONLY IF VALID
//       // ======================================================

//       if (
//         compressedLicense &&
//         licenseValid
//       ) {
//         party.licenseImage =
//           compressedLicense;


//         party.identityData.license =
//           licenseData;


//         party.identityVerification.documents.license =
//           {
//             uploaded: true,

//             verified: true,

//             confidence:
//               Number(
//                 licenseData?.confidence
//               ) || 0,

//             verifiedAt:
//               new Date(),
//           };


//         console.log(
//           "Driving Licence verified."
//         );

//         console.log(
//           licenseData
//         );

//       } else if (compressedLicense) {

//         // Uploaded but invalid.
//         // Do not replace an existing verified document
//         // with an invalid upload.

//         console.log(
//           "Driving Licence upload rejected."
//         );
//       }


//       // ======================================================
//       // SAVE PASSPORT ONLY IF VALID
//       // ======================================================

//       if (
//         compressedPassport &&
//         passportValid
//       ) {
//         party.passportImage =
//           compressedPassport;


//         party.identityData.passport =
//           passportData;


//         party.identityVerification.documents.passport =
//           {
//             uploaded: true,

//             verified: true,

//             confidence:
//               Number(
//                 passportData?.confidence
//               ) || 0,

//             verifiedAt:
//               new Date(),
//           };


//         console.log(
//           "Passport verified."
//         );

//         console.log(
//           passportData
//         );

//       } else if (compressedPassport) {

//         console.log(
//           "Passport upload rejected."
//         );
//       }


//       // ======================================================
//       // DETERMINE VERIFIED DOCUMENTS
//       // ======================================================

//       const verifiedLicense =
//         Boolean(
//           party.identityVerification
//             ?.documents
//             ?.license
//             ?.verified
//         );


//       const verifiedPassport =
//         Boolean(
//           party.identityVerification
//             ?.documents
//             ?.passport
//             ?.verified
//         );


//       // ======================================================
//       // FINAL CHECK
//       // ======================================================

//       if (
//         !verifiedLicense &&
//         !verifiedPassport
//       ) {
//         return res.status(400).json({
//           success: false,

//           message:
//             "No verified identity document is available.",

//           documents:
//             documentResults,
//         });
//       }


//       // ======================================================
//       // DOCUMENT VERIFIED
//       //
//       // IMPORTANT:
//       //
//       // We do NOT mark the whole identity as verified yet.
//       //
//       // User must now take ONE selfie holding ONE verified
//       // document.
//       // ======================================================

//       party.identityVerification.status =
//         "selfie_pending";


//       // ======================================================
//       // CLEAR FAILURE
//       // ======================================================

//       party.identityVerification.failureReason =
//         "";


//       // ======================================================
//       // SAVE PARTY
//       // ======================================================

//       await party.save();


//       // ======================================================
//       // RESPONSE
//       // ======================================================

//       return res.json({
//         success: true,

//         message:
//           "Documents verified. Please complete the required selfie verification.",

//         documents:
//           documentResults,

//         identityData:
//           party.identityData,

//         identityVerification: {
//           status:
//             party.identityVerification.status,

//           documents:
//             party.identityVerification.documents,

//           selfie:
//             party.identityVerification.selfie,
//         },

//         nextStep:
//           "selfie",
//       });

//     } catch (error) {
//       console.error(
//         "UPLOAD DOCUMENTS ERROR:",
//         error
//       );


//       return res.status(500).json({
//         success: false,

//         message:
//           error.message ||
//           "Internal Server Error",
//       });
//     }
//   }
// );


// // ============================================================
// // VALIDATE ONE SELFIE
// //
// // FLOW:
// //
// // Verified Licence/Passport
// //          ↓
// // User chooses ONE verified document
// //          ↓
// // Takes ONE selfie holding that document
// //          ↓
// // AI checks:
// //   - Face
// //   - Document
// //   - Document held
// //   - Document type
// //   - OCR
// //   - Document data match
// //   - Face consistency
// //   - Image quality
// //          ↓
// // verified
// //          ↓
// // FINTRAC
// // ============================================================

// router.post(
//   "/validate-selfie",
//   async (req, res) => {
//     try {
//       const {
//         partyId,
//         documentType,
//         selfie,
//       } = req.body;


//       // ======================================================
//       // VALIDATE INPUT
//       // ======================================================

//       if (!partyId) {
//         return res.status(400).json({
//           success: false,
//           message: "Missing partyId.",
//         });
//       }


//       if (!selfie) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Please provide a selfie image.",
//         });
//       }


//       // ======================================================
//       // ONLY LICENSE OR PASSPORT
//       // ======================================================

//       const normalizedDocumentType =
//         String(
//           documentType || ""
//         )
//           .trim()
//           .toLowerCase();


//       if (
//         normalizedDocumentType !== "license" &&
//         normalizedDocumentType !== "passport"
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "documentType must be either license or passport.",
//         });
//       }


//       // ======================================================
//       // FIND PARTY
//       // ======================================================

//       const party =
//         await TransactionParty.findById(
//           partyId
//         );


//       if (!party) {
//         return res.status(404).json({
//           success: false,
//           message: "Party not found.",
//         });
//       }


//       // ======================================================
//       // CHECK DOCUMENT VERIFICATION
//       // ======================================================

//       const selectedDocumentVerification =
//         party.identityVerification
//           ?.documents
//           ?.[normalizedDocumentType];


//       if (
//         !selectedDocumentVerification
//           ?.verified
//       ) {
//         return res.status(400).json({
//           success: false,

//           message:
//             `The selected ${normalizedDocumentType} has not been verified. Please verify the document first.`,

//           nextStep:
//             "document",
//         });
//       }


//       // ======================================================
//       // GET ORIGINAL DOCUMENT IMAGE
//       // ======================================================

//       const originalDocumentImage =
//         normalizedDocumentType ===
//         "license"
//           ? party.licenseImage
//           : party.passportImage;


//       if (!originalDocumentImage) {
//         return res.status(400).json({
//           success: false,

//           message:
//             "Original verified document image was not found.",
//         });
//       }


//       // ======================================================
//       // GET ORIGINAL OCR DATA
//       // ======================================================

//       const originalDocumentData =
//         party.identityData
//           ?.[normalizedDocumentType];


//       if (!originalDocumentData) {
//         return res.status(400).json({
//           success: false,

//           message:
//             "Original verified document data was not found.",
//         });
//       }


//       // ======================================================
//       // COMPRESS SELFIE
//       //
//       // Keep enough resolution for:
//       // - face
//       // - document
//       // - OCR
//       //
//       // Do not compress too aggressively.
//       // ======================================================

//       let compressedSelfie = "";


//       try {
//         compressedSelfie =
//           await compressBase64(
//             selfie
//           );

//       } catch (error) {
//         return res.status(400).json({
//           success: false,

//           message:
//             error.message ||
//             "Unable to process selfie image.",
//         });
//       }


//       // ======================================================
//       // AI SELFIE VERIFICATION
//       // ======================================================

//       let verificationResult;


//       try {
//         verificationResult =
//           await verifySelfieAgainstDocument({
//             selfieImage:
//               compressedSelfie,

//             originalDocumentImage:
//               originalDocumentImage,

//             originalDocumentData:
//               originalDocumentData,

//             documentType:
//               normalizedDocumentType,
//           });

//       } catch (error) {
//         console.error(
//           "SELFIE AI VERIFICATION ERROR:",
//           error
//         );


//         return res.status(500).json({
//           success: false,

//           message:
//             "Unable to verify selfie at this time.",
//         });
//       }


//       // ======================================================
//       // NORMALIZE AI RESPONSE
//       // ======================================================

//       const result =
//         verificationResult || {};


//       const confidence =
//         Math.max(
//           0,
//           Math.min(
//             100,
//             Number(
//               result.confidence
//             ) || 0
//           )
//         );


//       const extracted =
//         result.extractedDocumentData ||
//         {};


//       const comparison =
//         result.comparison ||
//         {};


//       // ======================================================
//       // BUILD SINGLE SELFIE OBJECT
//       // ======================================================

//       const selfieVerification = {
//         uploaded: true,

//         verified:
//           result.verified === true,

//         documentType:
//           normalizedDocumentType,

//         faceDetected:
//           result.faceDetected === true,

//         documentDetected:
//           result.documentDetected === true,

//         documentHeld:
//           result.documentHeld === true,

//         documentTypeMatches:
//           result.documentTypeMatches === true,

//         documentDataMatches:
//           result.documentDataMatches === true,

//         faceVisuallyConsistent:
//           result.faceVisuallyConsistent === true,

//         imageQualityGood:
//           result.imageQualityGood === true,

//         confidence,

//         extractedDocumentData: {
//           documentType:
//             String(
//               extracted.documentType || ""
//             ).trim(),

//           fullName:
//             String(
//               extracted.fullName || ""
//             ).trim(),

//           firstName:
//             String(
//               extracted.firstName || ""
//             ).trim(),

//           lastName:
//             String(
//               extracted.lastName || ""
//             ).trim(),

//           documentNumber:
//             String(
//               extracted.documentNumber || ""
//             ).trim(),

//           dateOfBirth:
//             String(
//               extracted.dateOfBirth || ""
//             ).trim(),

//           issueDate:
//             String(
//               extracted.issueDate || ""
//             ).trim(),

//           expiryDate:
//             String(
//               extracted.expiryDate || ""
//             ).trim(),

//           nationality:
//             String(
//               extracted.nationality || ""
//             ).trim(),

//           issuingCountry:
//             String(
//               extracted.issuingCountry || ""
//             ).trim(),

//           issuingProvince:
//             String(
//               extracted.issuingProvince || ""
//             ).trim(),

//           address:
//             String(
//               extracted.address || ""
//             ).trim(),

//           sex:
//             String(
//               extracted.sex || ""
//             ).trim(),

//           placeOfBirth:
//             String(
//               extracted.placeOfBirth || ""
//             ).trim(),

//           class:
//             String(
//               extracted.class || ""
//             ).trim(),

//           restrictions:
//             String(
//               extracted.restrictions || ""
//             ).trim(),

//           raw:
//             extracted.raw &&
//             typeof extracted.raw === "object"
//               ? extracted.raw
//               : {},
//         },

//         comparison: {
//           documentNumberMatch:
//             comparison.documentNumberMatch ===
//             true,

//           nameMatch:
//             comparison.nameMatch ===
//             true,

//           dateOfBirthMatch:
//             comparison.dateOfBirthMatch ===
//             true,

//           expiryDateMatch:
//             comparison.expiryDateMatch ===
//             true,

//           documentTypeMatch:
//             comparison.documentTypeMatch ===
//             true,

//           issuingCountryMatch:
//             comparison.issuingCountryMatch ===
//             true,

//           nationalityMatch:
//             comparison.nationalityMatch ===
//             true,

//           faceMatch:
//             comparison.faceMatch ===
//             true,
//         },

//         verifiedAt:
//           result.verified === true
//             ? new Date()
//             : null,
//       };


//       // ======================================================
//       // SAVE SINGLE SELFIE
//       // ======================================================

//       party.identityVerification.selfie =
//         selfieVerification;


//       // ======================================================
//       // DETERMINE FINAL STATUS
//       // ======================================================

//       if (
//         selfieVerification.verified
//       ) {
//         party.identityVerification.status =
//           "verified";

//         party.identityVerification.failureReason =
//           "";

//         party.identityVerification.verifiedAt =
//           new Date();

//       } else {
//         party.identityVerification.status =
//           "failed";

//         party.identityVerification.failureReason =
//           result.reason ||
//           "Selfie verification failed.";
//       }


//       // ======================================================
//       // SAVE PARTY
//       // ======================================================

//       await party.save();


//       // ======================================================
//       // SELFIE FAILED
//       // ======================================================

//       if (
//         !selfieVerification.verified
//       ) {
//         return res.status(400).json({
//           success: false,

//           verified: false,

//           message:
//             result.reason ||
//             "Selfie verification failed. Please try again.",

//           selfie:
//             party.identityVerification.selfie,

//           identityVerification: {
//             status:
//               party.identityVerification.status,

//             failureReason:
//               party.identityVerification
//                 .failureReason,

//             documents:
//               party.identityVerification
//                 .documents,

//             selfie:
//               party.identityVerification
//                 .selfie,
//           },

//           nextStep:
//             "selfie",
//         });
//       }


//       // ======================================================
//       // SELFIE SUCCESS
//       // ======================================================

//       return res.json({
//         success: true,

//         verified: true,

//         message:
//           "Identity verification completed successfully.",

//         selfie:
//           party.identityVerification.selfie,

//         identityVerification: {
//           status:
//             party.identityVerification.status,

//           verifiedAt:
//             party.identityVerification
//               .verifiedAt,

//           documents:
//             party.identityVerification
//               .documents,

//           selfie:
//             party.identityVerification
//               .selfie,
//         },

//         nextStep:
//           "fintrac",
//       });

//     } catch (error) {
//       console.error(
//         "VALIDATE SELFIE ERROR:",
//         error
//       );


//       return res.status(500).json({
//         success: false,

//         message:
//           error.message ||
//           "Internal Server Error",
//       });
//     }
//   }
// );


// // ============================================================
// // GET IDENTITY VERIFICATION STATUS
// //
// // Useful for frontend refresh / onboarding resume.
// //
// // Returns:
// //
// // document verification
// // selfie verification
// // current status
// // next step
// // ============================================================

// router.get(
//   "/identity-verification/:partyId",
//   async (req, res) => {
//     try {
//       const party =
//         await TransactionParty.findById(
//           req.params.partyId
//         );


//       if (!party) {
//         return res.status(404).json({
//           success: false,
//           message: "Party not found.",
//         });
//       }


//       const identityVerification =
//         party.identityVerification;


//       const licenseVerified =
//         Boolean(
//           identityVerification
//             ?.documents
//             ?.license
//             ?.verified
//         );


//       const passportVerified =
//         Boolean(
//           identityVerification
//             ?.documents
//             ?.passport
//             ?.verified
//         );


//       const selfieVerified =
//         Boolean(
//           identityVerification
//             ?.selfie
//             ?.verified
//         );


//       let nextStep =
//         "document";


//       if (
//         licenseVerified ||
//         passportVerified
//       ) {
//         nextStep = "selfie";
//       }


//       if (selfieVerified) {
//         nextStep = "fintrac";
//       }


//       return res.json({
//         success: true,

//         status:
//           identityVerification?.status ||
//           "pending",

//         nextStep,

//         documents:
//           identityVerification
//             ?.documents || {},

//         selfie:
//           identityVerification
//             ?.selfie || null,

//         failureReason:
//           identityVerification
//             ?.failureReason || "",

//         verifiedAt:
//           identityVerification
//             ?.verifiedAt || null,
//       });

//     } catch (error) {
//       console.error(
//         "GET IDENTITY VERIFICATION ERROR:",
//         error
//       );


//       return res.status(500).json({
//         success: false,

//         message:
//           error.message ||
//           "Unable to get verification status.",
//       });
//     }
//   }
// );


// // ============================================================
// // EXPORT ROUTER
// // ============================================================

// export default router;









































// import express from "express";
// import nodemailer from "nodemailer";
// import sharp from "sharp";

// import Transaction from "../models/Transaction.js";
// import TransactionParty from "../models/TransactionParty.js";

// import extractDocumentData from "../utils/extractDocumentData.js";

// const router = express.Router();


// // ============================================================
// // EMAIL SETUP
// // ============================================================

// const transporter = nodemailer.createTransport({
//   host: "smtp-relay.brevo.com",
//   port: 587,
//   secure: false,
//   auth: {
//     user: 'axxxxxxxxxxxxxxxxxxxxxxxxo.com',
//     pass: 'xsccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccL',
//   },
// });



// // ============================================================
// // SEND PARTY EMAIL
// // ============================================================

// const sendPartyEmail = async (party) => {

//   const link = `https://yourdomain.com/party/onboarding/${party._id}`;

//   await transporter.sendMail({

//     from: `"Transaction Portal" <yourgmail@gmail.com>`,

//     to: party.email,

//     subject:
//       "Complete Your Transaction Verification",

//     html: `
// <!DOCTYPE html>
// <html>

// <head>
// <meta charset="UTF-8" />
// </head>

// <body
//   style="
//     margin:0;
//     padding:0;
//     background:#f4f6f9;
//     font-family:Arial,Helvetica,sans-serif;
//   "
// >

// <table
//   width="100%"
//   cellpadding="0"
//   cellspacing="0"
//   style="
//     background:#f4f6f9;
//     padding:40px 0;
//   "
// >

// <tr>

// <td align="center">

// <table
//   width="600"
//   cellpadding="0"
//   cellspacing="0"
//   style="
//     background:#ffffff;
//     border-radius:12px;
//     overflow:hidden;
//     box-shadow:0 6px 20px rgba(0,0,0,.08);
//   "
// >

// <!-- HEADER -->

// <tr>

// <td
//   style="
//     background:#0f4c81;
//     padding:28px;
//     text-align:center;
//   "
// >

// <h1
//   style="
//     margin:0;
//     color:#ffffff;
//     font-size:28px;
//     font-weight:700;
//   "
// >
// RealtorParth
// </h1>

// </td>

// </tr>


// <!-- BODY -->

// <tr>

// <td style="padding:40px;">

// <h2
//   style="
//     margin-top:0;
//     color:#222;
//     font-size:26px;
//   "
// >
// Hello ${party.name},
// </h2>


// <p
//   style="
//     font-size:16px;
//     color:#555;
//     line-height:28px;
//   "
// >

// You have been added as a participant in a
// <strong>RealtorParth transaction</strong>.

// </p>


// <p
//   style="
//     font-size:16px;
//     color:#555;
//     line-height:28px;
//   "
// >

// Before accessing your transaction documents,
// we need to verify your identity.

// Please click the button below to securely
// complete your verification.

// </p>


// <table
//   width="100%"
//   cellpadding="0"
//   cellspacing="0"
//   style="margin:35px 0;"
// >

// <tr>

// <td align="center">

// <a
//   href="${link}"
//   style="
//     background:#0f4c81;
//     color:#ffffff;
//     text-decoration:none;
//     padding:16px 36px;
//     border-radius:8px;
//     display:inline-block;
//     font-size:16px;
//     font-weight:600;
//   "
// >
// Verify Your Identity
// </a>

// </td>

// </tr>

// </table>


// <div
//   style="
//     background:#f8f9fb;
//     border-left:4px solid #0f4c81;
//     padding:18px;
//     border-radius:6px;
//   "
// >

// <p
//   style="
//     margin:0;
//     color:#555;
//     font-size:15px;
//     line-height:24px;
//   "
// >

// If the button above does not work, copy and
// paste the following link into your browser:

// </p>


// <p
//   style="
//     margin-top:12px;
//     word-break:break-all;
//   "
// >

// <a
//   href="${link}"
//   style="color:#0f4c81;"
// >
// ${link}
// </a>

// </p>

// </div>


// <p
//   style="
//     margin-top:35px;
//     font-size:15px;
//     color:#555;
//     line-height:26px;
//   "
// >

// <strong>Important:</strong>
// This verification link is unique to you and
// should not be shared with anyone else.

// </p>


// <p
//   style="
//     margin-top:15px;
//     font-size:15px;
//     color:#555;
//     line-height:26px;
//   "
// >

// Once your identity has been verified, you will
// be able to review and complete any required
// documents for your transaction.

// </p>


// <p
//   style="
//     margin-top:35px;
//     font-size:16px;
//     color:#222;
//   "
// >

// Kind Regards,<br>

// <strong>RealtorParth Team</strong>

// </p>

// </td>

// </tr>


// <!-- FOOTER -->

// <tr>

// <td
//   style="
//     background:#f7f7f7;
//     padding:22px;
//     text-align:center;
//     color:#777;
//     font-size:13px;
//     line-height:22px;
//   "
// >

// This is an automated email from RealtorParth.
// <br>

// Please do not reply directly to this email.

// </td>

// </tr>

// </table>

// </td>

// </tr>

// </table>

// </body>

// </html>
// `,
//   });

// };


// // ============================================================
// // SAVE PARTIES
// // ============================================================

// router.post("/save", async (req, res) => {

//   try {

//     const {
//       transactionId,
//       parties,
//       userId
//     } = req.body;


//     // ========================================================
//     // FIND TRANSACTION
//     // ========================================================

//     const transaction =
//       await Transaction.findOne({
//         _id: transactionId,
//         userId
//       });


//     if (!transaction) {

//       return res.json({
//         success: false,
//         message: "Unauthorized"
//       });

//     }


//     const savedParties = [];


//     // ========================================================
//     // LOOP PARTIES
//     // ========================================================

//     for (const p of parties) {

//       let party;


//       // ======================================================
//       // UPDATE EXISTING PARTY
//       // ======================================================

//       if (p._id) {

//         party =
//           await TransactionParty.findByIdAndUpdate(
//             p._id,

//             {
//               name: p.name,
//               email: p.email,
//               phone: p.phone,
//               role: p.role,
//               userId
//             },

//             {
//               new: true
//             }
//           );

//       }


//       // ======================================================
//       // CREATE NEW PARTY
//       // ======================================================

//       else {

//         party =
//           await TransactionParty.create({

//             transactionId,

//             userId,

//             name: p.name,

//             email: p.email,

//             phone: p.phone,

//             role: p.role

//           });


//         // ====================================================
//         // SEND EMAIL ONLY FOR NEW PARTY
//         // ====================================================

//         sendPartyEmail(party).catch(
//           (err) =>
//             console.error(
//               "Email Error:",
//               err
//             )
//         );

//       }


//       if (party) {
//         savedParties.push(party);
//       }

//     }


//     return res.json({

//       success: true,

//       parties: savedParties

//     });

//   } catch (error) {

//     console.error(
//       "SAVE PARTIES ERROR:",
//       error
//     );

//     return res.status(500).json({

//       success: false,

//       message:
//         error.message ||
//         "Failed to save parties"

//     });

//   }

// });


// // ============================================================
// // GET PARTY SETTINGS
// // ============================================================

// router.get(
//   "/transactionParty/settings/:partyId",
//   async (req, res) => {

//     try {

//       const partysettings =
//         await TransactionParty.findById(
//           req.params.partyId
//         );


//       console.log(
//         partysettings
//       );


//       if (!partysettings) {

//         return res.json({
//           success: false
//         });

//       }


//       return res.json({

//         success: true,

//         data: partysettings

//       });

//     } catch (err) {

//       console.error(err);

//       return res.status(500).json({
//         success: false
//       });

//     }

//   }
// );


// // ============================================================
// // GET SINGLE PARTY
// // ============================================================

// router.get(
//   "/party/:id",
//   async (req, res) => {

//     try {

//       const party =
//         await TransactionParty.findById(
//           req.params.id
//         );


//       if (!party) {

//         return res.status(404).json({

//           success: false,

//           message: "Invalid link"

//         });

//       }


//       return res.json({

//         success: true,

//         party

//       });

//     } catch (error) {

//       console.error(
//         "GET PARTY ERROR:",
//         error
//       );


//       return res.status(500).json({

//         success: false

//       });

//     }

//   }
// );


// // ============================================================
// // GET PARTIES
// // ============================================================

// router.get(
//   "/:transactionId/:userId",
//   async (req, res) => {

//     try {

//       const transaction =
//         await Transaction.findOne({

//           _id:
//             req.params.transactionId,

//           userId:
//             req.params.userId

//         });


//       if (!transaction) {

//         return res.json({

//           success: false,

//           message: "Unauthorized"

//         });

//       }


//       const parties =
//         await TransactionParty.find({

//           transactionId:
//             req.params.transactionId

//         });


//       return res.json({

//         success: true,

//         parties

//       });

//     } catch (error) {

//       console.error(
//         "GET PARTIES ERROR:",
//         error
//       );


//       return res.status(500).json({

//         success: false

//       });

//     }

//   }
// );


// // ============================================================
// // DELETE PARTY
// // ============================================================

// router.delete(
//   "/:id/:userId",
//   async (req, res) => {

//     try {

//       const party =
//         await TransactionParty.findById(
//           req.params.id
//         );


//       if (!party) {

//         return res.json({
//           success: false
//         });

//       }


//       const transaction =
//         await Transaction.findOne({

//           _id:
//             party.transactionId,

//           userId:
//             req.params.userId

//         });


//       if (!transaction) {

//         return res.json({

//           success: false,

//           message: "Unauthorized"

//         });

//       }


//       await TransactionParty.findByIdAndDelete(
//         req.params.id
//       );


//       return res.json({

//         success: true

//       });

//     } catch (error) {

//       console.error(
//         "DELETE PARTY ERROR:",
//         error
//       );


//       return res.status(500).json({

//         success: false

//       });

//     }

//   }
// );


// // ============================================================
// // UPLOAD + AI VALIDATE DOCUMENTS
// // ============================================================

// router.post(
//   "/upload-documents",
//   async (req, res) => {

//     try {

//       const {
//         partyId,
//         licenseImage,
//         passportImage
//       } = req.body;


//       // ======================================================
//       // VALIDATE PARTY ID
//       // ======================================================

//       if (!partyId) {

//         return res.status(400).json({

//           success: false,

//           message:
//             "Missing partyId"

//         });

//       }


//       // ======================================================
//       // FIND PARTY
//       // ======================================================

//       const party =
//         await TransactionParty.findById(
//           partyId
//         );


//       if (!party) {

//         return res.status(404).json({

//           success: false,

//           message:
//             "Party not found"

//         });

//       }


//       // ======================================================
//       // AT LEAST ONE DOCUMENT
//       // ======================================================

//       if (
//         !licenseImage &&
//         !passportImage
//       ) {

//         return res.status(400).json({

//           success: false,

//           message:
//             "Please upload at least one identity document."

//         });

//       }


//       // ======================================================
//       // COMPRESS IMAGE FUNCTION
//       // ======================================================

//       const compressBase64 =
//         async (base64) => {

//           if (!base64) {
//             return "";
//           }


//           try {

//             const cleanBase64 =
//               base64.replace(
//                 /^data:image\/\w+;base64,/,
//                 ""
//               );


//             const buffer =
//               Buffer.from(
//                 cleanBase64,
//                 "base64"
//               );


//             if (!buffer.length) {

//               throw new Error(
//                 "Invalid image data"
//               );

//             }


//             const compressed =
//               await sharp(buffer)

//                 .resize({

//                   width: 600,

//                   withoutEnlargement:
//                     true

//                 })

//                 .jpeg({

//                   quality: 50

//                 })

//                 .toBuffer();


//             return `data:image/jpeg;base64,${compressed.toString(
//               "base64"
//             )}`;

//           } catch (error) {

//             console.error(
//               "IMAGE COMPRESSION ERROR:",
//               error
//             );


//             throw new Error(
//               "Unable to process uploaded image."
//             );

//           }

//         };


//       // ======================================================
//       // COMPRESS DOCUMENTS
//       // ======================================================

//       let compressedLicense = "";

//       let compressedPassport = "";


//       try {

//         [
//           compressedLicense,
//           compressedPassport
//         ] = await Promise.all([

//           licenseImage
//             ? compressBase64(
//                 licenseImage
//               )
//             : Promise.resolve(""),

//           passportImage
//             ? compressBase64(
//                 passportImage
//               )
//             : Promise.resolve("")

//         ]);

//       } catch (error) {

//         return res.status(400).json({

//           success: false,

//           message:
//             error.message ||
//             "Unable to process uploaded images."

//         });

//       }


//       // ======================================================
//       // AI OCR VARIABLES
//       // ======================================================

//       let licenseData = null;

//       let passportData = null;


//       // ======================================================
//       // LICENSE AI VALIDATION
//       // ======================================================

//       if (compressedLicense) {

//         try {

//           licenseData =
//             await extractDocumentData(
//               compressedLicense
//             );

//         } catch (error) {

//           console.error(
//             "License OCR Failed:",
//             error
//           );


//           licenseData = {

//             validDocument: false,

//             confidence: 0,

//             reason:
//               "Unable to analyze Driving Licence."

//           };

//         }

//       }


//       // ======================================================
//       // PASSPORT AI VALIDATION
//       // ======================================================

//       if (compressedPassport) {

//         try {

//           passportData =
//             await extractDocumentData(
//               compressedPassport
//             );

//         } catch (error) {

//           console.error(
//             "Passport OCR Failed:",
//             error
//           );


//           passportData = {

//             validDocument: false,

//             confidence: 0,

//             reason:
//               "Unable to analyze Passport."

//           };

//         }

//       }


//       // ======================================================
//       // RESULT OBJECT
//       // ======================================================

//       const documentResults = {

//         license: {

//           uploaded: false,

//           valid: false,

//           confidence: 0,

//           message: ""

//         },

//         passport: {

//           uploaded: false,

//           valid: false,

//           confidence: 0,

//           message: ""

//         }

//       };


//       // ======================================================
//       // VALIDATE LICENSE
//       // ======================================================

//       if (compressedLicense) {

//         documentResults.license.uploaded =
//           true;


//         // ----------------------------------------------------
//         // AI REJECTED
//         // ----------------------------------------------------

//         if (
//           !licenseData ||
//           !licenseData.validDocument
//         ) {

//           documentResults.license.valid =
//             false;


//           documentResults.license.confidence =
//             licenseData?.confidence || 0;


//           documentResults.license.message =
//             licenseData?.reason ||
//             "Please upload a valid Driving Licence.";

//         }


//         // ----------------------------------------------------
//         // AI ACCEPTED
//         // ----------------------------------------------------

//         else {

//           const type =
//             (
//               licenseData.documentType ||
//               ""
//             ).toLowerCase();


//           const isLicense =
//             type.includes("driver") ||
//             type.includes("licence") ||
//             type.includes("license");


//           if (!isLicense) {

//             documentResults.license.valid =
//               false;


//             documentResults.license.message =
//               "You uploaded a Passport or another document in the Driving Licence field.";

//           } else {

//             documentResults.license.valid =
//               true;


//             documentResults.license.confidence =
//               licenseData.confidence || 0;


//             documentResults.license.message =
//               "Driving Licence verified.";

//           }

//         }

//       }


//       // ======================================================
//       // VALIDATE PASSPORT
//       // ======================================================

//       if (compressedPassport) {

//         documentResults.passport.uploaded =
//           true;


//         // ----------------------------------------------------
//         // AI REJECTED
//         // ----------------------------------------------------

//         if (
//           !passportData ||
//           !passportData.validDocument
//         ) {

//           documentResults.passport.valid =
//             false;


//           documentResults.passport.confidence =
//             passportData?.confidence || 0;


//           documentResults.passport.message =
//             passportData?.reason ||
//             "Please upload a valid Passport.";

//         }


//         // ----------------------------------------------------
//         // AI ACCEPTED
//         // ----------------------------------------------------

//         else {

//           const type =
//             (
//               passportData.documentType ||
//               ""
//             ).toLowerCase();


//           const isPassport =
//             type.includes("passport");


//           if (!isPassport) {

//             documentResults.passport.valid =
//               false;


//             documentResults.passport.message =
//               "You uploaded a Driving Licence or another document in the Passport field.";

//           } else {

//             documentResults.passport.valid =
//               true;


//             documentResults.passport.confidence =
//               passportData.confidence || 0;


//             documentResults.passport.message =
//               "Passport verified.";

//           }

//         }

//       }


//       // ======================================================
//       // CHECK VALID DOCUMENT
//       // ======================================================

//       const licenseValid =
//         documentResults.license.valid;


//       const passportValid =
//         documentResults.passport.valid;


//       const atLeastOneValid =
//         licenseValid ||
//         passportValid;


//       // ======================================================
//       // NO VALID DOCUMENT
//       // ======================================================

//       if (!atLeastOneValid) {

//         return res.status(400).json({

//           success: false,

//           message:
//             "No valid identity document was uploaded.",

//           documents:
//             documentResults

//         });

//       }


//       // ======================================================
//       // INITIALIZE IDENTITY DATA
//       // ======================================================

//       if (!party.identityData) {

//         party.identityData = {};

//       }


//       // ======================================================
//       // INITIALIZE IDENTITY VERIFICATION
//       // ======================================================

//       if (!party.identityVerification) {

//         party.identityVerification = {};

//       }


//       if (
//         !party.identityVerification.documents
//       ) {

//         party.identityVerification.documents =
//           {};

//       }


//       // ======================================================
//       // SAVE LICENSE ONLY IF VALID
//       // ======================================================

//       if (
//         compressedLicense &&
//         licenseValid
//       ) {

//         // ----------------------------------------------------
//         // SAVE IMAGE
//         // ----------------------------------------------------

//         party.licenseImage =
//           compressedLicense;


//         // ----------------------------------------------------
//         // SAVE OCR DATA
//         // ----------------------------------------------------

//         party.identityData.license =
//           licenseData;


//         // ----------------------------------------------------
//         // SAVE VERIFICATION STATUS
//         // ----------------------------------------------------

//         party.identityVerification.documents
//           .license = {

//             uploaded: true,

//             verified: true,

//             confidence:
//               licenseData?.confidence || 0,

//             verifiedAt:
//               new Date()

//           };


//         console.log(
//           "Driving Licence verified:"
//         );

//         console.log(
//           licenseData
//         );

//       }


//       // ======================================================
//       // SAVE PASSPORT ONLY IF VALID
//       // ======================================================

//       if (
//         compressedPassport &&
//         passportValid
//       ) {

//         // ----------------------------------------------------
//         // SAVE IMAGE
//         // ----------------------------------------------------

//         party.passportImage =
//           compressedPassport;


//         // ----------------------------------------------------
//         // SAVE OCR DATA
//         // ----------------------------------------------------

//         party.identityData.passport =
//           passportData;


//         // ----------------------------------------------------
//         // SAVE VERIFICATION STATUS
//         // ----------------------------------------------------

//         party.identityVerification.documents
//           .passport = {

//             uploaded: true,

//             verified: true,

//             confidence:
//               passportData?.confidence || 0,

//             verifiedAt:
//               new Date()

//           };


//         console.log(
//           "Passport verified:"
//         );

//         console.log(
//           passportData
//         );

//       }


//       // ======================================================
//       // SET VERIFICATION STATUS
//       // ======================================================

//       party.identityVerification.status =
//         "document_verified";


//       // ======================================================
//       // CLEAR PREVIOUS FAILURE
//       // ======================================================

//       party.identityVerification.failureReason =
//         "";


//       // ======================================================
//       // SAVE PARTY
//       // ======================================================

//       await party.save();


//       // ======================================================
//       // RESPONSE
//       // ======================================================

//       return res.json({

//         success: true,

//         message:
//           "Documents validated successfully.",

//         documents:
//           documentResults,

//         identityData:
//           party.identityData,

//         identityVerification: {

//           status:
//             party.identityVerification.status,

//           documents:
//             party.identityVerification.documents

//         }

//       });

//     } catch (error) {

//       console.error(
//         "UPLOAD DOCUMENTS ERROR:",
//         error
//       );


//       return res.status(500).json({

//         success: false,

//         message:
//           error.message ||
//           "Internal Server Error"

//       });

//     }

//   }
// );


// // ============================================================
// // EXPORT ROUTER
// // ============================================================

// export default router;





















































// import express from "express";
// import nodemailer from "nodemailer";

// import Transaction from "../models/Transaction.js";
// import TransactionParty from "../models/TransactionParty.js";

// import sharp from "sharp";
// // utils/extractDocumentData.js
// import extractDocumentData from "../utils/extractDocumentData.js";

// const router = express.Router();


// // ================= EMAIL SETUP =================
// const transporter = nodemailer.createTransport({
//   host: "smtp-relay.brevo.com",
//   port: 587,
//   secure: false,
//   auth: {
//     user: 'axxxxxxxxxxxxxxxxxo.com',
//     pass: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxL',
//   },
// });

// // ================= SEND EMAIL =================
// const sendPartyEmail = async (party) => {

//   // ✅ use _id instead of token
//   const link = `https://yourdomain.com/party/onboarding/${party._id}`;

//   await transporter.sendMail({
//     from: `"Transaction Portal" <yourgmail@gmail.com>`,
//     to: party.email,
//     subject: "Complete Your Transaction Verification",
//     // html: `
//     //   <h2>Hello ${party.name}</h2>
//     //   <p>You have been added to a transaction.</p>
//     //   <p>Please click below to complete your verification:</p>
//     //   <a href="${link}" target="_blank">${link}</a>
//     //   <br/><br/>
//     //   <p>This link is for you only.</p>
//     // `
//     html: `
// <!DOCTYPE html>
// <html>
// <head>
// <meta charset="UTF-8" />
// </head>

// <body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">

// <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
// <tr>
// <td align="center">

// <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.08);">

// <!-- Header -->
// <tr>
// <td style="background:#0f4c81;padding:28px;text-align:center;">
// <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;">
// RealtorParth
// </h1>
// </td>
// </tr>

// <!-- Body -->
// <tr>
// <td style="padding:40px;">

// <h2 style="margin-top:0;color:#222;font-size:26px;">
// Hello ${party.name},
// </h2>

// <p style="font-size:16px;color:#555;line-height:28px;">
// You have been added as a participant in a
// <strong>RealtorParth transaction</strong>.
// </p>

// <p style="font-size:16px;color:#555;line-height:28px;">
// Before accessing your transaction documents, we need to verify your identity.
// Please click the button below to securely complete your verification.
// </p>

// <table width="100%" cellpadding="0" cellspacing="0" style="margin:35px 0;">
// <tr>
// <td align="center">

// <a href="${link}"
// style="
// background:#0f4c81;
// color:#ffffff;
// text-decoration:none;
// padding:16px 36px;
// border-radius:8px;
// display:inline-block;
// font-size:16px;
// font-weight:600;
// ">
// Verify Your Identity
// </a>

// </td>
// </tr>
// </table>

// <div style="background:#f8f9fb;border-left:4px solid #0f4c81;padding:18px;border-radius:6px;">

// <p style="margin:0;color:#555;font-size:15px;line-height:24px;">
// If the button above does not work, copy and paste the following link into your browser:
// </p>

// <p style="margin-top:12px;word-break:break-all;">
// <a href="${link}" style="color:#0f4c81;">
// ${link}
// </a>
// </p>

// </div>

// <p style="margin-top:35px;font-size:15px;color:#555;line-height:26px;">
// <strong>Important:</strong> This verification link is unique to you and should not be shared with anyone else.
// </p>

// <p style="margin-top:15px;font-size:15px;color:#555;line-height:26px;">
// Once your identity has been verified, you will be able to review and complete any required documents for your transaction.
// </p>

// <p style="margin-top:35px;font-size:16px;color:#222;">
// Kind Regards,<br>
// <strong>RealtorParth Team</strong>
// </p>

// </td>
// </tr>

// <!-- Footer -->
// <tr>
// <td style="background:#f7f7f7;padding:22px;text-align:center;color:#777;font-size:13px;line-height:22px;">
// This is an automated email from RealtorParth.<br>
// Please do not reply directly to this email.
// </td>
// </tr>

// </table>

// </td>
// </tr>
// </table>

// </body>
// </html>
// `
//   });

// };


// router.post("/save", async (req, res) => {
//   try {
//     const { transactionId, parties, userId } = req.body;

//     const transaction = await Transaction.findOne({
//       _id: transactionId,
//       userId
//     });

//     if (!transaction) {
//       return res.json({ success: false, message: "Unauthorized" });
//     }

//     const savedParties = [];

//     for (const p of parties) {

//       let party;

//       // ✅ 1. UPDATE EXISTING PARTY
//       if (p._id) {
//         party = await TransactionParty.findByIdAndUpdate(
//           p._id,
//           {
//             name: p.name,
//             email: p.email,
//             phone: p.phone,
//             role: p.role,
//             userId
//           },
//           { new: true }
//         );
//       }

//       // ✅ 2. CREATE NEW PARTY
//       else {
//         party = await TransactionParty.create({
//           transactionId,
//           userId,
//           name: p.name,
//           email: p.email,
//           phone: p.phone,
//           role: p.role
//         });

//         // 👉 send email ONLY for new party
//         sendPartyEmail(party).catch(err =>
//           console.error("Email Error:", err)
//         );
//       }

//       savedParties.push(party);
//     }

//     res.json({
//       success: true,
//       parties: savedParties
//     });

//   } catch (error) {
//     console.error("SAVE PARTIES ERROR:", error);
//     res.status(500).json({ success: false });
//   }
// });


// router.get("/transactionParty/settings/:partyId", async (req, res) => {
//   try {

//     const partysettings = await TransactionParty.findById(req.params.partyId);
//     console.log(partysettings);
//     if (!partysettings) {
//       return res.json({ success: false });
//     }

//     res.json({
//       success: true,
//       data: partysettings || {}
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false });
//   }
// });



// // ================= GET SINGLE PARTY (FOR ONBOARDING) =================
// router.get("/party/:id", async (req, res) => {

//   try {

//     const party = await TransactionParty.findById(req.params.id);

//     if (!party) {
//       return res.status(404).json({
//         success: false,
//         message: "Invalid link"
//       });
//     }

//     res.json({
//       success: true,
//       party
//     });

//   } catch (error) {

//     console.error("GET PARTY ERROR:", error);

//     res.status(500).json({ success: false });

//   }

// });


// // ================= GET PARTIES =================
// router.get("/:transactionId/:userId", async (req, res) => {

//   try {

//     const transaction = await Transaction.findOne({
//       _id: req.params.transactionId,
//       userId: req.params.userId
//     });

//     if (!transaction) {
//       return res.json({
//         success: false,
//         message: "Unauthorized"
//       });
//     }

//     const parties = await TransactionParty.find({
//       transactionId: req.params.transactionId
//     });

//     res.json({
//       success: true,
//       parties
//     });

//   } catch (error) {

//     console.error("GET PARTIES ERROR:", error);

//     res.status(500).json({ success: false });

//   }

// });






// // ================= DELETE PARTY =================
// router.delete("/:id/:userId", async (req, res) => {

//   try {

//     const party = await TransactionParty.findById(req.params.id);

//     if (!party) {
//       return res.json({ success: false });
//     }

//     const transaction = await Transaction.findOne({
//       _id: party.transactionId,
//       userId: req.params.userId
//     });

//     if (!transaction) {
//       return res.json({
//         success: false,
//         message: "Unauthorized"
//       });
//     }

//     await TransactionParty.findByIdAndDelete(req.params.id);

//     res.json({ success: true });

//   } catch (error) {

//     console.error("DELETE PARTY ERROR:", error);

//     res.status(500).json({ success: false });

//   }

// });


// // ================= SAVE DOCUMENTS (LICENSE + PASSPORT) =================



// router.post("/upload-documents", async (req, res) => {
//   try {
//     const { partyId, licenseImage, passportImage } = req.body;

//     if (!partyId) {
//       return res.json({
//         success: false,
//         message: "Missing partyId",
//       });
//     }

//     const party = await TransactionParty.findById(partyId);

//     if (!party) {
//       return res.json({
//         success: false,
//         message: "Party not found",
//       });
//     }

//     // ==========================================
//     // Compress Image
//     // ==========================================

//     const compressBase64 = async (base64) => {
//       if (!base64) return "";

//       const buffer = Buffer.from(
//         base64.replace(/^data:image\/\w+;base64,/, ""),
//         "base64"
//       );

//       const compressed = await sharp(buffer)
//         .resize({
//           width: 600,
//           withoutEnlargement: true,
//         })
//         .jpeg({
//           quality: 50,
//         })
//         .toBuffer();

//       return `data:image/jpeg;base64,${compressed.toString("base64")}`;
//     };

//     // ==========================================
//     // Compress Images
//     // ==========================================

//     const [compressedLicense, compressedPassport] = await Promise.all([
//       compressBase64(licenseImage),
//       compressBase64(passportImage),
//     ]);

//     // ==========================================
//     // Run OCR (Parallel)
//     // ==========================================

//     const [licenseData, passportData] = await Promise.all([
//       compressedLicense
//         ? extractDocumentData(compressedLicense).catch((err) => {
//             console.error("License OCR Failed:", err);
//             return null;
//           })
//         : Promise.resolve(null),

//       compressedPassport
//         ? extractDocumentData(compressedPassport).catch((err) => {
//             console.error("Passport OCR Failed:", err);
//             return null;
//           })
//         : Promise.resolve(null),
//     ]);

//     // ==========================================
//     // Validate License Upload
//     // ==========================================

//     if (licenseData) {
//       if (!licenseData.validDocument) {
//         return res.status(400).json({
//           success: false,
//           message:
//             licenseData.reason ||
//             "Please upload a valid Driver's Licence.",
//         });
//       }

//       const type = (licenseData.documentType || "").toLowerCase();

//       if (
//         !type.includes("driver") &&
//         !type.includes("licence") &&
//         !type.includes("license")
//       ) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "You uploaded a Passport or another document in the Driver's Licence field.",
//         });
//       }
//     }

//     // ==========================================
//     // Validate Passport Upload
//     // ==========================================

//     if (passportData) {
//       if (!passportData.validDocument) {
//         return res.status(400).json({
//           success: false,
//           message:
//             passportData.reason ||
//             "Please upload a valid Passport.",
//         });
//       }

//       const type = (passportData.documentType || "").toLowerCase();

//       if (!type.includes("passport")) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "You uploaded a Driver's Licence or another document in the Passport field.",
//         });
//       }
//     }

//     // ==========================================
//     // Save Images
//     // ==========================================

//     if (compressedLicense) {
//       party.licenseImage = compressedLicense;
//     }

//     if (compressedPassport) {
//       party.passportImage = compressedPassport;
//     }

//     // ==========================================
//     // Initialize Identity Object
//     // ==========================================

//     if (!party.identityData) {
//       party.identityData = {};
//     }

//     // ==========================================
//     // Save OCR Data
//     // ==========================================

//     if (licenseData) {
//       console.log("License Extracted:");
//       console.log(licenseData);

//       party.identityData.license = licenseData;
//     }

//     if (passportData) {
//       console.log("Passport Extracted:");
//       console.log(passportData);

//       party.identityData.passport = passportData;
//     }

//     // ==========================================
//     // Save Party
//     // ==========================================

//     await party.save();

//     return res.json({
//       success: true,
//       message: "Documents uploaded successfully.",
//       identityData: party.identityData,
//     });

//   } catch (error) {
//     console.error("UPLOAD DOCUMENTS ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: error.message || "Internal Server Error",
//     });
//   }
// });

// export default router;













