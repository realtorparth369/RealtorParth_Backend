import express from "express";
import fs from "fs";
import path from "path";


import axios from "axios";
import jwt from "jsonwebtoken";

import mongoose from "mongoose";
import { PDFDocument, StandardFonts } from "pdf-lib";

import Transaction from "../models/Transaction.js";
import SCSAAFA from "../models/SCSAAFAModel.js";
import TransactionParty from "../models/TransactionParty.js";
import TransactionUser from "../models/TransactionUser.js";

import nodemailer from "nodemailer";

const router = express.Router();

/* ===============================
   PDF PATH
================================ */
const PDF_PATH = path.join(
  process.cwd(),
  "seller_pdfs/Seller Customer Status Acknowledgment and Fee Agreement.pdf"
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


// ✅ KEEP THIS OUTSIDE (top of file OR separate file)
const sendSignedPdfEmail = async (toEmail, pdfBuffer, certBuffer) => {
  try {
    if (!toEmail) {
      console.warn("⚠️ No email provided");
      return;
    }

    if (!pdfBuffer || !certBuffer) {
      console.warn("⚠️ Missing PDF or certificate buffer");
      return;
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.BREVO_USER,
        pass: process.env.BREVO_PASS,
      }
    });

    const info = await transporter.sendMail({
      from: `"RealtorParth" <hello@realtorparth.ca>`,
      to: toEmail,
      subject: "Seller Customer Acknowledgment and Fee Agreement Document + Summary",
      text: "Attached are your fully signed document and audit summary from DocuSign.",
      attachments: [
        {
          filename: "Signed.pdf",
          content: pdfBuffer,
          contentType: "application/pdf"
        },
        {
          filename: "Summary.pdf",
          content: certBuffer,
          contentType: "application/pdf"
        }
      ]
    });

    console.log("✅ Email sent:", info.messageId);

  } catch (error) {
    console.error("❌ Email error:", error?.response || error.message || error);
  }
};






