import express from "express";
import fs from "fs";
import axios from "axios";
import jwt from "jsonwebtoken";
import path from "path";
import mongoose from "mongoose";
import { PDFDocument, StandardFonts } from "pdf-lib";
import Transaction from "../models/Transaction.js";
import Crg from "../models/CrgModel.js";
import TransactionParty from "../models/TransactionParty.js";
import docusign from "docusign-esign";
import TransactionUser from "../models/TransactionUser.js";
import nodemailer from "nodemailer";
import archiver from "archiver";
import stream from "stream";

const router = express.Router();
const PDF_PATH = path.join(process.cwd(), "Consumer Relationships Guide (Print Friendly).pdf");

/* ===============================
   DOCUSIGN TOKEN (NO SDK)
=============================== */
const getAccessToken = async () => {
  const privateKey = fs.readFileSync("./private.key");
  const payload = {
    iss: process.env.DOCUSIGN_INTEGRATION_KEY,
    sub: process.env.DOCUSIGN_USER_ID,
    aud: "account-d.docusign.com",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: "signature impersonation"
  };
  const token = jwt.sign(payload, privateKey, { algorithm: "RS256" });
  const res = await axios.post(
    "https://account-d.docusign.com/oauth/token",
    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: token
    }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    }
  );
  return res.data.access_token;
}


const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_PASSWORD,
  }
});


const sendSignedPdfEmail = async (toEmail, pdfBuffer) => {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.BREVO_USER,
        pass: process.env.BREVO_PASSWORD,
      }
    });
    await transporter.sendMail({
      from: `"RealtorParth" <hello@realtorparth.ca>`,
      to: toEmail,
      subject: "Signed Document + Summary",
      text: "Attached are your signed document and audit summary.",
      attachments: [
        {
          filename: "Signed-Document.pdf",
          content: pdfBuffer
        },
        {
          filename: "DocuSign-Summary.pdf",
          content: certBuffer
        }
      ]
    });
    console.log("✅ Email sent to:", toEmail);
  } catch (error) {
    console.error("❌ Email error:", error);
  }
};






