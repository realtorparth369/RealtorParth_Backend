import express from "express";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { PDFDocument, StandardFonts } from "pdf-lib";


import axios from "axios";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import Transaction from "../models/Transaction.js";
import ESRAA from "../models/ESRAAModel.js";
import TransactionParty from "../models/TransactionParty.js";
import TransactionUser from "../models/TransactionUser.js";
const router = express.Router();

// 👉 Put your blank ESRAA PDF here
const PDF_PATH = path.join(
    process.cwd(),
    "seller_pdfs/Exclusive Seller Representation Agreement Amendment.pdf"   // ⚠️ change if your file name is different
);

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
      subject: "Exclusive Seller Representation Agreement Amendment Document + Summary",
      text: "Attached are your fully signed document and audit summary from DocuSign.",
      attachments: [
        {
          filename: "ESRAA.pdf",
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
        /* ===============================
           VALIDATION
        =============================== */
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
          // const transactinuser = await TransactionUser.findById(party.userId);
          const transactionUser = await TransactionUser.findById(party.userId);
        /* ===============================
           SAVE / UPDATE (PER PARTY)
        =============================== */
        await ESRAA.findOneAndUpdate(
          { partyId },
          {
            ...data,
            partyId,
            transactionId: party.transactionId,

            // Reset signing flow whenever document is regenerated
            envelopeId: null,
            signers: [],
            completedEmailSent: false,

            seller1Signed: false,
            seller2Signed: false,
            witness1Signed: false,
            witness2Signed: false,
            brokerSigned: false,

            seller1SignedAt: null,
            seller2SignedAt: null,
            witness1SignedAt: null,
            witness2SignedAt: null,
            brokerSignedAt: null
          },
          {
            new: true,
            upsert: true
          }
        );

        // await ESRAA.findOneAndUpdate(
        //     { partyId }, // 🔥 MAIN FIX
        //     {
        //         ...data,
        //         partyId,
        //         transactionId: party.transactionId // ✅ optional (admin use)
        //     },
        //     {
        //         new: true,
        //         upsert: true
        //     }
        // );
        /* ===============================
           LOAD PDF
        =============================== */
        const existingPdfBytes = fs.readFileSync(PDF_PATH);
        const pdfDoc = await PDFDocument.load(existingPdfBytes, {
            ignoreEncryption: true
        });
        const form = pdfDoc.getForm();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        /* ===============================
           MAP PDF FIELDS (EDIT NAMES)
        =============================== */
        // Agreement
           if (data.agreementNumber) {
             form.getTextField("txtp_PlatBook_ABC")  // ⚠️ change if your field name is different
               .setText(data.agreementNumber);
           }
        if (data.brokerageName2) {
            form.getTextField("txtl_brkagentUnMapped")
                .setText(data.brokerageName2);
        }
        if (data.sellerName1) {
            form.getTextField("txtseller1")
                .setText(data.sellerName1);
        }
        if (data.sellerName2) {
            form.getTextField("txtseller2")
                .setText(data.sellerName2);
        }
        if (data.listingNumber) {
            form.getTextField("txtmlsnumber")
                .setText(data.listingNumber);
        }
        if (data.exclusiveselleragreement) {
            form.getTextField("txtp_PlatBook_ABC")
                .setText(data.exclusiveselleragreement);
        }
        if (data.unitNum) {
            form.getTextField("txtp_unitNumber")
                .setText(data.unitNum);
        }
        if (data.streetNum) {
            form.getTextField("txtp_streetnum")
                .setText(data.streetNum);
        }
        if (data.street) {
            form.getTextField("txtp_street")
                .setText(data.street);
        }
        if (data.city) {
            form.getTextField("txtp_city")
                .setText(data.city);
        }
        if (data.state) {
            form.getTextField("txtp_state")
                .setText(data.state);
        }
        if (data.zipcode) {
            form.getTextField("txtp_zipcode")
                .setText(data.zipcode);
        }
        if (data.effectiveDate) {
            const [year, month, day] = data.effectiveDate.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtEffecitveDate_m").setText(month);
            form.getTextField("txtEffecitveDate_d").setText(day);
            form.getTextField("txtEffecitveDate_yy").setText(yy);
        }
        if (data.effectiveTime) {
            form.getTextField("txtEffecitveTime")
                .setText(data.effectiveTime);
        }
        if (data.endDate) {
            const [year, month, day] = data.endDate.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtAmendDate_m").setText(month);
            form.getTextField("txtAmendDate_d").setText(day);
            form.getTextField("txtAmendDate_yy").setText(yy);
        }
        if (data.endTime) {
            form.getTextField("txtAmendTime")
                .setText(data.endTime);
        }
        if (data.price) {
            form.getTextField("txtAmendPrice")
                .setText(data.price);
        }
        if (data.otherAmendments) {
            form.getTextField("txtOtherAmendments")
                .setText(data.otherAmendments);
        }
        // Signatures
        if (data.sellerPrint1) {
            form.getTextField("txtsellersig1")
                .setText(data.sellerPrint1);
        }
        if (data.sellerPrint2) {
            form.getTextField("txtsellersig2")
                .setText(data.sellerPrint2);
        }
        if (data.witnessPrint1) {
            form.getTextField("txtWitness1Sig")
                .setText(data.witnessPrint1);
        }
        if (data.witnessPrint2) {
            form.getTextField("txtWitness2Sig")
                .setText(data.witnessPrint2);
        }
        /* ===============================
           FINALIZE PDF
        =============================== */
        form.updateFieldAppearances(font);
        form.flatten();
        const pdfBytes = await pdfDoc.save({
            updateFieldAppearances: true
        });
      return res.json({
          success: true,
          message: "Exclusive Seller Representation Agreement Amendment saved successfully."
      });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error generating ESRAA PDF");
    }
});

