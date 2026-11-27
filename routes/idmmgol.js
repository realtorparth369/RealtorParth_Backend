import express from "express";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { PDFDocument, StandardFonts } from "pdf-lib";



import axios from "axios";
import jwt from "jsonwebtoken";


import Transaction from "../models/Transaction.js";
import IDMMGOL from "../models/IDMMGOLModel.js";
import TransactionParty from "../models/TransactionParty.js";
import TransactionUser from "../models/TransactionUser.js";

import nodemailer from "nodemailer";

const router = express.Router();

// 👉 Your blank PDF template path
const PDF_PATH = path.join(
  process.cwd(),
  "seller_pdfs/CREB® - Illegal Drug Manufacture_Marijuana Grow Operation Listing.pdf"   // ⚠️ PUT YOUR REAL PDF NAME HERE
);


/* =====================================
   GENERATE + SAVE IDMMGOL
===================================== */
// router.post("/generate-pdf", async (req, res) => {

//   try {

//     const { transactionId, userId, ...data } = req.body;

//     if (!transactionId || !userId) {
//       return res.status(400).json({
//         success: false,
//         message: "transactionId or userId required"
//       });
//     }

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
//        SAVE / UPDATE DB
//     =============================== */

//     await IDMMGOL.findOneAndUpdate(
//       { transactionId },             // ✅ per transaction
//       { ...data, transactionId },    // ✅ store all form data
//       { new: true, upsert: true }
//     );




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

const sendSignedPdfEmail = async (toEmail, pdfBuffer, certBuffer) => {
  try {
    // ✅ Validate inputs
    if (!toEmail) {
      console.warn("⚠️ No email provided");
      return;
    }

    if (!pdfBuffer || !certBuffer) {
      console.warn("⚠️ Missing PDF or certificate buffer");
      return;
    }

    // ✅ Create transporter
    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.BREVO_USER,
        pass: process.env.BREVO_PASSWORD,
      }
    });

    // ✅ Send email
    const info = await transporter.sendMail({
      from: `"RealtorParth" <hello@realtorparth.ca>`,
      to: toEmail,
      subject: "ID Manufacture / MG Operation Addendum Document + Summary",
      text: "Attached are your fully signed document and audit summary from DocuSign.",
      attachments: [
        {
          filename: "IDMMGOL.pdf",
          content: pdfBuffer,
          contentType: "application/pdf"
        },
        {
          filename: "DocuSign-Summary.pdf",
          content: certBuffer,
          contentType: "application/pdf"
        }
      ]
    });

    console.log("✅ Email sent:", info.messageId);

  } catch (error) {
    console.error(
      "❌ Email error:",
      error?.response?.data || error.message || error
    );
  }
};




