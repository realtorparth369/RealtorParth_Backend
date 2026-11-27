import express from "express";
import BuyerTermination from "../models/BuyerTerminationModel.js";
import fs from "fs";
import path from "path";


import axios from "axios";
import jwt from "jsonwebtoken";

import { PDFDocument, StandardFonts } from "pdf-lib";
import Transaction from "../models/Transaction.js";
import TransactionParty from "../models/TransactionParty.js";
import TransactionUser from "../models/TransactionUser.js";
import nodemailer from "nodemailer";

const router = express.Router();


/* ===============================
   GET DATA BY USER
================================ */


// router.get("/buyer-termination/user/:transactionId/:userId", async (req, res) => {

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

//     const data = await BuyerTermination.findOne({
//       transactionId   // ✅ KEY FIX
//     });

//     res.json({
//       success: true,
//       data
//     });

//   } catch (err) {

//     console.error(err);
//     res.status(500).json({ success: false });

//   }

// });





router.get("/buyer-termination/user/:partyId", async (req, res) => {

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

    const data = await BuyerTermination.findOne({
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
   GENERATE PDF + SAVE
================================ */

// router.post("/generate-buyer-termination", async (req, res) => {

//   try {

//     const data = req.body;

//     const { transactionId, userId } = data;

//     if (!transactionId || !userId) {
//       return res.status(400).json({ message: "transactionId or userId missing" });
//     }

//     /* ===============================
//        VERIFY TRANSACTION OWNERSHIP
//     =============================== */

//     const transaction = await Transaction.findOne({
//       _id: transactionId,
//       userId
//     });

//     if (!transaction) {
//       return res.json({ success: false, message: "Unauthorized" });
//     }

//     /* ===============================
//        SAVE / UPDATE (PER TRANSACTION)
//     =============================== */

//     await BuyerTermination.findOneAndUpdate(
//       { transactionId },   // ✅ KEY FIX
//       data,
//       { upsert: true, new: true }
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
      subject: "Signed Buyer Agreement Termination Document + Summary",
      text: "Attached are your fully signed document and audit summary from DocuSign.",
      attachments: [
        {
          filename: "Signed-Buyer-Agreement-Termination.pdf",
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
    console.error("❌ Email error:", error?.response || error.message || error);
  }
};

router.post("/generate-buyer-termination", async (req, res) => {
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
    // await BuyerTermination.findOneAndUpdate(
    //   { partyId }, // 🔥 MAIN FIX
    //   {
    //     ...data,
    //     partyId,
    //     transactionId: party.transactionId // ✅ optional
    //   },
    //   {
    //     new: true,
    //     upsert: true
    //   }
    // );

    /* ===============================
      SAVE / UPDATE (PER PARTY)
    =============================== */

    await BuyerTermination.findOneAndUpdate(
      { partyId },
      {
        ...data,

        partyId,
        transactionId: party.transactionId,

        /* Reset signing status whenever
           the document is regenerated */

        envelopeId: null,
        completedEmailSent: false,

        signers: [],

        buyer1Signed: false,
        buyer2Signed: false,

        witness1Signed: false,
        witness2Signed: false,

        brokerSigned: false,

        buyer1SignedAt: null,
        buyer2SignedAt: null,

        witness1SignedAt: null,
        witness2SignedAt: null,

        brokerSignedAt: null
      },
      {
        new: true,
        upsert: true
      }
    );
    /* ===============================
       LOAD PDF TEMPLATE
    =============================== */
    const pdfPath = path.join(process.cwd(), "Exclusive Buyer Representation Agreement Termination (Designated Agency).pdf");
    const existingPdfBytes = fs.readFileSync(pdfPath);
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
    if (data.brokerageName1) {
      form.getTextField("txts_broker")
        .setText(data.brokerageName1);
    }
    if (data.brokerageName2) {
      form.getTextField("txts_brkagent_ABC")
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
    if (data.terminateAgreement) {
      form.getTextField("txtp_PlatBook_ABC")
        .setText(data.terminateAgreement);
    }
    if (data.terminationTime) {
      form.getTextField("txtTerminationTime")
        .setText(data.terminationTime);
    }
    if (data.terminationDate) {
      const [year, month, day] = data.terminationDate.split("-");
      const yy = year.slice(-2);
      form.getTextField("txtTerminationDate_m").setText(month);
      form.getTextField("txtTerminationDate_d").setText(day);
      form.getTextField("txtTerminationDate_yy").setText(yy);
    }
    if (data.terminationType) {
      try {
        const radioField = form.getRadioGroup("radio_group_24hbxi");
        if (data.terminationType === "unconditional") {
          radioField.select("1");
        }
        if (data.terminationType === "conditional") {
          radioField.select("2");
        }
      } catch (err) {
        console.log("Third party radio group not found");
      }
    }
    if (data.additionalTerms) {
      form.getTextField("txtAddTerms").setText(data.additionalTerms);
      form.getCheckBox("chkOpt_Terms").check();
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
    if (data.brokerPrint) {
      form.getTextField("txts_brknamesig").setText(data.brokerPrint);
    }
    form.updateFieldAppearances(font);
    form.flatten();
    // 3️⃣ Save with appearance refresh enabled
    const pdfBytes = await pdfDoc.save({
      updateFieldAppearances: true
    });
    /* ===============================
       SAVE PDF
    =============================== */
    const pdfBuffer = Buffer.from(pdfBytes);
    if (!sendEmail) {
      return res.json({
        success: true,
        message: "Buyer Termination saved successfully."
      });
    }
    return res.json({
      success: true,
      message: "Buyer Termination saved successfully."
    });
  }
  catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});



router.post("/send-buyer-termination-for-signature", async (req, res) => {
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

    const transactionUser =
      await TransactionUser.findById(
        party.userId
      );

    /* ===============================
       GET SAVED DATA
    =============================== */

    const data =
      await BuyerTermination.findOne({
        partyId
      });

    if (!data) {
      return res.status(404).json({
        success: false,
        message:
          "Buyer Termination not found"
      });
    }

    /* ===============================
       GENERATE PDF
    =============================== */

    const pdfPath = path.join(
      process.cwd(),
      "Exclusive Buyer Representation Agreement Termination (Designated Agency).pdf"
    );

    const existingPdfBytes =
      fs.readFileSync(pdfPath);

    const pdfDoc =
      await PDFDocument.load(
        existingPdfBytes,
        {
          ignoreEncryption: true
        }
      );

    const form = pdfDoc.getForm();

    const font =
      await pdfDoc.embedFont(
        StandardFonts.Helvetica
      );

    if (data.brokerageName1) {
      form
        .getTextField("txts_broker")
        .setText(data.brokerageName1);
    }

    if (data.brokerageName2) {
      form
        .getTextField("txts_brkagent_ABC")
        .setText(data.brokerageName2);
    }

    if (data.buyerName1) {
      form
        .getTextField("txtbuyer1")
        .setText(data.buyerName1);
    }

    if (data.buyerName2) {
      form
        .getTextField("txtbuyer2")
        .setText(data.buyerName2);
    }

    if (data.terminateAgreement) {
      form
        .getTextField("txtp_PlatBook_ABC")
        .setText(data.terminateAgreement);
    }

    if (data.terminationTime) {
      form
        .getTextField("txtTerminationTime")
        .setText(data.terminationTime);
    }

    if (data.terminationDate) {
      const [year, month, day] =
        data.terminationDate.split("-");

      const yy = year.slice(-2);

      form
        .getTextField(
          "txtTerminationDate_m"
        )
        .setText(month);

      form
        .getTextField(
          "txtTerminationDate_d"
        )
        .setText(day);

      form
        .getTextField(
          "txtTerminationDate_yy"
        )
        .setText(yy);
    }

    if (data.terminationType) {
      try {
        const radioField =
          form.getRadioGroup(
            "radio_group_24hbxi"
          );

        if (
          data.terminationType ===
          "unconditional"
        ) {
          radioField.select("1");
        }

        if (
          data.terminationType ===
          "conditional"
        ) {
          radioField.select("2");
        }
      } catch (err) {
        console.log(
          "Third party radio group not found"
        );
      }
    }

    if (data.additionalTerms) {
      form
        .getTextField("txtAddTerms")
        .setText(
          data.additionalTerms
        );

      form
        .getCheckBox(
          "chkOpt_Terms"
        )
        .check();
    }

    if (data.buyerPrint1) {
      form
        .getTextField("txtbuyersig1")
        .setText(data.buyerPrint1);
    }

    if (data.buyerPrint2) {
      form
        .getTextField("txtbuyersig2")
        .setText(data.buyerPrint2);
    }

    if (data.witnessPrint1) {
      form
        .getTextField("txtWitness1Sig")
        .setText(
          data.witnessPrint1
        );
    }

    if (data.witnessPrint2) {
      form
        .getTextField("txtWitness2Sig")
        .setText(
          data.witnessPrint2
        );
    }

    if (data.brokerPrint) {
      form
        .getTextField(
          "txts_brknamesig"
        )
        .setText(data.brokerPrint);
    }

    form.updateFieldAppearances(
      font
    );

    form.flatten();

    const pdfBytes =
      await pdfDoc.save();

    /* ===============================
       DOCUSIGN TOKEN
    =============================== */

    const accessToken =
      await getAccessToken();

    /* ===============================
       SIGNERS
    =============================== */
    /* ===============================
   SIGNERS
=============================== */

    const signers = [];

    /* ===============================
       BUYER 1
    =============================== */

    if (data.buyerPrint1 && data.buyerEmail1) {
      signers.push({
        email: data.buyerEmail1,
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
       BUYER 2 (OPTIONAL)
    =============================== */

    if (data.buyerPrint2 && data.buyerEmail2) {
      signers.push({
        email: data.buyerEmail2,
        name: data.buyerPrint2,
        recipientId: "2",
        routingOrder: "2",
        clientUserId: `${partyId}_buyer2`,
        tabs: {
          signHereTabs: [
            {
              anchorString: "/sign2/"
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
       WITNESS 1 (OPTIONAL)
    =============================== */

    if (data.witnessPrint1 && data.witnessEmail1) {
      signers.push({
        email: data.witnessEmail1,
        name: data.witnessPrint1,
        recipientId: "3",
        routingOrder: "3",
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
       WITNESS 2 (OPTIONAL)
    =============================== */

    if (data.witnessPrint2 && data.witnessEmail2) {
      signers.push({
        email: data.witnessEmail2,
        name: data.witnessPrint2,
        recipientId: "4",
        routingOrder: "4",
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
       BROKER (OPTIONAL)
    =============================== */

    if (data.brokerPrint && data.brokerEmail) {
      signers.push({
        email: data.brokerEmail,
        name: data.brokerPrint,
        recipientId: "5",
        routingOrder: "5",
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

    console.log("Buyer Termination Signers:", signers);

    /* ===============================
       CREATE ENVELOPE
    =============================== */

    /* ===============================
   CREATE ENVELOPE
=============================== */

    const envelopePayload = {
      emailSubject:
        "Please sign the Buyer Representation Termination document",

      documents: [
        {
          documentBase64: Buffer.from(pdfBytes).toString(
            "base64"
          ),
          name: "Buyer Representation Termination.pdf",
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

    const envelopeId =
      envelopeRes.data.envelopeId;

    /* ===============================
       SAVE ENVELOPE DETAILS
    =============================== */

    await BuyerTermination.findOneAndUpdate(
      { partyId },
      {
        envelopeId,

        completedEmailSent: false,

        signers: signers.map((s) => ({
          recipientId: s.recipientId,
          clientUserId:
            s.clientUserId || null,
          email: s.email,
          name: s.name,
          routingOrder:
            s.routingOrder
        }))
      }
    );

    /* ===============================
       SEND EMAILS
    =============================== */
    /* ===============================
   SEND EMAILS
=============================== */

    for (const signer of signers) {

      const signingLink = `https://realtorparth.ca/api/ebratdapdf/start-sign/${partyId}/${signer.recipientId}`;

      await transporter.sendMail({
        from: `"RealtorParth" <hello@realtorparth.ca>`,
        to: signer.email,
        subject:
          "Buyer Representation Agreement Termination Ready For Signature",

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
Your <strong>Buyer Representation Agreement Termination</strong> document has been prepared and is now ready for your electronic signature.
</p>

<p style="font-size:16px;color:#555;line-height:28px;">
Please review the document carefully and complete your signature by clicking the button below.
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
Sign Buyer Representation Termination
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
      message:
        "Buyer Representation Termination sent for signature successfully."
    });

  } catch (error) {

    console.error(
      "BUYER TERMINATION DOCUSIGN ERROR:",
      error.response?.data || error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to send Buyer Representation Termination for signature."
    });

  }
});

router.get("/start-sign/:partyId/:recipientId", async (req, res) => {
  try {
    const { partyId, recipientId } = req.params;

    const buyerTermination =
      await BuyerTermination.findOne({
        partyId
      });

    if (!buyerTermination) {
      return res
        .status(404)
        .send("Buyer Termination not found.");
    }

    if (!buyerTermination.envelopeId) {
      return res
        .status(400)
        .send("Envelope not created yet.");
    }

    if (
      !buyerTermination.signers ||
      buyerTermination.signers.length === 0
    ) {
      return res
        .status(400)
        .send("No signers found.");
    }

    /* ===============================
       FIND CURRENT SIGNER
    =============================== */

    const signer =
      buyerTermination.signers.find(
        (s) => s.recipientId === recipientId
      );

    if (!signer) {
      return res
        .status(404)
        .send("Signer not found.");
    }

    const accessToken =
      await getAccessToken();

    /* ===============================
       CREATE RECIPIENT VIEW
    =============================== */

    const viewRes = await axios.post(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${buyerTermination.envelopeId}/views/recipient`,
      {
        authenticationMethod: "none",

        email: signer.email,
        userName: signer.name,

        clientUserId: signer.clientUserId,

        returnUrl:
          `https://realtorparth.ca/api/ebratdapdf/sign-complete/${partyId}/${recipientId}`
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type":
            "application/json"
        }
      }
    );

    return res.redirect(
      viewRes.data.url
    );

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


router.get("/sign-complete/:partyId/:recipientId", async (req, res) => {
  try {
    const { partyId, recipientId } = req.params;

    /* ===============================
       GET DOCUMENT
    =============================== */

    const buyerTermination =
      await BuyerTermination.findOne({
        partyId
      });

    if (!buyerTermination) {
      return res
        .status(404)
        .send("Buyer Termination not found.");
    }

    /* ===============================
       UPDATE SIGN STATUS
    =============================== */

    switch (recipientId) {

      case "1":
        buyerTermination.buyer1Signed = true;
        buyerTermination.buyer1SignedAt = new Date();
        break;

      case "2":
        buyerTermination.buyer2Signed = true;
        buyerTermination.buyer2SignedAt = new Date();
        break;

      case "3":
        buyerTermination.witness1Signed = true;
        buyerTermination.witness1SignedAt = new Date();
        break;

      case "4":
        buyerTermination.witness2Signed = true;
        buyerTermination.witness2SignedAt = new Date();
        break;

      case "5":
        buyerTermination.brokerSigned = true;
        buyerTermination.brokerSignedAt = new Date();
        break;
    }

    await buyerTermination.save();

    /* ===============================
       CHECK REQUIRED SIGNERS
    =============================== */

    const buyer2Required =
      !!buyerTermination.buyerPrint2 &&
      !!buyerTermination.buyerEmail2;

    const witness1Required =
      !!buyerTermination.witnessPrint1 &&
      !!buyerTermination.witnessEmail1;

    const witness2Required =
      !!buyerTermination.witnessPrint2 &&
      !!buyerTermination.witnessEmail2;

    const brokerRequired =
      !!buyerTermination.brokerPrint &&
      !!buyerTermination.brokerEmail;

    const allSigned =

      buyerTermination.buyer1Signed &&

      (
        !buyer2Required ||
        buyerTermination.buyer2Signed
      ) &&

      (
        !witness1Required ||
        buyerTermination.witness1Signed
      ) &&

      (
        !witness2Required ||
        buyerTermination.witness2Signed
      ) &&

      (
        !brokerRequired ||
        buyerTermination.brokerSigned
      );

    if (!allSigned) {

      console.log(
        "Waiting for remaining signers..."
      );

      return res.redirect(
        "https://realtorparth.ca/signature-complete"
      );

    }

    /* ===============================
       PREVENT DUPLICATE EMAIL
    =============================== */

    if (buyerTermination.completedEmailSent) {

      return res.redirect(
        "https://realtorparth.ca/signature-complete"
      );

    }

    /* ===============================
       GET PARTY
    =============================== */

    const party = await TransactionParty.findById(
      partyId
    );

    if (!party) {
      return res
        .status(404)
        .send("Party not found.");
    }

    /* ===============================
       TRANSACTION USER
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
       STATUS HTML
    =============================== */

    const statusRows = `
<tr style="background:#f8fafc;">
<td style="font-weight:600;">Buyer 1</td>
<td style="color:${buyerTermination.buyer1Signed ? "#16a34a" : "#dc2626"};">
${buyerTermination.buyer1Signed ? "✔ Signed" : "✘ Pending"}
</td>
</tr>

${buyer2Required ? `
<tr>
<td style="font-weight:600;">Buyer 2</td>
<td style="color:${buyerTermination.buyer2Signed ? "#16a34a" : "#dc2626"};">
${buyerTermination.buyer2Signed ? "✔ Signed" : "✘ Pending"}
</td>
</tr>
` : ""}

${witness1Required ? `
<tr style="background:#f8fafc;">
<td style="font-weight:600;">Witness 1</td>
<td style="color:${buyerTermination.witness1Signed ? "#16a34a" : "#dc2626"};">
${buyerTermination.witness1Signed ? "✔ Signed" : "✘ Pending"}
</td>
</tr>
` : ""}

${witness2Required ? `
<tr>
<td style="font-weight:600;">Witness 2</td>
<td style="color:${buyerTermination.witness2Signed ? "#16a34a" : "#dc2626"};">
${buyerTermination.witness2Signed ? "✔ Signed" : "✘ Pending"}
</td>
</tr>
` : ""}

${brokerRequired ? `
<tr style="background:#f8fafc;">
<td style="font-weight:600;">Broker</td>
<td style="color:${buyerTermination.brokerSigned ? "#16a34a" : "#dc2626"};">
${buyerTermination.brokerSigned ? "✔ Signed" : "✘ Pending"}
</td>
</tr>
` : ""}
`;

    /* ===============================
       SEND EMAIL
    =============================== */

    await transporter.sendMail({
      from: `"RealtorParth" <hello@realtorparth.ca>`,
      to: transactionUser.email,
      subject:
        "Buyer Representation Agreement Termination Completed",

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
<h1 style="margin:0;color:#ffffff;">
RealtorParth
</h1>
</td>
</tr>

<tr>
<td style="padding:40px;">

<h2 style="margin-top:0;">
Buyer Representation Agreement Completed
</h2>

<p style="font-size:16px;color:#555;line-height:28px;">
All required parties have completed their electronic signatures.
</p>

<table
width="100%"
cellpadding="10"
cellspacing="0"
style="margin:30px 0;border-collapse:collapse;border:1px solid #e5e7eb;">

<tr style="background:#f8fafc;">
<td style="font-weight:600;width:180px;">Client</td>
<td>${party.name}</td>
</tr>

<tr>
<td style="font-weight:600;">Email</td>
<td>${party.email}</td>
</tr>

<tr style="background:#f8fafc;">
<td style="font-weight:600;">Document</td>
<td>Buyer Representation Termination</td>
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

${statusRows}

</table>

<p style="margin-top:30px;">
All required signatures have now been collected.
</p>

<p style="margin-top:35px;">
Kind Regards,<br>
<strong>RealtorParth Team</strong>
</p>

</td>
</tr>

<tr>
<td style="background:#f7f7f7;padding:20px;text-align:center;font-size:13px;color:#777;">
This is an automated notification from RealtorParth.
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
       COMPLETE
    =============================== */
    /* ===============================
   COMPLETE
=============================== */

    buyerTermination.completedEmailSent = true;

    await buyerTermination.save();

    console.log(
      "Buyer Termination completedEmailSent updated."
    );

    return res.redirect(
      "https://realtorparth.ca/signature-complete"
    );

  } catch (err) {

    console.error(
      "========== BUYER TERMINATION SIGN COMPLETE ERROR =========="
    );

    console.error(
      err.response?.data || err
    );

    return res.redirect(
      "https://realtorparth.ca/signature-complete"
    );

  }
});


// router.post("/send-buyer-termination-for-signature", async (req, res) => {
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
//     const transactionUser = await TransactionUser.findById(
//       party.userId
//     );
//     /* ===============================
//        GET SAVED DATA
//     =============================== */
//     const data = await BuyerTermination.findOne({ partyId });
//     if (!data) {
//       return res.status(404).json({
//         success: false,
//         message: "Buyer Termination not found"
//       });
//     }
//     const pdfPath = path.join(
//       process.cwd(),
//       "Exclusive Buyer Representation Agreement Termination (Designated Agency).pdf"
//     );
//     const existingPdfBytes = fs.readFileSync(pdfPath);
//     const pdfDoc = await PDFDocument.load(existingPdfBytes, {
//       ignoreEncryption: true
//     });
//     const form = pdfDoc.getForm();
//     const font = await pdfDoc.embedFont(
//       StandardFonts.Helvetica
//     );
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
//     if (data.terminateAgreement) {
//       form.getTextField("txtp_PlatBook_ABC")
//         .setText(data.terminateAgreement);
//     }
//     if (data.terminationTime) {
//       form.getTextField("txtTerminationTime")
//         .setText(data.terminationTime);
//     }
//     if (data.terminationDate) {
//       const [year, month, day] = data.terminationDate.split("-");
//       const yy = year.slice(-2);
//       form.getTextField("txtTerminationDate_m").setText(month);
//       form.getTextField("txtTerminationDate_d").setText(day);
//       form.getTextField("txtTerminationDate_yy").setText(yy);
//     }
//     if (data.terminationType) {
//       try {
//         const radioField = form.getRadioGroup("radio_group_24hbxi");
//         if (data.terminationType === "unconditional") {
//           radioField.select("1");
//         }
//         if (data.terminationType === "conditional") {
//           radioField.select("2");
//         }
//       } catch (err) {
//         console.log("Third party radio group not found");
//       }
//     }
//     if (data.additionalTerms) {
//       form.getTextField("txtAddTerms").setText(data.additionalTerms);
//       form.getCheckBox("chkOpt_Terms").check();
//     }
//     if (data.buyerPrint1) {
//       form.getTextField("txtbuyersig1").setText(data.buyerPrint1);
//     }
//     if (data.buyerPrint2) {
//       form.getTextField("txtbuyersig2").setText(data.buyerPrint2);
//     }
//     if (data.witnessPrint1) {
//       form.getTextField("txtWitness1Sig").setText(data.witnessPrint1);
//     }
//     if (data.witnessPrint2) {
//       form.getTextField("txtWitness2Sig").setText(data.witnessPrint2);
//     }
//     if (data.brokerPrint) {
//       form.getTextField("txts_brknamesig").setText(data.brokerPrint);
//     }
//     form.updateFieldAppearances(font);
//     form.flatten();
//     const pdfBytes = await pdfDoc.save();
//     const accessToken = await getAccessToken();
//     /* ===============================
//        SIGNERS
//     =============================== */
//     const signers = [];
//     const baseEmail = party.email;
//     const [name, domain] = baseEmail.split("@");
//     const buyer1Email = baseEmail;
//     const buyer2Email = `${name}+buyer2@${domain}`;
//     /* BUYER 1 */
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
//     if (data.brokerPrint && transactionUser?.email) {
//       signers.push({
//         email: transactionUser.email,
//         name: data.brokerPrint,
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
//     console.log("Buyer Termination Signers:", signers);
//     if (signers.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Buyer details missing. Cannot send."
//       });
//     }
//     /* ===============================
//        CREATE ENVELOPE
//     =============================== */
//     const envelopePayload = {
//       emailSubject: "Please sign the Buyer Representation Termination document",
//       documents: [
//         {
//           documentBase64: Buffer.from(pdfBytes).toString(
//             "base64"
//           ),
//           name: "Buyer Representation Termination.pdf",
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
//     await BuyerTermination.findOneAndUpdate(
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
//     /* ===============================
//        EMAIL CLIENT
//     =============================== */
//     const signingLink = `https://realtorparth.ca/api/ebratdapdf/start-sign/${partyId}`;
//     await transporter.sendMail({
//       from: `"RealtorParth" <hello@realtorparth.ca>`,
//       to: party.email,
//       subject: "Buyer Representation Agreement Termination Ready For Signature",
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
//         Hello ${data.buyerPrint1},
//         </h2>

//         <p style="font-size:16px;color:#555;line-height:28px;">
//         Your <strong>Buyer Representation Agreement Termination</strong> document has been prepared and is now ready for your electronic signature.
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
//         Representation Agreement Termination
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
//     console.error("BUYER TERMINATION DOCUSIGN ERROR:", error.response?.data || error);
//     res.status(500).json({
//       success: false,
//       message:
//         "Failed to send Buyer Representation Termination for signature."
//     });
//   }
// });


// router.get("/start-sign/:partyId", async (req, res) => {
//   try {
//     const { partyId } = req.params;

//     const buyerTermination = await BuyerTermination.findOne({
//       partyId
//     });

//     if (!buyerTermination) {
//       return res
//         .status(404)
//         .send("Buyer Termination not found.");
//     }

//     if (!buyerTermination.envelopeId) {
//       return res
//         .status(400)
//         .send("Envelope not created yet.");
//     }

//     if (
//       !buyerTermination.signers ||
//       buyerTermination.signers.length === 0
//     ) {
//       return res
//         .status(400)
//         .send("No signers found.");
//     }

//     /* ===============================
//        FIRST SIGNER
//     =============================== */

//     const signer =
//       buyerTermination.signers.find(
//         s => s.recipientId === "1"
//       ) || buyerTermination.signers[0];

//     const accessToken = await getAccessToken();

//     /* ===============================
//        CREATE RECIPIENT VIEW
//     =============================== */

//     const viewRes = await axios.post(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${buyerTermination.envelopeId}/views/recipient`,
//       {
//         authenticationMethod: "none",

//         email: signer.email,
//         userName: signer.name,

//         clientUserId: signer.clientUserId,

//         returnUrl: `https://realtorparth.ca/api/ebratdapdf/sign-complete/${partyId}`
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
//     const buyerTermination = await BuyerTermination.findOne({
//       partyId
//     });
//     if (!buyerTermination) {
//       return res
//         .status(404)
//         .send("Buyer Termination not found.");
//     }
//     // Prevent duplicate notifications
//     if (buyerTermination.completedEmailSent) {
//       console.log("Notification already sent.");
//       return res.redirect(
//         "https://realtorparth.ca/signature-complete"
//       );
//     }
//     const party = await TransactionParty.findById(partyId);
//     if (!party) {
//       return res.status(404).send("Party not found.");
//     }
//     /* ===============================
//        TRANSACTION USER
//     =============================== */
//     const transactionUser = await TransactionUser.findById(
//       party.userId
//     );
//     if (!transactionUser) {
//       return res
//         .status(404)
//         .send("Transaction User not found.");
//     }
//     /* ===============================
//        SEND EMAIL
//     =============================== */
//     await transporter.sendMail({
//       from: `"RealtorParth" <hello@realtorparth.ca>`,
//       to: transactionUser.email,
//       subject: "Buyer Representation Agreement Termination Signed by Client",
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
// The client has successfully completed their electronic signature for the <strong>Buyer Representation Agreement Termination</strong> document.
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
// <td style="color:#555;">Buyer Representation Termination</td>
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
//     /* ===============================
//        PREVENT DUPLICATE EMAIL
//     =============================== */
//     buyerTermination.completedEmailSent = true;
//     await buyerTermination.save();
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






//   /* ===============================
//     DOCUSIGN FLOW
//  =============================== */

//   const accessToken = await getAccessToken();
//   const isEmbedded = !sendEmail;

//   const embeddedSigners = [];
//   const emailSigners = [];

//   let recipientId = 1;

//   const baseEmail = party.email;
//   const [name, domain] = baseEmail.split("@");

//   const buyer1Email = baseEmail;
//   const buyer2Email = `${name}+buyer2@${domain}`;

//   /* 🟢 BUYER 1 */
//   if (data.buyerPrint1) {
//     embeddedSigners.push({
//       email: buyer1Email,
//       name: data.buyerPrint1,
//       recipientId: String(recipientId),
//       routingOrder: String(recipientId),
//       ...(isEmbedded && {
//         clientUserId: `${party._id}_buyer1`
//       }),
//       tabs: {
//         signHereTabs: [{ anchorString: "/sign1/" }]
//       }
//     });
//     recipientId++;
//   }

//   /* 🔵 BUYER 2 */
//   if (data.buyerPrint2) {
//     embeddedSigners.push({
//       email: buyer2Email,
//       name: data.buyerPrint2,
//       recipientId: String(recipientId),
//       routingOrder: String(recipientId),
//       ...(isEmbedded && {
//         clientUserId: `${party._id}_buyer2`
//       }),
//       tabs: {
//         signHereTabs: [{ anchorString: "/sign2/" }]
//       }
//     });
//     recipientId++;
//   }

//   /* 🟣 REP (EMAIL ONLY) */
//   if (data.brokerPrint && transactinuser?.email) {
//     emailSigners.push({
//       email: transactinuser.email,
//       name: data.brokerPrint,
//       recipientId: String(recipientId),
//       routingOrder: String(recipientId),
//       tabs: {
//         signHereTabs: [{ anchorString: "/sign5/" }]
//       }
//     });
//     recipientId++;
//   }

//   const allSigners = [...embeddedSigners, ...emailSigners];

//   if (allSigners.length === 0) {
//     return res.status(400).json({ error: "No signers found" });
//   }

//   /* ===============================
//      CREATE ENVELOPE
//   =============================== */
//   const envelopeRes = await axios.post(
//     `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes`,
//     {
//       emailSubject: "Please sign Buyer Amendment document",
//       documents: [
//         {
//           documentBase64: Buffer.from(pdfBytes).toString("base64"),
//           name: "Buyer Agreement Termination.pdf",
//           fileExtension: "pdf",
//           documentId: "1"
//         }
//       ],
//       recipients: { signers: allSigners },
//       status: "sent"
//     },
//     {
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//         "Content-Type": "application/json"
//       }
//     }
//   );

//   const envelopeId = envelopeRes.data.envelopeId;

//   /* ===============================
//      STORE SESSION (ONLY BUYERS)
//   =============================== */
//   global.signingSessions = global.signingSessions || {};

//   global.signingSessions[partyId] = {
//     envelopeId,
//     signers: embeddedSigners,
//     currentIndex: 0
//   };

//   /* ===============================
//      START SIGNING (BUYER 1)
//   =============================== */
//   let signingUrl = null;

//   if (isEmbedded && embeddedSigners.length > 0) {
//     const firstSigner = embeddedSigners[0];

//     const viewRes = await axios.post(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/views/recipient`,
//       {
//         // returnUrl: `${process.env.FRONTEND_URL}/sign-redirect?partyId=${partyId}&type=ebratda`,
//         returnUrl: `http://localhost:5173/sign-redirect?partyId=${partyId}&type=ebratda`,
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

//     signingUrl = viewRes.data.url;
//   }




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
        // returnUrl: `${process.env.FRONTEND_URL}/sign-redirect?partyId=${partyId}&type=ebratda`,
        returnUrl: `http://localhost:5173/sign-redirect?partyId=${partyId}&type=ebratda`,
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
       🔍 CHECK STATUS (NO WAIT)
    =============================== */
    const envelopeRes = await axios.get(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const status = envelopeRes.data.status;

    console.log("📄 Envelope Status:", status);

    // ❗ NOT COMPLETED → DON'T SEND EMAIL
    if (status !== "completed") {
      return res.status(202).json({
        message: "Waiting for final signer (agent)"
      });
    }

    /* ===============================
       📄 DOWNLOAD FINAL PDF + SUMMARY
    =============================== */

    const pdfRes = await axios.get(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/combined`,
      {
        responseType: "arraybuffer",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const certRes = await axios.get(
      `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/certificate`,
      {
        responseType: "arraybuffer",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    console.log("📄 FINAL PDF + SUMMARY READY");

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
          console.log("✅ Email sent with FULL signatures");
        }
      } catch (err) {
        console.error("❌ Email error:", err);
      }
    })();

    /* ===============================
       📥 RETURN PDF
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

//       await new Promise((r) => setTimeout(r, 1500)); // wait 1 sec
//       attempts++;
//     }

//     console.log("📄 Downloading envelope:", envelopeId);
//     console.log("⏳ Status:", status);

//     /* ===============================
//        DOWNLOAD FINAL PDF
//     =============================== */
//     const docRes = await axios.get(
//       `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/combined`,
//       {
//         responseType: "arraybuffer",
//         headers: {
//           Authorization: `Bearer ${accessToken}`
//         }
//       }
//     );

//     res.set({
//       "Content-Type": "application/pdf",
//       "Content-Disposition": "attachment; filename=Signed.pdf"
//     });

//     res.send(docRes.data);

//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Download error");
//   }
// });





export default router;