router.post("/generate-crg", async (req, res) => {
  try {
    const { partyId, sendEmail = false, isAdmin = false, ...data } = req.body;
    if (!partyId) {
      return res.status(400).json({ message: "partyId required" });
    }
    const party = await TransactionParty.findById(partyId);
    if (!party) {
      return res.json({ message: "Invalid party" });
    }
    /* ===============================
       SAVE DATA
    =============================== */
    await Crg.findOneAndUpdate(
      { partyId },
      {
        ...data,
        partyId,
        transactionId: party.transactionId
      },
      {
        new: true,
        upsert: true
      }
    );
    /* ===============================
       GENERATE PDF
    =============================== */
    const existingPdfBytes = fs.readFileSync(PDF_PATH);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    if (data.consumerPrintName1) {
      form.getTextField("txtConsumer1Sig").setText(data.consumerPrintName1);
    }
    if (data.consumerPrintName2) {
      form.getTextField("txtConsumer2Sig").setText(data.consumerPrintName2);
    }
    form.updateFieldAppearances(font);
    form.flatten();
    const pdfBytes = await pdfDoc.save();

    /* ===============================
       SAVE ONLY
    =============================== */
    return res.json({
      success: true,
      message: "Customer Relationship Guide saved successfully."
    });
  } catch (error) {
    console.error("❌ ERROR:", error.response?.data || error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

router.post("/send-crg-for-signature", async (req, res) => {
  try {
    const { partyId } = req.body;
    if (!partyId) {
      return res.status(400).json({
        success: false,
        message: "partyId required"
      });
    }
    /* ===============================
       GET PARTY
    =============================== */
    const party = await TransactionParty.findById(partyId);
    if (!party) {
      return res.status(404).json({
        success: false,
        message: "Party not found"
      });
    }

    /* ===============================
       GET SAVED DATA
    =============================== */
    const data = await Crg.findOne({ partyId });
    if (!data) {
      return res.status(404).json({
        success: false,
        message: "CRG not found"
      });
    }

    /* ===============================
       GENERATE PDF
    =============================== */
    const existingPdfBytes = fs.readFileSync(PDF_PATH);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    if (data.consumerPrintName1) {
      form.getTextField("txtConsumer1Sig").setText(data.consumerPrintName1);
    }
    if (data.consumerPrintName2) {
      form.getTextField("txtConsumer2Sig").setText(data.consumerPrintName2);
    }
    form.updateFieldAppearances(font);
    form.flatten();
    const pdfBytes = await pdfDoc.save();
    /* ===============================
       DOCUSIGN TOKEN
    =============================== */
    const accessToken = await getAccessToken();
    /* ===============================
      SIGNERS
    =============================== */
    const signers = [];
    // const baseEmail = party.email;
    // const [name, domain] = baseEmail.split("@");
    // const consumer1Email = baseEmail;
    // const consumer2Email = `${name}+consumer2@${domain}`;

    const consumer1Email = data.consumerEmail1;
    const consumer2Email = data.consumerEmail2;

    /* CONSUMER 1 */
    // if (data.consumerPrintName1) {
    if (data.consumerPrintName1 && data.consumerEmail1) {
      signers.push({
        email: consumer1Email,
        name: data.consumerPrintName1,
        recipientId: "1",
        routingOrder: "1",
        clientUserId: `${partyId}_consumer1`,
        tabs: {
          signHereTabs: [
            {
              anchorString: "/sign1/"
            }
          ],
          dateSignedTabs: [
            {
              anchorString: "/date_md/",
              dateFormat: "MMMM d"
            },
            {
              anchorString: "/date_y/",
              dateFormat: "yy"
            }
          ]
        }
      });
    }
    /* CONSUMER 2 */
    // if (data.consumerPrintName2) {
    if (data.consumerPrintName2 && data.consumerEmail2) {
      signers.push({
        email: consumer2Email,
        name: data.consumerPrintName2,
        recipientId: "2",
        routingOrder: "1",
        clientUserId: `${partyId}_consumer2`,
        tabs: {
          signHereTabs: [
            {
              anchorString: "/sign1/"
            }
          ],
          dateSignedTabs: [
            {
              anchorString: "/date_md/",
              dateFormat: "MMMM d"
            },
            {
              anchorString: "/date_y/",
              dateFormat: "yy"
            }
          ]
        }
      });
    }
    if (signers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No signers found."
      });
    }
    console.log("CRG Signers:", signers);

    /* ===============================
      CREATE ENVELOPE
    =============================== */
    const envelopePayload = {
      emailSubject: "Please sign the Customer Relationship Guide",
      documents: [
        {
          documentBase64: Buffer.from(pdfBytes).toString("base64"),
          name: "CRG.pdf",
          fileExtension: "pdf",
          documentId: "1"
        }
      ],
      recipients: {
        signers
      },
      status: "sent"
    };
    const envelopeRes = await axios.post(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes`,
      envelopePayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
    const envelopeId = envelopeRes.data.envelopeId;
    await Crg.findOneAndUpdate(
      { partyId },
      {
        envelopeId,
        signers: signers.map(s => ({
          recipientId: s.recipientId,
          clientUserId: s.clientUserId || null,
          email: s.email,
          name: s.name,
          routingOrder: s.routingOrder
        }))
      }
    );
    const signingLink = `https://realtorparth.ca/api/crgpdf/start-sign/${partyId}`;
    for (const signer of signers) {
      const recipientName =
        signer.recipientId === "2"
          ? data.consumerPrintName2
          : data.consumerPrintName1;

      const signingLink = `https://realtorparth.ca/api/crgpdf/start-sign/${partyId}/${signer.recipientId}`;

      await transporter.sendMail({
        from: `"RealtorParth" <hello@realtorparth.ca>`,
        to: signer.email,
        subject: "Customer Relationship Guide Ready For Signature",
        html: `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
</head>

<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.08);">

<tr>
<td style="background:#0f4c81;padding:28px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;">
RealtorParth
</h1>
</td>
</tr>

<tr>
<td style="padding:40px;">

<h2 style="margin-top:0;color:#222;font-size:26px;">
Hello ${recipientName},
</h2>

<p style="font-size:16px;color:#555;line-height:28px;">
Your <strong>Customer Relationship Guide</strong> document has been prepared and is now ready for your electronic signature.
</p>

<p style="font-size:16px;color:#555;line-height:28px;">
Please review the document carefully and complete your signature by clicking the button below.
</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:35px 0;">
<tr>
<td align="center">

<a href="${signingLink}"
style="
background:#0f4c81;
color:#ffffff;
text-decoration:none;
padding:16px 36px;
border-radius:8px;
display:inline-block;
font-size:16px;
font-weight:600;
">
Sign Customer Relationship Guide
</a>

</td>
</tr>
</table>

<div style="background:#f8f9fb;border-left:4px solid #0f4c81;padding:18px;border-radius:6px;">
<p style="margin:0;color:#555;font-size:15px;line-height:24px;">
If the button above does not work, copy and paste the following link into your browser:
</p>

<p style="margin-top:12px;word-break:break-all;">
<a href="${signingLink}" style="color:#0f4c81;">
${signingLink}
</a>
</p>
</div>

<p style="margin-top:35px;font-size:15px;color:#555;line-height:26px;">
If you have any questions regarding this document, please contact your Realtor before signing.
</p>

<p style="margin-top:35px;font-size:16px;color:#222;">
Kind Regards,<br>
<strong>RealtorParth Team</strong>
</p>

</td>
</tr>

<tr>
<td style="background:#f7f7f7;padding:22px;text-align:center;color:#777;font-size:13px;line-height:22px;">
This is an automated email from RealtorParth.<br>
Please do not reply directly to this email.
</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`
      });
    }
    return res.json({
      success: true,
      message: "Email sent successfully."
    });
  } catch (error) {
    console.error(
      "CRG DOCUSIGN ERROR:",
      error.response?.data || error
    );
    res.status(500).json({
      success: false,
      message: "Failed to send CRG for signature."
    });
  }
});

router.get("/start-sign/:partyId/:recipientId", async (req, res) => {
  try {
    const { partyId, recipientId } = req.params;
    const crg = await Crg.findOne({ partyId });
    if (!crg) {
      return res.status(404).send("CRG not found.");
    }
    if (!crg.envelopeId) {
      return res.status(400).send("Envelope not created yet.");
    }
    if (!crg.signers || crg.signers.length === 0) {
      return res.status(400).send("No signers found.");
    }
    /* ===============================
       FIND CURRENT SIGNER
    =============================== */
    const signer = crg.signers.find(
      (s) => s.recipientId === recipientId
    );
    if (!signer) {
      return res.status(404).send("Signer not found.");
    }
    const accessToken = await getAccessToken();
    /* ===============================
       CREATE RECIPIENT VIEW
    =============================== */
    const viewRes = await axios.post(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${crg.envelopeId}/views/recipient`,
      {
        authenticationMethod: "none",
        email: signer.email,
        userName: signer.name,
        clientUserId: signer.clientUserId,
        // Pass recipientId so we know who completed signing
        returnUrl: `https://realtorparth.ca/api/crgpdf/sign-complete/${partyId}/${recipientId}`
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
    return res.redirect(viewRes.data.url);
  } catch (error) {
    console.error(
      "START SIGN ERROR:",
      error.response?.data || error
    );
    return res.status(500).send("Unable to start signing.");
  }
});



router.get("/sign-complete/:partyId/:recipientId", async (req, res) => {
  try {
    const { partyId, recipientId } = req.params;

    console.log("========== CRG SIGN COMPLETE ==========");
    console.log("Party:", partyId);
    console.log("Recipient:", recipientId);

    /* ===============================
       GET CRG
    =============================== */

    const crg = await Crg.findOne({ partyId });

    if (!crg) {
      return res.status(404).send("CRG not found.");
    }

    /* ===============================
       UPDATE SIGN STATUS
    =============================== */

    if (recipientId === "1") {
      crg.consumer1Signed = true;
      crg.consumer1SignedAt = new Date();
    }

    if (recipientId === "2") {
      crg.consumer2Signed = true;
      crg.consumer2SignedAt = new Date();
    }

    await crg.save();

    /* ===============================
       CHECK IF ALL REQUIRED SIGNERS
       HAVE SIGNED
    =============================== */

    const consumer2Required =
      !!crg.consumerPrintName2 &&
      !!crg.consumerEmail2;

    const allSigned =
      crg.consumer1Signed &&
      (
        !consumer2Required ||
        crg.consumer2Signed
      );

    if (!allSigned) {
      console.log("Waiting for remaining signer...");
      return res.redirect(
        "https://realtorparth.ca/signature-complete"
      );
    }

    /* ===============================
       PREVENT DUPLICATE EMAIL
    =============================== */

    if (crg.completedEmailSent) {
      return res.redirect(
        "https://realtorparth.ca/signature-complete"
      );
    }

    /* ===============================
       GET PARTY
    =============================== */

    const party = await TransactionParty.findById(partyId);

    if (!party) {
      return res.status(404).send("Party not found.");
    }

    /* ===============================
       GET AGENT
    =============================== */

    const transactionUser =
      await TransactionUser.findById(
        party.userId
      );

    if (!transactionUser) {
      return res
        .status(404)
        .send("Transaction User not found.");
    }

    /* ===============================
       BUILD STATUS
    =============================== */

    const statusHtml = `
<tr>
<td style="font-weight:600;color:#333;">
Consumer 1
</td>
<td style="color:${crg.consumer1Signed ? "#16a34a" : "#dc2626"
      };font-weight:600;">
${crg.consumer1Signed ? "✔ Signed" : "⏳ Pending"}
</td>
</tr>

${consumer2Required
        ? `
<tr style="background:#f8fafc;">
<td style="font-weight:600;color:#333;">
Consumer 2
</td>
<td style="color:${crg.consumer2Signed ? "#16a34a" : "#dc2626"
        };font-weight:600;">
${crg.consumer2Signed ? "✔ Signed" : "⏳ Pending"}
</td>
</tr>
`
        : ""
      }
`;

    /* ===============================
       SEND EMAIL
    =============================== */

    await transporter.sendMail({
      from: `"RealtorParth" <hello@realtorparth.ca>`,
      to: transactionUser.email,
      subject: "Customer Relationship Guide Fully Signed",
      html: `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
</head>

<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">

<tr>
<td style="background:#0f4c81;padding:28px;text-align:center;">
<h1 style="margin:0;color:#fff;">
RealtorParth
</h1>
</td>
</tr>

<tr>
<td style="padding:40px;">

<h2>Customer Relationship Guide Completed</h2>

<p>
All required consumers have completed signing.
</p>

<table
width="100%"
cellpadding="10"
cellspacing="0"
style="border-collapse:collapse;border:1px solid #e5e7eb;"
>

<tr style="background:#f8fafc;">
<td style="font-weight:600;">Client Name</td>
<td>${party.name}</td>
</tr>

<tr>
<td style="font-weight:600;">Client Email</td>
<td>${party.email}</td>
</tr>

<tr style="background:#f8fafc;">
<td style="font-weight:600;">Document</td>
<td>Customer Relationship Guide (CRG)</td>
</tr>

${statusHtml}

<tr>
<td style="font-weight:600;">
Completed On
</td>
<td>
${new Date().toLocaleString("en-CA", {
        dateStyle: "long",
        timeStyle: "short"
      })}
</td>
</tr>

</table>

</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`
    });

    /* ===============================
       MARK EMAIL SENT
    =============================== */

    crg.completedEmailSent = true;

    await crg.save();

    return res.redirect(
      "https://realtorparth.ca/signature-complete"
    );

  } catch (err) {

    console.error(
      "========== CRG SIGN COMPLETE ERROR =========="
    );

    console.error(
      err.response?.data || err
    );

    return res.redirect(
      "https://realtorparth.ca/signature-complete"
    );
  }
});


// router.get("/start-sign/:partyId", async (req, res) => {
//   try {
//     const { partyId } = req.params;
//     const crg = await Crg.findOne({ partyId });
//     if (!crg) {
//       return res.status(404).send("CRG not found.");
//     }
//     if (!crg.envelopeId) {
//       return res.status(400).send("Envelope not created yet.");
//     }
//     if (!crg.signers || crg.signers.length === 0) {
//       return res.status(400).send("No signers found.");
//     }
//     /* ===============================
//        FIRST SIGNER (CONSUMER 1)
//     =============================== */
//     // const signer = crg.signers.find((s) => s.recipientId === "1") || crg.signers[0];
//     const signer = crg.signers.find(
//       s => s.recipientId === recipientId
//     );
//     const accessToken = await getAccessToken();
//     /* ===============================
//        CREATE RECIPIENT VIEW
//     =============================== */
//     const viewRes = await axios.post(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${crg.envelopeId}/views/recipient`,
//       {
//         authenticationMethod: "none",
//         email: signer.email,
//         userName: signer.name,
//         clientUserId: signer.clientUserId,
//         returnUrl: `https://realtorparth.ca/api/crgpdf/sign-complete/${partyId}`
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//           "Content-Type": "application/json"
//         }
//       }
//     );
//     return res.redirect(viewRes.data.url);
//   } catch (error) {
//     console.error(
//       "START SIGN ERROR:",
//       error.response?.data || error
//     );
//     return res.status(500).send("Unable to start signing.");
//   }
// });

// router.get("/sign-complete/:partyId", async (req, res) => {
//   try {
//     const { partyId } = req.params;
//     console.log("========== CRG SIGN COMPLETE ==========");
//     console.log("Party ID:", partyId);
//     /* ===============================
//        GET CRG
//     =============================== */
//     const crg = await Crg.findOne({ partyId });
//     if (!crg) {
//       return res.status(404).send("CRG not found.");
//     }
//     /* ===============================
//        PREVENT DUPLICATE EMAILS
//     =============================== */
//     if (crg.completedEmailSent) {
//       console.log("Notification already sent.");
//       return res.redirect(
//         "https://realtorparth.ca/signature-complete"
//       );
//     }
//     /* ===============================
//        GET PARTY
//     =============================== */
//     const party = await TransactionParty.findById(partyId);
//     if (!party) {
//       return res.status(404).send("Party not found.");
//     }
//     /* ===============================
//        GET AGENT
//     =============================== */
//     const transactionUser = await TransactionUser.findById(
//       party.userId
//     );
//     if (!transactionUser) {
//       return res.status(404).send("Transaction User not found.");
//     }
//     console.log("Sending notification to:", transactionUser.email);
//     /* ===============================
//        SEND EMAIL
//     =============================== */
//     await transporter.sendMail({
//       from: `"RealtorParth" <hello@realtorparth.ca>`,
//       to: transactionUser.email,
//       subject: "Customer Relationship Guide Signed",
//       html: `
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

// <tr>
// <td style="background:#0f4c81;padding:28px;text-align:center;">
// <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;">
// RealtorParth
// </h1>
// </td>
// </tr>

// <tr>
// <td style="padding:40px;">

// <h2 style="margin-top:0;color:#222;font-size:26px;">
// Client Signature Completed
// </h2>

// <p style="font-size:16px;color:#555;line-height:28px;">
// The client has successfully completed their electronic signature for the
// <strong>Customer Relationship Guide (CRG)</strong>.
// </p>

// <table
// width="100%"
// cellpadding="10"
// cellspacing="0"
// style="margin:30px 0;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;"
// >

// <tr style="background:#f8fafc;">
// <td style="font-weight:600;color:#333;width:180px;">Client Name</td>
// <td style="color:#555;">${party.name}</td>
// </tr>

// <tr>
// <td style="font-weight:600;color:#333;">Client Email</td>
// <td style="color:#555;">${party.email}</td>
// </tr>

// <tr style="background:#f8fafc;">
// <td style="font-weight:600;color:#333;">Document</td>
// <td style="color:#555;">Customer Relationship Guide (CRG)</td>
// </tr>

// <tr>
// <td style="font-weight:600;color:#333;">Status</td>
// <td style="color:#16a34a;font-weight:600;">
// ✔ Client Signature Completed
// </td>
// </tr>

// <tr style="background:#f8fafc;">
// <td style="font-weight:600;color:#333;">Completed On</td>
// <td style="color:#555;">
// ${new Date().toLocaleString("en-CA", {
//         dateStyle: "long",
//         timeStyle: "short"
//       })}
// </td>
// </tr>

// </table>

// <div style="background:#f8f9fb;border-left:4px solid #16a34a;padding:18px;border-radius:6px;">
// <p style="margin:0;font-size:15px;color:#555;line-height:24px;">
// This is an automated notification confirming that the client has completed their portion of the signing process.
// </p>
// </div>

// <p style="margin-top:35px;font-size:16px;color:#222;">
// Kind Regards,<br>
// <strong>RealtorParth Team</strong>
// </p>

// </td>
// </tr>

// <tr>
// <td style="background:#f7f7f7;padding:22px;text-align:center;color:#777;font-size:13px;line-height:22px;">
// This is an automated notification from RealtorParth.<br>
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
//     });
//     console.log("Notification email sent.");
//     /* ===============================
//        PREVENT DUPLICATE EMAIL
//     =============================== */
//     crg.completedEmailSent = true;
//     await crg.save();
//     console.log("completedEmailSent updated");
//     return res.redirect(
//       "https://realtorparth.ca/signature-complete"
//     );
//   } catch (err) {
//     console.error("========== CRG SIGN COMPLETE ERROR ==========");
//     console.error(err.response?.data || err);
//     return res.redirect(
//       "https://realtorparth.ca/signature-complete"
//     );
//   }
// });




router.get("/get-next-signer", async (req, res) => {
  try {
    const { partyId } = req.query;

    const session = global.signingSessions?.[partyId];
    // if (!session) return res.json({ done: true });
    if (!session) {
      console.error("❌ Session missing for:", partyId);
      return res.status(500).json({ error: "Session expired" });
    }

    const { envelopeId, signers, currentIndex } = session;

    const nextIndex = currentIndex + 1;

    if (nextIndex >= signers.length) {
      return res.json({ done: true });
    }

    const nextSigner = signers[nextIndex];
    const accessToken = await getAccessToken();

    const viewRes = await axios.post(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/views/recipient`,
      {
        // returnUrl: `${process.env.FRONTEND_URL}/sign-redirect?partyId=${partyId}&type=crg`,
        returnUrl: `http://localhost:5173/sign-redirect?partyId=${partyId}&type=crg`,
        authenticationMethod: "none",
        email: nextSigner.email,
        userName: nextSigner.name,
        clientUserId: nextSigner.clientUserId
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    session.currentIndex = nextIndex;

    res.json({ signingUrl: viewRes.data.url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed next signer" });
  }
});

router.get("/download-signed-pdf", async (req, res) => {
  try {
    const { partyId } = req.query;

    const session = global.signingSessions?.[partyId];
    if (!session) return res.status(400).send("No session");

    const { envelopeId } = session;

    const accessToken = await getAccessToken();

    /* ===============================
       ⏳ WAIT UNTIL COMPLETED
    =============================== */
    let status = "sent";
    let attempts = 0;

    while (status !== "completed" && attempts < 20) {
      const statusRes = await axios.get(
        `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      status = statusRes.data.status;

      if (status === "completed") break;

      await new Promise((r) => setTimeout(r, 1500));
      attempts++;
    }

    console.log("📄 Envelope Status:", status);

    /* ===============================
       📄 DOWNLOAD PDF + CERTIFICATE
    =============================== */

    // ✅ Signed PDF
    const pdfRes = await axios.get(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/combined`,
      {
        responseType: "arraybuffer",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    // ✅ Certificate (DocuSign summary)
    const certRes = await axios.get(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/certificate`,
      {
        responseType: "arraybuffer",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    console.log("📄 PDF + Certificate downloaded");

    /* ===============================
       📧 SEND EMAIL (NON-BLOCKING)
    =============================== */
    const party = await TransactionParty.findById(partyId);
    const transactionUser = await TransactionUser.findById(party.userId);

    console.log("📧 Sending email to:", transactionUser?.email);

    // 🔥 IMPORTANT: send email in background (DO NOT BLOCK RESPONSE)
    (async () => {
      try {
        if (transactionUser?.email) {
          await sendSignedPdfEmail(
            transactionUser.email,
            pdfRes.data,
            certRes.data
          );
          console.log("✅ Email sent with summary");
        } else {
          console.warn("⚠️ No transaction user email found");
        }
      } catch (err) {
        console.error("❌ Email background error:", err);
      }
    })();

    /* ===============================
       📥 SEND PDF TO FRONTEND (FAST)
    =============================== */
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=Signed.pdf"
    });

    res.send(pdfRes.data);

  } catch (error) {
    console.error("❌ ERROR:", error);
    res.status(500).send("Download error");
  }
});


router.get("/crg/user/:partyId", async (req, res) => {
  try {
    const { partyId } = req.params;
    if (!partyId) {
      return res.json({
        success: false,
        message: "partyId required"
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
       FETCH DATA (PER PARTY)
    =============================== */
    const crg = await Crg.findOne({
      partyId // 🔥 MAIN FIX
    });
    res.json({
      success: true,
      data: crg || null
    });
  } catch (error) {
    console.error("GET CRG ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

export default router;

















// router.post("/generate-crg", async (req, res) => {
//   try {
//     const { partyId, isAdmin = false, ...data } = req.body;
//     if (!partyId) {
//       return res.status(400).json({ message: "partyId required" });
//     }
//     const party = await TransactionParty.findById(partyId);
//     if (!party) {
//       return res.json({ message: "Invalid party" });
//     }
//     /* ===============================
//        SAVE DATA
//     =============================== */
//     await Crg.findOneAndUpdate(
//       { partyId },
//       { ...data, partyId },
//       { new: true, upsert: true }
//     );
//     /* ===============================
//        GENERATE PDF
//     =============================== */
//     const existingPdfBytes = fs.readFileSync(PDF_PATH);
//     const pdfDoc = await PDFDocument.load(existingPdfBytes);
//     const form = pdfDoc.getForm();
//     const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
//     if (data.consumerPrintName1) {
//       form.getTextField("txtConsumer1Sig").setText(data.consumerPrintName1);
//     }
//     if (data.consumerPrintName2) {
//       form.getTextField("txtConsumer2Sig").setText(data.consumerPrintName2);
//     }
//     if (data.signedDateM) {
//       form.getTextField("txtSignedDate_m").setText(data.signedDateM);
//     }
//     if (data.signedDateD) {
//       form.getTextField("txtSignedDate_d").setText(data.signedDateD);
//     }
//     if (data.signedYear) {
//       form.getTextField("txtSignedDate_yy").setText(data.signedYear);
//     }
//     form.updateFieldAppearances(font);
//     form.flatten();
//     const pdfBytes = await pdfDoc.save();
//     /* ===============================
//       ADMIN SAVE ONLY
//     =============================== */
//     if (isAdmin) {
//       return res.json({
//         success: true,
//         message: "CRG saved successfully."
//       });
//     }
//     /* ===============================
//        DOCUSIGN EMBEDDED SIGNING
//     =============================== */
//     const accessToken = await getAccessToken();
//     const signers = [];
//     /* SIGNER 1 */
//     if (data.consumerPrintName1) {
//       const email1 = data.email1 || party.email;
//       signers.push({
//         email: email1,
//         name: data.consumerPrintName1,
//         recipientId: "1",
//         routingOrder: "1",
//         clientUserId: `${party._id}_1`,
//         tabs: {
//           signHereTabs: [
//             {
//               anchorString: "/sign1/"
//             }
//           ]
//         }
//       });
//     }
//     /* SIGNER 2 */
//     if (data.consumerPrintName2) {
//       const email2 = data.email2 || party.email;
//       if (email2) {
//         signers.push({
//           email: email2,
//           name: data.consumerPrintName2,
//           recipientId: "2",
//           routingOrder: "2",
//           clientUserId: `${party._id}_2`,
//           tabs: {
//             signHereTabs: [
//               {
//                 anchorString: "/sign2/"
//               }
//             ]
//           }
//         });
//       }
//     }
//     if (signers.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "No signers found."
//       });
//     }
//     console.log("Embedded Signers:", signers);
//     /* ===============================
//        CREATE ENVELOPE
//     =============================== */
//     const envelopeRes = await axios.post(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes`,
//       {
//         emailSubject: "Please sign CRG document",
//         documents: [
//           {
//             documentBase64: Buffer.from(pdfBytes).toString("base64"),
//             name: "CRG.pdf",
//             fileExtension: "pdf",
//             documentId: "1"
//           }
//         ],
//         recipients: {
//           signers
//         },
//         status: "sent"
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//           "Content-Type": "application/json"
//         }
//       }
//     );
//     const envelopeId = envelopeRes.data.envelopeId;
//     /* ===============================
//        EMBEDDED SIGNING URL
//     =============================== */
//     const firstSigner = signers[0];
//     const viewRes = await axios.post(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/views/recipient`,
//       {
//         returnUrl: `${process.env.FRONTEND_URL}/party/type/${partyId}`,
//         authenticationMethod: "none",
//         email: firstSigner.email,
//         userName: firstSigner.name,
//         clientUserId: firstSigner.clientUserId
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//           "Content-Type": "application/json"
//         }
//       }
//     );
//     return res.json({
//       success: true,
//       envelopeId,
//       signingUrl: viewRes.data.url
//     });
//   } catch (error) {
//     console.error("CRG ERROR:", error.response?.data || error);
//     res.status(500).json({
//       success: false,
//       message: "Error generating CRG PDF"
//     });
//   }
// });





// router.post("/send-crg-for-signature", async (req, res) => {
//   try {
//     const { partyId } = req.body;
//     if (!partyId) {
//       return res.status(400).json({
//         success: false,
//         message: "partyId required"
//       });
//     }
//     /* ===============================
//        GET PARTY
//     =============================== */
//     const party = await TransactionParty.findById(partyId);
//     if (!party) {
//       return res.status(404).json({
//         success: false,
//         message: "Party not found"
//       });
//     }
//     /* ===============================
//        GET SAVED CRG
//     =============================== */
//     const crg = await Crg.findOne({ partyId });
//     if (!crg) {
//       return res.status(404).json({
//         success: false,
//         message: "CRG not found"
//       });
//     }
//     /* ===============================
//        GENERATE PDF
//     =============================== */
//     const existingPdfBytes = fs.readFileSync(PDF_PATH);
//     const pdfDoc = await PDFDocument.load(existingPdfBytes);
//     const form = pdfDoc.getForm();
//     const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
//     if (crg.consumerPrintName1) {
//       form.getTextField("txtConsumer1Sig")
//         .setText(crg.consumerPrintName1);
//     }
//     if (crg.consumerPrintName2) {
//       form.getTextField("txtConsumer2Sig")
//         .setText(crg.consumerPrintName2);
//     }
//     if (crg.signedDateM) {
//       form.getTextField("txtSignedDate_m")
//         .setText(crg.signedDateM);
//     }
//     if (crg.signedDateD) {
//       form.getTextField("txtSignedDate_d")
//         .setText(crg.signedDateD);
//     }
//     if (crg.signedYear) {
//       form.getTextField("txtSignedDate_yy")
//         .setText(crg.signedYear);
//     }
//     form.updateFieldAppearances(font);
//     form.flatten();
//     const pdfBytes = await pdfDoc.save();
//     /* ===============================
//        DOCUSIGN TOKEN
//     =============================== */
//     const accessToken = await getAccessToken();
//     /* ===============================
//        SIGNERS
//     =============================== */
//     const signers = [];
//     if (crg.consumerPrintName1) {
//       signers.push({
//         email: party.email,
//         name: crg.consumerPrintName1,
//         recipientId: "1",
//         routingOrder: "1",
//         tabs: {
//           signHereTabs: [
//             {
//               anchorString: "/sign1/"
//             }
//           ]
//         }
//       });
//     }
//     if (crg.consumerPrintName2) {
//       signers.push({
//         email: party.email,
//         name: crg.consumerPrintName2,
//         recipientId: "2",
//         routingOrder: "2",
//         tabs: {
//           signHereTabs: [
//             {
//               anchorString: "/sign2/"
//             }
//           ]
//         }
//       });
//     }
//     if (signers.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "No signers found."
//       });
//     }
//     console.log("Party Email:", party.email);
//     console.log("CRG:", crg);
//     console.log("Signers:", signers);
//     /* ===============================
//        CREATE ENVELOPE
//     =============================== */
//     const envelopeRes = await axios.post(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes`,
//       {
//         emailSubject: "Please sign your Consumer Relationship Guide",
//         documents: [
//           {
//             documentBase64: Buffer.from(pdfBytes).toString("base64"),
//             name: "CRG.pdf",
//             fileExtension: "pdf",
//             documentId: "1"
//           }
//         ],
//         recipients: {
//           signers
//         },
//         status: "sent"
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//           "Content-Type": "application/json"
//         }
//       }
//     );
//     return res.json({
//       success: true,
//       envelopeId: envelopeRes.data.envelopeId,
//       message: "DocuSign email sent successfully."
//     });
//   } catch (error) {
//     console.error(
//       "DOCUSIGN ERROR:",
//       error.response?.data || error
//     );
//     res.status(500).json({
//       success: false,
//       message: "Failed to send DocuSign email."
//     });
//   }
// });