router.post("/generate-pdf", async (req, res) => {
  try {
    const { partyId, sendEmail = false, isAdmin = false, ...data } = req.body;
    delete data._id;
    if (!partyId) {
      return res.status(400).json({
        success: false,
        message: "partyId is required"
      });
    }
    const party = await TransactionParty.findById(partyId);
    if (!party) {
      return res.json({
        success: false,
        message: "Invalid party"
      });
    }
    const transactinuser = await TransactionUser.findById(party.userId);
    /* ===============================
       SAVE / UPDATE (PER PARTY)
    =============================== */
    // await IDMMGOL.findOneAndUpdate(
    //   { partyId }, // 🔥 MAIN FIX
    //   {
    //     ...data,
    //     partyId,
    //     transactionId: party.transactionId // ✅ optional (admin use)
    //   },
    //   {
    //     new: true,
    //     upsert: true
    //   }
    // );
    await IDMMGOL.findOneAndUpdate(
      { partyId },
      {
        partyId,
        transactionId: party.transactionId,

        agreementNumber: data.agreementNumber,
        listingContractNumber: data.listingContractNumber,

        sellerFirstName1: data.sellerFirstName1,
        sellerLastName1: data.sellerLastName1,

        sellerFirstName2: data.sellerFirstName2,
        sellerLastName2: data.sellerLastName2,

        brokerageName: data.brokerageName,
        brokerageRepName: data.brokerageRepName,

        streetNum: data.streetNum,
        street: data.street,
        unitNum: data.unitNum,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,

        plan: data.plan,
        block: data.block,
        lotUnit: data.lotUnit,

        sellerSignDate: data.sellerSignDate,

        sellerPrint1: data.sellerPrint1,
        sellerPrint2: data.sellerPrint2,

        witness1: data.witness1,
        witness2: data.witness2,

        brokerageSignDate: data.brokerageSignDate,
        repPrintName: data.repPrintName,

        /* ===============================
           EMAILS
        =============================== */

        sellerSignatureEmail1: data.sellerSignatureEmail1,
        sellerSignatureEmail2: data.sellerSignatureEmail2,

        witnessEmail1: data.witnessEmail1,
        witnessEmail2: data.witnessEmail2,

        brokerEmail: data.brokerEmail
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );
    /* ===============================
       LOAD PDF
    =============================== */
    const existingPdfBytes = fs.readFileSync(PDF_PATH);
    const pdfDoc = await PDFDocument.load(existingPdfBytes, {
      ignoreEncryption: true
    });
    const form = pdfDoc.getForm();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    if (data.listingContractNumber) {
      form.getTextField("txtp_PlatBook")
        .setText(data.listingContractNumber);
    }
    if (data.sellerFirstName1) {
      form.getTextField("txtseller1FName")
        .setText(data.sellerFirstName1);
    }
    if (data.sellerLastName1) {
      form.getTextField("txtseller1LName")
        .setText(data.sellerLastName1);
    }
    if (data.sellerFirstName2) {
      form.getTextField("txtseller2FName")
        .setText(data.sellerFirstName2);
    }
    if (data.sellerLastName2) {
      form.getTextField("txtseller2LName")
        .setText(data.sellerLastName2);
    }
    if (data.streetNum) {
      form.getTextField("txtp_streetnum")
        .setText(data.streetNum);
    }
    if (data.street) {
      form.getTextField("txtp_street")
        .setText(data.street);
    }
    if (data.unitNum) {
      form.getTextField("txtp_unitNumber")
        .setText(data.unitNum);
    }
    if (data.city) {
      form.getTextField("txtp_city")
        .setText(data.city);
    }
    if (data.state) {
      form.getTextField("txtp_state")
        .setText(data.state);
    }
    if (data.zipCode) {
      form.getTextField("txtp_zipcode")
        .setText(data.zipCode);
    }
    if (data.plan) {
      form.getTextField("txtp_PageNumber")
        .setText(data.plan);
    }
    if (data.block) {
      form.getTextField("txtp_Block")
        .setText(data.block);
    }
    if (data.lotUnit) {
      form.getTextField("txtp_LotNumber")
        .setText(data.lotUnit);
    }
    if (data.sellerPrint1) {
      form.getTextField("txtsellersig1")
        .setText(data.sellerPrint1);
    }
    if (data.sellerPrint2) {
      form.getTextField("txtsellersig2")
        .setText(data.sellerPrint2);
    }
    if (data.witness1) {
      form.getTextField("txtWitness1Sig")
        .setText(data.witness1);
    }
    if (data.witness2) {
      form.getTextField("txtWitness2Sig")
        .setText(data.witness2);
    }
    /* ===============================
       FINALIZE PDF
    =============================== */
    form.updateFieldAppearances(font);
    form.flatten();
    const pdfBytes = await pdfDoc.save({
      updateFieldAppearances: true
    });
    /* ===============================
       SAVE ONLY
    =============================== */
    return res.json({
      success: true,
      message:
        "Illegal Drug Manufacture / Marijuana Grow Operation Addendum saved successfully."
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});




router.post("/send-idmmgol-for-signature", async (req, res) => {
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

    const transactionUser = await TransactionUser.findById(
      party.userId
    );

    /* ===============================
       GET SAVED DATA
    =============================== */

    const data = await IDMMGOL.findOne({ partyId });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "IDMMGOL not found"
      });
    }

    /* ===============================
       LOAD PDF
    =============================== */

    const existingPdfBytes = fs.readFileSync(PDF_PATH);

    const pdfDoc = await PDFDocument.load(existingPdfBytes, {
      ignoreEncryption: true
    });

    const form = pdfDoc.getForm();

    const font = await pdfDoc.embedFont(
      StandardFonts.Helvetica
    );

    /* ===============================
       PDF FIELD MAPPING
    =============================== */

    if (data.listingContractNumber) {
      form
        .getTextField("txtp_PlatBook")
        .setText(data.listingContractNumber);
    }

    if (data.sellerFirstName1) {
      form
        .getTextField("txtseller1FName")
        .setText(data.sellerFirstName1);
    }

    if (data.sellerLastName1) {
      form
        .getTextField("txtseller1LName")
        .setText(data.sellerLastName1);
    }

    if (data.sellerFirstName2) {
      form
        .getTextField("txtseller2FName")
        .setText(data.sellerFirstName2);
    }

    if (data.sellerLastName2) {
      form
        .getTextField("txtseller2LName")
        .setText(data.sellerLastName2);
    }

    if (data.streetNum) {
      form
        .getTextField("txtp_streetnum")
        .setText(data.streetNum);
    }

    if (data.street) {
      form
        .getTextField("txtp_street")
        .setText(data.street);
    }

    if (data.unitNum) {
      form
        .getTextField("txtp_unitNumber")
        .setText(data.unitNum);
    }

    if (data.city) {
      form
        .getTextField("txtp_city")
        .setText(data.city);
    }

    if (data.state) {
      form
        .getTextField("txtp_state")
        .setText(data.state);
    }

    if (data.zipCode) {
      form
        .getTextField("txtp_zipcode")
        .setText(data.zipCode);
    }

    if (data.plan) {
      form
        .getTextField("txtp_PageNumber")
        .setText(data.plan);
    }

    if (data.block) {
      form
        .getTextField("txtp_Block")
        .setText(data.block);
    }

    if (data.lotUnit) {
      form
        .getTextField("txtp_LotNumber")
        .setText(data.lotUnit);
    }

    /* ===============================
       SIGNATURE NAMES
    =============================== */

    if (data.sellerPrint1) {
      form
        .getTextField("txtsellersig1")
        .setText(data.sellerPrint1);
    }

    if (data.sellerPrint2) {
      form
        .getTextField("txtsellersig2")
        .setText(data.sellerPrint2);
    }

    if (data.witness1) {
      form
        .getTextField("txtWitness1Sig")
        .setText(data.witness1);
    }

    if (data.witness2) {
      form
        .getTextField("txtWitness2Sig")
        .setText(data.witness2);
    }

    /* ===============================
       FINALIZE PDF
    =============================== */

    form.updateFieldAppearances(font);

    form.flatten();

    const pdfBytes = await pdfDoc.save({
      updateFieldAppearances: true
    });

    const accessToken = await getAccessToken();

    /* ===============================
   BUILD SIGNERS
=============================== */

    const signers = [];

    /* ---------- Seller 1 ---------- */

    if (data.sellerPrint1 && data.sellerSignatureEmail1) {
      signers.push({
        email: data.sellerSignatureEmail1.trim(),
        name: data.sellerPrint1,
        recipientId: "1",
        routingOrder: "1",
        clientUserId: `${partyId}_seller1`,
        tabs: {
          signHereTabs: [
            {
              anchorString: "/sign1/"
            }
          ],
          dateSignedTabs: [
            {
              anchorString: "/date_md1/",
              dateFormat: "MMMM d"
            }
          ]
        }
      });
    }

    /* ---------- Seller 2 ---------- */

    if (data.sellerPrint2 && data.sellerSignatureEmail2) {
      signers.push({
        email: data.sellerSignatureEmail2.trim(),
        name: data.sellerPrint2,
        recipientId: "2",
        routingOrder: "1",
        clientUserId: `${partyId}_seller2`,
        tabs: {
          signHereTabs: [
            {
              anchorString: "/sign3/"
            }
          ]
        }
      });
    }

    /* ---------- Witness 1 ---------- */

    if (data.witness1 && data.witnessEmail1) {
      signers.push({
        email: data.witnessEmail1.trim(),
        name: data.witness1,
        recipientId: "3",
        routingOrder: "1",
        clientUserId: `${partyId}_witness1`,
        tabs: {
          signHereTabs: [
            {
              anchorString: "/sign2/"
            }
          ]
        }
      });
    }

    /* ---------- Witness 2 ---------- */

    if (data.witness2 && data.witnessEmail2) {
      signers.push({
        email: data.witnessEmail2.trim(),
        name: data.witness2,
        recipientId: "4",
        routingOrder: "1",
        clientUserId: `${partyId}_witness2`,
        tabs: {
          signHereTabs: [
            {
              anchorString: "/sign4/"
            }
          ]
        }
      });
    }

    /* ---------- Broker ---------- */

    if (data.repPrintName && data.brokerEmail) {
      signers.push({
        email: data.brokerEmail.trim(),
        name: data.repPrintName,
        recipientId: "5",
        routingOrder: "1",
        clientUserId: `${partyId}_broker`,
        tabs: {
          signHereTabs: [
            {
              anchorString: "/sign5/"
            }
          ],
          dateSignedTabs: [
            {
              anchorString: "/date_md2/",
              dateFormat: "MMMM d"
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

    console.log("IDMMGOL Signers:", signers);

    /* ===============================
       CREATE ENVELOPE
    =============================== */

    const envelopePayload = {
      emailSubject:
        "Please sign the Illegal Drug Manufacture / Marijuana Grow Operation Addendum",

      documents: [
        {
          documentBase64: Buffer.from(pdfBytes).toString("base64"),
          name:
            "Illegal Drug Manufacture Marijuana Grow Operation Addendum.pdf",
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

    await IDMMGOL.findOneAndUpdate(
      { partyId },
      {
        envelopeId,

        completedEmailSent: false,

        seller1Signed: false,
        seller2Signed: false,
        witness1Signed: false,
        witness2Signed: false,
        brokerSigned: false,

        signers: signers.map((s) => ({
          recipientId: s.recipientId,
          clientUserId: s.clientUserId,
          email: s.email,
          name: s.name,
          routingOrder: s.routingOrder
        }))
      }
    );
    /* ===============================
   SEND EMAIL TO EACH SIGNER
=============================== */

    for (const signer of signers) {

      // const signingLink = `https://realtorparth.ca/api/idmmgol/start-sign/${partyId}?recipientId=${signer.recipientId}`;
      const signingLink = `https://realtorparth.ca/api/idmmgol/start-sign/${partyId}/${signer.recipientId}`;

      let documentRole = "Signer";

      switch (signer.recipientId) {
        case "1":
          documentRole = "Seller 1";
          break;

        case "2":
          documentRole = "Seller 2";
          break;

        case "3":
          documentRole = "Witness 1";
          break;

        case "4":
          documentRole = "Witness 2";
          break;

        case "5":
          documentRole = "Broker";
          break;
      }

      await transporter.sendMail({
        from: `"RealtorParth" <hello@realtorparth.ca>`,
        to: signer.email,
        subject:
          "Illegal Drug Manufacture / Marijuana Grow Operation Addendum Ready For Signature",

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
Hello ${signer.name},
</h2>

<p style="font-size:16px;color:#555;line-height:28px;">
You have been requested to sign the
<strong>Illegal Drug Manufacture / Marijuana Grow Operation Addendum</strong>
as <strong>${documentRole}</strong>.
</p>

<p style="font-size:16px;color:#555;line-height:28px;">
Please review the document carefully and complete your electronic signature.
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
Open Document & Sign
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
      message: "Signature request emails sent successfully."
    });

  } catch (error) {

    console.error(
      "IDMMGOL DOCUSIGN ERROR:",
      error.response?.data || error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to send IDMMGOL for signature."
    });

  }
});



router.get("/start-sign/:partyId/:recipientId", async (req, res) => {
  try {
    const { partyId, recipientId } = req.params;
    // const { recipientId } = req.query;

    const idmmgol = await IDMMGOL.findOne({ partyId });

    if (!idmmgol) {
      return res.status(404).send("IDMMGOL not found.");
    }

    if (!idmmgol.envelopeId) {
      return res.status(400).send("Envelope not created yet.");
    }

    if (
      !idmmgol.signers ||
      idmmgol.signers.length === 0
    ) {
      return res.status(400).send("No signers found.");
    }

    /* ===============================
       GET REQUESTED SIGNER
    =============================== */

    const signer =
      idmmgol.signers.find(
        s => s.recipientId === String(recipientId)
      ) ||
      idmmgol.signers.find(
        s => s.recipientId === "1"
      ) ||
      idmmgol.signers[0];

    if (!signer) {
      return res.status(404).send("Signer not found.");
    }

    const accessToken = await getAccessToken();

    /* ===============================
       CREATE RECIPIENT VIEW
    =============================== */

    const viewRes = await axios.post(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${idmmgol.envelopeId}/views/recipient`,
      {
        authenticationMethod: "none",

        email: signer.email,
        userName: signer.name,

        clientUserId: signer.clientUserId,

        returnUrl: `https://realtorparth.ca/api/idmmgol/sign-complete/${partyId}?recipientId=${signer.recipientId}`
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

    return res
      .status(500)
      .send("Unable to start signing.");

  }
});


router.get("/sign-complete/:partyId", async (req, res) => {
  try {

    const { partyId } = req.params;
    const { recipientId } = req.query;

    console.log("========== IDMMGOL SIGN COMPLETE ==========");
    console.log("Party:", partyId);
    console.log("Recipient:", recipientId);

    const idmmgol = await IDMMGOL.findOne({ partyId });

    if (!idmmgol) {
      return res.status(404).send("IDMMGOL not found.");
    }

    /* ===============================
       UPDATE SIGNING STATUS
    =============================== */

    switch (String(recipientId)) {

      case "1":
        if (idmmgol.seller1Signed) {
          return res.redirect(
            "https://realtorparth.ca/signature-complete"
          );
        }
        idmmgol.seller1Signed = true;
        break;

      case "2":
        if (idmmgol.seller2Signed) {
          return res.redirect(
            "https://realtorparth.ca/signature-complete"
          );
        }
        idmmgol.seller2Signed = true;
        break;

      case "3":
        if (idmmgol.witness1Signed) {
          return res.redirect(
            "https://realtorparth.ca/signature-complete"
          );
        }
        idmmgol.witness1Signed = true;
        break;

      case "4":
        if (idmmgol.witness2Signed) {
          return res.redirect(
            "https://realtorparth.ca/signature-complete"
          );
        }
        idmmgol.witness2Signed = true;
        break;

      case "5":
        if (idmmgol.brokerSigned) {
          return res.redirect(
            "https://realtorparth.ca/signature-complete"
          );
        }
        idmmgol.brokerSigned = true;
        break;
    }

    const party = await TransactionParty.findById(partyId);

    if (!party) {
      return res.status(404).send("Party not found.");
    }

    const transactionUser = await TransactionUser.findById(
      party.userId
    );

    if (!transactionUser) {
      return res
        .status(404)
        .send("Transaction User not found.");
    }

    /* ===============================
       SEND AGENT EMAIL
    =============================== */

    if (
      !idmmgol.completedEmailSent &&
      transactionUser.email
    ) {

      await transporter.sendMail({
        from: `"RealtorParth" <hello@realtorparth.ca>`,
        to: transactionUser.email,
        subject:
          "Illegal Drug Manufacture / Marijuana Grow Operation Addendum Signed",
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
A Signer Has Completed Signing
</h2>

<p style="font-size:16px;color:#555;line-height:28px;">
A signer has completed their electronic signature for the
<strong>Illegal Drug Manufacture / Marijuana Grow Operation Addendum</strong>.
</p>

<table
width="100%"
cellpadding="10"
cellspacing="0"
style="margin:30px 0;border-collapse:collapse;border:1px solid #e5e7eb;"
>

<tr>
<td style="font-weight:600;">Client</td>
<td>${party.name}</td>
</tr>

<tr>
<td style="font-weight:600;">Email</td>
<td>${party.email}</td>
</tr>

<tr>
<td style="font-weight:600;">Completed By</td>
<td>${recipientId}</td>
</tr>

<tr>
<td style="font-weight:600;">Completed On</td>
<td>
${new Date().toLocaleString("en-CA", {
          dateStyle: "long",
          timeStyle: "short"
        })}
</td>
</tr>

</table>

<p>
RealtorParth Team
</p>

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

      idmmgol.completedEmailSent = true;
    }

    /* ===============================
       OPTIONAL WITNESS NOTIFICATIONS
    =============================== */

    if (
      String(recipientId) === "1" &&
      idmmgol.witnessEmail1
    ) {
      await transporter.sendMail({
        from: `"RealtorParth" <hello@realtorparth.ca>`,
        to: idmmgol.witnessEmail1,
        subject:
          "Seller 1 has completed signing - Illegal Drug Manufacture / Marijuana Grow Operation Addendum",
        html: `
          <p>Hello ${idmmgol.witness1 || "Witness"},</p>

          <p>
            Seller 1 has completed their electronic signature for the
            <strong>Illegal Drug Manufacture / Marijuana Grow Operation Addendum</strong>.
          </p>

          <p>
            This is an automated notification from RealtorParth.
          </p>
        `
      });
    }

    if (
      String(recipientId) === "2" &&
      idmmgol.witnessEmail2
    ) {
      await transporter.sendMail({
        from: `"RealtorParth" <hello@realtorparth.ca>`,
        to: idmmgol.witnessEmail2,
        subject:
          "Seller 2 has completed signing - Illegal Drug Manufacture / Marijuana Grow Operation Addendum",
        html: `
          <p>Hello ${idmmgol.witness2 || "Witness"},</p>

          <p>
            Seller 2 has completed their electronic signature for the
            <strong>Illegal Drug Manufacture / Marijuana Grow Operation Addendum</strong>.
          </p>

          <p>
            This is an automated notification from RealtorParth.
          </p>
        `
      });
    }

    /* ===============================
       SAVE
    =============================== */

    await idmmgol.save();

    console.log("Signing status updated.");

    return res.redirect(
      "https://realtorparth.ca/signature-complete"
    );

  } catch (err) {

    console.error(
      "========== IDMMGOL SIGN COMPLETE ERROR =========="
    );

    console.error(err.response?.data || err);

    return res.redirect(
      "https://realtorparth.ca/signature-complete"
    );

  }
});



// router.post("/send-idmmgol-for-signature", async (req, res) => {
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
//     const transactionUser = await TransactionUser.findById(party.userId);
//     /* ===============================
//        GET SAVED DATA
//     =============================== */
//     const data = await IDMMGOL.findOne({ partyId });
//     if (!data) {
//       return res.status(404).json({
//         success: false,
//         message: "IDMMGOL not found"
//       });
//     }
//     /* ===============================
//        LOAD PDF
//     =============================== */
//     const existingPdfBytes = fs.readFileSync(PDF_PATH);
//     const pdfDoc = await PDFDocument.load(existingPdfBytes, {
//       ignoreEncryption: true
//     });
//     const form = pdfDoc.getForm();
//     const font = await pdfDoc.embedFont(
//       StandardFonts.Helvetica
//     );
//     if (data.listingContractNumber) {
//       form.getTextField("txtp_PlatBook")
//         .setText(data.listingContractNumber);
//     }
//     if (data.sellerFirstName1) {
//       form.getTextField("txtseller1FName")
//         .setText(data.sellerFirstName1);
//     }
//     if (data.sellerLastName1) {
//       form.getTextField("txtseller1LName")
//         .setText(data.sellerLastName1);
//     }
//     if (data.sellerFirstName2) {
//       form.getTextField("txtseller2FName")
//         .setText(data.sellerFirstName2);
//     }
//     if (data.sellerLastName2) {
//       form.getTextField("txtseller2LName")
//         .setText(data.sellerLastName2);
//     }
//     if (data.streetNum) {
//       form.getTextField("txtp_streetnum")
//         .setText(data.streetNum);
//     }
//     if (data.street) {
//       form.getTextField("txtp_street")
//         .setText(data.street);
//     }
//     if (data.unitNum) {
//       form.getTextField("txtp_unitNumber")
//         .setText(data.unitNum);
//     }
//     if (data.city) {
//       form.getTextField("txtp_city")
//         .setText(data.city);
//     }
//     if (data.state) {
//       form.getTextField("txtp_state")
//         .setText(data.state);
//     }
//     if (data.zipCode) {
//       form.getTextField("txtp_zipcode")
//         .setText(data.zipCode);
//     }
//     if (data.plan) {
//       form.getTextField("txtp_PageNumber")
//         .setText(data.plan);
//     }
//     if (data.block) {
//       form.getTextField("txtp_Block")
//         .setText(data.block);
//     }
//     if (data.lotUnit) {
//       form.getTextField("txtp_LotNumber")
//         .setText(data.lotUnit);
//     }
//     if (data.sellerPrint1) {
//       form.getTextField("txtsellersig1")
//         .setText(data.sellerPrint1);
//     }
//     if (data.sellerPrint2) {
//       form.getTextField("txtsellersig2")
//         .setText(data.sellerPrint2);
//     }
//     if (data.witness1) {
//       form.getTextField("txtWitness1Sig")
//         .setText(data.witness1);
//     }
//     if (data.witness2) {
//       form.getTextField("txtWitness2Sig")
//         .setText(data.witness2);
//     }
//     /* =====================================================
//        END PDF MAPPING
//     ===================================================== */
//     form.updateFieldAppearances(font);
//     form.flatten();
//     const pdfBytes = await pdfDoc.save({
//       updateFieldAppearances: true
//     });
//     const accessToken = await getAccessToken();

//     const signers = [];
//     const baseEmail = party.email;
//     const [name, domain] = baseEmail.split("@");
//     const seller1Email = baseEmail;
//     const seller2Email = `${name}+seller2@${domain}`;
//     /* SELLER 1 */
//     if (data.sellerPrint1) {
//       signers.push({
//         email: seller1Email,
//         name: data.sellerPrint1,
//         recipientId: "1",
//         routingOrder: "1",
//         clientUserId: `${partyId}_seller1`,
//         tabs: {
//           signHereTabs: [
//             {
//               anchorString: "/sign1/"
//             }
//           ],
//           dateSignedTabs: [
//             {
//               anchorString: "/date_md1/",
//               dateFormat: "MMMM d"
//             }
//           ]
//         }
//       });
//     }
//     /* SELLER 2 */
//     if (data.sellerPrint2) {
//       signers.push({
//         email: seller2Email,
//         name: data.sellerPrint2,
//         recipientId: "2",
//         routingOrder: "2",
//         clientUserId: `${partyId}_seller2`,
//         tabs: {
//           signHereTabs: [
//             {
//               anchorString: "/sign3/"
//             }
//           ]
//         }
//       });
//     }
//     /* AGENT */
//     if (data.repPrintName && transactionUser?.email) {
//       signers.push({
//         email: transactionUser.email,
//         name: data.repPrintName,
//         recipientId: "3",
//         routingOrder: "3",
//         tabs: {
//           signHereTabs: [
//             {
//               anchorString: "/sign5/"
//             }
//           ],
//           dateSignedTabs: [
//             {
//               anchorString: "/date_md2/",
//               dateFormat: "MMMM d"
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
//     console.log("IDMMGOL Signers:", signers);
//     /* ===============================
//        CREATE ENVELOPE
//     =============================== */
//     const envelopePayload = {
//       emailSubject: "Please sign the Illegal Drug Manufacture / Marijuana Grow Operation Addendum",
//       documents: [
//         {
//           documentBase64: Buffer.from(pdfBytes).toString("base64"),
//           name:
//             "Illegal Drug Manufacture Marijuana Grow Operation Addendum.pdf",
//           fileExtension: "pdf",
//           documentId: "1"
//         }
//       ],
//       recipients: {
//         signers
//       },
//       status: "sent"
//     };
//     const envelopeRes = await axios.post(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes`,
//       envelopePayload,
//       {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//           "Content-Type": "application/json"
//         }
//       }
//     );
//     const envelopeId = envelopeRes.data.envelopeId;
//     await IDMMGOL.findOneAndUpdate(
//       { partyId },
//       {
//         envelopeId,
//         completedEmailSent: false,
//         signers: signers.map(s => ({
//           recipientId: s.recipientId,
//           clientUserId: s.clientUserId || null,
//           email: s.email,
//           name: s.name,
//           routingOrder: s.routingOrder
//         }))
//       }
//     );
//     const signingLink = `https://realtorparth.ca/api/idmmgol/start-sign/${partyId}`;
//     await transporter.sendMail({
//       from: `"RealtorParth" <hello@realtorparth.ca>`,
//       to: party.email,
//       subject:
//         "Illegal Operation Addendum Ready For Signature",
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
// Hello ${data.sellerPrint1},
// </h2>

// <p style="font-size:16px;color:#555;line-height:28px;">
// Your <strong>Illegal Operation Addendum</strong> document has been prepared and is now ready for your electronic signature.
// </p>

// <p style="font-size:16px;color:#555;line-height:28px;">
// Please review the document carefully and complete your signature by clicking the button below.
// </p>

// <table width="100%" cellpadding="0" cellspacing="0" style="margin:35px 0;">
// <tr>
// <td align="center">

// <a href="${signingLink}"
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
// Sign Illegal Operation Addendum
// </a>

// </td>
// </tr>
// </table>

// <div style="background:#f8f9fb;border-left:4px solid #0f4c81;padding:18px;border-radius:6px;">
// <p style="margin:0;color:#555;font-size:15px;line-height:24px;">
// If the button above does not work, copy and paste the following link into your browser:
// </p>

// <p style="margin-top:12px;word-break:break-all;">
// <a href="${signingLink}" style="color:#0f4c81;">
// ${signingLink}
// </a>
// </p>
// </div>

// <p style="margin-top:35px;font-size:15px;color:#555;line-height:26px;">
// If you have any questions regarding this document, please contact your Realtor before signing.
// </p>

// <p style="margin-top:35px;font-size:16px;color:#222;">
// Kind Regards,<br>
// <strong>RealtorParth Team</strong>
// </p>

// </td>
// </tr>

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
//     });
//     return res.json({
//       success: true,
//       message: "Email sent successfully."
//     });
//   } catch (error) {
//     console.error(
//       "IDMMGOL DOCUSIGN ERROR:",
//       error.response?.data || error
//     );
//     res.status(500).json({
//       success: false,
//       message:
//         "Failed to send IDMMGOL for signature."
//     });
//   }
// });


// router.get("/start-sign/:partyId", async (req, res) => {
//   try {
//     const { partyId } = req.params;

//     const idmmgol = await IDMMGOL.findOne({ partyId });

//     if (!idmmgol) {
//       return res
//         .status(404)
//         .send("IDMMGOL not found.");
//     }

//     if (!idmmgol.envelopeId) {
//       return res
//         .status(400)
//         .send("Envelope not created yet.");
//     }

//     if (
//       !idmmgol.signers ||
//       idmmgol.signers.length === 0
//     ) {
//       return res
//         .status(400)
//         .send("No signers found.");
//     }

//     /* ===============================
//        FIRST SIGNER
//     =============================== */

//     const signer =
//       idmmgol.signers.find(
//         s => s.recipientId === "1"
//       ) || idmmgol.signers[0];

//     const accessToken = await getAccessToken();

//     /* ===============================
//        CREATE RECIPIENT VIEW
//     =============================== */

//     const viewRes = await axios.post(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${idmmgol.envelopeId}/views/recipient`,
//       {
//         authenticationMethod: "none",

//         email: signer.email,
//         userName: signer.name,

//         clientUserId: signer.clientUserId,

//         returnUrl: `https://realtorparth.ca/api/idmmgol/sign-complete/${partyId}`
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

//     return res
//       .status(500)
//       .send("Unable to start signing.");

//   }
// });



// router.get("/sign-complete/:partyId", async (req, res) => {
//   try {
//     const { partyId } = req.params;
//     const idmmgol = await IDMMGOL.findOne({ partyId });
//     if (!idmmgol) {
//       return res
//         .status(404)
//         .send("IDMMGOL not found.");
//     }
//     // Prevent duplicate emails
//     if (idmmgol.completedEmailSent) {
//       console.log("Notification already sent.");
//       return res.redirect("https://realtorparth.ca/signature-complete");
//     }
//     // ----------------------------------------------------
//     // Party
//     // ----------------------------------------------------
//     const party = await TransactionParty.findById(partyId);
//     if (!party) {
//       return res.status(404).send("Party not found.");
//     }
//     // ----------------------------------------------------
//     // Transaction User (Admin)
//     // ----------------------------------------------------
//     const transactionUser = await TransactionUser.findById(party.userId);
//     if (!transactionUser) {
//       return res
//         .status(404)
//         .send("Transaction User not found.");
//     }
//     console.log(
//       "Sending notification to:",
//       transactionUser.email
//     );
//     // ----------------------------------------------------
//     // Send Notification Email
//     // ----------------------------------------------------
//     await transporter.sendMail({
//       from: `"RealtorParth" <hello@realtorparth.ca>`,
//       to: transactionUser.email,
//       subject:"Illegal Drug Manufacture / Marijuana Grow Operation Addendum Signed by Client",
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
// <strong>Illegal Drug Manufacture / Marijuana Grow Operation Addendum</strong>.
// </p>

// <table
// width="100%"
// cellpadding="10"
// cellspacing="0"
// style="margin:30px 0;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;"
// >

// <tr style="background:#f8fafc;">
// <td style="font-weight:600;color:#333;width:180px;">
// Client Name
// </td>
// <td style="color:#555;">
// ${party.name}
// </td>
// </tr>

// <tr>
// <td style="font-weight:600;color:#333;">
// Client Email
// </td>
// <td style="color:#555;">
// ${party.email}
// </td>
// </tr>

// <tr style="background:#f8fafc;">
// <td style="font-weight:600;color:#333;">
// Document
// </td>
// <td style="color:#555;">
// Illegal Drug Manufacture / Marijuana Grow Operation Addendum
// </td>
// </tr>

// <tr>
// <td style="font-weight:600;color:#333;">
// Status
// </td>
// <td style="color:#16a34a;font-weight:600;">
// ✔ Client Signature Completed
// </td>
// </tr>

// <tr style="background:#f8fafc;">
// <td style="font-weight:600;color:#333;">
// Completed On
// </td>
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
//     // ----------------------------------------------------
//     // Prevent duplicate notification
//     // ----------------------------------------------------
//     idmmgol.completedEmailSent = true;
//     await idmmgol.save();
//     console.log("completedEmailSent updated");
//     return res.redirect(
//       "https://realtorparth.ca/signature-complete"
//     );
//   } catch (err) {
//     console.error("========== SIGN COMPLETE ERROR ==========");
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
        // returnUrl: `${process.env.FRONTEND_URL}/sign-redirect?partyId=${partyId}&type=idmmgol`,
        returnUrl: `http://localhost:5173/sign-redirect?partyId=${partyId}&type=idmmgol`,
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
    const { partyId, final } = req.query;

    const session = global.signingSessions?.[partyId];
    if (!session) return res.status(400).send("No session");

    const { envelopeId, transactionUserEmail } = session;

    const accessToken = await getAccessToken();

    const isFinalFlow = final === "true";

    /* ===============================
       🔍 GET RECIPIENT STATUS
    =============================== */
    const recipientsRes = await axios.get(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/recipients`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const allSigners = recipientsRes.data.signers;

    /* ===============================
       👤 PARTY FLOW (NO REP REQUIRED)
    =============================== */
    if (!isFinalFlow) {
      const partySigners = allSigners.slice(0, -1); // exclude rep

      const partyCompleted = partySigners.every(
        (s) => s.status === "completed"
      );

      if (!partyCompleted) {
        return res.status(400).json({
          error: "Party signers not completed yet"
        });
      }

      console.log("✅ Party completed (IDMMGOL)");

      const docRes = await axios.get(
        `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/combined`,
        {
          responseType: "arraybuffer",
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=Party-Signed-IDMMGOL.pdf"
      });

      return res.send(docRes.data);
    }

    /* ===============================
       👨‍💼 FINAL FLOW (ALL SIGNERS)
    =============================== */
    let status = "sent";
    let attempts = 0;

    while (status !== "completed" && attempts < 20) {
      const statusRes = await axios.get(
        `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      status = statusRes.data.status;

      if (status === "completed") break;

      await new Promise((r) => setTimeout(r, 1500));
      attempts++;
    }

    if (status !== "completed") {
      return res.status(400).json({
        error: "Envelope not completed yet"
      });
    }

    console.log("✅ Final completed (IDMMGOL)");

    /* DOWNLOAD FINAL PDF */
    const signedDoc = await axios.get(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/combined`,
      {
        responseType: "arraybuffer",
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const signedPdfBuffer = Buffer.from(signedDoc.data);

    /* GENERATE SUMMARY */
    const summaryPdfBuffer = await generateSummaryPdf(partyId);

    /* SEND EMAIL */
    await sendSignedPdfEmail(
      transactionUserEmail,
      signedPdfBuffer,
      summaryPdfBuffer
    );

    console.log("📧 Email sent (IDMMGOL):", transactionUserEmail);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=Final-IDMMGOL.pdf"
    });

    res.send(signedPdfBuffer);

  } catch (err) {
    console.error("❌ Download error:", err.response?.data || err.message || err);
    res.status(500).send("Download error");
  }
});


router.get("/user/:partyId", async (req, res) => {

  try {

    const { partyId } = req.params;

    /* ===============================
       VALIDATION
    =============================== */

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
       FETCH DATA (PER PARTY)
    =============================== */

    const data = await IDMMGOL.findOne({
      partyId
    });

    res.json({
      success: true,
      data: data || null
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});

export default router;



































// router.post("/generate-pdf", async (req, res) => {
//   try {
//     const { partyId, sendEmail = false, isAdmin = false, ...data } = req.body;
//     // ❗ prevent duplicate _id issue
//     delete data._id;
//     /* ===============================
//        VALIDATION
//     =============================== */
//     if (!partyId) {
//       return res.status(400).json({
//         success: false,
//         message: "partyId is required"
//       });
//     }
//     /* ===============================
//        VERIFY PARTY EXISTS
//     =============================== */
//     const party = await TransactionParty.findById(partyId);
//     if (!party) {
//       return res.json({
//         success: false,
//         message: "Invalid party"
//       });
//     }
//     const transactinuser = await TransactionUser.findById(party.userId);

//     /* ===============================
//        SAVE / UPDATE (PER PARTY)
//     =============================== */
//     await IDMMGOL.findOneAndUpdate(
//       { partyId }, // 🔥 MAIN FIX
//       {
//         ...data,
//         partyId,
//         transactionId: party.transactionId // ✅ optional (admin use)
//       },
//       {
//         new: true,
//         upsert: true
//       }
//     );

//     // 👉 continue your PDF generation logic here...
//     /* ===============================
//        LOAD PDF
//     =============================== */
//     const existingPdfBytes = fs.readFileSync(PDF_PATH);
//     const pdfDoc = await PDFDocument.load(existingPdfBytes, {
//       ignoreEncryption: true
//     });
//     const form = pdfDoc.getForm();
//     const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
//     /* ===============================
//        MAP PDF FIELDS (EDIT THESE)
//     =============================== */

//     if (data.listingContractNumber) {
//       form.getTextField("txtp_PlatBook")
//         .setText(data.listingContractNumber);
//     }
//     if (data.sellerFirstName1) {
//       form.getTextField("txtseller1FName")
//         .setText(data.sellerFirstName1);
//     }
//     if (data.sellerLastName1) {
//       form.getTextField("txtseller1LName")
//         .setText(data.sellerLastName1);
//     }
//     if (data.sellerFirstName2) {
//       form.getTextField("txtseller2FName")
//         .setText(data.sellerFirstName2);
//     }
//     if (data.sellerLastName2) {
//       form.getTextField("txtseller2LName")
//         .setText(data.sellerLastName2);
//     }
//     if (data.streetNum) {
//       form.getTextField("txtp_streetnum")
//         .setText(data.streetNum);
//     }
//     if (data.street) {
//       form.getTextField("txtp_street")
//         .setText(data.street);
//     }
//     if (data.unitNum) {
//       form.getTextField("txtp_unitNumber")
//         .setText(data.unitNum);
//     }
//     if (data.city) {
//       form.getTextField("txtp_city")
//         .setText(data.city);
//     }
//     if (data.state) {
//       form.getTextField("txtp_state")
//         .setText(data.state);
//     }
//     if (data.zipCode) {
//       form.getTextField("txtp_zipcode")
//         .setText(data.zipCode);
//     }
//     if (data.plan) {
//       form.getTextField("txtp_PageNumber")
//         .setText(data.plan);
//     }
//     if (data.block) {
//       form.getTextField("txtp_Block")
//         .setText(data.block);
//     }
//     if (data.lotUnit) {
//       form.getTextField("txtp_LotNumber")
//         .setText(data.lotUnit);
//     }
//     if (data.sellerSignDate) {
//       const [year, month, day] = data.sellerSignDate.split("-");
//       const yy = year.slice(-2);
//       form.getTextField("txtSellSignDate_m").setText(month);
//       form.getTextField("txtSellSignDate_d").setText(day);
//       form.getTextField("txtSellSignDate_yy").setText(yy);
//     }
//     if (data.sellerPrint1) {
//       form.getTextField("txtsellersig1")
//         .setText(data.sellerPrint1);
//     }
//     if (data.sellerPrint2) {
//       form.getTextField("txtsellersig2")
//         .setText(data.sellerPrint2);
//     }
//     if (data.witness1) {
//       form.getTextField("txtWitness1Sig")
//         .setText(data.witness1);
//     }
//     if (data.witness2) {
//       form.getTextField("txtWitness2Sig")
//         .setText(data.witness2);
//     }
//     if (data.brokerageSignDate) {
//       const [year, month, day] = data.brokerageSignDate.split("-");
//       const yy = year.slice(-2);
//       form.getTextField("txtBuySignDate_m").setText(month);
//       form.getTextField("txtBuySignDate_d").setText(day);
//       form.getTextField("txtBuySignDate_yy").setText(yy);
//     }

//     /* ===============================
//        FINALIZE PDF
//     =============================== */
//     form.updateFieldAppearances(font);
//     form.flatten();
//     const pdfBytes = await pdfDoc.save({
//       updateFieldAppearances: true
//     });

//     /* ===============================
//     🟡 ADMIN MODE → DIRECT PDF
//     =============================== */
//     if (isAdmin) {
//       return res
//         .status(200)
//         .set({
//           "Content-Type": "application/pdf",
//           "Content-Disposition": "attachment; filename=Buyer_Amendment.pdf"
//         })
//         .send(Buffer.from(pdfBytes));
//     }

//     /* ===============================
//         DOCUSIGN FLOW
//     =============================== */
//     const accessToken = await getAccessToken();
//     const isEmbedded = !sendEmail;
//     const embeddedSigners = [];
//     const emailSigners = [];
//     let recipientId = 1;
//     const baseEmail = party.email;
//     const [name, domain] = baseEmail.split("@");
//     const seller1Email = baseEmail;
//     const seller2Email = `${name}+seller2@${domain}`;
//     /* 🟢 BUYER 1 */
//     if (data.sellerPrint1) {
//       embeddedSigners.push({
//         email: seller1Email,
//         name: data.sellerPrint1,
//         recipientId: String(recipientId),
//         routingOrder: String(recipientId),
//         ...(isEmbedded && {
//           clientUserId: `${party._id}_seller1`
//         }),
//         tabs: {
//           signHereTabs: [{ anchorString: "/sign1/" }]
//         }
//       });
//       recipientId++;
//     }

//     /* 🔵 BUYER 2 */
//     if (data.sellerPrint2) {
//       embeddedSigners.push({
//         email: seller2Email,
//         name: data.sellerPrint2,
//         recipientId: String(recipientId),
//         routingOrder: String(recipientId),
//         ...(isEmbedded && {
//           clientUserId: `${party._id}_seller2`
//         }),
//         tabs: {
//           signHereTabs: [{ anchorString: "/sign3/" }]
//         }
//       });
//       recipientId++;
//     }

//     /* 🟣 REP (EMAIL ONLY) */
//     if (data.repPrintName && transactinuser?.email) {
//       emailSigners.push({
//         email: transactinuser.email,
//         name: data.repPrintName,
//         recipientId: String(recipientId),
//         routingOrder: String(recipientId),
//         tabs: {
//           signHereTabs: [{ anchorString: "/sign5/" }]
//         }
//       });
//       recipientId++;
//     }
//     const allSigners = [...embeddedSigners, ...emailSigners];
//     if (allSigners.length === 0) {
//       return res.status(400).json({ error: "No signers found" });
//     }

//     /* ===============================
//        CREATE ENVELOPE
//     =============================== */
//     const envelopeRes = await axios.post(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes`,
//       {
//         emailSubject: "Please sign Buyer Amendment document",
//         documents: [
//           {
//             documentBase64: Buffer.from(pdfBytes).toString("base64"),
//             name: "IDMMGOL.pdf",
//             fileExtension: "pdf",
//             documentId: "1"
//           }
//         ],
//         recipients: { signers: allSigners },
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
//        STORE SESSION (ONLY BUYERS)
//     =============================== */
//     global.signingSessions = global.signingSessions || {};
//     global.signingSessions[partyId] = {
//       envelopeId,
//       signers: embeddedSigners,
//       currentIndex: 0
//     };

//     /* ===============================
//        START SIGNING (BUYER 1)
//     =============================== */
//     let signingUrl = null;
//     if (isEmbedded && embeddedSigners.length > 0) {
//       const firstSigner = embeddedSigners[0];
//       const viewRes = await axios.post(
//         `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/views/recipient`,
//         {
//           // returnUrl: `${process.env.FRONTEND_URL}/sign-redirect?partyId=${partyId}&type=idmmgol`,
//           returnUrl: `http://localhost:5173/sign-redirect?partyId=${partyId}&type=idmmgol`,
//           authenticationMethod: "none",
//           email: firstSigner.email,
//           userName: firstSigner.name,
//           clientUserId: firstSigner.clientUserId
//         },
//         {
//           headers: {
//             Authorization: `Bearer ${accessToken}`,
//             "Content-Type": "application/json"
//           }
//         }
//       );

//       signingUrl = viewRes.data.url;
//     }

//     return res.json({
//       success: true,
//       envelopeId,
//       signingUrl
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Error generating IDMMGOL PDF");

//   }
// });