router.post("/send-esraa-for-signature", async (req, res) => {
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
       GET AGENT
    =============================== */

    const transactionUser = await TransactionUser.findById(
      party.userId
    );

    /* ===============================
       GET SAVED ESRAA
    =============================== */

    const data = await ESRAA.findOne({ partyId });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "ESRAA not found"
      });
    }

    /* ===============================
       GENERATE PDF
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

    if (data.agreementNumber) {
      form
        .getTextField("txtp_PlatBook_ABC")
        .setText(data.agreementNumber);
    }

    if (data.brokerageName2) {
      form
        .getTextField("txtl_brkagentUnMapped")
        .setText(data.brokerageName2);
    }

    if (data.sellerName1) {
      form
        .getTextField("txtseller1")
        .setText(data.sellerName1);
    }

    if (data.sellerName2) {
      form
        .getTextField("txtseller2")
        .setText(data.sellerName2);
    }

    if (data.listingNumber) {
      form
        .getTextField("txtmlsnumber")
        .setText(data.listingNumber);
    }

    if (data.exclusiveselleragreement) {
      form
        .getTextField("txtp_PlatBook_ABC")
        .setText(data.exclusiveselleragreement);
    }

    if (data.unitNum) {
      form
        .getTextField("txtp_unitNumber")
        .setText(data.unitNum);
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

    if (data.zipcode) {
      form
        .getTextField("txtp_zipcode")
        .setText(data.zipcode);
    }

    if (data.effectiveDate) {
      const [year, month, day] =
        data.effectiveDate.split("-");

      form
        .getTextField("txtEffecitveDate_m")
        .setText(month);

      form
        .getTextField("txtEffecitveDate_d")
        .setText(day);

      form
        .getTextField("txtEffecitveDate_yy")
        .setText(year.slice(-2));
    }

    if (data.effectiveTime) {
      form
        .getTextField("txtEffecitveTime")
        .setText(data.effectiveTime);
    }

    if (data.endDate) {
      const [year, month, day] =
        data.endDate.split("-");

      form
        .getTextField("txtAmendDate_m")
        .setText(month);

      form
        .getTextField("txtAmendDate_d")
        .setText(day);

      form
        .getTextField("txtAmendDate_yy")
        .setText(year.slice(-2));
    }

    if (data.endTime) {
      form
        .getTextField("txtAmendTime")
        .setText(data.endTime);
    }

    if (data.price) {
      form
        .getTextField("txtAmendPrice")
        .setText(data.price);
    }

    if (data.otherAmendments) {
      form
        .getTextField("txtOtherAmendments")
        .setText(data.otherAmendments);
    }

    /* ===============================
       SIGNATURE PRINT NAMES
    =============================== */

    if (data.sellerPrint1) {
      form
        .getTextField("txtsellersig1")
        .setText(data.sellerPrint1);
    }

    if (data.sellerName2) {
      form
        .getTextField("txtsellersig2")
        .setText(data.sellerName2);
    }

    if (data.witnessPrint1) {
      form
        .getTextField("txtWitness1Sig")
        .setText(data.witnessPrint1);
    }

    if (data.witnessPrint2) {
      form
        .getTextField("txtWitness2Sig")
        .setText(data.witnessPrint2);
    }

    if (data.repPrintName) {
      form
        .getTextField("txtl_brkagentsig")
        .setText(data.repPrintName);
    }

    form.updateFieldAppearances(font);

    form.flatten();

    const pdfBytes = await pdfDoc.save({
      updateFieldAppearances: true
    });

    /* ===============================
       DOCUSIGN TOKEN
    =============================== */

    const accessToken = await getAccessToken();

        /* ===============================
       BUILD SIGNERS (PARALLEL SIGNING)
    =============================== */

    const signers = [];

    /* SELLER 1 */
    if (data.sellerPrint1 && data.sellerSignatureEmail1) {
      signers.push({
        email: data.sellerSignatureEmail1,
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
              anchorString: "/date_md/",
              dateFormat: "MMMM d"
            }
          ]
        }
      });
    }

    /* SELLER 2 */
    if (data.sellerName2 && data.sellerSignatureEmail2) {
      signers.push({
        email: data.sellerSignatureEmail2,
        name: data.sellerName2,
        recipientId: "2",
        routingOrder: "1",
        clientUserId: `${partyId}_seller2`,
        tabs: {
          signHereTabs: [
            {
              anchorString: "/sign2/"
            }
          ]
        }
      });
    }

    /* WITNESS 1 */
    if (data.witnessPrint1 && data.witnessEmail1) {
      signers.push({
        email: data.witnessEmail1,
        name: data.witnessPrint1,
        recipientId: "3",
        routingOrder: "1",
        clientUserId: `${partyId}_witness1`,
        tabs: {
          signHereTabs: [
            {
              anchorString: "/sign3/"
            }
          ]
        }
      });
    }

    /* WITNESS 2 */
    if (data.witnessPrint2 && data.witnessEmail2) {
      signers.push({
        email: data.witnessEmail2,
        name: data.witnessPrint2,
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

    /* BROKER / AGENT */
    if (data.repPrintName && data.brokerEmail) {
      signers.push({
        email: data.brokerEmail,
        name: data.repPrintName,
        recipientId: "5",
        routingOrder: "1",
        clientUserId: `${partyId}_broker`,
        tabs: {
          signHereTabs: [
            {
              anchorString: "/sign5/"
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

    console.log("ESRAA Signers:", signers);

        /* ===============================
       CREATE ENVELOPE
    =============================== */

    const envelopePayload = {
      emailSubject:
        "Please sign the Exclusive Seller Representation Agreement Amendment",
      documents: [
        {
          documentBase64: Buffer.from(pdfBytes).toString("base64"),
          name: "Exclusive Seller Representation Agreement Amendment.pdf",
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

    await ESRAA.findOneAndUpdate(
      { partyId },
      {
        envelopeId,
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
       SEND EMAIL TO EVERY SIGNER
    =============================== */

    for (const signer of signers) {

      // const signingLink = `https://realtorparth.ca/api/esraa/start-sign/${partyId}?recipientId=${signer.recipientId}`;
      const signingLink = `https://realtorparth.ca/api/esraa/start-sign/${partyId}/${signer.recipientId}`;

      await transporter.sendMail({
        from: `"RealtorParth" <hello@realtorparth.ca>`,
        to: signer.email,
        subject:
          "Exclusive Seller Representation Agreement Amendment Ready For Signature",

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

<h2 style="margin-top:0;color:#222;">
Hello ${signer.name},
</h2>

<p style="font-size:16px;color:#555;line-height:28px;">
Your
<strong>Exclusive Seller Representation Agreement Amendment</strong>
is ready for your electronic signature.
</p>

<p style="font-size:16px;color:#555;line-height:28px;">
Please click the button below to review and sign the document.
</p>

<table width="100%" cellpadding="0" cellspacing="0" style="margin:35px 0;">
<tr>
<td align="center">

<a
href="${signingLink}"
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
Sign Document
</a>

</td>
</tr>
</table>

<div style="background:#f8f9fb;border-left:4px solid #0f4c81;padding:18px;border-radius:6px;">

<p style="margin:0;color:#555;font-size:15px;">
If the button above does not work, use the following link:
</p>

<p style="margin-top:12px;word-break:break-all;">
<a href="${signingLink}" style="color:#0f4c81;">
${signingLink}
</a>
</p>

</div>

<p style="margin-top:35px;font-size:16px;">
Kind Regards,<br>
<strong>RealtorParth Team</strong>
</p>

</td>
</tr>

<tr>
<td style="background:#f7f7f7;padding:22px;text-align:center;color:#777;font-size:13px;">
This is an automated email from RealtorParth.
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
      message: "Signature emails sent successfully."
    });

  } catch (error) {

    console.error(
      "ESRAA DOCUSIGN ERROR:",
      error.response?.data || error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to send ESRAA for signature."
    });

  }
});


// router.get("/start-sign/:partyId", async (req, res) => {
router.get("/start-sign/:partyId/:recipientId", async (req, res) => {
  try {
    const { partyId, recipientId } = req.params;
    // const { recipientId } = req.query;

    const esraa = await ESRAA.findOne({ partyId });

    if (!esraa) {
      return res.status(404).send("ESRAA not found.");
    }

    if (!esraa.envelopeId) {
      return res.status(400).send("Envelope not created yet.");
    }

    if (!esraa.signers || esraa.signers.length === 0) {
      return res.status(400).send("No signers found.");
    }

    /* ===============================
       GET REQUESTED SIGNER
    =============================== */

    const signer =
      esraa.signers.find(
        (s) => s.recipientId === String(recipientId)
      ) || esraa.signers[0];

    if (!signer) {
      return res.status(404).send("Signer not found.");
    }

    const accessToken = await getAccessToken();

    /* ===============================
       CREATE RECIPIENT VIEW
    =============================== */

    const viewRes = await axios.post(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${esraa.envelopeId}/views/recipient`,
      {
        authenticationMethod: "none",

        email: signer.email,
        userName: signer.name,
        clientUserId: signer.clientUserId,

        returnUrl: `https://realtorparth.ca/api/esraa/sign-complete/${partyId}?recipientId=${signer.recipientId}`
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


router.get("/sign-complete/:partyId", async (req, res) => {
  try {

    const { partyId } = req.params;
    const { recipientId } = req.query;

    console.log("========== ESRAA SIGN COMPLETE ==========");
    console.log("Party ID:", partyId);
    console.log("Recipient:", recipientId);

    /* ===============================
       GET ESRAA
    =============================== */

    const esraa = await ESRAA.findOne({ partyId });

    if (!esraa) {
      return res.status(404).send("ESRAA not found.");
    }

    /* ===============================
       UPDATE SIGNING STATUS
    =============================== */

    switch (String(recipientId)) {

      case "1":
        esraa.seller1Signed = true;
        esraa.seller1SignedAt = new Date();
        break;

      case "2":
        esraa.seller2Signed = true;
        esraa.seller2SignedAt = new Date();
        break;

      case "3":
        esraa.witness1Signed = true;
        esraa.witness1SignedAt = new Date();
        break;

      case "4":
        esraa.witness2Signed = true;
        esraa.witness2SignedAt = new Date();
        break;

      case "5":
        esraa.brokerSigned = true;
        esraa.brokerSignedAt = new Date();
        break;
    }

    /* ===============================
       PREVENT DUPLICATE FINAL EMAIL
    =============================== */

    if (esraa.completedEmailSent) {

      await esraa.save();

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

    const transactionUser = await TransactionUser.findById(
      party.userId
    );

    if (!transactionUser) {
      return res.status(404).send("Transaction User not found.");
    }

    /* ===============================
       CHECK IF EVERYONE HAS SIGNED
    =============================== */

    const allSigned =
      (!esraa.sellerPrint1 || esraa.seller1Signed) &&
      (!esraa.sellerPrint2 || esraa.seller2Signed) &&
      (!esraa.witnessPrint1 || esraa.witness1Signed) &&
      (!esraa.witnessPrint2 || esraa.witness2Signed) &&
      (!esraa.repPrintName || esraa.brokerSigned);

    if (!allSigned) {

      await esraa.save();

      return res.redirect(
        "https://realtorparth.ca/signature-complete"
      );
    }

    console.log("All ESRAA signers completed.");

        /* ===============================
       SEND FINAL NOTIFICATION
    =============================== */

    const notifyEmails = [
      transactionUser.email,
      esraa.witnessEmail1,
      esraa.witnessEmail2
    ].filter(Boolean);

    await transporter.sendMail({
      from: `"RealtorParth" <hello@realtorparth.ca>`,
      to: notifyEmails.join(","),
      subject:
        "Exclusive Seller Representation Agreement Amendment Fully Signed",

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
Document Signing Completed
</h2>

<p style="font-size:16px;color:#555;line-height:28px;">
All required parties have successfully completed signing the
<strong>Exclusive Seller Representation Agreement Amendment</strong>.
</p>

<table
width="100%"
cellpadding="10"
cellspacing="0"
style="margin:30px 0;border-collapse:collapse;border:1px solid #e5e7eb;">

<tr style="background:#f8fafc;">
<td style="font-weight:600;width:180px;">Primary Seller</td>
<td>${esraa.sellerPrint1 || "-"}</td>
</tr>

<tr>
<td style="font-weight:600;">Second Seller</td>
<td>${esraa.sellerPrint2 || "-"}</td>
</tr>

<tr style="background:#f8fafc;">
<td style="font-weight:600;">Broker</td>
<td>${esraa.repPrintName || "-"}</td>
</tr>

<tr>
<td style="font-weight:600;">Completed</td>
<td>
${new Date().toLocaleString("en-CA", {
  dateStyle: "long",
  timeStyle: "short"
})}
</td>
</tr>

</table>

<div style="background:#f8f9fb;border-left:4px solid #16a34a;padding:18px;border-radius:6px;">
<p style="margin:0;font-size:15px;color:#555;line-height:24px;">
This is an automated notification confirming that every required signer has completed the signing process.
</p>
</div>

<p style="margin-top:35px;font-size:16px;color:#222;">
Kind Regards,<br>
<strong>RealtorParth Team</strong>
</p>

</td>
</tr>

<tr>
<td style="background:#f7f7f7;padding:22px;text-align:center;color:#777;font-size:13px;">
This is an automated notification from RealtorParth.<br>
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

    console.log("Final notification sent.");

    /* ===============================
       MARK COMPLETED
    =============================== */

    esraa.completedEmailSent = true;

    await esraa.save();

    console.log("completedEmailSent updated");

    return res.redirect(
      "https://realtorparth.ca/signature-complete"
    );

  } catch (err) {

    console.error("========== ESRAA SIGN COMPLETE ERROR ==========");
    console.error(err.response?.data || err);

    return res.redirect(
      "https://realtorparth.ca/signature-complete"
    );

  }
});






// router.post("/send-esraa-for-signature", async (req, res) => {
//   try {
//     const { partyId } = req.body;
//     if (!partyId) {
//       return res.status(400).json({
//         success: false,
//         message: "partyId required"
//       });
//     }
//     const party = await TransactionParty.findById(partyId);
//     if (!party) {
//       return res.status(404).json({
//         success: false,
//         message: "Party not found"
//       });
//     }
//     const transactionUser = await TransactionUser.findById(party.userId);
//     const data = await ESRAA.findOne({ partyId });
//     if (!data) {
//       return res.status(404).json({
//         success: false,
//         message: "ESRAA not found"
//       });
//     }
//     /* ===============================
//        GENERATE PDF
//     =============================== */
//     const existingPdfBytes = fs.readFileSync(PDF_PATH);
//     const pdfDoc = await PDFDocument.load(existingPdfBytes, {
//       ignoreEncryption: true
//     });
//     const form = pdfDoc.getForm();
//     const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
//     /* =====================================================
//        PASTE YOUR ENTIRE PDF MAPPING HERE
//        Replace every data.xxx with Mongo values
//     ===================================================== */
//             // Agreement
//            if (data.agreementNumber) {
//              form.getTextField("txtp_PlatBook_ABC")  // ⚠️ change if your field name is different
//                .setText(data.agreementNumber);
//            }
//         if (data.brokerageName2) {
//             form.getTextField("txtl_brkagentUnMapped")
//                 .setText(data.brokerageName2);
//         }
//         // Seller
//         if (data.sellerName1) {
//             form.getTextField("txtseller1")
//                 .setText(data.sellerName1);
//         }
//         if (data.sellerName2) {
//             form.getTextField("txtseller2")
//                 .setText(data.sellerName2);
//         }
//         // Listing
//         if (data.listingNumber) {
//             form.getTextField("txtmlsnumber")
//                 .setText(data.listingNumber);
//         }
//         if (data.exclusiveselleragreement) {
//             form.getTextField("txtp_PlatBook_ABC")
//                 .setText(data.exclusiveselleragreement);
//         }
//         if (data.unitNum) {
//             form.getTextField("txtp_unitNumber")
//                 .setText(data.unitNum);
//         }
//         if (data.streetNum) {
//             form.getTextField("txtp_streetnum")
//                 .setText(data.streetNum);
//         }
//         if (data.street) {
//             form.getTextField("txtp_street")
//                 .setText(data.street);
//         }
//         if (data.city) {
//             form.getTextField("txtp_city")
//                 .setText(data.city);
//         }
//         if (data.state) {
//             form.getTextField("txtp_state")
//                 .setText(data.state);
//         }
//         if (data.zipcode) {
//             form.getTextField("txtp_zipcode")
//                 .setText(data.zipcode);
//         }
//         if (data.effectiveDate) {
//             const [year, month, day] = data.effectiveDate.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtEffecitveDate_m").setText(month);
//             form.getTextField("txtEffecitveDate_d").setText(day);
//             form.getTextField("txtEffecitveDate_yy").setText(yy);
//         }
//         if (data.effectiveTime) {
//             form.getTextField("txtEffecitveTime")
//                 .setText(data.effectiveTime);
//         }
//         if (data.endDate) {
//             const [year, month, day] = data.endDate.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtAmendDate_m").setText(month);
//             form.getTextField("txtAmendDate_d").setText(day);
//             form.getTextField("txtAmendDate_yy").setText(yy);
//         }
//         if (data.endTime) {
//             form.getTextField("txtAmendTime")
//                 .setText(data.endTime);
//         }
//         // Price
//         if (data.price) {
//             form.getTextField("txtAmendPrice")
//                 .setText(data.price);
//         }
//         // Other Amendments
//         if (data.otherAmendments) {
//             form.getTextField("txtOtherAmendments")
//                 .setText(data.otherAmendments);
//         }
//         // Signatures
//         if (data.sellerPrint1) {
//             form.getTextField("txtsellersig1")
//                 .setText(data.sellerPrint1);
//         }
//         if (data.sellerPrint2) {
//             form.getTextField("txtsellersig2")
//                 .setText(data.sellerPrint2);
//         }
//         if (data.witnessPrint1) {
//             form.getTextField("txtWitness1Sig")
//                 .setText(data.witnessPrint1);
//         }
//         if (data.witnessPrint2) {
//             form.getTextField("txtWitness2Sig")
//                 .setText(data.witnessPrint2);
//         }
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
//               anchorString: "/date_md/",
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
//               anchorString: "/sign2/"
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
//     console.log("ESRAA Signers:", signers);
//         /* ===============================
//        CREATE ENVELOPE
//     =============================== */
//     const envelopePayload = {
//       emailSubject: "Please sign the Exclusive Seller Representation Agreement Amendment",
//       documents: [
//         {
//           documentBase64: Buffer.from(pdfBytes).toString("base64"),
//           name: "ESRAA.pdf",
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
//     await ESRAA.findOneAndUpdate(
//       { partyId },
//       {
//         envelopeId,
//         signers: signers.map((s) => ({
//           recipientId: s.recipientId,
//           clientUserId: s.clientUserId || null,
//           email: s.email,
//           name: s.name,
//           routingOrder: s.routingOrder
//         }))
//       }
//     );
//         const signingLink = `https://realtorparth.ca/api/esraa/start-sign/${partyId}`;
//     await transporter.sendMail({
//       from: `"RealtorParth" <hello@realtorparth.ca>`,
//       to: party.email,
//       subject:
//         "Exclusive Seller Representation Agreement Amendment Ready For Signature",

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
// Your <strong>Exclusive Seller Representation Agreement Amendment</strong> has been prepared and is ready for your electronic signature.
// </p>

// <p style="font-size:16px;color:#555;line-height:28px;">
// Please review the document carefully before signing.
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
// Sign Exclusive Seller Representation Agreement Amendment
// </a>

// </td>
// </tr>
// </table>

// <div style="background:#f8f9fb;border-left:4px solid #0f4c81;padding:18px;border-radius:6px;">
// <p style="margin:0;color:#555;font-size:15px;line-height:24px;">
// If the button above does not work, use the following link:
// </p>

// <p style="margin-top:12px;word-break:break-all;">
// <a href="${signingLink}" style="color:#0f4c81;">
// ${signingLink}
// </a>
// </p>
// </div>

// <p style="margin-top:35px;font-size:16px;color:#222;">
// Kind Regards,<br>
// <strong>RealtorParth Team</strong>
// </p>

// </td>
// </tr>

// <tr>
// <td style="background:#f7f7f7;padding:22px;text-align:center;color:#777;font-size:13px;">
// This is an automated email from RealtorParth.
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

//         return res.json({
//       success: true,
//       message: "Email sent successfully."
//     });
//   } catch (error) {
//     console.error(
//       "ESRAA DOCUSIGN ERROR:",
//       error.response?.data || error
//     );
//     res.status(500).json({
//       success: false,
//       message: "Failed to send ESRAA for signature."
//     });
//   }
// });

// router.get("/start-sign/:partyId", async (req, res) => {
//   try {
//     const { partyId } = req.params;

//     const esraa = await ESRAA.findOne({ partyId });

//     if (!esraa) {
//       return res.status(404).send("ESRAA not found.");
//     }

//     if (!esraa.envelopeId) {
//       return res.status(400).send("Envelope not created yet.");
//     }

//     if (!esraa.signers || esraa.signers.length === 0) {
//       return res.status(400).send("No signers found.");
//     }

//     /* ===============================
//        FIRST SIGNER (SELLER 1)
//     =============================== */

//     const signer =
//       esraa.signers.find(
//         (s) => s.recipientId === "1"
//       ) || esraa.signers[0];

//     const accessToken = await getAccessToken();

//     /* ===============================
//        CREATE RECIPIENT VIEW
//     =============================== */

//     const viewRes = await axios.post(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${esraa.envelopeId}/views/recipient`,
//       {
//         authenticationMethod: "none",

//         email: signer.email,
//         userName: signer.name,

//         clientUserId: signer.clientUserId,

//         returnUrl: `https://realtorparth.ca/api/esraa/sign-complete/${partyId}`
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

//     console.log("========== ESRAA SIGN COMPLETE ==========");
//     console.log("Party ID:", partyId);

//     /* ===============================
//        GET ESRAA
//     =============================== */

//     const esraa = await ESRAA.findOne({ partyId });

//     if (!esraa) {
//       return res.status(404).send("ESRAA not found.");
//     }

//     /* ===============================
//        PREVENT DUPLICATE EMAILS
//     =============================== */

//     if (esraa.completedEmailSent) {
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
//       subject:
//         "Exclusive Seller Representation Agreement Amendment Signed",

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
// Seller Signature Completed
// </h2>

// <p style="font-size:16px;color:#555;line-height:28px;">
// The client has successfully completed their electronic signature for the
// <strong>Exclusive Seller Representation Agreement Amendment</strong>.
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
// <td style="color:#555;">
// Exclusive Seller Representation Agreement Amendment
// </td>
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
//   dateStyle: "long",
//   timeStyle: "short"
// })}
// </td>
// </tr>

// </table>

// <div style="background:#f8f9fb;border-left:4px solid #16a34a;padding:18px;border-radius:6px;">
// <p style="margin:0;font-size:15px;color:#555;line-height:24px;">
// This is an automated notification confirming that the client has completed
// their portion of the signing process.
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

//     esraa.completedEmailSent = true;
//     await esraa.save();

//     console.log("completedEmailSent updated");

//     return res.redirect(
//       "https://realtorparth.ca/signature-complete"
//     );

//   } catch (err) {

//     console.error("========== ESRAA SIGN COMPLETE ERROR ==========");
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
        // returnUrl: `${process.env.FRONTEND_URL}/sign-redirect?partyId=${partyId}&type=esraa`,
        returnUrl: `http://localhost:5173/sign-redirect?partyId=${partyId}&type=esraa`,
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
       🔍 GET RECIPIENTS
    =============================== */
    const recipientsRes = await axios.get(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/recipients`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const allSigners = recipientsRes.data.signers;

    /* ===============================
       👤 PARTY FLOW
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

      console.log("✅ Party completed (ESRAA)");

      const docRes = await axios.get(
        `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/combined`,
        {
          responseType: "arraybuffer",
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=Party-Signed-ESRAA.pdf"
      });

      return res.send(docRes.data);
    }

    /* ===============================
       👨‍💼 FINAL FLOW
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

    console.log("✅ Final completed (ESRAA)");

    /* DOWNLOAD FINAL */
    const signedDoc = await axios.get(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/combined`,
      {
        responseType: "arraybuffer",
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const signedPdfBuffer = Buffer.from(signedDoc.data);

    /* SUMMARY */
    const summaryPdfBuffer = await generateSummaryPdf(partyId);

    /* EMAIL */
    await sendSignedPdfEmail(
      transactionUserEmail,
      signedPdfBuffer,
      summaryPdfBuffer
    );

    console.log("📧 Email sent (ESRAA):", transactionUserEmail);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=Final-ESRAA.pdf"
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

    const data = await ESRAA.findOne({
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

//     try {

//         const { partyId, sendEmail = false, isAdmin = false, ...data } = req.body;

//         // ❗ prevent duplicate _id issue
//         delete data._id;

//         /* ===============================
//            VALIDATION
//         =============================== */

//         if (!partyId) {
//             return res.status(400).json({
//                 success: false,
//                 message: "partyId is required"
//             });
//         }

//         /* ===============================
//            VERIFY PARTY EXISTS
//         =============================== */

//         const party = await TransactionParty.findById(partyId);

//         if (!party) {
//             return res.json({
//                 success: false,
//                 message: "Invalid party"
//             });
//         }
//           const transactinuser = await TransactionUser.findById(party.userId);

//         /* ===============================
//            SAVE / UPDATE (PER PARTY)
//         =============================== */

//         await ESRAA.findOneAndUpdate(
//             { partyId }, // 🔥 MAIN FIX
//             {
//                 ...data,
//                 partyId,
//                 transactionId: party.transactionId // ✅ optional (admin use)
//             },
//             {
//                 new: true,
//                 upsert: true
//             }
//         );

//         // 👉 continue your PDF generation logic here...


//         /* ===============================
//            LOAD PDF
//         =============================== */

//         const existingPdfBytes = fs.readFileSync(PDF_PATH);

//         const pdfDoc = await PDFDocument.load(existingPdfBytes, {
//             ignoreEncryption: true
//         });

//         const form = pdfDoc.getForm();

//         const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

//         /* ===============================
//            MAP PDF FIELDS (EDIT NAMES)
//         =============================== */

//         // Agreement
//            if (data.agreementNumber) {
//              form.getTextField("txtp_PlatBook_ABC")  // ⚠️ change if your field name is different
//                .setText(data.agreementNumber);
//            }

//         // Brokerage
//         //    if (data.brokerageName1) {
//         //      form.getTextField("brokerageName1")
//         //        .setText(data.brokerageName1);
//         //    }

//         if (data.brokerageName2) {
//             form.getTextField("txtl_brkagentUnMapped")
//                 .setText(data.brokerageName2);
//         }

//         // Seller
//         if (data.sellerName1) {
//             form.getTextField("txtseller1")
//                 .setText(data.sellerName1);
//         }

//         if (data.sellerName2) {
//             form.getTextField("txtseller2")
//                 .setText(data.sellerName2);
//         }

//         // Listing
//         if (data.listingNumber) {
//             form.getTextField("txtmlsnumber")
//                 .setText(data.listingNumber);
//         }

//         if (data.exclusiveselleragreement) {
//             form.getTextField("txtp_PlatBook_ABC")
//                 .setText(data.exclusiveselleragreement);
//         }

//         // Property Address
//         //    const fullAddress = `${data.unitNum || ""} ${data.streetNum || ""} ${data.street || ""}, ${data.city || ""}, ${data.state || ""} ${data.zipcode || ""}`;

//         if (data.unitNum) {
//             form.getTextField("txtp_unitNumber")
//                 .setText(data.unitNum);
//         }
//         if (data.streetNum) {
//             form.getTextField("txtp_streetnum")
//                 .setText(data.streetNum);
//         }
//         if (data.street) {
//             form.getTextField("txtp_street")
//                 .setText(data.street);
//         }
//         if (data.city) {
//             form.getTextField("txtp_city")
//                 .setText(data.city);
//         }
//         if (data.state) {
//             form.getTextField("txtp_state")
//                 .setText(data.state);
//         }
//         if (data.zipcode) {
//             form.getTextField("txtp_zipcode")
//                 .setText(data.zipcode);
//         }







//         // Dates & Time
//         //    if (data.effectiveDate) {
//         //      form.getTextField("effectiveDate")
//         //        .setText(data.effectiveDate);
//         //    }

//         if (data.effectiveDate) {
//             const [year, month, day] = data.effectiveDate.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtEffecitveDate_m").setText(month);
//             form.getTextField("txtEffecitveDate_d").setText(day);
//             form.getTextField("txtEffecitveDate_yy").setText(yy);
//         }

//         if (data.effectiveTime) {
//             form.getTextField("txtEffecitveTime")
//                 .setText(data.effectiveTime);
//         }

//         //    if (data.endDate) {
//         //      form.getTextField("endDate")
//         //        .setText(data.endDate);
//         //    }

//         if (data.endDate) {
//             const [year, month, day] = data.endDate.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtAmendDate_m").setText(month);
//             form.getTextField("txtAmendDate_d").setText(day);
//             form.getTextField("txtAmendDate_yy").setText(yy);
//         }



//         if (data.endTime) {
//             form.getTextField("txtAmendTime")
//                 .setText(data.endTime);
//         }

//         // Price
//         if (data.price) {
//             form.getTextField("txtAmendPrice")
//                 .setText(data.price);
//         }

//         // Other Amendments
//         if (data.otherAmendments) {
//             form.getTextField("txtOtherAmendments")
//                 .setText(data.otherAmendments);
//         }

//         // Signed Date
//         //    if (data.signedDate) {
//         //      form.getTextField("signedDate")
//         //        .setText(data.signedDate);
//         //    }


//         if (data.signedDate) {
//             const [year, month, day] = data.signedDate.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtSignedDate_m").setText(month);
//             form.getTextField("txtSignedDate_d").setText(day);
//             form.getTextField("txtSignedDate_yy").setText(yy);
//         }



//         // Signatures
//         if (data.sellerPrint1) {
//             form.getTextField("txtsellersig1")
//                 .setText(data.sellerPrint1);
//         }

//         if (data.sellerPrint2) {
//             form.getTextField("txtsellersig2")
//                 .setText(data.sellerPrint2);
//         }

//         if (data.witnessPrint1) {
//             form.getTextField("txtWitness1Sig")
//                 .setText(data.witnessPrint1);
//         }

//         if (data.witnessPrint2) {
//             form.getTextField("txtWitness2Sig")
//                 .setText(data.witnessPrint2);
//         }

//         //    if (data.repPrintName) {
//         //      form.getTextField("repPrintName")
//         //        .setText(data.repPrintName);
//         //    }

//         /* ===============================
//            FINALIZE PDF
//         =============================== */

//         form.updateFieldAppearances(font);
//         form.flatten();

//         const pdfBytes = await pdfDoc.save({
//             updateFieldAppearances: true
//         });

        

//     /* ===============================
// 🟡 ADMIN MODE → DIRECT PDF
// =============================== */
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
//       DOCUSIGN FLOW
//    =============================== */

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
//           signHereTabs: [{ anchorString: "/sign2/" }]
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
//             name: "ESRAA.pdf",
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
//           // returnUrl: `${process.env.FRONTEND_URL}/sign-redirect?partyId=${partyId}&type=esraa`,
//           returnUrl: `http://localhost:5173/sign-redirect?partyId=${partyId}&type=esraa`,
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

//         // res.setHeader("Content-Type", "application/pdf");
//         // res.setHeader(
//         //     "Content-Disposition",
//         //     "attachment; filename=ESRAA_Filled.pdf"
//         // );

//         // res.send(Buffer.from(pdfBytes));

//     } catch (error) {

//         console.error(error);
//         res.status(500).send("Error generating ESRAA PDF");

//     }

// });
