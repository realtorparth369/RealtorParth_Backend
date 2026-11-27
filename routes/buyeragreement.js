import express from "express";
import fs from "fs";
import path from "path";


import axios from "axios";
import jwt from "jsonwebtoken";


import { PDFDocument, StandardFonts } from "pdf-lib";
import BuyerAgreement from "../models/BuyerAgreementModel.js";
import Transaction from "../models/Transaction.js";
import TransactionParty from "../models/TransactionParty.js";
import TransactionUser from "../models/TransactionUser.js";
import nodemailer from "nodemailer";

const router = express.Router();


//const PDF_PATH = path.join(__dirname, "../Exclusive Buyer Representation Agreement (Designated Agency).pdf");

const PDF_PATH = path.join(
  process.cwd(),
  "Exclusive Buyer Representation Agreement (Designated Agency).pdf" // make sure file exists
);


// =============================
// ✅ GET DATA BY USER ID
// =============================

// router.get("/buyeragreement/user/:transactionId/:userId", async (req, res) => {
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
//        FETCH DATA (PER TRANSACTION)
//     =============================== */

//     const data = await BuyerAgreement.findOne({
//       transactionId   // ✅ KEY FIX
//     });

//     if (!data) {
//       return res.json({ success: true, data: null });
//     }

//     res.json({ success: true, data });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({
//       success: false,
//       message: "Error fetching Buyer Agreement",
//     });
//   }
// });





router.get("/buyeragreement/user/:partyId", async (req, res) => {

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
       FETCH BUYER AGREEMENT (PER PARTY)
    =============================== */

    const buyerAgreement = await BuyerAgreement.findOne({
      partyId
    });

    res.json({
      success: true,
      data: buyerAgreement || null
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});



// =============================
// ✅ SAVE / UPDATE (UPSERT)
// =============================
router.post("/buyeragreement/save", async (req, res) => {
  try {
    const { transactionUserId, ...formData } = req.body;

    if (!transactionUserId) {
      return res.status(400).json({
        success: false,
        message: "transactionUserId required",
      });
    }

    const updated = await BuyerAgreement.findOneAndUpdate(
      { transactionUserId },
      {
        transactionUserId,
        ...formData,
      },
      {
        new: true,
        upsert: true,
      }
    );

    res.json({
      success: true,
      message: "Buyer Agreement saved",
      data: updated,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Error saving Buyer Agreement",
    });
  }
});


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
      subject: "Signed Buyer Agreement Document + Summary",
      text: "Attached are your signed document and audit summary.",
      attachments: [
        {
          filename: "Signed-Buyer_Agreement-Document.pdf",
          content: pdfBuffer
        },
        {
          filename: "DocuSign-Buyer_Agreement-Summary.pdf",
          content: certBuffer
        }
      ]
    });

    console.log("✅ Email sent to:", toEmail);
  } catch (error) {
    console.error("❌ Email error:", error);
  }
};

