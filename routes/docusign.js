import express from "express";

import Crg from "../models/CrgModel.js";
import BuyerAgreement from "../models/BuyerAgreementModel.js";
import BuyerAmendment from "../models/BuyerAmendmentModel.js";
import BuyerTermination from "../models/BuyerTerminationModel.js";
import RPC from "../models/RPCModel.js";
import SCSAAFA from "../models/SCSAAFAModel.js";
import IDMMGOL from "../models/IDMMGOLModel.js";
import ESRAA from "../models/ESRAAModel.js";

import nodemailer from "nodemailer";

const router = express.Router();

const DOCUMENTS = {
    CRG: {
        model: Crg,
        route: "crgpdf",
        title: "Customer Relationship Guide"
    },

    EBRADA: {
        model: BuyerAgreement,
        route: "ebradapdf",
        title: "Exclusive Buyer Representation Agreement"
    },

    EBRAA: {
        model: BuyerAmendment,
        route: "ebraapdf",
        title: "Buyer Representation Agreement Amendment"
    },

    EBRATDA: {
        model: BuyerTermination,
        route: "ebratdapdf",
        title: "Buyer Representation Agreement Termination"
    },

    RPC: {
        model: RPC,
        route: "rpcpdf",
        title: "Residential Purchase Contract"
    },

    SCSAAFA: {
        model: SCSAAFA,
        route: "scsaafa",
        title: "Seller Customer Status Acknowledgment and Fee Agreement"
    },

    IDMMGOL: {
        model: IDMMGOL,
        route: "idmmgol",
        title: "Illegal Drug Manufacture / Marijuana Grow Operation Listing"
    },

    ESRAA: {
        model: ESRAA,
        route: "esraa",
        title: "Exclusive Seller Representation Agreement Amendment"
    }
};

router.post("/remind-signer", async (req, res) => {
    console.log("runs1")
    try {
        const {
            partyId,
            documentType,
            recipientId,
        } = req.body;

        if (!partyId || !documentType || !recipientId) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields.",
            });
        }
        console.log("runs2")
        const config = DOCUMENTS[documentType];

        if (!config) {
            return res.status(400).json({
                success: false,
                message: "Invalid document type.",
            });
        }

        const doc = await config.model.findOne({
            partyId,
        });

        if (!doc) {
            return res.status(404).json({
                success: false,
                message: "Document not found.",
            });
        }

        const signer = doc.signers.find(
            (s) => s.recipientId === recipientId
        );

        if (!signer) {
            return res.status(404).json({
                success: false,
                message: "Signer not found.",
            });
        }

        // const signingLink =
        //     `https://realtorparth.ca/api/${config.route}` +
        //     `/start-sign/${partyId}?recipientId=${recipientId}`;

        const signingLink = `https://realtorparth.ca/api/${config.route}` + `/start-sign/${partyId}/${recipientId}`;

        const transporter = nodemailer.createTransport({
            host: 'smtp-relay.brevo.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.BREVO_USER,
                pass: process.env.BREVO_PASSWORD,
            }
        });
        // const documentName = docType;
        await transporter.sendMail({
            from: `"RealtorParth" <hello@realtorparth.ca>`,
            to: signer.email,
            subject: `Reminder: ${config.title} awaiting signature`,
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
This is a friendly reminder that your
<strong>${config.title}</strong>
is still waiting for your electronic signature.
</p>

<p style="font-size:16px;color:#555;line-height:28px;">
Please review and sign the document as soon as possible to help keep your transaction moving forward.
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
Review & Sign Document
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
If you have already completed the signature, you may safely ignore this reminder.
</p>

<p style="margin-top:15px;font-size:15px;color:#555;line-height:26px;">
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
This is an automated reminder from RealtorParth.<br>
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

        return res.json({
            success: true,
            message: "Reminder sent successfully.",
        });

    } catch (err) {

        console.error(err);

        return res.status(500).json({
            success: false,
            message: "Unable to send reminder.",
        });

    }
});


export default router;