import express from "express";
import BuyerAmendment from "../models/BuyerAmendmentModel.js";
import fs from "fs";
import axios from "axios";
import jwt from "jsonwebtoken";
import path from "path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import Transaction from "../models/Transaction.js";
import TransactionParty from "../models/TransactionParty.js";
import TransactionUser from "../models/TransactionUser.js";
import nodemailer from "nodemailer";

const router = express.Router();


router.get("/buyer-amendment/user/:partyId", async (req, res) => {
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
       FETCH DATA (PER PARTY)
    =============================== */
    const data = await BuyerAmendment.findOne({
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
  console.log("sendSignedPdfEmail called");
  console.log("Recipient:", toEmail);
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
    // ✅ Create transporter (use .env)
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
      subject: "Signed Buyer Agreement Amendment Document + Summary",
      text: "Attached are your fully signed document and audit summary from DocuSign.",
      attachments: [
        {
          filename: "Signed-Buyer-Agreement-Amendment.pdf",
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
    console.log("Mail sent:", info.messageId);
    console.log(info);
    console.log("✅ Email sent:", info.messageId);
  } catch (error) {
    console.error("❌ Email error:", error?.response || error.message || error);
  }
};


router.post("/generate-buyer-amendment", async (req, res) => {
  try {
    // const { partyId, sendEmail = false, isAdmin = false, ...data } = req.body;
    const { partyId, sendEmail = false, isAdmin = false, ...data } = req.body;
    delete data._id;

    if (!partyId) {
      return res.status(400).json({ message: "partyId required" });
    }
    const party = await TransactionParty.findById(partyId);
    if (!party) {
      return res.json({ message: "Invalid party" });
    }
    const transactinuser = await TransactionUser.findById(party.userId);
    /* ===============================
       SAVE DATA
    =============================== */
    // await BuyerAmendment.findOneAndUpdate(
    //   { partyId },
    //   {
    //     ...data,
    //     partyId,
    //     transactionId: party.transactionId
    //   },
    //   { new: true, upsert: true }
    // );
    await BuyerAmendment.findOneAndUpdate(
      { partyId },
      {
        ...data,

        partyId,
        transactionId: party.transactionId,

        // Reset signing status whenever document is regenerated
        buyer1Signed: false,
        buyer2Signed: false,
        witness1Signed: false,
        witness2Signed: false,
        repSigned: false,

        buyer1SignedAt: null,
        buyer2SignedAt: null,
        witness1SignedAt: null,
        witness2SignedAt: null,
        repSignedAt: null,

        envelopeId: null,
        signers: [],
        completedEmailSent: false
      },
      {
        new: true,
        upsert: true
      }
    );
    /* ===============================
       GENERATE PDF
    =============================== */
    const pdfPath = path.join(process.cwd(), "EBRAA.pdf");
    console.log("Loading PDF template from:", pdfPath);
    const existingPdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes, {
      ignoreEncryption: true
    });
    const form = pdfDoc.getForm();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    // === FILL PDF ===
    if (data.agreementNumber) {
      form.getTextField("txtp_PlatBook_ABC").setText(data.agreementNumber);
    }
    if (data.brokerageName1) {
      form.getTextField("txts_broker").setText(data.brokerageName1);
    }
    if (data.brokerageName2) {
      form.getTextField("txts_brkagent_ABC").setText(data.brokerageName2);
    }
    if (data.buyerName1) {
      form.getTextField("txtbuyer1").setText(data.buyerName1);
    }
    if (data.buyerName2) {
      form.getTextField("txtbuyer2").setText(data.buyerName2);
    }
    if (data.effectiveTime) {
      form.getTextField("txtContractTimeDigit").setText(data.effectiveTime);
    }
    if (data.effectiveDate) {
      const [year, month, day] = data.effectiveDate.split("-");
      const yy = year.slice(-2);
      form.getTextField("txtp_ContractDateABC_m").setText(month);
      form.getTextField("txtp_ContractDateABC_d").setText(day);
      form.getTextField("txtp_ContractDateABC_yy").setText(yy);
    }
    if (data.endTime) {
      form.getTextField("txtexpireTimeNum").setText(data.endTime);
    }
    if (data.endDate) {
      const [year, month, day] = data.endDate.split("-");
      const yy = year.slice(-2);
      form.getTextField("txtp_expiredate_mmmm").setText(month);
      form.getTextField("txtp_expiredate_dd").setText(day);
      form.getTextField("txtp_expiredate_yy").setText(yy);
    }
    if (data.propertyType) {
      form.getTextField("txtPropType").setText(data.propertyType);
    }
    if (data.marketAreas) {
      form.getTextField("txtMarketArea").setText(data.marketAreas);
    }
    if (data.otherAmendments) {
      form.getTextField("txtotherAmends").setText(data.otherAmendments);
    }
    if (data.buyerPrint1) {
      form.getTextField("txtbuyersig1").setText(data.buyerPrint1);
    }
    if (data.buyerPrint2) {
      form.getTextField("txtbuyersig2").setText(data.buyerPrint2);
    }
    if (data.witnessPrint1) {
      form.getTextField("txtWitness1Sig").setText(data.witnessPrint1);
    }
    if (data.witnessPrint2) {
      form.getTextField("txtWitness2Sig").setText(data.witnessPrint2);
    }
    if (data.repPrintName) {
      form.getTextField("txts_brknamesig").setText(data.repPrintName);
    }
    form.updateFieldAppearances(font);
    form.flatten();
    const pdfBytes = await pdfDoc.save();
    return res.json({
      success: true,
      message: "Buyer Amendment saved successfully."
    });
  } catch (error) {
    console.error("❌ ERROR:", error.response?.data || error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

router.post("/send-buyer-amendment-for-signature", async (req, res) => {
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

    const data = await BuyerAmendment.findOne({ partyId });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Buyer Amendment not found"
      });
    }

    /* ===============================
       GENERATE PDF
    =============================== */

    const pdfPath = path.join(
      process.cwd(),
      "EBRAA.pdf"
    );

    const existingPdfBytes = fs.readFileSync(pdfPath);

    const pdfDoc = await PDFDocument.load(existingPdfBytes, {
      ignoreEncryption: true
    });

    const form = pdfDoc.getForm();

    const font = await pdfDoc.embedFont(
      StandardFonts.Helvetica
    );

    if (data.brokerageName1)
      form.getTextField("txts_broker").setText(data.brokerageName1);

    if (data.brokerageName2)
      form.getTextField("txts_brkagent_ABC").setText(data.brokerageName2);

    if (data.buyerName1)
      form.getTextField("txtbuyer1").setText(data.buyerName1);

    if (data.buyerName2)
      form.getTextField("txtbuyer2").setText(data.buyerName2);

    if (data.effectiveTime)
      form.getTextField("txtContractTimeDigit").setText(
        data.effectiveTime
      );

    if (data.effectiveDate) {
      const [year, month, day] =
        data.effectiveDate.split("-");

      form
        .getTextField("txtp_ContractDateABC_m")
        .setText(month);

      form
        .getTextField("txtp_ContractDateABC_d")
        .setText(day);

      form
        .getTextField("txtp_ContractDateABC_yy")
        .setText(year.slice(-2));
    }

    if (data.endTime)
      form.getTextField("txtexpireTimeNum").setText(
        data.endTime
      );

    if (data.endDate) {
      const [year, month, day] =
        data.endDate.split("-");

      form
        .getTextField("txtp_expiredate_mmmm")
        .setText(month);

      form
        .getTextField("txtp_expiredate_dd")
        .setText(day);

      form
        .getTextField("txtp_expiredate_yy")
        .setText(year.slice(-2));
    }

    if (data.propertyType)
      form.getTextField("txtPropType").setText(
        data.propertyType
      );

    if (data.marketAreas)
      form.getTextField("txtMarketArea").setText(
        data.marketAreas
      );

    if (data.otherAmendments)
      form.getTextField("txtotherAmends").setText(
        data.otherAmendments
      );

    if (data.buyerPrint1)
      form.getTextField("txtbuyersig1").setText(
        data.buyerPrint1
      );

    if (data.buyerName2)
      form.getTextField("txtbuyersig2").setText(
        data.buyerName2
      );

    if (data.witnessPrint1)
      form.getTextField("txtWitness1Sig").setText(
        data.witnessPrint1
      );

    if (data.witnessPrint2)
      form.getTextField("txtWitness2Sig").setText(
        data.witnessPrint2
      );

    if (data.repPrintName)
      form.getTextField("txts_brknamesig").setText(
        data.repPrintName
      );

    form.updateFieldAppearances(font);
    form.flatten();

    const pdfBytes = await pdfDoc.save({
      updateFieldAppearances: true
    });

    const accessToken = await getAccessToken();

    /* ===============================
   BUILD SIGNERS (PARALLEL SIGNING)
=============================== */

    const signers = [];

    /* BUYER 1 */
    // if (data.buyerPrint1 && data.buyerEmail1) {
    //   signers.push({
    //     email: data.buyerEmail1,
    //     name: data.buyerPrint1,
    //     recipientId: "1",
    //     routingOrder: "1",
    //     clientUserId: `${partyId}_buyer1`,
    //     tabs: {
    //       signHereTabs: [
    //         {
    //           anchorString: "/sign1/"
    //         }
    //       ],
    //       dateSignedTabs: [
    //         {
    //           anchorString: "/date_md/",
    //           dateFormat: "MMMM d"
    //         }
    //       ]
    //     }
    //   });
    // }

    // /* BUYER 2 */
    // if (data.buyerName2 && data.buyerEmail2) {
    //   signers.push({
    //     email: data.buyerEmail2,
    //     name: data.buyerName2,
    //     recipientId: "2",
    //     routingOrder: "1",
    //     clientUserId: `${partyId}_buyer2`,
    //     tabs: {
    //       signHereTabs: [
    //         {
    //           anchorString: "/sign2/"
    //         }
    //       ]
    //     }
    //   });
    // }

    // /* WITNESS 1 */
    // if (data.witnessPrint1 && data.witnessEmail1) {
    //   signers.push({
    //     email: data.witnessEmail1,
    //     name: data.witnessPrint1,
    //     recipientId: "3",
    //     routingOrder: "1",
    //     clientUserId: `${partyId}_witness1`,
    //     tabs: {
    //       signHereTabs: [
    //         {
    //           anchorString: "/sign3/"
    //         }
    //       ]
    //     }
    //   });
    // }

    // /* WITNESS 2 */
    // if (data.witnessPrint2 && data.witnessEmail2) {
    //   signers.push({
    //     email: data.witnessEmail2,
    //     name: data.witnessPrint2,
    //     recipientId: "4",
    //     routingOrder: "1",
    //     clientUserId: `${partyId}_witness2`,
    //     tabs: {
    //       signHereTabs: [
    //         {
    //           anchorString: "/sign4/"
    //         }
    //       ]
    //     }
    //   });
    // }

    // /* REPRESENTATIVE */
    // if (data.repPrintName && data.repEmail) {
    //   signers.push({
    //     email: data.repEmail,
    //     name: data.repPrintName,
    //     recipientId: "5",
    //     routingOrder: "1",
    //     clientUserId: `${partyId}_rep`,
    //     tabs: {
    //       signHereTabs: [
    //         {
    //           anchorString: "/sign5/"
    //         }
    //       ]
    //     }
    //   });
    // }



    /* ===============================
   BUYER 1
=============================== */
    if (data.buyerPrint1 && data.buyerEmail1) {
      signers.push({
        email: data.buyerEmail1.trim(),
        name: data.buyerPrint1,
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

    /* ===============================
       BUYER 2
    =============================== */
    if (data.buyerName2 && data.buyerEmail2) {
      signers.push({
        email: data.buyerEmail2.trim(),
        name: data.buyerName2,
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

    /* ===============================
       WITNESS 1
    =============================== */
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

    /* ===============================
       WITNESS 2
    =============================== */
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

    /* ===============================
       REPRESENTATIVE
    =============================== */
    if (data.repPrintName && data.repEmail) {
      signers.push({
        email: data.repEmail.trim(),
        name: data.repPrintName,
        recipientId: "5",
        routingOrder: "1",
        clientUserId: `${partyId}_rep`,
        tabs: {
          signHereTabs: [
            {
              anchorString: "/sign5/"
            }
          ]
        }
      });
    }

    console.log("Buyer Amendment Signers:", signers);

    if (signers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid signers found."
      });
    }

    /* ===============================
   CREATE DOCUSIGN ENVELOPE
=============================== */

    const envelopePayload = {
      emailSubject: "Please sign the Buyer Amendment document",

      documents: [
        {
          documentBase64: Buffer.from(pdfBytes).toString("base64"),
          name: "Buyer Amendment.pdf",
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
       SAVE ENVELOPE DETAILS
    =============================== */

    const updated = await BuyerAmendment.findOneAndUpdate(
      { partyId },
      {
        envelopeId,

        completedEmailSent: false,

        buyer1Signed: false,
        buyer2Signed: false,

        witness1Signed: false,
        witness2Signed: false,

        repSigned: false,

        buyer1SignedAt: null,
        buyer2SignedAt: null,

        witness1SignedAt: null,
        witness2SignedAt: null,

        repSignedAt: null,

        signers: signers.map((s) => ({
          recipientId: s.recipientId,
          clientUserId: s.clientUserId,
          email: s.email,
          name: s.name,
          routingOrder: s.routingOrder
        }))
      },
      // {
      //   envelopeId,
      //   signers: signers.map(s => ({
      //     recipientId: s.recipientId,
      //     clientUserId: s.clientUserId,
      //     email: s.email,
      //     name: s.name,
      //     routingOrder: s.routingOrder,
      //   })),
      // },
      { new: true }
    );

    console.log("Updated document:", updated);

    /* ===============================
   SEND EMAIL TO EVERY SIGNER
=============================== */

    for (const signer of signers) {
      // const signingLink = `https://realtorparth.ca/api/ebraapdf/start-sign/${partyId}?recipientId=${signer.recipientId}`;
      const signingLink = `https://realtorparth.ca/api/ebraapdf/start-sign/${partyId}/${signer.recipientId}`;

      let documentRole = "Signer";

      switch (signer.recipientId) {

        case "1":
          documentRole = "Buyer 1";
          break;

        case "2":
          documentRole = "Buyer 2";
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
      }

      // Your <strong>Buyer Amendment</strong> document has been prepared and is now ready for your electronic signature.
      await transporter.sendMail({
        from: `"RealtorParth" <hello@realtorparth.ca>`,
        to: signer.email,
        subject: "Buyer Amendment Ready For Signature",

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
<strong>Buyer Amendment</strong>
as <strong>${documentRole}</strong>.
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
Sign Buyer Amendment
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
      message: "Buyer Amendment sent for signature successfully."
    });

  } catch (error) {

    console.error(
      "BUYER AMENDMENT DOCUSIGN ERROR:",
      error.response?.data || error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to send Buyer Amendment for signature."
    });

  }
});

// router.get("/start-sign/:partyId", async (req, res) => {
router.get("/start-sign/:partyId/:recipientId", async (req, res) => {
  try {
    // const { partyId } = req.params;
    // const { recipientId } = req.query;
    const { partyId, recipientId } = req.params;

    const buyerAmendment = await BuyerAmendment.findOne({ partyId });

    if (!buyerAmendment) {
      return res.status(404).send("Buyer Amendment not found.");
    }

    if (!buyerAmendment.envelopeId) {
      return res.status(400).send("Envelope not created yet.");
    }

    if (
      !buyerAmendment.signers ||
      buyerAmendment.signers.length === 0
    ) {
      return res.status(400).send("No signers found.");
    }

    /* ===============================
       FIND REQUESTED SIGNER
    =============================== */

    // const signer =
    //   buyerAmendment.signers.find(
    //     s => s.recipientId === String(recipientId)
    //   ) ||
    //   buyerAmendment.signers.find(
    //     s => s.recipientId === "1"
    //   ) ||
    //   buyerAmendment.signers[0];

    // const signer = buyerAmendment.signers.find(
    //   s => s.recipientId === recipientId
    // );

    const signer =
      buyerAmendment.signers.find(
        s => s.recipientId === String(recipientId)
      ) ||
      buyerAmendment.signers.find(
        s => s.recipientId === "1"
      ) ||
      buyerAmendment.signers[0];

    if (!signer) {
      return res.status(404).send("Signer not found.");
    }


    if (!signer) {
      return res.status(404).send("Signer not found.");
    }

    const accessToken = await getAccessToken();

    /* ===============================
       CREATE RECIPIENT VIEW
    =============================== */

    const viewRes = await axios.post(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${buyerAmendment.envelopeId}/views/recipient`,
      {
        authenticationMethod: "none",

        email: signer.email,
        userName: signer.name,
        clientUserId: signer.clientUserId,
        returnUrl:
          `https://realtorparth.ca/api/ebraapdf/sign-complete/${partyId}?recipientId=${signer.recipientId}`
        // returnUrl:
        //   `https://realtorparth.ca/api/ebraapdf/sign-complete/${partyId}` +
        //   `?recipientId=${signer.recipientId}`
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
      "BUYER AMENDMENT START SIGN ERROR:",
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

    console.log("========== SIGN COMPLETE ==========");
    console.log("Party ID:", partyId);
    console.log("Recipient ID:", recipientId);

    /* ===============================
       BUYER AMENDMENT
    =============================== */

    const buyerAmendment = await BuyerAmendment.findOne({ partyId });

    if (!buyerAmendment) {
      return res.status(404).send("Buyer Amendment not found.");
    }

    /* ===============================
       UPDATE SIGNING STATUS
    =============================== */
    /* ===============================
   UPDATE SIGNING STATUS
=============================== */

    const signer = buyerAmendment.signers?.find(
      s => s.recipientId === String(recipientId)
    );

    if (!signer) {
      console.log("Unknown recipient:", recipientId);
    } else {

      console.log("Matched signer:", signer);

      const now = new Date();

      switch (String(recipientId)) {

        case "1":
          buyerAmendment.buyer1Signed = true;
          buyerAmendment.buyer1SignedAt = now;
          break;

        case "2":
          buyerAmendment.buyer2Signed = true;
          buyerAmendment.buyer2SignedAt = now;
          break;

        case "3":
          buyerAmendment.witness1Signed = true;
          buyerAmendment.witness1SignedAt = now;
          break;

        case "4":
          buyerAmendment.witness2Signed = true;
          buyerAmendment.witness2SignedAt = now;
          break;

        case "5":
          buyerAmendment.repSigned = true;
          buyerAmendment.repSignedAt = now;
          break;

        default:
          console.log("Unknown recipient:", recipientId);
      }
    }

    /* ===============================
       PREVENT DUPLICATE EMAIL
    =============================== */

    const everyoneSigned =
      buyerAmendment.buyer1Signed &&
      (!buyerAmendment.buyerPrint2 || buyerAmendment.buyer2Signed) &&
      (!buyerAmendment.witnessPrint1 || buyerAmendment.witness1Signed) &&
      (!buyerAmendment.witnessPrint2 || buyerAmendment.witness2Signed) &&
      (!buyerAmendment.repPrintName || buyerAmendment.repSigned)
    // (!buyerAmendment.repPrintName || buyerAmendment.agentSigned);

    if (!everyoneSigned) {
      await buyerAmendment.save();

      console.log("Waiting for remaining signers...");

      return res.redirect(
        "https://realtorparth.ca/signature-complete"
      );
    }

    if (buyerAmendment.completedEmailSent) {

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
      return res.status(404).send("Party not found.");
    }

    /* ===============================
       TRANSACTION USER
    =============================== */

    const transactionUser = await TransactionUser.findById(
      party.userId
    );

    if (!transactionUser) {
      return res.status(404).send("Transaction User not found.");
    }

    console.log("Sending notification to:", transactionUser.email);

    // ----------------------------------------------------
    // Send Simple Notification Email
    // ----------------------------------------------------
    await transporter.sendMail({
      from: `"RealtorParth" <hello@realtorparth.ca>`,
      to: transactionUser.email,
      subject: "Buyer Amendment Signed by Client",


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
        Buyer Signature Completed
        </h2>

        <p style="font-size:16px;color:#555;line-height:28px;">
        The client has successfully completed their electronic signature for the Buyer Amendment document.
        </p>

        <table
          width="100%"
          cellpadding="10"
          cellspacing="0"
          style="margin:30px 0;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;"
        >

        <tr style="background:#f8fafc;">
        <td style="font-weight:600;color:#333;width:180px;">Client Name</td>
        <td style="color:#555;">${party.name}</td>
        </tr>

        <tr>
        <td style="font-weight:600;color:#333;">Client Email</td>
        <td style="color:#555;">${party.email}</td>
        </tr>

        <tr style="background:#f8fafc;">
        <td style="font-weight:600;color:#333;">Document</td>
        <td style="color:#555;">Buyer Amendment</td>
        </tr>

        <tr>
        <td style="font-weight:600;color:#333;">Status</td>
        <td style="color:#16a34a;font-weight:600;">
        ✔ Client Signature Completed
        </td>
        </tr>

        <tr style="background:#f8fafc;">
        <td style="font-weight:600;color:#333;">Completed On</td>
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
        This is an automated notification confirming that the client has completed their portion of the signing process.
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
       OPTIONAL EMAIL TO WITNESSES
    =============================== */

    const witnessEmails = [
      buyerAmendment.witnessEmail1,
      buyerAmendment.witnessEmail2
    ].filter(Boolean);

    if (witnessEmails.length > 0) {
      await transporter.sendMail({
        from: `"RealtorParth" <hello@realtorparth.ca>`,
        to: witnessEmails.join(","),
        subject: "Buyer Amendment Completed",
        html: `
      <p>Hello,</p>

      <p>
        The <strong>Buyer Amendment</strong> has now been fully signed by all parties.
      </p>

      <p>
        Thank you for participating in the signing process.
      </p>

      <p>
        Regards,<br>
        RealtorParth Team
      </p>
    `
      });
    }

    /* ===============================
       SAVE
    =============================== */

    buyerAmendment.completedEmailSent = true;

    await buyerAmendment.save();

    console.log("completedEmailSent updated");

    return res.redirect(
      "https://realtorparth.ca/signature-complete"
    );

  } catch (err) {

    console.error("========== SIGN COMPLETE ERROR ==========");
    console.error(err.response?.data || err);

    return res.redirect(
      "https://realtorparth.ca/signature-complete"
    );
  }
});



// router.post("/send-buyer-amendment-for-signature", async (req, res) => {
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
//     const data = await BuyerAmendment.findOne({ partyId });
//     if (!data) {
//       return res.status(404).json({
//         success: false,
//         message: "Buyer Amendment not found"
//       });
//     }
//     /* ===============================
//        GENERATE PDF
//     =============================== */
//     const pdfPath = path.join(process.cwd(), "EBRAA.pdf");
//     const existingPdfBytes = fs.readFileSync(pdfPath);
//     const pdfDoc = await PDFDocument.load(existingPdfBytes, {
//       ignoreEncryption: true
//     });
//     const form = pdfDoc.getForm();
//     const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
//     // if (data.agreementNumber) form.getTextField("txtp_PlatBook_ABC").setText(data.agreementNumber);
//     if (data.brokerageName1) form.getTextField("txts_broker").setText(data.brokerageName1);
//     if (data.brokerageName2) form.getTextField("txts_brkagent_ABC").setText(data.brokerageName2);
//     if (data.buyerName1) form.getTextField("txtbuyer1").setText(data.buyerName1);
//     if (data.buyerName2) form.getTextField("txtbuyer2").setText(data.buyerName2);
//     if (data.effectiveTime) form.getTextField("txtContractTimeDigit").setText(data.effectiveTime);
//     if (data.effectiveDate) {
//       const [year, month, day] = data.effectiveDate.split("-");
//       form.getTextField("txtp_ContractDateABC_m").setText(month);
//       form.getTextField("txtp_ContractDateABC_d").setText(day);
//       form.getTextField("txtp_ContractDateABC_yy").setText(year.slice(-2));
//     }
//     if (data.endTime) form.getTextField("txtexpireTimeNum").setText(data.endTime);
//     if (data.endDate) {
//       const [year, month, day] = data.endDate.split("-");
//       form.getTextField("txtp_expiredate_mmmm").setText(month);
//       form.getTextField("txtp_expiredate_dd").setText(day);
//       form.getTextField("txtp_expiredate_yy").setText(year.slice(-2));
//     }
//     if (data.propertyType) form.getTextField("txtPropType").setText(data.propertyType);
//     if (data.marketAreas) form.getTextField("txtMarketArea").setText(data.marketAreas);
//     if (data.otherAmendments) form.getTextField("txtotherAmends").setText(data.otherAmendments);
//     if (data.buyerPrint1) form.getTextField("txtbuyersig1").setText(data.buyerPrint1);
//     if (data.buyerPrint2) form.getTextField("txtbuyersig2").setText(data.buyerPrint2);
//     if (data.witnessPrint1) form.getTextField("txtWitness1Sig").setText(data.witnessPrint1);
//     if (data.witnessPrint2) form.getTextField("txtWitness2Sig").setText(data.witnessPrint2);
//     if (data.repPrintName) form.getTextField("txts_brknamesig").setText(data.repPrintName);
//     form.updateFieldAppearances(font);
//     form.flatten();
//     const pdfBytes = await pdfDoc.save();
//     const accessToken = await getAccessToken();

//     const signers = [];
//     const baseEmail = party.email;
//     const [name, domain] = baseEmail.split("@");
//     const buyer1Email = baseEmail;
//     const buyer2Email = `${name}+buyer2@${domain}`;
//     if (data.buyerPrint1) {
//       signers.push({
//         email: buyer1Email,
//         name: data.buyerPrint1,
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
//     if (data.buyerPrint2) {
//       signers.push({
//         email: buyer2Email,
//         name: data.buyerPrint2,
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
//     if (data.repPrintName && transactionUser?.email) {
//       signers.push({
//         email: transactionUser.email,
//         name: data.repPrintName,
//         recipientId: "3",
//         routingOrder: "3",
//         // clientUserId: `${partyId}_agent`,
//         tabs: {
//           signHereTabs: [
//             {
//               anchorString: "/sign5/"
//             }
//           ]
//         }
//       });
//     }
//     console.log("Single Signer Payload:", signers);
//     if (signers.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Buyer 1 details missing. Cannot send."
//       });
//     }
//     /* ===============================
//        CREATE & SEND ENVELOPE
//     =============================== */
//     const envelopePayload = {
//       emailSubject: "Please sign the Buyer Amendment document",
//       documents: [
//         {
//           documentBase64: Buffer.from(pdfBytes).toString("base64"),
//           name: "Buyer Amendment.pdf",
//           fileExtension: "pdf",
//           documentId: "1"
//         }
//       ],
//       recipients: {
//         signers: signers
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
//     await BuyerAmendment.findOneAndUpdate(
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
//     const signingLink = `https://realtorparth.ca/api/ebraapdf/start-sign/${partyId}`;
//     await transporter.sendMail({
//       from: `"RealtorParth" <hello@realtorparth.ca>`,
//       to: party.email,
//       subject: "Buyer Amendment Ready For Signature",
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
// Your <strong>Buyer Amendment</strong> document has been prepared and is now ready for your electronic signature.
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
// Sign Buyer Amendment
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
//     console.error("BUYER AMENDMENT DOCUSIGN ERROR:", error.response?.data || error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to send Buyer Amendment for signature."
//     });
//   }
// });

// router.get("/start-sign/:partyId", async (req, res) => {
//   try {
//     const { partyId } = req.params;

//     const buyerAmendment = await BuyerAmendment.findOne({ partyId });

//     if (!buyerAmendment) {
//       return res.status(404).send("Buyer Amendment not found.");
//     }

//     if (!buyerAmendment.envelopeId) {
//       return res.status(400).send("Envelope not created yet.");
//     }

//     if (
//       !buyerAmendment.signers ||
//       buyerAmendment.signers.length === 0
//     ) {
//       return res.status(400).send("No signers found.");
//     }

//     /* ===============================
//        FIRST SIGNER
//     =============================== */

//     // const signer = buyerAmendment.signers[0];
//     const signer =
//       buyerAmendment.signers.find(
//         s => s.recipientId === "1"
//       ) || buyerAmendment.signers[0];

//     const accessToken = await getAccessToken();

//     /* ===============================
//        CREATE RECIPIENT VIEW
//     =============================== */

//     const viewRes = await axios.post(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${buyerAmendment.envelopeId}/views/recipient`,
//       {
//         authenticationMethod: "none",

//         email: signer.email,
//         userName: signer.name,

//         // clientUserId: signer.clientUserId || `${partyId}_buyer1`,
//         clientUserId: signer.clientUserId,

//         returnUrl: `https://realtorparth.ca/api/ebraapdf/sign-complete/${partyId}`
//         // returnUrl: `https://realtorparth.ca/party/documents/${partyId}`
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

//     console.log("========== SIGN COMPLETE ==========");
//     console.log("Party ID:", partyId);

//     // ----------------------------------------------------
//     // Buyer Amendment
//     // ----------------------------------------------------
//     const buyerAmendment = await BuyerAmendment.findOne({ partyId });

//     if (!buyerAmendment) {
//       return res.status(404).send("Buyer Amendment not found.");
//     }

//     // Prevent duplicate emails
//     if (buyerAmendment.completedEmailSent) {
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
//       subject: "Buyer Amendment Signed by Client",


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
//         Buyer Signature Completed
//         </h2>

//         <p style="font-size:16px;color:#555;line-height:28px;">
//         The client has successfully completed their electronic signature for the Buyer Amendment document.
//         </p>

//         <table
//           width="100%"
//           cellpadding="10"
//           cellspacing="0"
//           style="margin:30px 0;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;"
//         >

//         <tr style="background:#f8fafc;">
//         <td style="font-weight:600;color:#333;width:180px;">Client Name</td>
//         <td style="color:#555;">${party.name}</td>
//         </tr>

//         <tr>
//         <td style="font-weight:600;color:#333;">Client Email</td>
//         <td style="color:#555;">${party.email}</td>
//         </tr>

//         <tr style="background:#f8fafc;">
//         <td style="font-weight:600;color:#333;">Document</td>
//         <td style="color:#555;">Buyer Amendment</td>
//         </tr>

//         <tr>
//         <td style="font-weight:600;color:#333;">Status</td>
//         <td style="color:#16a34a;font-weight:600;">
//         ✔ Client Signature Completed
//         </td>
//         </tr>

//         <tr style="background:#f8fafc;">
//         <td style="font-weight:600;color:#333;">Completed On</td>
//         <td style="color:#555;">
//         ${new Date().toLocaleString("en-CA", {
//         dateStyle: "long",
//         timeStyle: "short"
//       })}
//         </td>
//         </tr>

//         </table>

//         <div style="background:#f8f9fb;border-left:4px solid #16a34a;padding:18px;border-radius:6px;">
//         <p style="margin:0;font-size:15px;color:#555;line-height:24px;">
//         This is an automated notification confirming that the client has completed their portion of the signing process.
//         </p>
//         </div>

//         <p style="margin-top:35px;font-size:16px;color:#222;">
//         Kind Regards,<br>
//         <strong>RealtorParth Team</strong>
//         </p>

//         </td>
//         </tr>

//         <tr>
//         <td style="background:#f7f7f7;padding:22px;text-align:center;color:#777;font-size:13px;line-height:22px;">
//         This is an automated notification from RealtorParth.<br>
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

//     console.log("Notification email sent.");

//     // ----------------------------------------------------
//     // Prevent duplicate notification
//     // ----------------------------------------------------
//     buyerAmendment.completedEmailSent = true;
//     await buyerAmendment.save();

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
        returnUrl: `${process.env.FRONTEND_URL}/sign-redirect?partyId=${partyId}&type=ebraa`,
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

    // ✅ Summary (Certificate of Completion)
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
          console.log("✅ Final email sent (PDF + Summary)");
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
















































































// import express from "express";
// import BuyerAmendment from "../models/BuyerAmendmentModel.js";
// import fs from "fs";


// import axios from "axios";
// import jwt from "jsonwebtoken";



// import path from "path";
// import { PDFDocument, StandardFonts } from "pdf-lib";
// import Transaction from "../models/Transaction.js";
// import TransactionParty from "../models/TransactionParty.js";
// import TransactionUser from "../models/TransactionUser.js";
// import nodemailer from "nodemailer";

// const router = express.Router();


// /* ===============================
//    GET DATA BY USER
// ================================ */

// //router.get("/buyer-amendment/user/:userId", async (req, res) => {

// //  try {

// //    const data = await BuyerAmendment.findOne({
// //      transactionUserId: req.params.userId
// //    });

// //    res.json({ success: true, data });

// //  } catch (err) {

// //    console.error(err);
// //    res.status(500).json({ success: false });

// //  }

// //});


// router.get("/buyer-amendment/user/:partyId", async (req, res) => {

//   try {

//     const { partyId } = req.params;

//     if (!partyId) {
//       return res.json({
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

//     /* ===============================
//        FETCH DATA (PER PARTY)
//     =============================== */

//     const data = await BuyerAmendment.findOne({
//       partyId
//     });

//     res.json({
//       success: true,
//       data: data || null
//     });

//   } catch (error) {

//     console.error(error);

//     res.status(500).json({
//       success: false,
//       message: "Server error"
//     });

//   }

// });




// /* ===============================
//    GENERATE PDF + SAVE
// ================================ */

// //router.post("/generate-buyer-amendment", async (req, res) => {

// //  try {

// //    const data = req.body;

// //    if (!data.transactionUserId) {
// //      return res.status(400).json({ message: "User ID missing" });
// //    }

//     /* ===============================
//        SAVE / UPDATE DB
//     =============================== */

// //    await BuyerAmendment.findOneAndUpdate(
// //      { transactionUserId: data.transactionUserId },
// //      data,
// //      { upsert: true, new: true }
// //    );




// /* ===============================
//    DOCUSIGN TOKEN (NO SDK)
// =============================== */
// const getAccessToken = async () => {
//   const privateKey = fs.readFileSync("./private.key");

//   const payload = {
//     iss: process.env.DOCUSIGN_INTEGRATION_KEY,
//     sub: process.env.DOCUSIGN_USER_ID,
//     aud: "account-d.docusign.com",
//     iat: Math.floor(Date.now() / 1000),
//     exp: Math.floor(Date.now() / 1000) + 3600,
//     scope: "signature impersonation"
//   };

//   const token = jwt.sign(payload, privateKey, { algorithm: "RS256" });

//   const res = await axios.post(
//     "https://account-d.docusign.com/oauth/token",
//     new URLSearchParams({
//       grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
//       assertion: token
//     }),
//     {
//       headers: { "Content-Type": "application/x-www-form-urlencoded" }
//     }
//   );

//   return res.data.access_token;
// }



// const sendSignedPdfEmail = async (toEmail, pdfBuffer, certBuffer) => {
//   try {
//     // ✅ Validate inputs
//     if (!toEmail) {
//       console.warn("⚠️ No email provided");
//       return;
//     }

//     if (!pdfBuffer || !certBuffer) {
//       console.warn("⚠️ Missing PDF or certificate buffer");
//       return;
//     }



//     // ✅ Send email
//     const info = await transporter.sendMail({
//       from: `"RealtorParth" <hello@realtorparth.ca>`,
//       to: toEmail,
//       subject: "Signed Buyer Agreement Amendment Document + Summary",
//       text: "Attached are your fully signed document and audit summary from DocuSign.",
//       attachments: [
//         {
//           filename: "Signed-Buyer-Agreement-Amendment.pdf",
//           content: pdfBuffer,
//           contentType: "application/pdf"
//         },
//         {
//           filename: "DocuSign-Summary.pdf",
//           content: certBuffer,
//           contentType: "application/pdf"
//         }
//       ]
//     });

//     console.log("✅ Email sent:", info.messageId);

//   } catch (error) {
//     console.error("❌ Email error:", error?.response || error.message || error);
//   }
// };


// router.post("/generate-buyer-amendment", async (req, res) => {
//   try {
// //    const { partyId, sendEmail = false, ...data } = req.body;
//     const { partyId, sendEmail = false, isAdmin = false, ...data } = req.body;

//     if (!partyId) {
//       return res.status(400).json({ message: "partyId required" });
//     }

//     const party = await TransactionParty.findById(partyId);
//     if (!party) {
//       return res.json({ message: "Invalid party" });
//     }

//     console.log("Data saved for party userID:", party.userId);
//     const transactinuser = await TransactionUser.findById(party.userId);
//     console.log("transaction user:", transactinuser);

//     /* ===============================
//        SAVE DATA
//     =============================== */
//     await BuyerAmendment.findOneAndUpdate(
//       { partyId },
//       {
//         ...data,
//         partyId,
//         transactionId: party.transactionId
//       },
//       { new: true, upsert: true }
//     );
// console.log("Data saved for party userID:", party.userId);

//     /* ===============================
//        GENERATE PDF
//     =============================== */
//     const pdfPath = path.join(
//       process.cwd(),
//       "EBRAA.pdf"
//     );
//     const existingPdfBytes = fs.readFileSync(pdfPath);

//     const pdfDoc = await PDFDocument.load(existingPdfBytes, {
//       ignoreEncryption: true
//     });

//     const form = pdfDoc.getForm();
//     const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

//     // === FILL PDF ===
//     if (data.agreementNumber) {
//       form.getTextField("txtp_PlatBook_ABC")
//         .setText(data.agreementNumber);
//     }
//     if (data.brokerageName1) {
//       form.getTextField("txts_broker")
//         .setText(data.brokerageName1);
//     }
//     if (data.brokerageName2) {
//       form.getTextField("txts_brkagent_ABC")
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
//     // if (data.agreementRef) {
//     //     form.getTextField("txtp_PlatBook_ABC")
//     //         .setText(data.agreementRef);
//     // }
//     if (data.effectiveTime) {
//       form.getTextField("txtContractTimeDigit")
//         .setText(data.effectiveTime);
//     }
//     if (data.effectiveDate) {
//       const [year, month, day] = data.effectiveDate.split("-");
//       const yy = year.slice(-2);
//       form.getTextField("txtp_ContractDateABC_m").setText(month);
//       form.getTextField("txtp_ContractDateABC_d").setText(day);
//       form.getTextField("txtp_ContractDateABC_yy").setText(yy);
//     }

//     if (data.endTime) {
//       form.getTextField("txtexpireTimeNum")
//         .setText(data.endTime);
//     }
//     if (data.endDate) {
//       const [year, month, day] = data.endDate.split("-");
//       const yy = year.slice(-2);
//       form.getTextField("txtp_expiredate_mmmm").setText(month);
//       form.getTextField("txtp_expiredate_dd").setText(day);
//       form.getTextField("txtp_expiredate_yy").setText(yy);
//     }

//     if (data.propertyType) {
//       form.getTextField("txtPropType")
//         .setText(data.propertyType);
//     }

//     if (data.marketAreas) {
//       form.getTextField("txtMarketArea")
//         .setText(data.marketAreas);
//     }

//     if (data.otherAmendments) {
//       form.getTextField("txtotherAmends")
//         .setText(data.otherAmendments);
//     }

//     if (data.signedDate) {
//       const [year, month, day] = data.signedDate.split("-");
//       const yy = year.slice(-2);
//       form.getTextField("txtSignedDate_m").setText(month);
//       form.getTextField("txtSignedDate_d").setText(day);
//       form.getTextField("txtSignedDate_yy").setText(yy);
//     }

//     if (data.buyerPrint1) {
//       form.getTextField("txtbuyersig1")
//         .setText(data.buyerPrint1);
//     }

//     if (data.buyerPrint2) {
//       form.getTextField("txtbuyersig2")
//         .setText(data.buyerPrint2);
//     }

//     if (data.witnessPrint1) {
//       form.getTextField("txtWitness1Sig")
//         .setText(data.witnessPrint1);
//     }

//     if (data.witnessPrint2) {
//       form.getTextField("txtWitness2Sig")
//         .setText(data.witnessPrint2);
//     }

//     if (data.repPrintName) {
//       form.getTextField("txts_brknamesig")
//         .setText(data.repPrintName);
//     }

//     form.updateFieldAppearances(font);
//     form.flatten();

//     const pdfBytes = await pdfDoc.save();

//     /* ===============================
//    🟡 ADMIN MODE → DIRECT PDF
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


//  /* ===============================
//        DOCUSIGN FLOW
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
// if (data.buyerPrint1) {
//       embeddedSigners.push({
//         email: buyer1Email,
//         name: data.buyerPrint1,
//         recipientId: "1",
//         routingOrder: "1",
//         clientUserId: `${party._id}_buyer1`,
//         tabs: {
//           signHereTabs: [{ anchorString: "/sign1/" }]
//         }
//       });
//     }

//     // 🔵 BUYER 2
//     if (data.buyerPrint2) {
//       embeddedSigners.push({
//         email: buyer2Email,
//         name: data.buyerPrint2,
//         recipientId: "2",
//         routingOrder: "2",
//         clientUserId: `${party._id}_buyer2`,
//         tabs: {
//           signHereTabs: [{ anchorString: "/sign2/" }]
//         }
//       });
//     }

//     // 🟣 AGENT (EMAIL SIGNER - LAST)
//     if (data.repPrintName && transactinuser?.email) {
//       emailSigners.push({
//         email: transactinuser.email,
//         name: data.repPrintName,
//         recipientId: "3",
//         routingOrder: "3", // 🔥 MUST BE LAST
//         tabs: {
//           signHereTabs: [{ anchorString: "/sign5/" }]
//         }
//       });
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
//             name: "Buyer Amendment.pdf",
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
//           returnUrl: `${process.env.FRONTEND_URL}/sign-redirect?partyId=${partyId}&type=ebraa`,
// //          returnUrl: `http://localhost:5173/sign-redirect?partyId=${partyId}&type=ebraa`,
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
//     console.error("❌ ERROR:", error.response?.data || error);
//     res.status(500).json({ message: "Server error" });
//   }
// });



// router.get("/get-next-signer", async (req, res) => {
//   try {
//     const { partyId } = req.query;

//     const session = global.signingSessions?.[partyId];
//     // if (!session) return res.json({ done: true });
//     if (!session) {
//       console.error("❌ Session missing for:", partyId);
//       return res.status(500).json({ error: "Session expired" });
//     }

//     const { envelopeId, signers, currentIndex } = session;

//     const nextIndex = currentIndex + 1;

//     if (nextIndex >= signers.length) {
//       return res.json({ done: true });
//     }

//     const nextSigner = signers[nextIndex];
//     const accessToken = await getAccessToken();

//     const viewRes = await axios.post(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/views/recipient`,
//       {
//         returnUrl: `${process.env.FRONTEND_URL}/sign-redirect?partyId=${partyId}&type=ebraa`,
// //        returnUrl: `http://localhost:5173/sign-redirect?partyId=${partyId}&type=ebraa`,
//         authenticationMethod: "none",
//         email: nextSigner.email,
//         userName: nextSigner.name,
//         clientUserId: nextSigner.clientUserId
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${accessToken}`
//         }
//       }
//     );

//     session.currentIndex = nextIndex;

//     res.json({ signingUrl: viewRes.data.url });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Failed next signer" });
//   }
// });




// router.get("/download-signed-pdf", async (req, res) => {
//   try {
//     const { partyId } = req.query;

//     const session = global.signingSessions?.[partyId];
//     if (!session) return res.status(400).send("No session");

//     const { envelopeId } = session;

//     const accessToken = await getAccessToken();

//     /* ===============================
//        ⏳ WAIT UNTIL COMPLETED
//     =============================== */
//     let status = "sent";
//     let attempts = 0;

//     while (status !== "completed" && attempts < 20) {
//       const statusRes = await axios.get(
//         `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}`,
//         {
//           headers: {
//             Authorization: `Bearer ${accessToken}`
//           }
//         }
//       );

//       status = statusRes.data.status;

//       if (status === "completed") break;

//       await new Promise((r) => setTimeout(r, 1500));
//       attempts++;
//     }

//     console.log("📄 Envelope:", envelopeId);
//     console.log("⏳ Status:", status);

//     /* ===============================
//        📄 DOWNLOAD PDF + SUMMARY
//     =============================== */

//     // ✅ Signed PDF
//     const pdfRes = await axios.get(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/combined`,
//       {
//         responseType: "arraybuffer",
//         headers: {
//           Authorization: `Bearer ${accessToken}`
//         }
//       }
//     );

//     // ✅ Summary (Certificate of Completion)
//     const certRes = await axios.get(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/certificate`,
//       {
//         responseType: "arraybuffer",
//         headers: {
//           Authorization: `Bearer ${accessToken}`
//         }
//       }
//     );

//     console.log("📄 PDF + Summary downloaded");

//     /* ===============================
//        📧 SEND EMAIL (BACKGROUND)
//     =============================== */
//     (async () => {
//       try {
//         const party = await TransactionParty.findById(partyId);
//         const transactionUser = await TransactionUser.findById(party.userId);

//         console.log("📧 Sending final email to:", transactionUser?.email);

//         if (transactionUser?.email) {
//           await sendSignedPdfEmail(
//             transactionUser.email,
//             pdfRes.data,
//             certRes.data
//           );
//           console.log("✅ Final email sent (PDF + Summary)");
//         } else {
//           console.warn("⚠️ No transaction user email found");
//         }
//       } catch (err) {
//         console.error("❌ Email error:", err);
//       }
//     })();

//     /* ===============================
//        📥 SEND PDF TO FRONTEND (FAST)
//     =============================== */
//     res.set({
//       "Content-Type": "application/pdf",
//       "Content-Disposition": "attachment; filename=Signed.pdf"
//     });

//     res.send(pdfRes.data);

//   } catch (err) {
//     console.error("❌ ERROR:", err);
//     res.status(500).send("Download error");
//   }
// });




// export default router;