router.post("/buyeragreement/generate-pdf", async (req, res) => {
  try {
    const { partyId, isAdmin = false, ...data } = req.body;
    delete data._id;
    /* ===============================
       VALIDATION
    =============================== */
    if (!partyId) {
      return res.status(400).json({
        success: false,
        message: "partyId is required",
      });
    }
    /* ===============================
       VERIFY PARTY EXISTS
    =============================== */
    const party = await TransactionParty.findById(partyId);
    if (!party) {
      return res.json({
        success: false,
        message: "Invalid party",
      });
    }

    /* ===============================
       SAVE / UPDATE (PER PARTY)
    =============================== */
    await BuyerAgreement.findOneAndUpdate(
      { partyId },
      {
        ...data,
        partyId,
        transactionId: party.transactionId,
        // Reset DocuSign info
        envelopeId: null,
        signers: [],
        completedEmailSent: false,
        // Reset signing status
        buyer1Signed: false,
        buyer2Signed: false,
        witness1Signed: false,
        witness2Signed: false,
        agentSigned: false,
        buyer1SignedAt: null,
        buyer2SignedAt: null,
        witness1SignedAt: null,
        witness2SignedAt: null,
        agentSignedAt: null
      },
      {
        new: true,
        upsert: true
      }
    );
    // await BuyerAgreement.findOneAndUpdate(
    //   { partyId }, // 🔥 MAIN FIX
    //   {
    //     ...data,
    //     partyId,
    //     transactionId: party.transactionId // ✅ optional but useful
    //   },
    //   {
    //     new: true,
    //     upsert: true,
    //   }
    // );
    // ⚠️ TODO: Replace with your real PDF logic
    const existingPdfBytes = fs.readFileSync(PDF_PATH);
    const pdfDoc = await PDFDocument.load(existingPdfBytes, {
      ignoreEncryption: true
    });
    const form = pdfDoc.getForm();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    /* =====================================================
       SECTION A – BASIC INFO
    ===================================================== */
    if (data.agreementNumber) {
      form.getTextField("txtagreementNum")
        .setText(data.agreementNumber);
    }
    if (data.brokerageName1) {
      form.getTextField("txts_broker")
        .setText(data.brokerageName1);
    }
    if (data.brokerageName2) {
      form.getTextField("txts2_broker_ABC")
        .setText(data.brokerageName2);
    }
    if (data.buyerName1) {
      form.getTextField("txtbuyer1")
        .setText(data.buyerName1);
    }
    if (data.buyerName2) {
      form.getTextField("txtbuyer2")
        .setText(data.buyerName2);
    }
    if (data.propertyType) {
      form.getTextField("txtPropType")
        .setText(data.propertyType);
    }
    if (data.marketAreas) {
      form.getTextField("txtMarketArea")
        .setText(data.marketAreas);
    }
    if (data.designatedAgentName) {
      form.getTextField("txtNOMAPDesAgents")
        .setText(data.designatedAgentName);
    }
    if (data.startDate) {
      form.getTextField("txtp_ContractDateABC_m")
        .setText(data.startDate);
    }
    if (data.startYear) {
      form.getTextField("txtp_ContractDateABC_yy")
        .setText(data.startYear);
    }
    if (data.startTime) {
      form.getTextField("txtContractTime")
        .setText(data.startTime);
    }
    if (data.endDate) {
      form.getTextField("txtp_expiredate_mmmm")
        .setText(data.endDate);
    }
    if (data.endYear) {
      form.getTextField("txtp_expiredate_yy")
        .setText(data.endYear);
    }
    if (data.endTime) {
      form.getTextField("txtExpireTime")
        .setText(data.endTime);
    }
    if (data.agentServices) {
      form.getTextField("txtServices")
        .setText(data.agentServices);
    }
    if (data.daysAfterAgreement) {
      form.getTextField("txtCopyDays")
        .setText(data.daysAfterAgreement);
    }
    if (data.ourFee) {
      const maxLengthLine1 = 120; // adjust based on PDF field width
      let words = data.ourFee.trim().split(" ");
      let line1 = "";
      let line2 = "";
      for (let i = 0; i < words.length; i++) {
        let testLine = line1 ? line1 + " " + words[i] : words[i];
        if (testLine.length <= maxLengthLine1) {
          line1 = testLine;
        } else {
          line2 = words.slice(i).join(" ");
          break;
        }
      }
      form.getTextField("txtTheFee1").setText(line1);
      form.getTextField("txtTheFee2").setText(line2);
    }
    if (data.retainerAmount) {
      form.getTextField("txtFeeDeposit")
        .setText(data.retainerAmount);
    }
    if (data.retainerMonth) {
      form.getTextField("txtRetainerDate_m")
        .setText(data.retainerMonth);
    }
    if (data.retainerDay) {
      form.getTextField("txtRetainerDate_d")
        .setText(data.retainerDay);
    }
    if (data.retainerYear) {
      form.getTextField("txtRetainerDate_yy")
        .setText(data.retainerYear);
    }
    if (data.refundDays) {
      form.getTextField("txtRetainerDays")
        .setText(data.refundDays);
    }
    if (data.otherPaymentTerms) {
      const maxLengthLine1 = 80; // adjust based on PDF field width
      let words = data.otherPaymentTerms.trim().split(" ");
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
      form.getTextField("txtRetainerOther1").setText(line1);
      form.getTextField("txtRetainerOther2").setText(line2);
    }
    if (data.contractDaysAfterAgreement) {
      form.getTextField("txtBindingDays")
        .setText(data.contractDaysAfterAgreement);
    }
    if (data.paymentAfterPurchaseDays) {
      form.getTextField("txtFeeDays")
        .setText(data.paymentAfterPurchaseDays);
    }
    if (data.refundDifferenceDays) {
      form.getTextField("txtRefundDays")
        .setText(data.refundDifferenceDays);
    }
    if (data.differencePaymentDays) {
      form.getTextField("txtDifferenceDays")
        .setText(data.differencePaymentDays);
    }
    if (data.reasonableExpenses) {
      const max1 = 60;
      const max2 = 120;
      const max3 = 120;
      const words = data.reasonableExpenses.trim().split(" ");
      let line1 = "";
      let line2 = "";
      let line3 = "";
      for (let word of words) {
        if ((line1 + " " + word).trim().length <= max1) {
          line1 += (line1 ? " " : "") + word;
        }
        else if ((line2 + " " + word).trim().length <= max2) {
          line2 += (line2 ? " " : "") + word;
        }
        else if ((line3 + " " + word).trim().length <= max3) {
          line3 += (line3 ? " " : "") + word;
        }
      }
      form.getTextField("txtExpenses1").setText(line1);
      form.getTextField("txtExpenses2").setText(line2);
      form.getTextField("txtExpenses3").setText(line3);
    }
    if (data.additionalTerms) {
      form.getTextField("txtAddTerms")
        .setText(data.additionalTerms);
    }
    if (data.attachedDocuments) {
      form.getTextField("txtDocuments")
        .setText(data.attachedDocuments);
    }
    if (data.buyer1Name) {
      form.getTextField("txtbuyer1")
        .setText(data.buyer1Name);
    }
    if (data.buyer1Address) {
      form.getTextField("text_80hvqn")
        .setText(data.buyer1Address);
    }
    if (data.buyer1Phone) {
      form.getTextField("txtb_phone1")
        .setText(data.buyer1Phone);
    }
    if (data.buyer1Fax) {
      form.getTextField("txtb_fax")
        .setText(data.buyer1Fax);
    }
    if (data.buyer1Email) {
      form.getTextField("txtb_email")
        .setText(data.buyer1Email);
    }
    if (data.buyer2Name) {
      form.getTextField("txtbuyer2")
        .setText(data.buyer2Name);
    }
    if (data.buyer2Address) {
      form.getTextField("text_81tjn")
        .setText(data.buyer2Address);
    }
    if (data.buyer2Phone) {
      form.getTextField("txtb2_phone1")
        .setText(data.buyer2Phone);
    }
    if (data.buyer2Fax) {
      form.getTextField("txtb2_fax")
        .setText(data.buyer2Fax);
    }
    if (data.buyer2Email) {
      form.getTextField("txtb2_email")
        .setText(data.buyer2Email);
    }
    if (data.brokerageName) {
      form.getTextField("txts_broker")
        .setText(data.brokerageName);
    }
    if (data.brokerageAddress) {
      form.getTextField("text_82cvpz")
        .setText(data.brokerageAddress);
    }
    if (data.brokeragePhone) {
      form.getTextField("txts_brkphone")
        .setText(data.brokeragePhone);
    }
    if (data.brokerageFax) {
      form.getTextField("txts_brkfax")
        .setText(data.brokerageFax);
    }
    if (data.brokerageEmail) {
      form.getTextField("txts_brkemail")
        .setText(data.brokerageEmail);
    }
    if (data.repName) {
      form.getTextField("txts_brkagent")
        .setText(data.repName);
    }
    if (data.repPhone) {
      form.getTextField("txts_brkagentph")
        .setText(data.repPhone);
    }
    if (data.repFax) {
      form.getTextField("txts_brkagentfax")
        .setText(data.repFax);
    }
    if (data.repEmail) {
      form.getTextField("txts_brkagentemail")
        .setText(data.repEmail);
    }
    if (data.buyersig1) {
      form.getTextField("txtbuyersig1")
        .setText(data.buyersig1);
    }
    if (data.buyersig2) {
      form.getTextField("txtbuyersig2")
        .setText(data.buyersig2);
    }
    if (data.witness1sig) {
      form.getTextField("txtWitness1Sig")
        .setText(data.witness1sig);
    }
    if (data.witness2sig) {
      form.getTextField("txtWitness2Sig")
        .setText(data.witness2sig);
    }
    if (data.agentsig) {
      form.getTextField("txts_brkagentsig")
        .setText(data.agentsig);
    }
    form.updateFieldAppearances(font);
    form.flatten();
    const pdfBytes = await pdfDoc.save({
      updateFieldAppearances: true
    });
    const outputDir = path.join(process.cwd(), "generated-pdfs");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(
      outputDir,
      `BuyerAgreement-${partyId}.pdf`
    );
    fs.writeFileSync(outputPath, pdfBytes);
    return res.json({
      success: true,
      message: "Buyer Agreement saved successfully."
    });
  } catch (error) {
    console.error("❌ ERROR:", error.response?.data || error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});


router.post("/send-buyer-representation-for-signature", async (req, res) => {
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
       GET SAVED BUYER AGREEMENT
    =============================== */
    const data = await BuyerAgreement.findOne({ partyId });
    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Buyer Agreement not found"
      });
    }
    console.log("Party Email:", party.email);
    console.log("Transaction User:", transactionUser?.email);
    /* ===============================
       GENERATE PDF
    =============================== */
    const existingPdfBytes = fs.readFileSync(PDF_PATH);
    const pdfDoc = await PDFDocument.load(existingPdfBytes, {
      ignoreEncryption: true
    });
    const form = pdfDoc.getForm();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    if (data.agreementNumber) {
      form.getTextField("txtagreementNum")
        .setText(data.agreementNumber);
    }
    if (data.brokerageName1) {
      form.getTextField("txts_broker")
        .setText(data.brokerageName1);
    }
    if (data.brokerageName2) {
      form.getTextField("txts2_broker_ABC")
        .setText(data.brokerageName2);
    }
    if (data.buyerName1) {
      form.getTextField("txtbuyer1")
        .setText(data.buyerName1);
    }
    if (data.buyerName2) {
      form.getTextField("txtbuyer2")
        .setText(data.buyerName2);
    }
    if (data.propertyType) {
      form.getTextField("txtPropType")
        .setText(data.propertyType);
    }
    if (data.marketAreas) {
      form.getTextField("txtMarketArea")
        .setText(data.marketAreas);
    }
    if (data.designatedAgentName) {
      form.getTextField("txtNOMAPDesAgents")
        .setText(data.designatedAgentName);
    }
    if (data.startDate) {
      form.getTextField("txtp_ContractDateABC_m")
        .setText(data.startDate);
    }
    if (data.startYear) {
      form.getTextField("txtp_ContractDateABC_yy")
        .setText(data.startYear);
    }
    if (data.startTime) {
      form.getTextField("txtContractTime")
        .setText(data.startTime);
    }
    if (data.endDate) {
      form.getTextField("txtp_expiredate_mmmm")
        .setText(data.endDate);
    }
    if (data.endYear) {
      form.getTextField("txtp_expiredate_yy")
        .setText(data.endYear);
    }
    if (data.endTime) {
      form.getTextField("txtExpireTime")
        .setText(data.endTime);
    }
    if (data.agentServices) {
      form.getTextField("txtServices")
        .setText(data.agentServices);
    }
    if (data.daysAfterAgreement) {
      form.getTextField("txtCopyDays")
        .setText(data.daysAfterAgreement);
    }
    if (data.ourFee) {
      const maxLengthLine1 = 120;
      let words = data.ourFee.trim().split(" ");
      let line1 = "";
      let line2 = "";
      for (let i = 0; i < words.length; i++) {
        let testLine = line1
          ? line1 + " " + words[i]
          : words[i];

        if (testLine.length <= maxLengthLine1) {
          line1 = testLine;
        } else {
          line2 = words.slice(i).join(" ");
          break;
        }
      }
      form.getTextField("txtTheFee1").setText(line1);
      form.getTextField("txtTheFee2").setText(line2);
    }
    if (data.retainerAmount) {
      form.getTextField("txtFeeDeposit")
        .setText(data.retainerAmount);
    }
    if (data.retainerMonth) {
      form.getTextField("txtRetainerDate_m")
        .setText(data.retainerMonth);
    }
    if (data.retainerDay) {
      form.getTextField("txtRetainerDate_d")
        .setText(data.retainerDay);
    }
    if (data.retainerYear) {
      form.getTextField("txtRetainerDate_yy")
        .setText(data.retainerYear);
    }
    if (data.refundDays) {
      form.getTextField("txtRetainerDays")
        .setText(data.refundDays);
    }
    if (data.otherPaymentTerms) {
      const maxLengthLine1 = 80;
      let words = data.otherPaymentTerms.trim().split(" ");
      let line1 = "";
      let line2 = "";
      for (let i = 0; i < words.length; i++) {
        let testLine = line1
          ? line1 + " " + words[i]
          : words[i];

        if (testLine.length <= maxLengthLine1) {
          line1 = testLine;
        } else {
          line2 = words.slice(i).join(" ");
          break;
        }
      }
      form.getTextField("txtRetainerOther1").setText(line1);
      form.getTextField("txtRetainerOther2").setText(line2);
    }
    if (data.contractDaysAfterAgreement) {
      form.getTextField("txtBindingDays")
        .setText(data.contractDaysAfterAgreement);
    }
    if (data.paymentAfterPurchaseDays) {
      form.getTextField("txtFeeDays")
        .setText(data.paymentAfterPurchaseDays);
    }
    if (data.refundDifferenceDays) {
      form.getTextField("txtRefundDays")
        .setText(data.refundDifferenceDays);
    }
    if (data.differencePaymentDays) {
      form.getTextField("txtDifferenceDays")
        .setText(data.differencePaymentDays);
    }
    if (data.reasonableExpenses) {
      const max1 = 60;
      const max2 = 120;
      const max3 = 120;
      const words = data.reasonableExpenses
        .trim()
        .split(" ");

      let line1 = "";
      let line2 = "";
      let line3 = "";
      for (let word of words) {
        if ((line1 + " " + word).trim().length <= max1) {
          line1 += (line1 ? " " : "") + word;
        }
        else if ((line2 + " " + word).trim().length <= max2) {
          line2 += (line2 ? " " : "") + word;
        }
        else if ((line3 + " " + word).trim().length <= max3) {
          line3 += (line3 ? " " : "") + word;
        }
      }
      form.getTextField("txtExpenses1").setText(line1);
      form.getTextField("txtExpenses2").setText(line2);
      form.getTextField("txtExpenses3").setText(line3);
    }
    if (data.additionalTerms) {
      form.getTextField("txtAddTerms")
        .setText(data.additionalTerms);
    }
    if (data.attachedDocuments) {
      form.getTextField("txtDocuments")
        .setText(data.attachedDocuments);
    }
    if (data.buyer1Name) {
      form.getTextField("txtbuyer1")
        .setText(data.buyer1Name);
    }
    if (data.buyer1Address) {
      form.getTextField("text_80hvqn")
        .setText(data.buyer1Address);
    }
    if (data.buyer1Phone) {
      form.getTextField("txtb_phone1")
        .setText(data.buyer1Phone);
    }
    if (data.buyer1Fax) {
      form.getTextField("txtb_fax")
        .setText(data.buyer1Fax);
    }
    if (data.buyer1Email) {
      form.getTextField("txtb_email")
        .setText(data.buyer1Email);
    }
    if (data.buyer2Name) {
      form.getTextField("txtbuyer2")
        .setText(data.buyer2Name);
    }
    if (data.buyer2Address) {
      form.getTextField("text_81tjn")
        .setText(data.buyer2Address);
    }
    if (data.buyer2Phone) {
      form.getTextField("txtb2_phone1")
        .setText(data.buyer2Phone);
    }
    if (data.buyer2Fax) {
      form.getTextField("txtb2_fax")
        .setText(data.buyer2Fax);
    }
    if (data.buyer2Email) {
      form.getTextField("txtb2_email")
        .setText(data.buyer2Email);
    }
    if (data.brokerageName) {
      form.getTextField("txts_broker")
        .setText(data.brokerageName);
    }
    if (data.brokerageAddress) {
      form.getTextField("text_82cvpz")
        .setText(data.brokerageAddress);
    }
    if (data.brokeragePhone) {
      form.getTextField("txts_brkphone")
        .setText(data.brokeragePhone);
    }
    if (data.brokerageFax) {
      form.getTextField("txts_brkfax")
        .setText(data.brokerageFax);
    }
    if (data.brokerageEmail) {
      form.getTextField("txts_brkemail")
        .setText(data.brokerageEmail);
    }
    if (data.repName) {
      form.getTextField("txts_brkagent")
        .setText(data.repName);
    }
    if (data.repPhone) {
      form.getTextField("txts_brkagentph")
        .setText(data.repPhone);
    }
    if (data.repFax) {
      form.getTextField("txts_brkagentfax")
        .setText(data.repFax);
    }
    if (data.repEmail) {
      form.getTextField("txts_brkagentemail")
        .setText(data.repEmail);
    }
    if (data.buyersig1) {
      form.getTextField("txtbuyersig1")
        .setText(data.buyersig1);
    }
    if (data.buyer2Name) {
      form.getTextField("txtbuyersig2")
        .setText(data.buyer2Name);
    }
    if (data.witness1sig) {
      form.getTextField("txtWitness1Sig")
        .setText(data.witness1sig);
    }
    if (data.witness2sig) {
      form.getTextField("txtWitness2Sig")
        .setText(data.witness2sig);
    }
    if (data.agentsig) {
      form.getTextField("txts_brkagentsig")
        .setText(data.agentsig);
    }
    form.updateFieldAppearances(font);
    form.flatten();
    const pdfBytes = await pdfDoc.save({
      updateFieldAppearances: true
    });
    const accessToken = await getAccessToken();

    const signers = [];
    /* BUYER 1 */
    if (data.buyersig1 && data.buyerSignatureEmail1) {
      signers.push({
        email: data.buyerSignatureEmail1,
        name: data.buyersig1,
        recipientId: "1",
        routingOrder: "1",
        clientUserId: `${partyId}_buyer1`,
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

    /* BUYER 2 */
    console.log("name: ",data.buyer2Name);
    console.log("email: ",data.buyer2Email);
    if (data.buyer2Name && data.buyer2Email) {
      signers.push({
        email: data.buyer2Email,
        name: data.buyer2Name,
        recipientId: "2",
        routingOrder: "1",
        clientUserId: `${partyId}_buyer2`,
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
    if (data.witness1sig && data.witness1Email) {
      signers.push({
        email: data.witness1Email,
        name: data.witness1sig,
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
    if (data.witness2sig && data.witness2Email) {
      signers.push({
        email: data.witness2Email,
        name: data.witness2sig,
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

    /* AGENT */
    if (data.agentsig && data.agentEmail) {
      signers.push({
        email: data.agentEmail,
        name: data.agentsig,
        recipientId: "5",
        routingOrder: "1",
        clientUserId: `${partyId}_agent`,
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
    console.log("Buyer Agreement Signers:", signers);

    const envelopePayload = {
      emailSubject: "Please sign the Buyer Representation Agreement",
      documents: [
        {
          documentBase64: Buffer.from(pdfBytes).toString("base64"),
          name: "Buyer Representation Agreement.pdf",
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
    /* ===============================
       SAVE ENVELOPE + SIGNERS
    =============================== */
    await BuyerAgreement.findOneAndUpdate(
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
      // const signingLink = `https://realtorparth.ca/api/ebradapdf/start-sign/${partyId}?recipientId=${signer.recipientId}`;
      const signingLink = `https://realtorparth.ca/api/ebradapdf/start-sign/${partyId}/${signer.recipientId}`;

      await transporter.sendMail({
        from: `"RealtorParth" <hello@realtorparth.ca>`,
        to: signer.email,
        subject: "Buyer Representation Agreement Ready For Signature",
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
You have been requested to electronically sign the
<strong>Buyer Representation Agreement</strong>.
</p>

<p style="font-size:16px;color:#555;line-height:28px;">
Please review the document carefully and click the button below to complete your signature.
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
Sign Buyer Representation Agreement Document
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
    /* ===============================
      SUCCESS
    =============================== */
    return res.json({
      success: true,
      message: "Buyer Representation Agreement sent for signature successfully."
    });
  } catch (error) {
    console.error(
      "BUYER REPRESENTATION DOCUSIGN ERROR:",
      error.response?.data || error
    );
    return res.status(500).json({
      success: false,
      message:
        "Failed to send Buyer Representation Agreement for signature."
    });

  }
});



router.get("/start-sign/:partyId/:recipientId", async (req, res) => {
  try {

    const { partyId, recipientId } = req.params;
    // const { recipientId } = req.query;

    const buyerAgreement = await BuyerAgreement.findOne({
      partyId
    });

    if (!buyerAgreement) {
      return res
        .status(404)
        .send("Buyer Agreement not found.");
    }

    if (!buyerAgreement.envelopeId) {
      return res
        .status(400)
        .send("Envelope not created yet.");
    }

    if (
      !buyerAgreement.signers ||
      buyerAgreement.signers.length === 0
    ) {
      return res
        .status(400)
        .send("No signers found.");
    }

    /* ===============================
       FIND CURRENT SIGNER
    =============================== */

    const signer = buyerAgreement.signers.find(
      s => s.recipientId === recipientId
    );

    if (!signer) {
      return res
        .status(404)
        .send("Signer not found.");
    }

    const accessToken = await getAccessToken();

    /* ===============================
       CREATE RECIPIENT VIEW
    =============================== */

    const viewRes = await axios.post(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${buyerAgreement.envelopeId}/views/recipient`,
      {
        authenticationMethod: "none",

        email: signer.email,
        userName: signer.name,

        clientUserId: signer.clientUserId,

        returnUrl: `https://realtorparth.ca/api/ebradapdf/sign-complete/${partyId}?recipientId=${recipientId}`
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
      "BUYER AGREEMENT START SIGN ERROR:",
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
    console.log("========== BUYER AGREEMENT SIGN COMPLETE ==========");
    console.log("Party ID:", partyId);
    console.log("Recipient ID:", recipientId);
    /* ===============================
       BUYER AGREEMENT
    =============================== */
    const buyerAgreement = await BuyerAgreement.findOne({partyId});
    if (!buyerAgreement) {
      return res
        .status(404)
        .send("Buyer Agreement not found.");
    }
    /* ===============================
       UPDATE SIGNING STATUS
    =============================== */
    let signerName = "";
    switch (recipientId) {
      case "1":
        buyerAgreement.buyer1Signed = true;
        buyerAgreement.buyer1SignedAt = new Date();
        signerName = buyerAgreement.buyersig1;
        break;
      case "2":
        buyerAgreement.buyer2Signed = true;
        buyerAgreement.buyer2SignedAt = new Date();
        signerName = buyerAgreement.buyersig2;
        break;
      case "3":
        buyerAgreement.witness1Signed = true;
        buyerAgreement.witness1SignedAt = new Date();
        signerName = buyerAgreement.witness1sig;
        break;
      case "4":
        buyerAgreement.witness2Signed = true;
        buyerAgreement.witness2SignedAt = new Date();
        signerName = buyerAgreement.witness2sig;
        break;
      case "5":
        buyerAgreement.agentSigned = true;
        buyerAgreement.agentSignedAt = new Date();
        signerName = buyerAgreement.agentsig;
        break;
      default:
        console.log("Unknown recipient.");
    }
    /* ===============================
       PREVENT DUPLICATE EMAIL
       (ONLY AFTER EVERYONE SIGNED)
    =============================== */
    const everyoneSigned =
      buyerAgreement.buyer1Signed &&
      (
        !buyerAgreement.buyersig2 ||
        buyerAgreement.buyer2Signed
      ) &&
      (
        !buyerAgreement.witness1sig ||
        buyerAgreement.witness1Signed
      ) &&
      (
        !buyerAgreement.witness2sig ||
        buyerAgreement.witness2Signed
      ) &&
      (
        !buyerAgreement.agentsig ||
        buyerAgreement.agentSigned
      );
    if (
      buyerAgreement.completedEmailSent &&
      everyoneSigned
    ) {
      console.log("Notification already sent.");
      return res.redirect(
        "https://realtorparth.ca/signature-complete"
      );
    }
    /* ===============================
       PARTY
    =============================== */
    const party = await TransactionParty.findById(partyId);
    if (!party) {
      return res
        .status(404)
        .send("Party not found.");
    }
    /* ===============================
       TRANSACTION USER
    =============================== */
    const transactionUser = await TransactionUser.findById(party.userId);
    if (!transactionUser) {
      return res
        .status(404)
        .send("Transaction User not found.");
    }
    console.log(`${signerName} completed signing.`);
    console.log(
      "Agent notification:",
      transactionUser.email
    );
    /* ===============================
       SEND AGENT EMAIL
    =============================== */
    if (everyoneSigned) {
      await transporter.sendMail({
        from: `"RealtorParth" <hello@realtorparth.ca>`,
        to: transactionUser.email,
        subject: "Buyer Representation Agreement Fully Signed",
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
Buyer Representation Agreement Completed
</h2>

<p style="font-size:16px;color:#555;line-height:28px;">
All required parties have completed signing the
<strong>Buyer Representation Agreement</strong>.
</p>

<table
width="100%"
cellpadding="10"
cellspacing="0"
style="margin:30px 0;border-collapse:collapse;border:1px solid #e5e7eb;"
>

<tr>
<td style="font-weight:600;width:180px;">Client</td>
<td>${party.name}</td>
</tr>

<tr>
<td style="font-weight:600;">Document</td>
<td>Buyer Representation Agreement</td>
</tr>

<tr>
<td style="font-weight:600;">Completed</td>
<td>${new Date().toLocaleString("en-CA", {
          dateStyle: "long",
          timeStyle: "short"
        })}</td>
</tr>

</table>

<p>
Every required signer has successfully completed the signing process.
</p>

<p>
Regards,<br>
<strong>RealtorParth Team</strong>
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
      /* ===============================
         OPTIONAL WITNESS EMAILS
      =============================== */
      if (buyerAgreement.witness1Email && buyerAgreement.witness1sig) {
        await transporter.sendMail({
          from: `"RealtorParth" <hello@realtorparth.ca>`,
          to: buyerAgreement.witness1Email,
          subject: "Buyer Representation Agreement Completed",
          html: `
            <p>Hello ${buyerAgreement.witness1sig},</p>

            <p>
            The Buyer Representation Agreement has now been fully signed by all required parties.
            </p>

            <p>Thank you.</p>

            <p><strong>RealtorParth Team</strong></p>
          `
        });
      }
      if (buyerAgreement.witness2Email && buyerAgreement.witness2sig) {
        await transporter.sendMail({
          from: `"RealtorParth" <hello@realtorparth.ca>`,
          to: buyerAgreement.witness2Email,
          subject: "Buyer Representation Agreement Completed",
          html: `
            <p>Hello ${buyerAgreement.witness2sig},</p>

            <p>
            The Buyer Representation Agreement has now been fully signed by all required parties.
            </p>

            <p>Thank you.</p>

            <p><strong>RealtorParth Team</strong></p>
          `
        });
      }
    }
    /* ===============================
       SAVE COMPLETION STATUS
    =============================== */
    if (everyoneSigned) {
      buyerAgreement.completedEmailSent = true;
    }
    await buyerAgreement.save();
    console.log("Buyer Agreement updated successfully.");
    return res.redirect(
      "https://realtorparth.ca/signature-complete"
    );
  } catch (err) {
    console.error(
      "========== BUYER AGREEMENT SIGN COMPLETE ERROR =========="
    );
    console.error(err.response?.data || err);
    return res.redirect("https://realtorparth.ca/signature-complete");

  }
});








// router.post("/send-buyer-representation-for-signature", async (req, res) => {
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
//        GET SAVED BUYER AGREEMENT
//     =============================== */
//     const data = await BuyerAgreement.findOne({ partyId });
//     if (!data) {
//       return res.status(404).json({
//         success: false,
//         message: "Buyer Agreement not found"
//       });
//     }
//     console.log("Party Email:", party.email);
//     console.log("Transaction User:", transactionUser?.email);
//     /* ===============================
//        GENERATE PDF
//     =============================== */
//     const existingPdfBytes = fs.readFileSync(PDF_PATH);
//     const pdfDoc = await PDFDocument.load(existingPdfBytes, {
//       ignoreEncryption: true
//     });
//     const form = pdfDoc.getForm();
//     const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
//     if (data.agreementNumber) {
//       form.getTextField("txtagreementNum")
//         .setText(data.agreementNumber);
//     }
//     if (data.brokerageName1) {
//       form.getTextField("txts_broker")
//         .setText(data.brokerageName1);
//     }
//     if (data.brokerageName2) {
//       form.getTextField("txts2_broker_ABC")
//         .setText(data.brokerageName2);
//     }
//     if (data.buyerName1) {
//       form.getTextField("txtbuyer1")
//         .setText(data.buyerName1);
//     }
//     if (data.buyerName2) {
//       form.getTextField("txtbuyer2")
//         .setText(data.buyerName2);
//     }

//     if (data.propertyType) {
//       form.getTextField("txtPropType")
//         .setText(data.propertyType);
//     }
//     if (data.marketAreas) {
//       form.getTextField("txtMarketArea")
//         .setText(data.marketAreas);
//     }
//     if (data.designatedAgentName) {
//       form.getTextField("txtNOMAPDesAgents")
//         .setText(data.designatedAgentName);
//     }
//     if (data.startDate) {
//       form.getTextField("txtp_ContractDateABC_m")
//         .setText(data.startDate);
//     }
//     if (data.startYear) {
//       form.getTextField("txtp_ContractDateABC_yy")
//         .setText(data.startYear);
//     }
//     if (data.startTime) {
//       form.getTextField("txtContractTime")
//         .setText(data.startTime);
//     }
//     if (data.endDate) {
//       form.getTextField("txtp_expiredate_mmmm")
//         .setText(data.endDate);
//     }
//     if (data.endYear) {
//       form.getTextField("txtp_expiredate_yy")
//         .setText(data.endYear);
//     }
//     if (data.endTime) {
//       form.getTextField("txtExpireTime")
//         .setText(data.endTime);
//     }
//     if (data.agentServices) {
//       form.getTextField("txtServices")
//         .setText(data.agentServices);
//     }
//     if (data.daysAfterAgreement) {
//       form.getTextField("txtCopyDays")
//         .setText(data.daysAfterAgreement);
//     }
//     if (data.ourFee) {
//       const maxLengthLine1 = 120; // adjust based on PDF field width
//       let words = data.ourFee.trim().split(" ");
//       let line1 = "";
//       let line2 = "";
//       for (let i = 0; i < words.length; i++) {
//         let testLine = line1 ? line1 + " " + words[i] : words[i];
//         if (testLine.length <= maxLengthLine1) {
//           line1 = testLine;
//         } else {
//           // Word doesn't fit → move it and rest to line2
//           line2 = words.slice(i).join(" ");
//           break;
//         }
//       }
//       form.getTextField("txtTheFee1").setText(line1);
//       form.getTextField("txtTheFee2").setText(line2);
//     }
//     if (data.retainerAmount) {
//       form.getTextField("txtFeeDeposit")
//         .setText(data.retainerAmount);
//     }
//     if (data.retainerMonth) {
//       form.getTextField("txtRetainerDate_m")
//         .setText(data.retainerMonth);
//     }
//     if (data.retainerDay) {
//       form.getTextField("txtRetainerDate_d")
//         .setText(data.retainerDay);
//     }
//     if (data.retainerYear) {
//       form.getTextField("txtRetainerDate_yy")
//         .setText(data.retainerYear);
//     }
//     if (data.refundDays) {
//       form.getTextField("txtRetainerDays")
//         .setText(data.refundDays);
//     }
//     if (data.otherPaymentTerms) {
//       const maxLengthLine1 = 80; // adjust based on PDF field width
//       let words = data.otherPaymentTerms.trim().split(" ");
//       let line1 = "";
//       let line2 = "";
//       for (let i = 0; i < words.length; i++) {
//         let testLine = line1 ? line1 + " " + words[i] : words[i];
//         if (testLine.length <= maxLengthLine1) {
//           line1 = testLine;
//         } else {
//           // Word doesn't fit → move it and rest to line2
//           line2 = words.slice(i).join(" ");
//           break;
//         }
//       }
//       form.getTextField("txtRetainerOther1").setText(line1);
//       form.getTextField("txtRetainerOther2").setText(line2);
//     }
//     if (data.contractDaysAfterAgreement) {
//       form.getTextField("txtBindingDays")
//         .setText(data.contractDaysAfterAgreement);
//     }
//     if (data.paymentAfterPurchaseDays) {
//       form.getTextField("txtFeeDays")
//         .setText(data.paymentAfterPurchaseDays);
//     }
//     if (data.refundDifferenceDays) {
//       form.getTextField("txtRefundDays")
//         .setText(data.refundDifferenceDays);
//     }
//     if (data.differencePaymentDays) {
//       form.getTextField("txtDifferenceDays")
//         .setText(data.differencePaymentDays);
//     }
//     if (data.reasonableExpenses) {
//       const max1 = 60;
//       const max2 = 120;
//       const max3 = 120;
//       const words = data.reasonableExpenses.trim().split(" ");
//       let line1 = "";
//       let line2 = "";
//       let line3 = "";
//       for (let word of words) {
//         if ((line1 + " " + word).trim().length <= max1) {
//           line1 += (line1 ? " " : "") + word;
//         }
//         else if ((line2 + " " + word).trim().length <= max2) {
//           line2 += (line2 ? " " : "") + word;
//         }
//         else if ((line3 + " " + word).trim().length <= max3) {
//           line3 += (line3 ? " " : "") + word;
//         }
//       }
//       form.getTextField("txtExpenses1").setText(line1);
//       form.getTextField("txtExpenses2").setText(line2);
//       form.getTextField("txtExpenses3").setText(line3);
//     }
//     if (data.additionalTerms) {
//       form.getTextField("txtAddTerms")
//         .setText(data.additionalTerms);
//     }
//     if (data.attachedDocuments) {
//       form.getTextField("txtDocuments")
//         .setText(data.attachedDocuments);
//     }
//     if (data.buyer1Name) {
//       form.getTextField("txtbuyer1")
//         .setText(data.buyer1Name);
//     }
//     if (data.buyer1Address) {
//       form.getTextField("text_80hvqn")
//         .setText(data.buyer1Address);
//     }
//     if (data.buyer1Phone) {
//       form.getTextField("txtb_phone1")
//         .setText(data.buyer1Phone);
//     }
//     if (data.buyer1Fax) {
//       form.getTextField("txtb_fax")
//         .setText(data.buyer1Fax);
//     }
//     if (data.buyer1Email) {
//       form.getTextField("txtb_email")
//         .setText(data.buyer1Email);
//     }
//     if (data.buyer2Name) {
//       form.getTextField("txtbuyer2")
//         .setText(data.buyer2Name);
//     }
//     if (data.buyer2Address) {
//       form.getTextField("text_81tjn")
//         .setText(data.buyer2Address);
//     }
//     if (data.buyer2Phone) {
//       form.getTextField("txtb2_phone1")
//         .setText(data.buyer2Phone);
//     }
//     if (data.buyer2Fax) {
//       form.getTextField("txtb2_fax")
//         .setText(data.buyer2Fax);
//     }
//     if (data.buyer2Email) {
//       form.getTextField("txtb2_email")
//         .setText(data.buyer2Email);
//     }
//     if (data.brokerageName) {
//       form.getTextField("txts_broker")
//         .setText(data.brokerageName);
//     }
//     if (data.brokerageAddress) {
//       form.getTextField("text_82cvpz")
//         .setText(data.brokerageAddress);
//     }
//     if (data.brokeragePhone) {
//       form.getTextField("txts_brkphone")
//         .setText(data.brokeragePhone);
//     }
//     if (data.brokerageFax) {
//       form.getTextField("txts_brkfax")
//         .setText(data.brokerageFax);
//     }
//     if (data.brokerageEmail) {
//       form.getTextField("txts_brkemail")
//         .setText(data.brokerageEmail);
//     }
//     if (data.repName) {
//       form.getTextField("txts_brkagent")
//         .setText(data.repName);
//     }
//     if (data.repPhone) {
//       form.getTextField("txts_brkagentph")
//         .setText(data.repPhone);
//     }
//     if (data.repFax) {
//       form.getTextField("txts_brkagentfax")
//         .setText(data.repFax);
//     }
//     if (data.repEmail) {
//       form.getTextField("txts_brkagentemail")
//         .setText(data.repEmail);
//     }
//     if (data.buyersig1) {
//       form.getTextField("txtbuyersig1")
//         .setText(data.buyersig1);
//     }
//     if (data.buyersig2) {
//       form.getTextField("txtbuyersig2")
//         .setText(data.buyersig2);
//     }
//     if (data.witness1sig) {
//       form.getTextField("txtWitness1Sig")
//         .setText(data.witness1sig);
//     }
//     if (data.witness2sig) {
//       form.getTextField("txtWitness2Sig")
//         .setText(data.witness2sig);
//     }
//     if (data.agentsig) {
//       form.getTextField("txts_brkagentsig")
//         .setText(data.agentsig);
//     }
//     form.updateFieldAppearances(font);
//     form.flatten();
//     const pdfBytes = await pdfDoc.save({
//       updateFieldAppearances: true
//     });
//     const accessToken = await getAccessToken();

//     const signers = [];
//     const baseEmail = party.email;
//     const [name, domain] = baseEmail.split("@");
//     const buyer1Email = baseEmail;
//     const buyer2Email = `${name}+buyer2@${domain}`;
//     /* BUYER 1 */
//     if (data.buyersig1) {
//       signers.push({
//         email: buyer1Email,
//         name: data.buyersig1,
//         recipientId: "1",
//         routingOrder: "1",
//         clientUserId: `${partyId}_buyer1`,
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
//     /* BUYER 2 */
//     if (data.buyersig2) {
//       signers.push({
//         email: buyer2Email,
//         name: data.buyersig2,
//         recipientId: "2",
//         routingOrder: "2",
//         clientUserId: `${partyId}_buyer2`,
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
//     if (data.agentsig && transactionUser?.email) {
//       signers.push({
//         email: transactionUser.email,
//         name: data.agentsig,
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
//     console.log("Buyer Agreement Signers:", signers);
//     const envelopePayload = {
//       emailSubject: "Please sign the Buyer Representation Agreement",
//       documents: [
//         {
//           documentBase64: Buffer.from(pdfBytes).toString("base64"),
//           name: "Buyer Representation Agreement.pdf",
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
//     await BuyerAgreement.findOneAndUpdate(
//       { partyId },
//       {
//         envelopeId,
//         signers: signers.map(s => ({
//           recipientId: s.recipientId,
//           clientUserId: s.clientUserId || null,
//           email: s.email,
//           name: s.name,
//           routingOrder: s.routingOrder
//         }))
//       }
//     );
//     const signingLink = `https://realtorparth.ca/api/ebradapdf/start-sign/${partyId}`;
//     await transporter.sendMail({
//       from: `"RealtorParth" <hello@realtorparth.ca>`,
//       to: party.email,
//       subject: "Buyer Representation Agreement Ready For Signature",
//       html: `
//         <!DOCTYPE html>
//         <html>
//         <head>
//         <meta charset="UTF-8" />
//         </head>

//         <body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">

//         <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
//         <tr>
//         <td align="center">

//         <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.08);">

//         <tr>
//         <td style="background:#0f4c81;padding:28px;text-align:center;">
//         <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;">
//         RealtorParth
//         </h1>
//         </td>
//         </tr>

//         <tr>
//         <td style="padding:40px;">

//         <h2 style="margin-top:0;color:#222;font-size:26px;">
//         Hello ${data.buyersig1},
//         </h2>

//         <p style="font-size:16px;color:#555;line-height:28px;">
//         Your <strong>Buyer Representation Agreement</strong> document has been prepared and is now ready for your electronic signature.
//         </p>

//         <p style="font-size:16px;color:#555;line-height:28px;">
//         Please review the document carefully and complete your signature by clicking the button below.
//         </p>

//         <table width="100%" cellpadding="0" cellspacing="0" style="margin:35px 0;">
//         <tr>
//         <td align="center">

//         <a href="${signingLink}"
//         style="
//         background:#0f4c81;
//         color:#ffffff;
//         text-decoration:none;
//         padding:16px 36px;
//         border-radius:8px;
//         display:inline-block;
//         font-size:16px;
//         font-weight:600;
//         ">
//         Sign Buyer Representation Agreement
//         </a>

//         </td>
//         </tr>
//         </table>

//         <div style="background:#f8f9fb;border-left:4px solid #0f4c81;padding:18px;border-radius:6px;">
//         <p style="margin:0;color:#555;font-size:15px;line-height:24px;">
//         If the button above does not work, copy and paste the following link into your browser:
//         </p>

//         <p style="margin-top:12px;word-break:break-all;">
//         <a href="${signingLink}" style="color:#0f4c81;">
//         ${signingLink}
//         </a>
//         </p>
//         </div>

//         <p style="margin-top:35px;font-size:15px;color:#555;line-height:26px;">
//         If you have any questions regarding this document, please contact your Realtor before signing.
//         </p>

//         <p style="margin-top:35px;font-size:16px;color:#222;">
//         Kind Regards,<br>
//         <strong>RealtorParth Team</strong>
//         </p>

//         </td>
//         </tr>

//         <tr>
//         <td style="background:#f7f7f7;padding:22px;text-align:center;color:#777;font-size:13px;line-height:22px;">
//         This is an automated email from RealtorParth.<br>
//         Please do not reply directly to this email.
//         </td>
//         </tr>

//         </table>

//         </td>
//         </tr>
//         </table>

//         </body>
//         </html>
//         `
//     });
//     return res.json({
//       success: true,
//       message: "Email sent successfully."
//     });
//   } catch (error) {
//     console.error(
//       "BUYER REPRESENTATION DOCUSIGN ERROR:",
//       error.response?.data || error
//     );
//     res.status(500).json({
//       success: false,
//       message: "Failed to send Buyer Representation Agreement for signature."
//     });
//   }
// });


// router.get("/start-sign/:partyId", async (req, res) => {
//   try {
//     const { partyId } = req.params;

//     const buyerAgreement = await BuyerAgreement.findOne({ partyId });

//     if (!buyerAgreement) {
//       return res.status(404).send("Buyer Agreement not found.");
//     }

//     if (!buyerAgreement.envelopeId) {
//       return res.status(400).send("Envelope not created yet.");
//     }

//     if (
//       !buyerAgreement.signers ||
//       buyerAgreement.signers.length === 0
//     ) {
//       return res.status(400).send("No signers found.");
//     }

//     /* ===============================
//        FIRST SIGNER (BUYER 1)
//     =============================== */

//     const signer =
//       buyerAgreement.signers.find(
//         s => s.recipientId === "1"
//       ) || buyerAgreement.signers[0];

//     const accessToken = await getAccessToken();

//     /* ===============================
//        CREATE RECIPIENT VIEW
//     =============================== */

//     const viewRes = await axios.post(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${buyerAgreement.envelopeId}/views/recipient`,
//       {
//         authenticationMethod: "none",

//         email: signer.email,
//         userName: signer.name,

//         clientUserId: signer.clientUserId,

//         returnUrl: `https://realtorparth.ca/api/ebradapdf/sign-complete/${partyId}`
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
//       "BUYER AGREEMENT START SIGN ERROR:",
//       error.response?.data || error
//     );

//     return res.status(500).send("Unable to start signing.");

//   }
// });



// router.get("/sign-complete/:partyId", async (req, res) => {
//   try {
//     const { partyId } = req.params;

//     console.log("========== BUYER AGREEMENT SIGN COMPLETE ==========");
//     console.log("Party ID:", partyId);

//     // ----------------------------------------------------
//     // Buyer Agreement
//     // ----------------------------------------------------
//     const buyerAgreement = await BuyerAgreement.findOne({ partyId });

//     if (!buyerAgreement) {
//       return res.status(404).send("Buyer Agreement not found.");
//     }

//     // Prevent duplicate emails
//     if (buyerAgreement.completedEmailSent) {
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
//     // Transaction User (Admin / Agent)
//     // ----------------------------------------------------
//     const transactionUser = await TransactionUser.findById(
//       party.userId
//     );

//     if (!transactionUser) {
//       return res.status(404).send("Transaction User not found.");
//     }

//     console.log("Sending notification to:", transactionUser.email);

//     // ----------------------------------------------------
//     // Send Simple Notification Email
//     // ----------------------------------------------------
//     await transporter.sendMail({
//       from: `"RealtorParth" <hello@realtorparth.ca>`,
//       to: transactionUser.email,
//       subject: "Buyer Representation Agreement Signed by Client",

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
// Buyer Signature Completed
// </h2>

// <p style="font-size:16px;color:#555;line-height:28px;">
// The client has successfully completed their electronic signature for the
// <strong>Buyer Representation Agreement</strong>.
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
// <td style="color:#555;">Buyer Representation Agreement</td>
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
// This is an automated notification confirming that the client has completed their portion of the signing process for the Buyer Representation Agreement.
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
//     buyerAgreement.completedEmailSent = true;
//     await buyerAgreement.save();

//     console.log("completedEmailSent updated");

//     return res.redirect(
//       "https://realtorparth.ca/signature-complete"
//     );

//   } catch (err) {

//     console.error("========== BUYER AGREEMENT SIGN COMPLETE ERROR ==========");
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
        // returnUrl: `${process.env.FRONTEND_URL}/sign-redirect?partyId=${partyId}&type=ebrada`,
        returnUrl: `http://localhost:5173/sign-redirect?partyId=${partyId}&type=ebrada`,
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

    console.log("📄 Envelope:", envelopeId);
    console.log("⏳ Status:", status);

    /* ===============================
       📄 DOWNLOAD PDF + SUMMARY
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

    // ✅ Certificate (summary PDF)
    const certRes = await axios.get(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/certificate`,
      {
        responseType: "arraybuffer",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    console.log("📄 PDF + Summary downloaded");

    /* ===============================
       📧 SEND EMAIL (BACKGROUND)
    =============================== */
    (async () => {
      try {
        const party = await TransactionParty.findById(partyId);
        const transactionUser = await TransactionUser.findById(party.userId);

        console.log("📧 Sending final email to:", transactionUser?.email);

        if (transactionUser?.email) {
          await sendSignedPdfEmail(
            transactionUser.email,
            pdfRes.data,
            certRes.data
          );
          console.log("✅ Final email sent");
        } else {
          console.warn("⚠️ No transaction user email found");
        }
      } catch (err) {
        console.error("❌ Email error:", err);
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

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).send("Download error");
  }
});



export default router;











































// router.post("/buyeragreement/generate-pdf", async (req, res) => {
//   try {
//     const { partyId, sendEmail = false, isAdmin = false, ...data } = req.body;
//     delete data._id;
//     /* ===============================
//        VALIDATION
//     =============================== */
//     if (!partyId) {
//       return res.status(400).json({
//         success: false,
//         message: "partyId is required",
//       });
//     }
//     /* ===============================
//        VERIFY PARTY EXISTS
//     =============================== */
//     const party = await TransactionParty.findById(partyId);
//     if (!party) {
//       return res.json({
//         success: false,
//         message: "Invalid party",
//       });
//     }
//     const transactinuser = await TransactionUser.findById(party.userId);
//     /* ===============================
//        SAVE / UPDATE (PER PARTY)
//     =============================== */
//     await BuyerAgreement.findOneAndUpdate(
//       { partyId }, // 🔥 MAIN FIX
//       {
//         ...data,
//         partyId,
//         transactionId: party.transactionId // ✅ optional but useful
//       },
//       {
//         new: true,
//         upsert: true,
//       }
//     );
//     // ⚠️ TODO: Replace with your real PDF logic
//     // For now dummy response

//     const existingPdfBytes = fs.readFileSync(PDF_PATH);
//     const pdfDoc = await PDFDocument.load(existingPdfBytes, {
//       ignoreEncryption: true
//     });
//     const form = pdfDoc.getForm();
//     const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
//     /* =====================================================
//        SECTION A – BASIC INFO
//     ===================================================== */
//     // Property Address (split example if needed)
//     if (data.agreementNumber) {
//       form.getTextField("txtagreementNum")
//         .setText(data.agreementNumber);
//     }
//     if (data.brokerageName1) {
//       form.getTextField("txts_broker")
//         .setText(data.brokerageName1);
//     }
//     if (data.brokerageName2) {
//       form.getTextField("txts2_broker_ABC")
//         .setText(data.brokerageName2);
//     }
//     if (data.buyerName1) {
//       form.getTextField("txtbuyer1")
//         .setText(data.buyerName1);
//     }
//     if (data.buyerName2) {
//       form.getTextField("txtbuyer2")
//         .setText(data.buyerName2);
//     }

//     if (data.propertyType) {
//       form.getTextField("txtPropType")
//         .setText(data.propertyType);
//     }
//     if (data.marketAreas) {
//       form.getTextField("txtMarketArea")
//         .setText(data.marketAreas);
//     }
//     if (data.designatedAgentName) {
//       form.getTextField("txtNOMAPDesAgents")
//         .setText(data.designatedAgentName);
//     }

//     if (data.startDate) {
//       form.getTextField("txtp_ContractDateABC_m")
//         .setText(data.startDate);
//     }

//     if (data.startYear) {
//       form.getTextField("txtp_ContractDateABC_yy")
//         .setText(data.startYear);
//     }

//     if (data.startTime) {
//       form.getTextField("txtContractTime")
//         .setText(data.startTime);
//     }

//     if (data.endDate) {
//       form.getTextField("txtp_expiredate_mmmm")
//         .setText(data.endDate);
//     }

//     if (data.endYear) {
//       form.getTextField("txtp_expiredate_yy")
//         .setText(data.endYear);
//     }

//     if (data.endTime) {
//       form.getTextField("txtExpireTime")
//         .setText(data.endTime);
//     }

//     if (data.agentServices) {
//       form.getTextField("txtServices")
//         .setText(data.agentServices);
//     }

//     if (data.daysAfterAgreement) {
//       form.getTextField("txtCopyDays")
//         .setText(data.daysAfterAgreement);
//     }

//     if (data.ourFee) {
//       const maxLengthLine1 = 120; // adjust based on PDF field width
//       let words = data.ourFee.trim().split(" ");
//       let line1 = "";
//       let line2 = "";
//       for (let i = 0; i < words.length; i++) {
//         let testLine = line1 ? line1 + " " + words[i] : words[i];
//         if (testLine.length <= maxLengthLine1) {
//           line1 = testLine;
//         } else {
//           // Word doesn't fit → move it and rest to line2
//           line2 = words.slice(i).join(" ");
//           break;
//         }
//       }
//       form.getTextField("txtTheFee1").setText(line1);
//       form.getTextField("txtTheFee2").setText(line2);
//     }
//     if (data.retainerAmount) {
//       form.getTextField("txtFeeDeposit")
//         .setText(data.retainerAmount);
//     }
//     if (data.retainerMonth) {
//       form.getTextField("txtRetainerDate_m")
//         .setText(data.retainerMonth);
//     }

//     if (data.retainerDay) {
//       form.getTextField("txtRetainerDate_d")
//         .setText(data.retainerDay);
//     }

//     if (data.retainerYear) {
//       form.getTextField("txtRetainerDate_yy")
//         .setText(data.retainerYear);
//     }

//     if (data.refundDays) {
//       form.getTextField("txtRetainerDays")
//         .setText(data.refundDays);
//     }

//     if (data.otherPaymentTerms) {
//       const maxLengthLine1 = 80; // adjust based on PDF field width
//       let words = data.otherPaymentTerms.trim().split(" ");
//       let line1 = "";
//       let line2 = "";
//       for (let i = 0; i < words.length; i++) {
//         let testLine = line1 ? line1 + " " + words[i] : words[i];
//         if (testLine.length <= maxLengthLine1) {
//           line1 = testLine;
//         } else {
//           // Word doesn't fit → move it and rest to line2
//           line2 = words.slice(i).join(" ");
//           break;
//         }
//       }
//       form.getTextField("txtRetainerOther1").setText(line1);
//       form.getTextField("txtRetainerOther2").setText(line2);
//     }

//     if (data.contractDaysAfterAgreement) {
//       form.getTextField("txtBindingDays")
//         .setText(data.contractDaysAfterAgreement);
//     }

//     if (data.paymentAfterPurchaseDays) {
//       form.getTextField("txtFeeDays")
//         .setText(data.paymentAfterPurchaseDays);
//     }

//     if (data.refundDifferenceDays) {
//       form.getTextField("txtRefundDays")
//         .setText(data.refundDifferenceDays);
//     }

//     if (data.differencePaymentDays) {
//       form.getTextField("txtDifferenceDays")
//         .setText(data.differencePaymentDays);
//     }

//     if (data.reasonableExpenses) {
//       const max1 = 60;
//       const max2 = 120;
//       const max3 = 120;
//       const words = data.reasonableExpenses.trim().split(" ");
//       let line1 = "";
//       let line2 = "";
//       let line3 = "";
//       for (let word of words) {
//         if ((line1 + " " + word).trim().length <= max1) {
//           line1 += (line1 ? " " : "") + word;
//         }
//         else if ((line2 + " " + word).trim().length <= max2) {
//           line2 += (line2 ? " " : "") + word;
//         }
//         else if ((line3 + " " + word).trim().length <= max3) {
//           line3 += (line3 ? " " : "") + word;
//         }
//       }
//       form.getTextField("txtExpenses1").setText(line1);
//       form.getTextField("txtExpenses2").setText(line2);
//       form.getTextField("txtExpenses3").setText(line3);
//     }

//     if (data.additionalTerms) {
//       form.getTextField("txtAddTerms")
//         .setText(data.additionalTerms);
//     }

//     if (data.attachedDocuments) {
//       form.getTextField("txtDocuments")
//         .setText(data.attachedDocuments);
//     }

//     if (data.buyer1Name) {
//       form.getTextField("txtbuyer1")
//         .setText(data.buyer1Name);
//     }

//     if (data.buyer1Address) {
//       form.getTextField("text_80hvqn")
//         .setText(data.buyer1Address);
//     }

//     if (data.buyer1Phone) {
//       form.getTextField("txtb_phone1")
//         .setText(data.buyer1Phone);
//     }

//     if (data.buyer1Fax) {
//       form.getTextField("txtb_fax")
//         .setText(data.buyer1Fax);
//     }

//     if (data.buyer1Email) {
//       form.getTextField("txtb_email")
//         .setText(data.buyer1Email);
//     }

//     if (data.buyer2Name) {
//       form.getTextField("txtbuyer2")
//         .setText(data.buyer2Name);
//     }

//     if (data.buyer2Address) {
//       form.getTextField("text_81tjn")
//         .setText(data.buyer2Address);
//     }

//     if (data.buyer2Phone) {
//       form.getTextField("txtb2_phone1")
//         .setText(data.buyer2Phone);
//     }

//     if (data.buyer2Fax) {
//       form.getTextField("txtb2_fax")
//         .setText(data.buyer2Fax);
//     }

//     if (data.buyer2Email) {
//       form.getTextField("txtb2_email")
//         .setText(data.buyer2Email);
//     }

//     if (data.brokerageName) {
//       form.getTextField("txts_broker")
//         .setText(data.brokerageName);
//     }

//     if (data.brokerageAddress) {
//       form.getTextField("text_82cvpz")
//         .setText(data.brokerageAddress);
//     }

//     if (data.brokeragePhone) {
//       form.getTextField("txts_brkphone")
//         .setText(data.brokeragePhone);
//     }

//     if (data.brokerageFax) {
//       form.getTextField("txts_brkfax")
//         .setText(data.brokerageFax);
//     }

//     if (data.brokerageEmail) {
//       form.getTextField("txts_brkemail")
//         .setText(data.brokerageEmail);
//     }

//     if (data.repName) {
//       form.getTextField("txts_brkagent")
//         .setText(data.repName);
//     }

//     if (data.repPhone) {
//       form.getTextField("txts_brkagentph")
//         .setText(data.repPhone);
//     }

//     if (data.repFax) {
//       form.getTextField("txts_brkagentfax")
//         .setText(data.repFax);
//     }

//     if (data.repEmail) {
//       form.getTextField("txts_brkagentemail")
//         .setText(data.repEmail);
//     }

//     if (data.signedDateM) {
//       form.getTextField("txtSignedDate_m")
//         .setText(data.signedDateM);
//     }

//     if (data.signedDateD) {
//       form.getTextField("txtSignedDate_d")
//         .setText(data.signedDateD);
//     }

//     if (data.signedYear) {
//       form.getTextField("txtSignedDate_yy")
//         .setText(data.signedYear);
//     }

//     if (data.buyersig1) {
//       form.getTextField("txtbuyersig1")
//         .setText(data.buyersig1);
//     }

//     if (data.buyersig2) {
//       form.getTextField("txtbuyersig2")
//         .setText(data.buyersig2);
//     }

//     if (data.witness1sig) {
//       form.getTextField("txtWitness1Sig")
//         .setText(data.witness1sig);
//     }

//     if (data.witness2sig) {
//       form.getTextField("txtWitness2Sig")
//         .setText(data.witness2sig);
//     }

//     if (data.agentsig) {
//       form.getTextField("txts_brkagentsig")
//         .setText(data.agentsig);
//     }
//     // 1️⃣ Regenerate all field appearances (VERY IMPORTANT)
//     form.updateFieldAppearances(font);

//     // 2️⃣ Flatten AFTER updating appearances
//     form.flatten();

//     // 3️⃣ Save with appearance refresh enabled
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
//     const buyer1Email = baseEmail;
//     const buyer2Email = `${name}+buyer2@${domain}`;
//     /* 🟢 BUYER 1 */
//     if (data.buyersig1) {
//       embeddedSigners.push({
//         email: buyer1Email,
//         name: data.buyersig1,
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
//     if (data.buyersig2) {
//       embeddedSigners.push({
//         email: buyer2Email,
//         name: data.buyersig2,
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

//     /* 🟣 REP (EMAIL ONLY) */
//     console.log("📧 Adding rep signer with email:", transactinuser?.email);
//     if (data.agentsig && transactinuser?.email) {
//       emailSigners.push({
//         email: transactinuser.email,
//         name: data.agentsig,
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
//             name: "Buyer Agreement.pdf",
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
//           // returnUrl: `${process.env.FRONTEND_URL}/sign-redirect?partyId=${partyId}&type=ebrada`,
//           returnUrl: `http://localhost:5173/sign-redirect?partyId=${partyId}&type=ebrada`,
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

//   } catch (err) {
//     console.error("❌ ERROR:", error.response?.data || error);
//     res.status(500).json({ message: "Server error" });
//   }
// });