router.post("/generate-pdf", async (req, res) => {
  try {
    const { partyId, sendEmail = false, isAdmin = false, ...data } = req.body;
    console.log("Received data:", req.body);
    // ❗ prevent duplicate _id issue
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
    const transactinuser = await TransactionUser.findById(party.userId);

    /* ===============================
       SAVE / UPDATE (PER PARTY)
    =============================== */

    await SCSAAFA.findOneAndUpdate(
      { partyId },
      {
        ...data,

        partyId,
        transactionId: party.transactionId,

        // Reset DocuSign information
        envelopeId: null,
        signers: [],
        completedEmailSent: false,

        // Reset signing status
        seller1Signed: false,
        seller2Signed: false,
        witness1Signed: false,
        witness2Signed: false,
        brokerSigned: false,
        spouseSigned: false,
        spouseWitnessSigned: false,

        // Reset signed timestamps
        seller1SignedAt: null,
        seller2SignedAt: null,
        witness1SignedAt: null,
        witness2SignedAt: null,
        brokerSignedAt: null,
        spouseSignedAt: null,
        spouseWitnessSignedAt: null
      },
      {
        new: true,
        upsert: true
      }
    );

    // await SCSAAFA.findOneAndUpdate(
    //   { partyId }, // 🔥 MAIN FIX
    //   {
    //     ...data,
    //     partyId,
    //     transactionId: party.transactionId // ✅ optional (admin side)
    //   },
    //   {
    //     new: true,
    //     upsert: true
    //   }
    // );

    // 👉 continue your PDF logic here...

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
       MAP FIELDS (IMPORTANT)
       ⚠️ Replace with your actual PDF field names
    =============================== */

    // HEADER
    if (data.agreementNumber)
      form.getTextField("txtAgreeNum")?.setText(data.agreementNumber);

    if (data.brokerageName1)
      form.getTextField("txts_broker")?.setText(data.brokerageName1);

    if (data.brokerageName2)
      form.getTextField("txtBroker2")?.setText(data.brokerageName2);


    // SELLER
    if (data.sellerName1)
      form.getTextField("txtseller1")?.setText(data.sellerName1);

    if (data.sellerName2)
      form.getTextField("txtseller2")?.setText(data.sellerName2);

    // PROPERTY
    if (data.propertyUnitNumber)
      form.getTextField("txtp_unitNumber")?.setText(data.propertyUnitNumber);

    if (data.streetNumber)
      form.getTextField("txtp_streetnum")?.setText(data.streetNumber);

    if (data.street)
      form.getTextField("txtp_street")?.setText(data.street);

    if (data.city)
      form.getTextField("txtp_city")?.setText(data.city);

    if (data.state)
      form.getTextField("txtp_state")?.setText(data.state);

    if (data.zipcode)
      form.getTextField("txtp_zipcode")?.setText(data.zipcode);



    if (data.plan)
      form.getTextField("txtp_PageNumber")?.setText(data.plan);

    if (data.block)
      form.getTextField("txtp_Block")?.setText(data.block);

    if (data.lot)
      form.getTextField("txtp_LotNumber")?.setText(data.lot);

    if (data.condoPlan)
      form.getTextField("txtCondoPlan")?.setText(data.condoPlan);

    if (data.unitNumber)
      form.getTextField("txtCondoUnit")?.setText(data.unitNumber);

    if (data.meridian)
      form.getTextField("txtp_Meridian")?.setText(data.meridian);

    if (data.range)
      form.getTextField("txtp_Range")?.setText(data.range);

    if (data.township)
      form.getTextField("txtp_township")?.setText(data.township);

    if (data.section)
      form.getTextField("txtp_section")?.setText(data.section);



    // FEE
    if (data.feeAmount)
      form.getTextField("txtTheFee")?.setText(data.feeAmount);

    if (data.feeDays1)
      form.getTextField("txtFeeDays1")?.setText(data.feeDays1);

    if (data.feeDays2)
      form.getTextField("txtFeeDays2")?.setText(data.feeDays2);


    // DOWER (radio example)
    if (data.married) {
      try {
        const radioField = form.getRadioGroup("radio_group_29ayds");

        if (data.married === "yes") {
          radioField.select("yes");
        }

        if (data.married === "no") {
          radioField.select("no");
        }

      } catch (err) {
        console.log("Third party radio group not found");
      }
    }

    if (data.resided) {
      try {
        const radioField = form.getRadioGroup("radio_group_31zdoj");

        if (data.resided === "yes") {
          radioField.select("yes");
        }

        if (data.resided === "no") {
          radioField.select("no");
        }

      } catch (err) {
        console.log("Third party radio group not found");
      }
    }

    // SIGNATURE
    if (data.seller1Name)
      form.getTextField("txtseller1")?.setText(data.seller1Name);

    if (data.seller1Streetnum)
      form.getTextField("txtS_streetnum")?.setText(data.seller1Streetnum);

    if (data.seller1Street)
      form.getTextField("txtS_street")?.setText(data.seller1Street);

    if (data.seller1City)
      form.getTextField("txtS_city")?.setText(data.seller1City);

    if (data.seller1State)
      form.getTextField("txtS_state")?.setText(data.seller1State);

    if (data.seller1Zipcode)
      form.getTextField("txtS_zipcode")?.setText(data.seller1Zipcode);

    if (data.seller1Phone)
      form.getTextField("txtS_phone1")?.setText(data.seller1Phone);

    if (data.seller1Fax)
      form.getTextField("txtS_fax")?.setText(data.seller1Fax);

    if (data.seller1Email)
      form.getTextField("txtS_email")?.setText(data.seller1Email);

    if (data.seller2Name)
      form.getTextField("txtseller2")?.setText(data.seller2Name);

    if (data.seller2Streetnum)
      form.getTextField("txtS2_streetnum")?.setText(data.seller2Streetnum);

    if (data.seller2Street)
      form.getTextField("txtS2_street")?.setText(data.seller2Street);

    if (data.seller2City)
      form.getTextField("txtS2_city")?.setText(data.seller2City);

    if (data.seller2State)
      form.getTextField("txtS2_state")?.setText(data.seller2State);

    if (data.seller2Zipcode)
      form.getTextField("txtS2_zipcode")?.setText(data.seller2Zipcode);

    if (data.seller2Phone)
      form.getTextField("txtS2_phone1")?.setText(data.seller2Phone);

    if (data.seller2Fax)
      form.getTextField("txtS2_fax")?.setText(data.seller2Fax);

    if (data.seller2Email)
      form.getTextField("txtS2_email")?.setText(data.seller2Email);

    if (data.brokerageFax)
      form.getTextField("txtl_brkfax")?.setText(data.brokerageFax);

    if (data.brokerageEmail)
      form.getTextField("txtl_brkemail")?.setText(data.brokerageEmail);

    if (data.repFax)
      form.getTextField("txtl_brkagentfax")?.setText(data.repFax);

    // if (data.signedDate) {
    //   const [year, month, day] = data.signedDate.split("-");
    //   const yy = year.slice(-2);
    //   form.getTextField("txtSignedDate_m").setText(month);
    //   form.getTextField("txtSignedDate_d").setText(day);
    //   form.getTextField("txtSignedDate_yy").setText(yy);
    // }


    if (data.sellerPrint1)
      form.getTextField("txtsellersig1")?.setText(data.sellerPrint1);

    if (data.sellerPrint2)
      form.getTextField("txtsellersig2")?.setText(data.sellerPrint2);

    if (data.witnessPrint1)
      form.getTextField("txtWitness1Sig")?.setText(data.witnessPrint1);

    if (data.witnessPrint2)
      form.getTextField("txtWitness3Sig")?.setText(data.witnessPrint2);

    if (data.spouseName)
      form.getTextField("txtSpouseSig")?.setText(data.spouseName);

    if (data.spouseWitnessName)
      form.getTextField("txtWitness2Sig")?.setText(data.spouseWitnessName);

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
      message: "Seller Customer Acknowledgment and Fee Agreement saved successfully."
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});



router.post("/send-scsaafa-for-signature", async (req, res) => {
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

    const transactionUser = await TransactionUser.findById(party.userId);

    /* ===============================
       GET SAVED DATA
    =============================== */

    const data = await SCSAAFA.findOne({ partyId });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Seller Customer Acknowledgment not found"
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

    /* =====================================================
       PDF MAPPING
    ===================================================== */

    // Agreement
    if (data.agreementNumber)
      form.getTextField("txtAgreeNum").setText(data.agreementNumber);

    // Brokerage
    if (data.brokerageName1)
      form.getTextField("txts_broker").setText(data.brokerageName1);

    if (data.brokerageName2)
      form.getTextField("txtBroker2").setText(data.brokerageName2);

    // Seller
    if (data.sellerName1)
      form.getTextField("txtseller1").setText(data.sellerName1);

    if (data.sellerName2)
      form.getTextField("txtseller2").setText(data.sellerName2);

    // Property
    if (data.propertyUnitNumber)
      form.getTextField("txtp_unitNumber").setText(data.propertyUnitNumber);

    if (data.streetNumber)
      form.getTextField("txtp_streetnum").setText(data.streetNumber);

    if (data.street)
      form.getTextField("txtp_street").setText(data.street);

    if (data.city)
      form.getTextField("txtp_city").setText(data.city);

    if (data.state)
      form.getTextField("txtp_state").setText(data.state);

    if (data.zipcode)
      form.getTextField("txtp_zipcode").setText(data.zipcode);

    // Legal Description
    if (data.plan)
      form.getTextField("txtp_PageNumber").setText(data.plan);

    if (data.block)
      form.getTextField("txtp_Block").setText(data.block);

    if (data.lot)
      form.getTextField("txtp_LotNumber").setText(data.lot);

    // Condo
    if (data.condoPlan)
      form.getTextField("txtCondoPlan").setText(data.condoPlan);

    if (data.unitNumber)
      form.getTextField("txtCondoUnit").setText(data.unitNumber);

    // ATS
    if (data.meridian)
      form.getTextField("txtp_Meridian").setText(data.meridian);

    if (data.range)
      form.getTextField("txtp_Range").setText(data.range);

    if (data.township)
      form.getTextField("txtp_township").setText(data.township);

    if (data.section)
      form.getTextField("txtp_section").setText(data.section);

    // Fee
    if (data.feeAmount)
      form.getTextField("txtTheFee").setText(data.feeAmount);

    if (data.feeDays1)
      form.getTextField("txtFeeDays1").setText(data.feeDays1);

    if (data.feeDays2)
      form.getTextField("txtFeeDays2").setText(data.feeDays2);

    // Dower
    if (data.married) {
      try {
        const radioField = form.getRadioGroup("radio_group_29ayds");

        if (data.married === "yes") radioField.select("yes");
        if (data.married === "no") radioField.select("no");
      } catch {
        console.log("Married radio group not found");
      }
    }

    if (data.resided) {
      try {
        const radioField = form.getRadioGroup("radio_group_31zdoj");

        if (data.resided === "yes") radioField.select("yes");
        if (data.resided === "no") radioField.select("no");
      } catch {
        console.log("Resided radio group not found");
      }
    }

    // Contact Information
    if (data.seller1Name)
      form.getTextField("txtseller1").setText(data.seller1Name);

    if (data.seller1Streetnum)
      form.getTextField("txtS_streetnum").setText(data.seller1Streetnum);

    if (data.seller1Street)
      form.getTextField("txtS_street").setText(data.seller1Street);

    if (data.seller1City)
      form.getTextField("txtS_city").setText(data.seller1City);

    if (data.seller1State)
      form.getTextField("txtS_state").setText(data.seller1State);

    if (data.seller1Zipcode)
      form.getTextField("txtS_zipcode").setText(data.seller1Zipcode);

    if (data.seller1Phone)
      form.getTextField("txtS_phone1").setText(data.seller1Phone);

    if (data.seller1Fax)
      form.getTextField("txtS_fax").setText(data.seller1Fax);

    if (data.seller1Email)
      form.getTextField("txtS_email").setText(data.seller1Email);

    if (data.seller2Name)
      form.getTextField("txtseller2").setText(data.seller2Name);

    if (data.seller2Streetnum)
      form.getTextField("txtS2_streetnum").setText(data.seller2Streetnum);

    if (data.seller2Street)
      form.getTextField("txtS2_street").setText(data.seller2Street);

    if (data.seller2City)
      form.getTextField("txtS2_city").setText(data.seller2City);

    if (data.seller2State)
      form.getTextField("txtS2_state").setText(data.seller2State);

    if (data.seller2Zipcode)
      form.getTextField("txtS2_zipcode").setText(data.seller2Zipcode);

    if (data.seller2Phone)
      form.getTextField("txtS2_phone1").setText(data.seller2Phone);

    if (data.seller2Fax)
      form.getTextField("txtS2_fax").setText(data.seller2Fax);

    if (data.seller2Email)
      form.getTextField("txtS2_email").setText(data.seller2Email);

    if (data.brokerageFax)
      form.getTextField("txtl_brkfax").setText(data.brokerageFax);

    if (data.brokerageEmail)
      form.getTextField("txtl_brkemail").setText(data.brokerageEmail);

    if (data.repFax)
      form.getTextField("txtl_brkagentfax").setText(data.repFax);

    // Signatures
    if (data.sellerPrint1)
      form.getTextField("txtsellersig1").setText(data.sellerPrint1);

    if (data.sellerPrint2)
      form.getTextField("txtsellersig2").setText(data.sellerPrint2);

    if (data.witnessPrint1)
      form.getTextField("txtWitness1Sig").setText(data.witnessPrint1);

    if (data.witnessPrint2)
      form.getTextField("txtWitness3Sig").setText(data.witnessPrint2);

    if (data.spouseName)
      form.getTextField("txtSpouseSig").setText(data.spouseName);

    if (data.spouseWitnessName)
      form.getTextField("txtWitness2Sig").setText(data.spouseWitnessName);

    /* =====================================================
       END PDF MAPPING
    ===================================================== */
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

    if (data.sellerName2 && data.sellerSignatureEmail2) {
      signers.push({
        email: data.sellerSignatureEmail2.trim(),
        name: data.sellerName2,
        recipientId: "2",
        routingOrder: "1",
        clientUserId: `${partyId}_seller2`,
        tabs: {
          signHereTabs: [
            {
              anchorString: "/sign2/"
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

    /* ---------- Witness 1 ---------- */

    if (data.witnessPrint1 && data.witnessEmail1) {
      signers.push({
        email: data.witnessEmail1.trim(),
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

    /* ---------- Witness 2 ---------- */

    if (data.witnessPrint2 && data.witnessEmail2) {
      signers.push({
        email: data.witnessEmail2.trim(),
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

    /* ---------- Brokerage Representative ---------- */

    if (data.repPrintName && data.repSignatureEmail) {
      signers.push({
        email: data.repSignatureEmail.trim(),
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

    /* ---------- Spouse ---------- */

    if (data.spouseName && data.spouseSignatureEmail) {
      signers.push({
        email: data.spouseSignatureEmail.trim(),
        name: data.spouseName,
        recipientId: "6",
        routingOrder: "1",
        clientUserId: `${partyId}_spouse`,
        tabs: {
          signHereTabs: [
            {
              anchorString: "/sign6/"
            }
          ],
          dateSignedTabs: [
            {
              anchorString: "/date_md2/",
              dateFormat: "MMMM d, HH:mm"
            }
          ]
        }
      });
    }

    /* ---------- Spouse Witness ---------- */

    if (data.spouseWitnessName && data.spouseWitnessEmail) {
      signers.push({
        email: data.spouseWitnessEmail.trim(),
        name: data.spouseWitnessName,
        recipientId: "7",
        routingOrder: "1",
        clientUserId: `${partyId}_spouseWitness`,
        tabs: {
          signHereTabs: [
            {
              anchorString: "/sign7/"
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

    console.log("SCSAAFA Signers:", signers);

    /* ===============================
      CREATE ENVELOPE
   =============================== */

    const envelopePayload = {
      emailSubject:
        "Please sign the Seller Customer Acknowledgment and Fee Agreement",

      documents: [
        {
          documentBase64: Buffer.from(pdfBytes).toString("base64"),
          name: "Seller Customer Acknowledgment and Fee Agreement.pdf",
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

    await SCSAAFA.findOneAndUpdate(
      { partyId },
      {
        envelopeId,

        completedEmailSent: false,

        seller1Signed: false,
        seller2Signed: false,

        witness1Signed: false,
        witness2Signed: false,

        brokerSigned: false,

        spouseSigned: false,
        spouseWitnessSigned: false,

        seller1SignedAt: null,
        seller2SignedAt: null,

        witness1SignedAt: null,
        witness2SignedAt: null,

        brokerSignedAt: null,

        spouseSignedAt: null,
        spouseWitnessSignedAt: null,

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

      // const signingLink = `https://realtorparth.ca/api/scsaafa/start-sign/${partyId}?recipientId=${signer.recipientId}`;
      const signingLink = `https://realtorparth.ca/api/scsaafa/start-sign/${partyId}/${signer.recipientId}`;

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
          documentRole = "Brokerage Representative";
          break;

        case "6":
          documentRole = "Spouse";
          break;

        case "7":
          documentRole = "Spouse Witness";
          break;
      }

      await transporter.sendMail({
        from: `"RealtorParth" <hello@realtorparth.ca>`,
        to: signer.email,
        subject:
          "Seller Customer Acknowledgment and Fee Agreement Ready For Signature",

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
<strong>Seller Customer Acknowledgment and Fee Agreement</strong>
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
      message:
        "Seller Customer Acknowledgment and Fee Agreement sent successfully."
    });

  } catch (error) {

    console.error(
      "SCSAAFA DOCUSIGN ERROR:",
      error.response?.data || error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to send Seller Customer Acknowledgment and Fee Agreement for signature."
    });

  }
});


router.get("/start-sign/:partyId/:recipientId", async (req, res) => {
  try {

    const { partyId, recipientId } = req.params;
    // const { recipientId } = req.query;

    const scsaafa = await SCSAAFA.findOne({ partyId });

    if (!scsaafa) {
      return res
        .status(404)
        .send("Seller Customer Acknowledgment not found.");
    }

    if (!scsaafa.envelopeId) {
      return res
        .status(400)
        .send("Envelope not created yet.");
    }

    if (
      !scsaafa.signers ||
      scsaafa.signers.length === 0
    ) {
      return res
        .status(400)
        .send("No signers found.");
    }

    /* ===============================
       GET REQUESTED SIGNER
    =============================== */

    const signer =
      scsaafa.signers.find(
        s => s.recipientId === String(recipientId)
      ) ||
      scsaafa.signers.find(
        s => s.recipientId === "1"
      ) ||
      scsaafa.signers[0];

    if (!signer) {
      return res.status(404).send("Signer not found.");
    }

    const accessToken = await getAccessToken();

    /* ===============================
       CREATE RECIPIENT VIEW
    =============================== */

    const viewRes = await axios.post(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${scsaafa.envelopeId}/views/recipient`,
      {
        authenticationMethod: "none",

        email: signer.email,
        userName: signer.name,

        clientUserId: signer.clientUserId,

        returnUrl:
          `https://realtorparth.ca/api/scsaafa/sign-complete/${partyId}?recipientId=${signer.recipientId}`
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

    console.log("========== SCSAAFA SIGN COMPLETE ==========");
    console.log("Party:", partyId);
    console.log("Recipient:", recipientId);

    const scsaafa = await SCSAAFA.findOne({ partyId });

    if (!scsaafa) {
      return res
        .status(404)
        .send("Seller Customer Acknowledgment not found.");
    }

    /* ===============================
       UPDATE SIGNING STATUS
    =============================== */

    const now = new Date();

    switch (String(recipientId)) {

      case "1":
        if (scsaafa.seller1Signed) {
          return res.redirect(
            "https://realtorparth.ca/signature-complete"
          );
        }

        scsaafa.seller1Signed = true;
        scsaafa.seller1SignedAt = now;
        break;

      case "2":
        if (scsaafa.seller2Signed) {
          return res.redirect(
            "https://realtorparth.ca/signature-complete"
          );
        }

        scsaafa.seller2Signed = true;
        scsaafa.seller2SignedAt = now;
        break;

      case "3":
        if (scsaafa.witness1Signed) {
          return res.redirect(
            "https://realtorparth.ca/signature-complete"
          );
        }

        scsaafa.witness1Signed = true;
        scsaafa.witness1SignedAt = now;
        break;

      case "4":
        if (scsaafa.witness2Signed) {
          return res.redirect(
            "https://realtorparth.ca/signature-complete"
          );
        }

        scsaafa.witness2Signed = true;
        scsaafa.witness2SignedAt = now;
        break;

      case "5":
        if (scsaafa.brokerSigned) {
          return res.redirect(
            "https://realtorparth.ca/signature-complete"
          );
        }

        scsaafa.brokerSigned = true;
        scsaafa.brokerSignedAt = now;
        break;

      case "6":
        if (scsaafa.spouseSigned) {
          return res.redirect(
            "https://realtorparth.ca/signature-complete"
          );
        }

        scsaafa.spouseSigned = true;
        scsaafa.spouseSignedAt = now;
        break;

      case "7":
        if (scsaafa.spouseWitnessSigned) {
          return res.redirect(
            "https://realtorparth.ca/signature-complete"
          );
        }

        scsaafa.spouseWitnessSigned = true;
        scsaafa.spouseWitnessSignedAt = now;
        break;
    }

    /* ===============================
       SAVE SIGNING STATUS
    =============================== */

    await scsaafa.save();

    /* ===============================
       WAIT UNTIL EVERYONE SIGNS
    =============================== */

    const everyoneSigned =
      (!scsaafa.sellerPrint1 || scsaafa.seller1Signed) &&
      (!scsaafa.sellerPrint2 || scsaafa.seller2Signed) &&
      (!scsaafa.witnessPrint1 || scsaafa.witness1Signed) &&
      (!scsaafa.witnessPrint2 || scsaafa.witness2Signed) &&
      (!scsaafa.repPrintName || scsaafa.brokerSigned) &&
      (!scsaafa.spouseName || scsaafa.spouseSigned) &&
      (!scsaafa.spouseWitnessName || scsaafa.spouseWitnessSigned);

    if (!everyoneSigned) {

      console.log("Waiting for remaining signers...");

      return res.redirect(
        "https://realtorparth.ca/signature-complete"
      );
    }

    if (scsaafa.completedEmailSent) {
      return res.redirect(
        "https://realtorparth.ca/signature-complete"
      );
    }
    /* ===============================
       PARTY
    =============================== */

    const party = await TransactionParty.findById(partyId);

    if (!party) {
      return res.status(404).send("Party not found.");
    }

    /* ===============================
       TRANSACTION USER
    =============================== */

    const transactionUser = await TransactionUser.findById(
      party.userId
    );

    if (!transactionUser) {
      return res
        .status(404)
        .send("Transaction User not found.");
    }

    /* ===============================
       SEND ADMIN NOTIFICATION
    =============================== */

    await transporter.sendMail({
      from: `"RealtorParth" <hello@realtorparth.ca>`,
      to: transactionUser.email,
      subject:
        "Seller Customer Acknowledgment and Fee Agreement Signed by All Parties",

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
All Signatures Completed
</h2>

<p style="font-size:16px;color:#555;line-height:28px;">
All required parties have successfully completed their electronic signatures for the
<strong>Seller Customer Acknowledgment and Fee Agreement</strong>.
</p>

<table
width="100%"
cellpadding="10"
cellspacing="0"
style="margin:30px 0;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;"
>

<tr style="background:#f8fafc;">
<td style="font-weight:600;color:#333;width:180px;">
Client Name
</td>
<td style="color:#555;">
${party.name}
</td>
</tr>

<tr>
<td style="font-weight:600;color:#333;">
Client Email
</td>
<td style="color:#555;">
${party.email}
</td>
</tr>

<tr style="background:#f8fafc;">
<td style="font-weight:600;color:#333;">
Document
</td>
<td style="color:#555;">
Seller Customer Acknowledgment and Fee Agreement
</td>
</tr>

<tr>
<td style="font-weight:600;color:#333;">
Status
</td>
<td style="color:#16a34a;font-weight:600;">
✔ All Required Signatures Completed
</td>
</tr>

<tr style="background:#f8fafc;">
<td style="font-weight:600;color:#333;">
Completed On
</td>
<td style="color:#555;">
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
<td style="background:#f7f7f7;padding:22px;text-align:center;color:#777;font-size:13px;line-height:22px;">
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
    console.log("Notification email sent.");

    /* ===============================
       PREVENT DUPLICATE EMAIL
    =============================== */

    scsaafa.completedEmailSent = true;

    await scsaafa.save();

    console.log("completedEmailSent updated.");

    return res.redirect(
      "https://realtorparth.ca/signature-complete"
    );

  } catch (err) {

    console.error(
      "========== SCSAAFA SIGN COMPLETE ERROR =========="
    );

    console.error(
      err.response?.data || err
    );

    return res.redirect(
      "https://realtorparth.ca/signature-complete"
    );

  }
});





// router.post("/send-scsaafa-for-signature", async (req, res) => {
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
//     const data = await SCSAAFA.findOne({ partyId });
//     if (!data) {
//       return res.status(404).json({
//         success: false,
//         message: "Seller Customer Acknowledgment not found"
//       });
//     }
//     /* ===============================
//        LOAD PDF
//     =============================== */
//     const existingPdfBytes = fs.readFileSync(PDF_PATH);
//     const pdfDoc = await PDFDocument.load(existingPdfBytes, {ignoreEncryption: true});
//     const form = pdfDoc.getForm();
//     const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

//     /* =====================================================
//        PASTE YOUR ENTIRE PDF MAPPING HERE
//        Replace every data.xxx exactly like generate-pdf
//     ===================================================== */
//     if (data.agreementNumber)
//       form.getTextField("txtAgreeNum")?.setText(data.agreementNumber);

//     if (data.brokerageName1)
//       form.getTextField("txts_broker")?.setText(data.brokerageName1);

//     if (data.brokerageName2)
//       form.getTextField("txtBroker2")?.setText(data.brokerageName2);

//     // SELLER
//     if (data.sellerName1)
//       form.getTextField("txtseller1")?.setText(data.sellerName1);

//     if (data.sellerName2)
//       form.getTextField("txtseller2")?.setText(data.sellerName2);

//     // PROPERTY
//     if (data.propertyUnitNumber)
//       form.getTextField("txtp_unitNumber")?.setText(data.propertyUnitNumber);

//     if (data.streetNumber)
//       form.getTextField("txtp_streetnum")?.setText(data.streetNumber);

//     if (data.street)
//       form.getTextField("txtp_street")?.setText(data.street);

//     if (data.city)
//       form.getTextField("txtp_city")?.setText(data.city);

//     if (data.state)
//       form.getTextField("txtp_state")?.setText(data.state);

//     if (data.zipcode)
//       form.getTextField("txtp_zipcode")?.setText(data.zipcode);

//     if (data.plan)
//       form.getTextField("txtp_PageNumber")?.setText(data.plan);

//     if (data.block)
//       form.getTextField("txtp_Block")?.setText(data.block);

//     if (data.lot)
//       form.getTextField("txtp_LotNumber")?.setText(data.lot);

//     if (data.condoPlan)
//       form.getTextField("txtCondoPlan")?.setText(data.condoPlan);

//     if (data.unitNumber)
//       form.getTextField("txtCondoUnit")?.setText(data.unitNumber);

//     if (data.meridian)
//       form.getTextField("txtp_Meridian")?.setText(data.meridian);

//     if (data.range)
//       form.getTextField("txtp_Range")?.setText(data.range);

//     if (data.township)
//       form.getTextField("txtp_township")?.setText(data.township);

//     if (data.section)
//       form.getTextField("txtp_section")?.setText(data.section);

//     // FEE
//     if (data.feeAmount)
//       form.getTextField("txtTheFee")?.setText(data.feeAmount);

//     if (data.feeDays1)
//       form.getTextField("txtFeeDays1")?.setText(data.feeDays1);

//     if (data.feeDays2)
//       form.getTextField("txtFeeDays2")?.setText(data.feeDays2);

//     // DOWER (radio example)
//     if (data.married) {
//       try {
//         const radioField = form.getRadioGroup("radio_group_29ayds");
//         if (data.married === "yes") {
//           radioField.select("yes");
//         }
//         if (data.married === "no") {
//           radioField.select("no");
//         }
//       } catch (err) {
//         console.log("Third party radio group not found");
//       }
//     }

//     if (data.resided) {
//       try {
//         const radioField = form.getRadioGroup("radio_group_31zdoj");
//         if (data.resided === "yes") {
//           radioField.select("yes");
//         }
//         if (data.resided === "no") {
//           radioField.select("no");
//         }
//       } catch (err) {
//         console.log("Third party radio group not found");
//       }
//     }

//     // SIGNATURE
//     if (data.seller1Name)
//       form.getTextField("txtseller1")?.setText(data.seller1Name);

//     if (data.seller1Streetnum)
//       form.getTextField("txtS_streetnum")?.setText(data.seller1Streetnum);

//     if (data.seller1Street)
//       form.getTextField("txtS_street")?.setText(data.seller1Street);

//     if (data.seller1City)
//       form.getTextField("txtS_city")?.setText(data.seller1City);

//     if (data.seller1State)
//       form.getTextField("txtS_state")?.setText(data.seller1State);

//     if (data.seller1Zipcode)
//       form.getTextField("txtS_zipcode")?.setText(data.seller1Zipcode);

//     if (data.seller1Phone)
//       form.getTextField("txtS_phone1")?.setText(data.seller1Phone);

//     if (data.seller1Fax)
//       form.getTextField("txtS_fax")?.setText(data.seller1Fax);

//     if (data.seller1Email)
//       form.getTextField("txtS_email")?.setText(data.seller1Email);

//     if (data.seller2Name)
//       form.getTextField("txtseller2")?.setText(data.seller2Name);

//     if (data.seller2Streetnum)
//       form.getTextField("txtS2_streetnum")?.setText(data.seller2Streetnum);

//     if (data.seller2Street)
//       form.getTextField("txtS2_street")?.setText(data.seller2Street);

//     if (data.seller2City)
//       form.getTextField("txtS2_city")?.setText(data.seller2City);

//     if (data.seller2State)
//       form.getTextField("txtS2_state")?.setText(data.seller2State);

//     if (data.seller2Zipcode)
//       form.getTextField("txtS2_zipcode")?.setText(data.seller2Zipcode);

//     if (data.seller2Phone)
//       form.getTextField("txtS2_phone1")?.setText(data.seller2Phone);

//     if (data.seller2Fax)
//       form.getTextField("txtS2_fax")?.setText(data.seller2Fax);

//     if (data.seller2Email)
//       form.getTextField("txtS2_email")?.setText(data.seller2Email);

//     if (data.brokerageFax)
//       form.getTextField("txtl_brkfax")?.setText(data.brokerageFax);

//     if (data.brokerageEmail)
//       form.getTextField("txtl_brkemail")?.setText(data.brokerageEmail);

//     if (data.repFax)
//       form.getTextField("txtl_brkagentfax")?.setText(data.repFax);

//     if (data.sellerPrint1)
//       form.getTextField("txtsellersig1")?.setText(data.sellerPrint1);

//     if (data.sellerPrint2)
//       form.getTextField("txtsellersig2")?.setText(data.sellerPrint2);

//     if (data.witnessPrint1)
//       form.getTextField("txtWitness1Sig")?.setText(data.witnessPrint1);

//     if (data.witnessPrint2)
//       form.getTextField("txtWitness3Sig")?.setText(data.witnessPrint2);

//     if (data.spouseName)
//       form.getTextField("txtSpouseSig")?.setText(data.spouseName);

//     if (data.spouseWitnessName)
//       form.getTextField("txtWitness2Sig")?.setText(data.spouseWitnessName);

//     /* =====================================================
//        END PDF MAPPING
//     ===================================================== */
//     form.updateFieldAppearances(font);
//     form.flatten();
//     const pdfBytes = await pdfDoc.save({
//       updateFieldAppearances: true
//     });
//     const accessToken = await getAccessToken();
//     /* ===============================
//       SIGNERS
//     =============================== */
//     const signers = [];
//     const baseEmail = party.email;
//     const [name, domain] = baseEmail.split("@");
//     const seller1Email = baseEmail;
//     const seller2Email = `${name}+seller2@${domain}`;
//     const spouseEmail = `${name}+spouse@${domain}`;
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
//               anchorString: "/sign2/"
//             }
//           ]
//         }
//       });
//     }
//     /* SPOUSE */
//     if (data.spouseName) {
//       signers.push({
//         email: spouseEmail,
//         name: data.spouseName,
//         recipientId: "3",
//         routingOrder: "3",
//         clientUserId: `${partyId}_spouse`,
//         tabs: {
//           signHereTabs: [
//             {
//               anchorString: "/sign6/"
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
//     /* AGENT */
//     if (data.repPrintName && transactionUser?.email) {
//       signers.push({
//         email: transactionUser.email,
//         name: data.repPrintName,
//         recipientId: "4",
//         routingOrder: "4",
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
//     console.log("SCSAAFA Signers:", signers);
//     /* ===============================
//        CREATE ENVELOPE
//     =============================== */
//     const envelopePayload = {
//       emailSubject: "Please sign the Seller Customer Acknowledgment and Fee Agreement",
//       documents: [
//         {
//           documentBase64: Buffer.from(pdfBytes).toString("base64"),
//           name: "Seller Customer Acknowledgment and Fee Agreement.pdf",
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
//     await SCSAAFA.findOneAndUpdate(
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
//     const signingLink = `https://realtorparth.ca/api/scsaafa/start-sign/${partyId}`;
//     await transporter.sendMail({
//       from: `"RealtorParth" <hello@realtorparth.ca>`,
//       to: party.email,
//       subject:
//         "Seller Customer Status Acknowledgment and Fee Agreement Ready For Signature",
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
// Hello ${data.buyerPrint1},
// </h2>

// <p style="font-size:16px;color:#555;line-height:28px;">
// Your <strong>Seller Customer Status Acknowledgment and Fee Agreement</strong> document has been prepared and is now ready for your electronic signature.
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
// Seller Customer Status Acknowledgment and Fee Agreement
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
//       "SCSAAFA DOCUSIGN ERROR:",
//       error.response?.data || error
//     );
//     res.status(500).json({
//       success: false,
//       message:
//         "Failed to send Seller Customer Acknowledgment for signature."
//     });
//   }
// });


// router.get("/start-sign/:partyId", async (req, res) => {
//   try {
//     const { partyId } = req.params;

//     const scsaafa = await SCSAAFA.findOne({ partyId });

//     if (!scsaafa) {
//       return res.status(404).send(
//         "Seller Customer Acknowledgment not found."
//       );
//     }

//     if (!scsaafa.envelopeId) {
//       return res.status(400).send(
//         "Envelope not created yet."
//       );
//     }

//     if (
//       !scsaafa.signers ||
//       scsaafa.signers.length === 0
//     ) {
//       return res.status(400).send(
//         "No signers found."
//       );
//     }

//     /* ===============================
//        FIRST SIGNER
//     =============================== */

//     const signer =
//       scsaafa.signers.find(
//         s => s.recipientId === "1"
//       ) || scsaafa.signers[0];

//     const accessToken = await getAccessToken();

//     /* ===============================
//        CREATE RECIPIENT VIEW
//     =============================== */

//     const viewRes = await axios.post(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${scsaafa.envelopeId}/views/recipient`,
//       {
//         authenticationMethod: "none",

//         email: signer.email,
//         userName: signer.name,

//         clientUserId: signer.clientUserId,

//         returnUrl: `https://realtorparth.ca/api/scsaafa/sign-complete/${partyId}`
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

//     return res.status(500).send(
//       "Unable to start signing."
//     );

//   }
// });



// router.get("/sign-complete/:partyId", async (req, res) => {
//   try {
//     const { partyId } = req.params;

//     console.log("========== SIGN COMPLETE ==========");
//     console.log("Party ID:", partyId);

//     // ----------------------------------------------------
//     // SCSAAFA
//     // ----------------------------------------------------
//     const scsaafa = await SCSAAFA.findOne({ partyId });

//     if (!scsaafa) {
//       return res
//         .status(404)
//         .send("Seller Customer Acknowledgment not found.");
//     }

//     // Prevent duplicate emails
//     if (scsaafa.completedEmailSent) {
//       console.log("Notification already sent.");

//       return res.redirect(
//         "https://realtorparth.ca/signature-complete"
//       );
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
//     const transactionUser = await TransactionUser.findById(
//       party.userId
//     );

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
//       subject:
//         "Seller Customer Acknowledgment Signed by Client",

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
// <strong>Seller Customer Acknowledgment and Fee Agreement</strong>.
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
// Seller Customer Acknowledgment and Fee Agreement
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
//     scsaafa.completedEmailSent = true;
//     await scsaafa.save();

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

    if (!session) {
      return res.status(400).json({ error: "Session expired" });
    }

    const { envelopeId, signers, currentIndex } = session;

    const accessToken = await getAccessToken();

    /* ===============================
       🔍 CHECK ENVELOPE STATUS
    =============================== */
    const statusRes = await axios.get(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/recipients`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const recipients = statusRes.data.signers;

    const currentSigner = signers[currentIndex];

    const currentStatus = recipients.find(
      (r) => r.email === currentSigner.email
    )?.status;

    console.log("Current signer status:", currentStatus);

    /* 🚨 BLOCK NEXT IF NOT COMPLETED */
    if (currentStatus !== "completed") {
      return res.json({
        waiting: true,
        message: "Current signer not finished yet"
      });
    }

    /* ===============================
       MOVE NEXT
    =============================== */
    const nextIndex = currentIndex + 1;

    if (nextIndex >= signers.length) {
      return res.json({ done: true });
    }

    const nextSigner = signers[nextIndex];

    const viewRes = await axios.post(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/views/recipient`,
      {
        // returnUrl: `${process.env.FRONTEND_URL}/sign-redirect?partyId=${partyId}&type=scsaafa`,
        returnUrl: `http://localhost:5173/sign-redirect?partyId=${partyId}&type=scsaafa`,
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
    console.error("❌ NEXT SIGNER ERROR:", err.response?.data || err);
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
       👤 PARTY FLOW (PARTIAL COMPLETE)
    =============================== */
    if (!isFinalFlow) {
      // 👉 exclude last signer (rep)
      const partySigners = allSigners.slice(0, -1);

      const partyCompleted = partySigners.every(
        (s) => s.status === "completed"
      );

      if (!partyCompleted) {
        return res.status(400).json({
          error: "Party signers not completed yet"
        });
      }

      console.log("✅ Party signing completed");

      /* DOWNLOAD PARTIAL DOC */
      const docRes = await axios.get(
        `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/combined`,
        {
          responseType: "arraybuffer",
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=Party-Signed.pdf"
      });

      return res.send(docRes.data);
    }

    /* ===============================
       👨‍💼 FINAL FLOW (ALL COMPLETE)
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

    console.log("✅ All signers completed (FINAL)");

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

    console.log("📧 Email sent to:", transactionUserEmail);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=Final-Signed.pdf"
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

    const data = await SCSAAFA.findOne({ partyId });

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
//     console.log("Received data:", req.body);
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

//     await SCSAAFA.findOneAndUpdate(
//       { partyId }, // 🔥 MAIN FIX
//       {
//         ...data,
//         partyId,
//         transactionId: party.transactionId // ✅ optional (admin side)
//       },
//       {
//         new: true,
//         upsert: true
//       }
//     );

//     // 👉 continue your PDF logic here...

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
//        MAP FIELDS (IMPORTANT)
//        ⚠️ Replace with your actual PDF field names
//     =============================== */

//     // HEADER
//     if (data.agreementNumber)
//       form.getTextField("txtAgreeNum")?.setText(data.agreementNumber);

//     if (data.brokerageName1)
//       form.getTextField("txts_broker")?.setText(data.brokerageName1);

//     if (data.brokerageName2)
//       form.getTextField("txtBroker2")?.setText(data.brokerageName2);


//     // SELLER
//     if (data.sellerName1)
//       form.getTextField("txtseller1")?.setText(data.sellerName1);

//     if (data.sellerName2)
//       form.getTextField("txtseller2")?.setText(data.sellerName2);

//     // PROPERTY
//     if (data.propertyUnitNumber)
//       form.getTextField("txtp_unitNumber")?.setText(data.propertyUnitNumber);

//     if (data.streetNumber)
//       form.getTextField("txtp_unitNumber")?.setText(data.streetNumber);

//     if (data.street)
//       form.getTextField("txtp_unitNumber")?.setText(data.street);

//     if (data.city)
//       form.getTextField("txtp_unitNumber")?.setText(data.city);

//     if (data.state)
//       form.getTextField("txtp_unitNumber")?.setText(data.state);

//     if (data.zipcode)
//       form.getTextField("txtp_unitNumber")?.setText(data.zipcode);



//     if (data.plan)
//       form.getTextField("txtp_PageNumber")?.setText(data.plan);

//     if (data.block)
//       form.getTextField("txtp_Block")?.setText(data.block);

//     if (data.lot)
//       form.getTextField("txtp_LotNumber")?.setText(data.lot);

//     if (data.condoPlan)
//       form.getTextField("txtCondoPlan")?.setText(data.condoPlan);

//     if (data.unitNumber)
//       form.getTextField("txtCondoUnit")?.setText(data.unitNumber);

//     if (data.meridian)
//       form.getTextField("txtp_Meridian")?.setText(data.meridian);

//     if (data.range)
//       form.getTextField("txtp_Range")?.setText(data.range);

//     if (data.township)
//       form.getTextField("txtp_township")?.setText(data.township);

//     if (data.section)
//       form.getTextField("txtp_section")?.setText(data.section);



//     // FEE
//     if (data.feeAmount)
//       form.getTextField("txtTheFee")?.setText(data.feeAmount);

//     if (data.feeDays1)
//       form.getTextField("txtFeeDays1")?.setText(data.feeDays1);

//     if (data.feeDays2)
//       form.getTextField("txtFeeDays2")?.setText(data.feeDays2);


//     // DOWER (radio example)
//     if (data.married) {
//       try {
//         const radioField = form.getRadioGroup("radio_group_29ayds");

//         if (data.married === "yes") {
//           radioField.select("yes");
//         }

//         if (data.married === "no") {
//           radioField.select("no");
//         }

//       } catch (err) {
//         console.log("Third party radio group not found");
//       }
//     }

//     if (data.resided) {
//       try {
//         const radioField = form.getRadioGroup("radio_group_31zdoj");

//         if (data.resided === "yes") {
//           radioField.select("yes");
//         }

//         if (data.resided === "no") {
//           radioField.select("no");
//         }

//       } catch (err) {
//         console.log("Third party radio group not found");
//       }
//     }

//     // SIGNATURE
//     if (data.seller1Name)
//       form.getTextField("txtseller1")?.setText(data.seller1Name);

//     if (data.seller1Streetnum)
//       form.getTextField("txtS_streetnum")?.setText(data.seller1Streetnum);

//     if (data.seller1Street)
//       form.getTextField("txtS_street")?.setText(data.seller1Street);

//     if (data.seller1City)
//       form.getTextField("txtS_city")?.setText(data.seller1City);

//     if (data.seller1State)
//       form.getTextField("txtS_state")?.setText(data.seller1State);

//     if (data.seller1Zipcode)
//       form.getTextField("txtS_zipcode")?.setText(data.seller1Zipcode);

//     if (data.seller1Phone)
//       form.getTextField("txtS_phone1")?.setText(data.seller1Phone);

//     if (data.seller1Fax)
//       form.getTextField("txtS_fax")?.setText(data.seller1Fax);

//     if (data.seller1Email)
//       form.getTextField("txtS_email")?.setText(data.seller1Email);

//     if (data.seller2Name)
//       form.getTextField("txtseller2")?.setText(data.seller2Name);

//     if (data.seller2Streetnum)
//       form.getTextField("txtS2_streetnum")?.setText(data.seller2Streetnum);

//     if (data.seller2Street)
//       form.getTextField("txtS2_street")?.setText(data.seller2Street);

//     if (data.seller2City)
//       form.getTextField("txtS2_city")?.setText(data.seller2City);

//     if (data.seller2State)
//       form.getTextField("txtS2_state")?.setText(data.seller2State);

//     if (data.seller2Zipcode)
//       form.getTextField("txtS2_zipcode")?.setText(data.seller2Zipcode);

//     if (data.seller2Phone)
//       form.getTextField("txtS2_phone1")?.setText(data.seller2Phone);

//     if (data.seller2Fax)
//       form.getTextField("txtS2_fax")?.setText(data.seller2Fax);

//     if (data.seller2Email)
//       form.getTextField("txtS2_email")?.setText(data.seller2Email);

//     if (data.brokerageFax)
//       form.getTextField("txtl_brkfax")?.setText(data.brokerageFax);

//     if (data.brokerageEmail)
//       form.getTextField("txtl_brkemail")?.setText(data.brokerageEmail);

//     if (data.repFax)
//       form.getTextField("txtl_brkagentfax")?.setText(data.repFax);

//     if (data.signedDate) {
//       const [year, month, day] = data.signedDate.split("-");
//       const yy = year.slice(-2);
//       form.getTextField("txtSignedDate_m").setText(month);
//       form.getTextField("txtSignedDate_d").setText(day);
//       form.getTextField("txtSignedDate_yy").setText(yy);
//     }


//     if (data.sellerPrint1)
//       form.getTextField("txtsellersig1")?.setText(data.sellerPrint1);

//     if (data.sellerPrint2)
//       form.getTextField("txtsellersig2")?.setText(data.sellerPrint2);

//     if (data.witnessPrint1)
//       form.getTextField("txtWitness1Sig")?.setText(data.witnessPrint1);

//     if (data.witnessPrint2)
//       form.getTextField("txtWitness3Sig")?.setText(data.witnessPrint2);

//     if (data.spouseName)
//       form.getTextField("txtSpouseSig")?.setText(data.spouseName);

//     if (data.spouseWitnessName)
//       form.getTextField("txtWitness2Sig")?.setText(data.spouseWitnessName);


//     /* ===============================
//        FINALIZE PDF
//     =============================== */
//     form.updateFieldAppearances(font);
//     form.flatten();

//     const pdfBytes = await pdfDoc.save({
//       updateFieldAppearances: true
//     });

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
//     const seller2Email = `${name}+buyer2@${domain}`;
//     const spouseEmail = `${name}+spouse@${domain}`;

//     /* 🟢 BUYER 1 */
//     if (data.sellerPrint1) {
//       embeddedSigners.push({
//         email: seller1Email,
//         name: data.sellerPrint1,
//         recipientId: String(recipientId),
//         routingOrder: String(recipientId),
//         ...(isEmbedded && {
//           clientUserId: `${party._id}_buyer1`
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
//           clientUserId: `${party._id}_buyer2`
//         }),
//         tabs: {
//           signHereTabs: [{ anchorString: "/sign2/" }]
//         }
//       });
//       recipientId++;
//     }

//     /* 🔵 SPOUSE 2 */
//     if (data.spouseName) {
//       embeddedSigners.push({
//         email: spouseEmail,
//         name: data.spouseName,
//         recipientId: String(recipientId),
//         routingOrder: String(recipientId),
//         ...(isEmbedded && {
//           clientUserId: `${party._id}_spouse`
//         }),
//         tabs: {
//           signHereTabs: [{ anchorString: "/sign6/" }]
//         }
//       });
//       recipientId++;
//     }

//     /* 🟣 REP (EMAIL ONLY) */
//     console.log("📧 Adding rep signer with email:", transactinuser?.email);
//     if (data.repName && transactinuser?.email) {
//       emailSigners.push({
//         email: transactinuser.email,
//         name: data.repName,
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
//             name: "Buyer Agreement Termination.pdf",
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
//           // returnUrl: `${process.env.FRONTEND_URL}/sign-redirect?partyId=${partyId}&type=scsaafa`,
//           returnUrl: `http://localhost:5173/sign-redirect?partyId=${partyId}&type=scsaafa`,
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
//     res.status(500).send("Error generating PDF");
//   }
// });