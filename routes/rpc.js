import express from "express";
import fs from "fs";
import path from "path";

import nodemailer from "nodemailer";
import axios from "axios";
import jwt from "jsonwebtoken";

import { PDFDocument, StandardFonts } from "pdf-lib";
import RPC from "../models/RPCModel.js";
import Transaction from "../models/Transaction.js";
import TransactionParty from "../models/TransactionParty.js";
import TransactionUser from "../models/TransactionUser.js";


import nodemailer from "nodemailer";

const router = express.Router();

/* ===============================
   PDF TEMPLATE PATH
=============================== */

const PDF_PATH = path.join(
    process.cwd(),
    "Residential Purchase Contract.pdf" // make sure file exists
);

/* ===============================
   GENERATE + SAVE RPC
=============================== */

//router.post("/generate-rpc", async (req, res) => {
//  try {
//    const { transactionUserId, ...data } = req.body;
//const data = req.body;
//    if (!transactionUserId) {
//      return res.status(400).json({
//        error: "transactionUserId is required",
//      });
//    }

/* ===============================
   SAVE OR UPDATE DB
=============================== */

//    const saved = await RPC.findOneAndUpdate(
//      { transactionUserId },
//      { ...data, transactionUserId },
//      { upsert: true, new: true }
//    );



// router.post("/generate-rpc", async (req, res) => {
//   try {

//     const { transactionId, userId, ...data } = req.body;

//     if (!transactionId || !userId) {
//       return res.status(400).json({
//         error: "transactionId or userId is required",
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
//        SAVE OR UPDATE DB
//     =============================== */

//     const saved = await RPC.findOneAndUpdate(
//       { transactionId },          // ✅ KEY FIX
//       { ...data, transactionId }, // ✅ store transactionId
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
            subject: "Residential Purchase Contract Document + Summary",
            text: "Attached are your fully signed document and audit summary from DocuSign.",
            attachments: [
                {
                    filename: "Residential-Purchase-Contract.pdf",
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




router.post("/generate-rpc", async (req, res) => {
    try {
        const {
            partyId,
            sendEmail = false,
            isAdmin = false,
            ...data
        } = req.body;
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
        console.log(party);
        const transactinuser = await TransactionUser.findById(party.userId);
        /* ===============================
           GET EXISTING RECORD
        =============================== */
        const existing = await RPC.findOne({ partyId });
        /* ===============================
           SAVE / UPDATE (PER PARTY)
        =============================== */
        const rpc = await RPC.findOneAndUpdate(
            { partyId },
            {
                ...existing?.toObject(),
                ...data,
                partyId,
                transactionId: party.transactionId,
                /* Buyer Emails */
                buyerSignatureEmail1: data.buyerSignatureEmail1 ?? existing?.buyerSignatureEmail1 ?? "",
                buyerSignatureEmail2: data.buyerSignatureEmail2 ?? existing?.buyerSignatureEmail2 ?? "",
                buyerWitnessEmail1: data.buyerWitnessEmail1 ?? existing?.buyerWitnessEmail1 ?? "",
                buyerWitnessEmail2: data.buyerWitnessEmail2 ?? existing?.buyerWitnessEmail2 ?? "",
                sellerSignatureEmail1: data.sellerSignatureEmail1 ?? existing?.sellerSignatureEmail1 ?? "",
                sellerSignatureEmail2: data.sellerSignatureEmail2 ?? existing?.sellerSignatureEmail2 ?? "",
                sellerWitnessEmail1: data.sellerWitnessEmail1 ?? existing?.sellerWitnessEmail1 ?? "",
                sellerWitnessEmail2: data.sellerWitnessEmail2 ?? existing?.sellerWitnessEmail2 ?? "",
                spouseSignatureEmail: data.spouseSignatureEmail ?? existing?.spouseSignatureEmail ?? "",
                spouseWitnessEmail: data.spouseWitnessEmail ?? existing?.spouseWitnessEmail ?? ""
            },
            {
                new: true,
                upsert: true
            }
        );
        console.log("RPC Saved:", rpc);
        // 👉 continue your PDF logic here...
        /* ===============================
           LOAD PDF
        =============================== */
        const existingPdfBytes = fs.readFileSync(PDF_PATH);
        const pdfDoc = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });
        const form = pdfDoc.getForm();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        /* =====================================================
           SECTION A – BASIC INFO
        ===================================================== */
        // Property Address (split example if needed)
        if (data.agreementNumber) {
            form.getTextField("txtp_PlatBook")
                .setText(data.agreementNumber);
        }
        if (data.sellerName1) {
            form.getTextField("txtseller1")
                .setText(data.sellerName1);
        }
        if (data.sellerName2) {
            form.getTextField("txtseller2")
                .setText(data.sellerName2);
        }
        if (data.buyerName1) {
            form.getTextField("txtbuyer1")
                .setText(data.buyerName1);
        }
        if (data.buyerName2) {
            form.getTextField("txtbuyer2")
                .setText(data.buyerName2);
        }
        if (data.unitnumber) {
            form.getTextField("txtp_unitNumber")
                .setText(data.unitnumber);
        }
        if (data.streetnumber) {
            form.getTextField("txtp_streetnum")
                .setText(data.streetnumber);
        }
        if (data.streetname) {
            form.getTextField("txtp_street")
                .setText(data.streetname);
        }
        if (data.city) {
            form.getTextField("txtp_city")
                .setText(data.city);
        }
        if (data.postalCode) {
            form.getTextField("txtp_zipcode")
                .setText(data.postalCode);
        }
        if (data.plan) {
            form.getTextField("txtp_PageNumber")
                .setText(data.plan);
        }
        if (data.block) {
            form.getTextField("txtp_Block")
                .setText(data.block);
        }
        if (data.lot) {
            form.getTextField("txtp_LotNumber")
                .setText(data.lot);
        }
        if (data.legalOther) {
            form.getTextField("txtLegalOther")
                .setText(data.legalOther);
        }
        if (data.unattachedGoods) {
            form.getTextField("txtp_propincludes")
                .setText(data.unattachedGoods);
        }
        if (data.attachedGoods) {
            form.getTextField("txtp_propexcludes")
                .setText(data.attachedGoods);
        }
        if (data.purchasePrice) {
            form.getTextField("txtp_price")
                .setText(data.purchasePrice);
        }
        if (data.completionDay) {
            const [year, month, day] = data.completionDay.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtp_closedate_mmmm").setText(month);
            form.getTextField("txtp_closedate_dd").setText(day);
            form.getTextField("txtp_closedate_yy").setText(yy);
        }
        if (data.hidbrokerage) {
            form.getTextField("hidBrokerage")
                .setText(data.hidbrokerage);
        }
        if (data.depositTrustee) {
            form.getTextField("txtTrustee")
                .setText(data.depositTrustee);
        }
        if (data.depositAmount1) {
            form.getTextField("txtp_Deposit")
                .setText(data.depositAmount1);
        }
        if (data.depositMethod1) {
            form.getTextField("txtDepositMethod")
                .setText(data.depositMethod1);
        }
        if (data.depositTime1) {
            form.getTextField("txtampmAlter1")
                .setText(data.depositTime1);
        }
        if (data.depositDate1) {
            const [year, month, day] = data.depositDate1.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtalterDate_m").setText(month);
            form.getTextField("txtalterDate_d").setText(day);
            form.getTextField("txtalterDate_yy").setText(yy);
        }
        if (data.depositAmount2) {
            form.getTextField("txtp_AdditionalDeposit")
                .setText(data.depositAmount2);
        }
        if (data.depositMethod2) {
            form.getTextField("txtAddDepositMethod")
                .setText(data.depositMethod2);
        }
        if (data.depositTime2) {
            form.getTextField("txtampmAlter2")
                .setText(data.depositTime2);
        }
        if (data.depositDate2) {
            const [year, month, day] = data.depositDate2.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtalter2Date_m").setText(month);
            form.getTextField("txtalter2Date_d").setText(day);
            form.getTextField("txtalter2Date_yy").setText(yy);
        }
        if (data.altertime3) {
            form.getTextField("txtampmAlter3")
                .setText(data.altertime3);
        }
        if (data.alterdate3) {
            const [year, month, day] = data.alterdate3.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtalter3Date_m").setText(month);
            form.getTextField("txtalter3Date_d").setText(day);
            form.getTextField("txtalter3Date_yy").setText(yy);
        }
        if (data.downPaymentPercent) {
            form.getTextField("txtp_TotalFinance")
                .setText(data.downPaymentPercent);
        }
        if (data.financingConditionTime) {
            form.getTextField("txtFinTime")
                .setText(data.financingConditionTime);
        }
        if (data.financingConditionDay) {
            const [year, month, day] = data.financingConditionDay.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtFinancingDate_m").setText(month);
            form.getTextField("txtFinancingDate_d").setText(day);
            form.getTextField("txtFinancingDate_yy").setText(yy);
        }
        if (data.inspectionConditionTime) {
            form.getTextField("txtInspectTime")
                .setText(data.inspectionConditionTime);
        }
        if (data.inspectionConditionDay) {
            const [year, month, day] = data.inspectionConditionDay.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtInspectionDate_m").setText(month);
            form.getTextField("txtInspectionDate_d").setText(day);
            form.getTextField("txtInspectionDate_yy").setText(yy);
        }
        if (data.buyerPropertySaleTime) {
            form.getTextField("txtBuyPropTime")
                .setText(data.buyerPropertySaleTime);
        }
        if (data.buyerPropertySaleDay) {
            const [year, month, day] = data.buyerPropertySaleDay.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtBuyerPropSaleDate_m").setText(month);
            form.getTextField("txtBuyerPropSaleDate_d").setText(day);
            form.getTextField("txtBuyerPropSaleDate_yy").setText(yy);
        }
        if (data.buyerConditions) {
            form.getTextField("txtAddBuyCond")
                .setText(data.buyerConditions);
        }
        if (data.buyCondTime) {
            form.getTextField("txtBuyCondTime")
                .setText(data.buyCondTime);
        }
        if (data.buyCondDate) {
            const [year, month, day] = data.buyCondDate.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtBuyerConditionDate_m").setText(month);
            form.getTextField("txtBuyerConditionDate_d").setText(day);
            form.getTextField("txtBuyerConditionDate_yy").setText(yy);
        }
        if (data.sellerConditions) {
            form.getTextField("txtSellerCond")
                .setText(data.sellerConditions);
        }
        if (data.sellerCondTime) {
            form.getTextField("txtSellCondTime")
                .setText(data.sellerCondTime);
        }
        if (data.sellerCondDate) {
            const [year, month, day] = data.sellerCondDate.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtSellerConditionDate_m").setText(month);
            form.getTextField("txtSellerConditionDate_d").setText(day);
            form.getTextField("txtSellerConditionDate_yy").setText(yy);
        }
        if (data.financingSchedule) {
            form.getCheckBox("chkOpt_Docs1").check();
        }
        if (data.tenancySchedule) {
            form.getCheckBox("chkOpt_Docs2").check();
        }
        if (data.manufacturedHomeSchedule) {
            form.getCheckBox("chkOpt_Docs3").check();
        }
        if (data.saleOfBuyerPropertySchedule) {
            form.getCheckBox("chkOpt_Docs4").check();
        }
        if (data.addendum) {
            form.getCheckBox("chkOpt_Docs5").check();
        }
        if (data.otherAttachment) {
            form.getTextField("txtAttachOther").setText(data.otherAttachment);
            form.getCheckBox("chkOpt_Docs6").check();
        }
        if (data.otherTerms) {
            form.getTextField("txtOthTerms").setText(data.otherTerms);
        }
        if (data.sellerBrokerage) {
            form.getTextField("txtl_broker")
                .setText(data.sellerBrokerage);
        }
        if (data.sellerRepAddr) {
            form.getTextField("txtl_brkaddr")
                .setText(data.sellerRepAddr);
        }
        if (data.sellerRepCity) {
            form.getTextField("txtl_brkcity")
                .setText(data.sellerRepCity);
        }
        if (data.sellerRepState) {
            form.getTextField("txtl_brkstate")
                .setText(data.sellerRepState);
        }
        if (data.sellerRepcode) {
            form.getTextField("txtl_brkzipcode")
                .setText(data.sellerRepcode);
        }
        if (data.buyerBrokerage) {
            form.getTextField("txts_broker")
                .setText(data.buyerBrokerage);
        }
        if (data.buyerRepAddr) {
            form.getTextField("txts_brkaddr")
                .setText(data.buyerRepAddr);
        }
        if (data.buyerRepCity) {
            form.getTextField("txts_brkcity")
                .setText(data.buyerRepCity);
        }
        if (data.buyerRepState) {
            form.getTextField("txts_brkstate")
                .setText(data.buyerRepState);
        }
        if (data.buyerRepcode) {
            form.getTextField("txts_brkzipcode")
                .setText(data.buyerRepcode);
        }
        if (data.brksellerRepName) {
            form.getTextField("txtl_brkagent")
                .setText(data.brksellerRepName);
        }
        if (data.brksellerRepPhone) {
            form.getTextField("txtl_brkagentph")
                .setText(data.brksellerRepPhone);
        }
        if (data.brksellerRepFax) {
            form.getTextField("txtl_brkagentfax")
                .setText(data.brksellerRepFax);
        }
        if (data.brksellerRepEmail) {
            form.getTextField("txtl_brkagentemail")
                .setText(data.brksellerRepEmail);
        }
        if (data.brkbuyerRepName) {
            form.getTextField("txts_brkagent")
                .setText(data.brkbuyerRepName);
        }
        if (data.brkbuyerRepPhone) {
            form.getTextField("txts_brkagentph")
                .setText(data.brkbuyerRepPhone);
        }
        if (data.brkbuyerRepFax) {
            form.getTextField("txts_brkagentfax")
                .setText(data.brkbuyerRepFax);
        }
        if (data.brkbuyerRepEmail) {
            form.getTextField("txts_brkagentemail")
                .setText(data.brkbuyerRepEmail);
        }
        if (data.sellerAuthorizedPerson) {
            form.getTextField("txtSellBrkName")
                .setText(data.sellerAuthorizedPerson);
        }
        if (data.buyerAuthorizedPerson) {
            form.getTextField("txtBuyBrkName")
                .setText(data.buyerAuthorizedPerson);
        }
        if (data.offerExpiryTime) {
            form.getTextField("txtExpireHr")
                .setText(data.offerExpiryTime);
        }
        if (data.offerExpiryDate) {
            const [year, month, day] = data.offerExpiryDate.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtExpireDate_m").setText(month);
            form.getTextField("txtExpireDate_d").setText(day);
            form.getTextField("txtExpireDate_yy").setText(yy);
        }
        if (data.buyerWitnessName1) {
            form.getTextField("txtWitness1Sig")
                .setText(data.buyerWitnessName1);
        }
        if (data.buyerWitnessName2) {
            form.getTextField("txtWitness2Sig")
                .setText(data.buyerWitnessName2);
        }
        if (data.sellerWitnessName1) {
            form.getTextField("txtWitness3Sig")
                .setText(data.sellerWitnessName1);
        }
        if (data.sellerWitnessName2) {
            form.getTextField("txtWitness4Sig")
                .setText(data.sellerWitnessName2);
        }
        if (data.spouseName) {
            form.getTextField("txtSpouse1Sig")
                .setText(data.spouseName);
        }
        if (data.spouseWitnessName) {
            form.getTextField("txtWitness5Sig")
                .setText(data.spouseWitnessName);
        }
        /* =====================================================
           CONVEYANCING INFORMATION SELLER
        ===================================================== */
        if (data.sellerRepstreetnum) {
            form.getTextField("txtS_streetnum")
                .setText(data.sellerRepstreetnum);
        }
        if (data.sellerRepstreet) {
            form.getTextField("txtS_street")
                .setText(data.sellerRepstreet);
        }
        if (data.sellerCity) {
            form.getTextField("txtS_city")
                .setText(data.sellerCity);
        }
        if (data.sellerState) {
            form.getTextField("txtS_state")
                .setText(data.sellerState);
        }
        if (data.sellercode) {
            form.getTextField("txtS_zipcode")
                .setText(data.sellercode);
        }
        if (data.sellerRepphone) {
            form.getTextField("txtS_phone1")
                .setText(data.sellerRepphone);
        }
        if (data.sellerRepfax) {
            form.getTextField("txtS_fax")
                .setText(data.sellerRepfax);
        }
        if (data.brksellerRepLName) {
            form.getTextField("txts_lawyername")
                .setText(data.brksellerRepLName);
        }
        if (data.brksellerRepLfirm) {
            form.getTextField("txts_lawyerfirm")
                .setText(data.brksellerRepLfirm);
        }
        if (data.brksellerRepLaddr) {
            form.getTextField("txts_lawyeraddr")
                .setText(data.brksellerRepLaddr);
        }
        if (data.brksellerRepLcity) {
            form.getTextField("txts_lawyercity")
                .setText(data.brksellerRepLcity);
        }
        if (data.brksellerRepLstate) {
            form.getTextField("txts_lawyerstate")
                .setText(data.brksellerRepLstate);
        }
        if (data.brksellerRepLcode) {
            form.getTextField("txts_lawyerzipcode")
                .setText(data.brksellerRepLcode);
        }
        if (data.brksellerRepLPhone) {
            form.getTextField("txts_lawyerphone")
                .setText(data.brksellerRepLPhone);
        }
        if (data.brksellerRepLFax) {
            form.getTextField("txts_lawyerfax")
                .setText(data.brksellerRepLFax);
        }
        if (data.brksellerRepLEmail) {
            form.getTextField("txts_lawyeremail")
                .setText(data.brksellerRepLEmail);
        }
        /* =====================================================
           CONVEYANCING INFORMATION BUYER
        ===================================================== */
        if (data.buyerRepstreetNum) {
            form.getTextField("txtb_streetnum123")
                .setText(data.buyerRepstreetNum);
        }
        if (data.buyerRepStreet) {
            form.getTextField("txtb_street123")
                .setText(data.buyerRepStreet);
        }
        if (data.buyerRepCity2) {
            form.getTextField("txtb_city123")
                .setText(data.buyerRepCity2);
        }
        if (data.buyerRepState2) {
            form.getTextField("txtb_state123")
                .setText(data.buyerRepState2);
        }
        if (data.buyerRepcode2) {
            form.getTextField("txtb_zipcode123")
                .setText(data.buyerRepcode2);
        }
        if (data.brkbuyerRepPhone) {
            form.getTextField("txtb_phone1123")
                .setText(data.brkbuyerRepPhone);
        }
        if (data.brkbuyerRepFax) {
            form.getTextField("txtb_fax123")
                .setText(data.brkbuyerRepFax);
        }
        if (data.brkbuyerRepLName) {
            form.getTextField("txtb_lawyername")
                .setText(data.brkbuyerRepLName);
        }
        if (data.brkbuyerRepLFirm) {
            form.getTextField("txtb_lawyerfirm")
                .setText(data.brkbuyerRepLFirm);
        }
        if (data.brkbuyerRepLAddr) {
            form.getTextField("txtb_lawyeraddr")
                .setText(data.brkbuyerRepLAddr);
        }
        if (data.brkbuyerRepLCity) {
            form.getTextField("txtb_lawyercity")
                .setText(data.brkbuyerRepLCity);
        }
        if (data.brkbuyerRepLstate) {
            form.getTextField("txtb_lawyerstate")
                .setText(data.brkbuyerRepLstate);
        }
        if (data.brkbuyerRepLZip) {
            form.getTextField("txtb_lawyerzipcode")
                .setText(data.brkbuyerRepLZip);
        }
        if (data.brkbuyerRepLPhone) {
            form.getTextField("txtb_lawyerphone")
                .setText(data.brkbuyerRepLPhone);
        }
        if (data.brkbuyerRepLFax) {
            form.getTextField("txtb_lawyerfax")
                .setText(data.brkbuyerRepLFax);
        }
        if (data.brkbuyerRepLEmail) {
            form.getTextField("txtb_lawyeremail")
                .setText(data.brkbuyerRepLEmail);
        }
        /* ===============================
           SAVE PDF
        =============================== */
        // 1️⃣ Regenerate all field appearances (VERY IMPORTANT)
        form.updateFieldAppearances(font);
        // 2️⃣ Flatten AFTER updating appearances
        form.flatten();
        const pdfBytes = await pdfDoc.save({
            updateFieldAppearances: true
        });
        /* ===============================
           SAVE ONLY
        =============================== */
        return res.json({
            success: true,
            message: "Residential Purchase Contract saved successfully."
        });
    } catch (err) {
        console.error("RPC ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});




router.post("/send-rpc-for-signature", async (req, res) => {
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
           GET SAVED RPC
        =============================== */

        const data = await RPC.findOne({ partyId });

        if (!data) {
            return res.status(404).json({
                success: false,
                message: "Residential Purchase Contract not found"
            });
        }

        console.log("Party Email:", party.email);

        /* ===============================
           LOAD PDF
        =============================== */

        const existingPdfBytes = fs.readFileSync(PDF_PATH);

        const pdfDoc = await PDFDocument.load(
            existingPdfBytes,
            {
                ignoreEncryption: true
            }
        );

        const form = pdfDoc.getForm();

        const font = await pdfDoc.embedFont(
            StandardFonts.Helvetica
        );

        /* =====================================================
           PASTE OUR ENTIRE RPC PDF MAPPING HERE
           (Copy exactly from generate-rpc)
        ===================================================== */


        // Property Address (split example if needed)

        if (data.agreementNumber) {
            form.getTextField("txtp_PlatBook")
                .setText(data.agreementNumber);
        }

        if (data.sellerName1) {
            form.getTextField("txtseller1")
                .setText(data.sellerName1);
        }
        if (data.sellerName2) {
            form.getTextField("txtseller2")
                .setText(data.sellerName2);
        }

        if (data.buyerName1) {
            form.getTextField("txtbuyer1")
                .setText(data.buyerName1);
        }

        if (data.buyerName2) {
            form.getTextField("txtbuyer2")
                .setText(data.buyerName2);
        }

        if (data.unitnumber) {
            form.getTextField("txtp_unitNumber")
                .setText(data.unitnumber);
        }

        if (data.streetnumber) {
            form.getTextField("txtp_streetnum")
                .setText(data.streetnumber);
        }

        if (data.streetname) {
            form.getTextField("txtp_street")
                .setText(data.streetname);
        }

        if (data.city) {
            form.getTextField("txtp_city")
                .setText(data.city);
        }

        if (data.postalCode) {
            form.getTextField("txtp_zipcode")
                .setText(data.postalCode);
        }

        if (data.plan) {
            form.getTextField("txtp_PageNumber")
                .setText(data.plan);
        }

        if (data.block) {
            form.getTextField("txtp_Block")
                .setText(data.block);
        }

        if (data.lot) {
            form.getTextField("txtp_LotNumber")
                .setText(data.lot);
        }

        if (data.legalOther) {
            form.getTextField("txtLegalOther")
                .setText(data.legalOther);
        }

        if (data.unattachedGoods) {
            form.getTextField("txtp_propincludes")
                .setText(data.unattachedGoods);
        }

        if (data.attachedGoods) {
            form.getTextField("txtp_propexcludes")
                .setText(data.attachedGoods);
        }

        if (data.purchasePrice) {
            form.getTextField("txtp_price")
                .setText(data.purchasePrice);
        }


        if (data.completionDay) {
            const [year, month, day] = data.completionDay.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtp_closedate_mmmm").setText(month);
            form.getTextField("txtp_closedate_dd").setText(day);
            form.getTextField("txtp_closedate_yy").setText(yy);
        }


        if (data.hidbrokerage) {
            form.getTextField("hidBrokerage")
                .setText(data.hidbrokerage);
        }

        if (data.depositTrustee) {
            form.getTextField("txtTrustee")
                .setText(data.depositTrustee);
        }

        if (data.depositAmount1) {
            form.getTextField("txtp_Deposit")
                .setText(data.depositAmount1);
        }

        if (data.depositMethod1) {
            form.getTextField("txtDepositMethod")
                .setText(data.depositMethod1);
        }

        if (data.depositTime1) {
            form.getTextField("txtampmAlter1")
                .setText(data.depositTime1);
        }

        if (data.depositDate1) {
            const [year, month, day] = data.depositDate1.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtalterDate_m").setText(month);
            form.getTextField("txtalterDate_d").setText(day);
            form.getTextField("txtalterDate_yy").setText(yy);
        }

        if (data.depositAmount2) {
            form.getTextField("txtp_AdditionalDeposit")
                .setText(data.depositAmount2);
        }

        if (data.depositMethod2) {
            form.getTextField("txtAddDepositMethod")
                .setText(data.depositMethod2);
        }

        if (data.depositTime2) {
            form.getTextField("txtampmAlter2")
                .setText(data.depositTime2);
        }

        if (data.depositDate2) {
            const [year, month, day] = data.depositDate2.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtalter2Date_m").setText(month);
            form.getTextField("txtalter2Date_d").setText(day);
            form.getTextField("txtalter2Date_yy").setText(yy);
        }

        if (data.altertime3) {
            form.getTextField("txtampmAlter3")
                .setText(data.altertime3);
        }

        if (data.alterdate3) {
            const [year, month, day] = data.alterdate3.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtalter3Date_m").setText(month);
            form.getTextField("txtalter3Date_d").setText(day);
            form.getTextField("txtalter3Date_yy").setText(yy);
        }


        if (data.downPaymentPercent) {
            form.getTextField("txtp_TotalFinance")
                .setText(data.downPaymentPercent);
        }

        if (data.financingConditionTime) {
            form.getTextField("txtFinTime")
                .setText(data.financingConditionTime);
        }

        if (data.financingConditionDay) {
            const [year, month, day] = data.financingConditionDay.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtFinancingDate_m").setText(month);
            form.getTextField("txtFinancingDate_d").setText(day);
            form.getTextField("txtFinancingDate_yy").setText(yy);
        }


        if (data.inspectionConditionTime) {
            form.getTextField("txtInspectTime")
                .setText(data.inspectionConditionTime);
        }

        if (data.inspectionConditionDay) {
            const [year, month, day] = data.inspectionConditionDay.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtInspectionDate_m").setText(month);
            form.getTextField("txtInspectionDate_d").setText(day);
            form.getTextField("txtInspectionDate_yy").setText(yy);
        }

        if (data.buyerPropertySaleTime) {
            form.getTextField("txtBuyPropTime")
                .setText(data.buyerPropertySaleTime);
        }

        if (data.buyerPropertySaleDay) {
            const [year, month, day] = data.buyerPropertySaleDay.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtBuyerPropSaleDate_m").setText(month);
            form.getTextField("txtBuyerPropSaleDate_d").setText(day);
            form.getTextField("txtBuyerPropSaleDate_yy").setText(yy);
        }


        if (data.buyerConditions) {
            form.getTextField("txtAddBuyCond")
                .setText(data.buyerConditions);
        }

        if (data.buyCondTime) {
            form.getTextField("txtBuyCondTime")
                .setText(data.buyCondTime);
        }

        if (data.buyCondDate) {
            const [year, month, day] = data.buyCondDate.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtBuyerConditionDate_m").setText(month);
            form.getTextField("txtBuyerConditionDate_d").setText(day);
            form.getTextField("txtBuyerConditionDate_yy").setText(yy);
        }

        if (data.sellerConditions) {
            form.getTextField("txtSellerCond")
                .setText(data.sellerConditions);
        }

        if (data.sellerCondTime) {
            form.getTextField("txtSellCondTime")
                .setText(data.sellerCondTime);
        }

        if (data.sellerCondDate) {
            const [year, month, day] = data.sellerCondDate.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtSellerConditionDate_m").setText(month);
            form.getTextField("txtSellerConditionDate_d").setText(day);
            form.getTextField("txtSellerConditionDate_yy").setText(yy);
        }


        if (data.financingSchedule) {
            form.getCheckBox("chkOpt_Docs1").check();
        }

        if (data.tenancySchedule) {
            form.getCheckBox("chkOpt_Docs2").check();
        }

        if (data.manufacturedHomeSchedule) {
            form.getCheckBox("chkOpt_Docs3").check();
        }

        if (data.saleOfBuyerPropertySchedule) {
            form.getCheckBox("chkOpt_Docs4").check();
        }

        if (data.addendum) {
            form.getCheckBox("chkOpt_Docs5").check();
        }

        if (data.otherAttachment) {
            form.getTextField("txtAttachOther").setText(data.otherAttachment);
            form.getCheckBox("chkOpt_Docs6").check();
        }

        if (data.otherTerms) {
            form.getTextField("txtOthTerms").setText(data.otherTerms);
        }


        if (data.sellerBrokerage) {
            form.getTextField("txtl_broker")
                .setText(data.sellerBrokerage);
        }

        if (data.sellerRepAddr) {
            form.getTextField("txtl_brkaddr")
                .setText(data.sellerRepAddr);
        }

        if (data.sellerRepCity) {
            form.getTextField("txtl_brkcity")
                .setText(data.sellerRepCity);
        }

        if (data.sellerRepState) {
            form.getTextField("txtl_brkstate")
                .setText(data.sellerRepState);
        }

        if (data.sellerRepcode) {
            form.getTextField("txtl_brkzipcode")
                .setText(data.sellerRepcode);
        }


        if (data.buyerBrokerage) {
            form.getTextField("txts_broker")
                .setText(data.buyerBrokerage);
        }

        if (data.buyerRepAddr) {
            form.getTextField("txts_brkaddr")
                .setText(data.buyerRepAddr);
        }

        if (data.buyerRepCity) {
            form.getTextField("txts_brkcity")
                .setText(data.buyerRepCity);
        }

        if (data.buyerRepState) {
            form.getTextField("txts_brkstate")
                .setText(data.buyerRepState);
        }

        if (data.buyerRepcode) {
            form.getTextField("txts_brkzipcode")
                .setText(data.buyerRepcode);
        }




        if (data.brksellerRepName) {
            form.getTextField("txtl_brkagent")
                .setText(data.brksellerRepName);
        }

        if (data.brksellerRepPhone) {
            form.getTextField("txtl_brkagentph")
                .setText(data.brksellerRepPhone);
        }

        if (data.brksellerRepFax) {
            form.getTextField("txtl_brkagentfax")
                .setText(data.brksellerRepFax);
        }

        if (data.brksellerRepEmail) {
            form.getTextField("txtl_brkagentemail")
                .setText(data.brksellerRepEmail);
        }



        if (data.brkbuyerRepName) {
            form.getTextField("txts_brkagent")
                .setText(data.brkbuyerRepName);
        }

        if (data.brkbuyerRepPhone) {
            form.getTextField("txts_brkagentph")
                .setText(data.brkbuyerRepPhone);
        }

        if (data.brkbuyerRepFax) {
            form.getTextField("txts_brkagentfax")
                .setText(data.brkbuyerRepFax);
        }

        if (data.brkbuyerRepEmail) {
            form.getTextField("txts_brkagentemail")
                .setText(data.brkbuyerRepEmail);
        }



        if (data.sellerAuthorizedPerson) {
            form.getTextField("txtSellBrkName")
                .setText(data.sellerAuthorizedPerson);
        }

        if (data.buyerAuthorizedPerson) {
            form.getTextField("txtBuyBrkName")
                .setText(data.buyerAuthorizedPerson);
        }



        if (data.offerExpiryTime) {
            form.getTextField("txtExpireHr")
                .setText(data.offerExpiryTime);
        }

        if (data.offerExpiryDate) {
            const [year, month, day] = data.offerExpiryDate.split("-");
            const yy = year.slice(-2);
            form.getTextField("txtExpireDate_m").setText(month);
            form.getTextField("txtExpireDate_d").setText(day);
            form.getTextField("txtExpireDate_yy").setText(yy);
        }
        if (data.buyerWitnessName1) {
            form.getTextField("txtWitness1Sig")
                .setText(data.buyerWitnessName1);
        }

        if (data.buyerWitnessName2) {
            form.getTextField("txtWitness2Sig")
                .setText(data.buyerWitnessName2);
        }

        if (data.sellerWitnessName1) {
            form.getTextField("txtWitness3Sig")
                .setText(data.sellerWitnessName1);
        }

        if (data.sellerWitnessName2) {
            form.getTextField("txtWitness4Sig")
                .setText(data.sellerWitnessName2);
        }

        if (data.spouseName) {
            form.getTextField("txtSpouse1Sig")
                .setText(data.spouseName);
        }

        if (data.spouseWitnessName) {
            form.getTextField("txtWitness5Sig")
                .setText(data.spouseWitnessName);
        }

        /* =====================================================
           CONVEYANCING INFORMATION SELLER
        ===================================================== */

        if (data.sellerRepstreetnum) {
            form.getTextField("txtS_streetnum")
                .setText(data.sellerRepstreetnum);
        }

        if (data.sellerRepstreet) {
            form.getTextField("txtS_street")
                .setText(data.sellerRepstreet);
        }

        if (data.sellerCity) {
            form.getTextField("txtS_city")
                .setText(data.sellerCity);
        }

        if (data.sellerState) {
            form.getTextField("txtS_state")
                .setText(data.sellerState);
        }

        if (data.sellercode) {
            form.getTextField("txtS_zipcode")
                .setText(data.sellercode);
        }

        if (data.sellerRepphone) {
            form.getTextField("txtS_phone1")
                .setText(data.sellerRepphone);
        }

        if (data.sellerRepfax) {
            form.getTextField("txtS_fax")
                .setText(data.sellerRepfax);
        }

        if (data.brksellerRepLName) {
            form.getTextField("txts_lawyername")
                .setText(data.brksellerRepLName);
        }

        if (data.brksellerRepLfirm) {
            form.getTextField("txts_lawyerfirm")
                .setText(data.brksellerRepLfirm);
        }

        if (data.brksellerRepLaddr) {
            form.getTextField("txts_lawyeraddr")
                .setText(data.brksellerRepLaddr);
        }


        if (data.brksellerRepLcity) {
            form.getTextField("txts_lawyercity")
                .setText(data.brksellerRepLcity);
        }

        if (data.brksellerRepLstate) {
            form.getTextField("txts_lawyerstate")
                .setText(data.brksellerRepLstate);
        }

        if (data.brksellerRepLcode) {
            form.getTextField("txts_lawyerzipcode")
                .setText(data.brksellerRepLcode);
        }

        if (data.brksellerRepLPhone) {
            form.getTextField("txts_lawyerphone")
                .setText(data.brksellerRepLPhone);
        }

        if (data.brksellerRepLFax) {
            form.getTextField("txts_lawyerfax")
                .setText(data.brksellerRepLFax);
        }

        if (data.brksellerRepLEmail) {
            form.getTextField("txts_lawyeremail")
                .setText(data.brksellerRepLEmail);
        }

        /* =====================================================
           CONVEYANCING INFORMATION BUYER
        ===================================================== */

        if (data.buyerRepstreetNum) {
            form.getTextField("txtb_streetnum123")
                .setText(data.buyerRepstreetNum);
        }

        if (data.buyerRepStreet) {
            form.getTextField("txtb_street123")
                .setText(data.buyerRepStreet);
        }

        if (data.buyerRepCity2) {
            form.getTextField("txtb_city123")
                .setText(data.buyerRepCity2);
        }

        if (data.buyerRepState2) {
            form.getTextField("txtb_state123")
                .setText(data.buyerRepState2);
        }

        if (data.buyerRepcode2) {
            form.getTextField("txtb_zipcode123")
                .setText(data.buyerRepcode2);
        }

        if (data.brkbuyerRepPhone) {
            form.getTextField("txtb_phone1123")
                .setText(data.brkbuyerRepPhone);
        }

        if (data.brkbuyerRepFax) {
            form.getTextField("txtb_fax123")
                .setText(data.brkbuyerRepFax);
        }

        if (data.brkbuyerRepLName) {
            form.getTextField("txtb_lawyername")
                .setText(data.brkbuyerRepLName);
        }

        if (data.brkbuyerRepLFirm) {
            form.getTextField("txtb_lawyerfirm")
                .setText(data.brkbuyerRepLFirm);
        }

        if (data.brkbuyerRepLAddr) {
            form.getTextField("txtb_lawyeraddr")
                .setText(data.brkbuyerRepLAddr);
        }

        if (data.brkbuyerRepLCity) {
            form.getTextField("txtb_lawyercity")
                .setText(data.brkbuyerRepLCity);
        }

        if (data.brkbuyerRepLstate) {
            form.getTextField("txtb_lawyerstate")
                .setText(data.brkbuyerRepLstate);
        }

        if (data.brkbuyerRepLZip) {
            form.getTextField("txtb_lawyerzipcode")
                .setText(data.brkbuyerRepLZip);
        }

        if (data.brkbuyerRepLPhone) {
            form.getTextField("txtb_lawyerphone")
                .setText(data.brkbuyerRepLPhone);
        }

        if (data.brkbuyerRepLFax) {
            form.getTextField("txtb_lawyerfax")
                .setText(data.brkbuyerRepLFax);
        }

        if (data.brkbuyerRepLEmail) {
            form.getTextField("txtb_lawyeremail")
                .setText(data.brkbuyerRepLEmail);
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
   SIGNERS
=============================== */
        const signers = [];
        /* ---------- Buyer 1 ---------- */
        if (data.buyerName1 && data.buyerSignatureEmail1) {
            signers.push({
                email: data.buyerSignatureEmail1.trim(),
                name: data.buyerName1,
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
                            anchorString: "/date_md4/",
                            dateFormat: "MMMM d"
                        },
                        {
                            anchorString: "/time4/",
                            dateFormat: "h:mm a"
                        }
                    ]
                }
            });
        }

        /* ---------- Buyer Witness 1 ---------- */

        if (data.buyerWitnessName1 && data.buyerWitnessEmail1) {
            signers.push({
                email: data.buyerWitnessEmail1.trim(),
                name: data.buyerWitnessName1,
                recipientId: "2",
                routingOrder: "1",
                clientUserId: `${partyId}_buyerWitness1`,
                tabs: {
                    signHereTabs: [
                        {
                            anchorString: "/sign2/"
                        }
                    ]
                }
            });
        }

        /* ---------- Buyer 2 ---------- */

        if (data.buyerName2 && data.buyerSignatureEmail2) {
            signers.push({
                email: data.buyerSignatureEmail2.trim(),
                name: data.buyerName2,
                recipientId: "3",
                routingOrder: "1",
                clientUserId: `${partyId}_buyer2`,
                tabs: {
                    signHereTabs: [
                        {
                            anchorString: "/sign3/"
                        }
                    ],
                    dateSignedTabs: [
                        {
                            anchorString: "/date_md5/",
                            dateFormat: "MMMM d"
                        },
                        {
                            anchorString: "/time5/",
                            dateFormat: "h:mm a"
                        }
                    ]
                }
            });
        }

        /* ---------- Buyer Witness 2 ---------- */

        if (data.buyerWitnessName2 && data.buyerWitnessEmail2) {
            signers.push({
                email: data.buyerWitnessEmail2.trim(),
                name: data.buyerWitnessName2,
                recipientId: "4",
                routingOrder: "1",
                clientUserId: `${partyId}_buyerWitness2`,
                tabs: {
                    signHereTabs: [
                        {
                            anchorString: "/sign4/"
                        }
                    ]
                }
            });
        }

        /* ---------- Seller 1 ---------- */

        if (data.sellerName1 && data.sellerSignatureEmail1) {
            signers.push({
                email: data.sellerSignatureEmail1.trim(),
                name: data.sellerName1,
                recipientId: "5",
                routingOrder: "1",
                clientUserId: `${partyId}_seller1`,
                tabs: {
                    signHereTabs: [
                        {
                            anchorString: "/sign5/"
                        }
                    ],
                    dateSignedTabs: [
                        {
                            anchorString: "/date_md1/",
                            dateFormat: "MMMM d"
                        },
                        {
                            anchorString: "/time1/",
                            dateFormat: "h:mm a"
                        }
                    ]
                }
            });
        }

        /* ---------- Seller Witness 1 ---------- */

        if (data.sellerWitnessName1 && data.sellerWitnessEmail1) {
            signers.push({
                email: data.sellerWitnessEmail1.trim(),
                name: data.sellerWitnessName1,
                recipientId: "6",
                routingOrder: "1",
                clientUserId: `${partyId}_sellerWitness1`,
                tabs: {
                    signHereTabs: [
                        {
                            anchorString: "/sign6/"
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
                recipientId: "7",
                routingOrder: "1",
                clientUserId: `${partyId}_seller2`,
                tabs: {
                    signHereTabs: [
                        {
                            anchorString: "/sign7/"
                        }
                    ],
                    dateSignedTabs: [
                        {
                            anchorString: "/date_md2/",
                            dateFormat: "MMMM d"
                        },
                        {
                            anchorString: "/time2/",
                            dateFormat: "h:mm a"
                        }
                    ]
                }
            });
        }

        /* ---------- Seller Witness 2 ---------- */

        if (data.sellerWitnessName2 && data.sellerWitnessEmail2) {
            signers.push({
                email: data.sellerWitnessEmail2.trim(),
                name: data.sellerWitnessName2,
                recipientId: "8",
                routingOrder: "1",
                clientUserId: `${partyId}_sellerWitness2`,
                tabs: {
                    signHereTabs: [
                        {
                            anchorString: "/sign8/"
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
                recipientId: "9",
                routingOrder: "1",
                clientUserId: `${partyId}_spouse`,
                tabs: {
                    signHereTabs: [
                        {
                            anchorString: "/sign9/"
                        }
                    ],
                    dateSignedTabs: [
                        {
                            anchorString: "/date_md3/",
                            dateFormat: "MMMM d"
                        },
                        {
                            anchorString: "/time3/",
                            dateFormat: "h:mm a"
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
                recipientId: "10",
                routingOrder: "1",
                clientUserId: `${partyId}_spouseWitness`,
                tabs: {
                    signHereTabs: [
                        {
                            anchorString: "/sign10/"
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

        console.log("RPC Signers:", signers);

        /* ===============================
           CREATE ENVELOPE
        =============================== */

        const envelopePayload = {
            emailSubject:
                "Please sign the Residential Purchase Contract",

            documents: [
                {
                    documentBase64: Buffer.from(pdfBytes).toString("base64"),
                    name: "Residential Purchase Contract.pdf",
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

        await RPC.findOneAndUpdate(
            { partyId },
            {
                envelopeId,

                completedEmailSent: false,

                buyer1Signed: false,
                buyer2Signed: false,

                buyerWitness1Signed: false,
                buyerWitness2Signed: false,

                seller1Signed: false,
                seller2Signed: false,

                sellerWitness1Signed: false,
                sellerWitness2Signed: false,

                spouseSigned: false,
                spouseWitnessSigned: false,

                buyer1SignedAt: null,
                buyer2SignedAt: null,

                buyerWitness1SignedAt: null,
                buyerWitness2SignedAt: null,

                seller1SignedAt: null,
                seller2SignedAt: null,

                sellerWitness1SignedAt: null,
                sellerWitness2SignedAt: null,

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

            // const signingLink = `https://realtorparth.ca/api/rpcpdf/start-sign/${partyId}?recipientId=${signer.recipientId}`;
            const signingLink = `https://realtorparth.ca/api/rpcpdf/start-sign/${partyId}/${signer.recipientId}`;

            let documentRole = "Signer";

            switch (signer.recipientId) {

                case "1":
                    documentRole = "Buyer 1";
                    break;

                case "2":
                    documentRole = "Buyer Witness 1";
                    break;

                case "3":
                    documentRole = "Buyer 2";
                    break;

                case "4":
                    documentRole = "Buyer Witness 2";
                    break;

                case "5":
                    documentRole = "Seller 1";
                    break;

                case "6":
                    documentRole = "Seller Witness 1";
                    break;

                case "7":
                    documentRole = "Seller 2";
                    break;

                case "8":
                    documentRole = "Seller Witness 2";
                    break;

                case "9":
                    documentRole = "Spouse";
                    break;

                case "10":
                    documentRole = "Spouse Witness";
                    break;
            }

            await transporter.sendMail({
                from: `"RealtorParth" <hello@realtorparth.ca>`,
                to: signer.email,
                subject: "Residential Purchase Contract Ready For Signature",

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
<strong>Residential Purchase Contract</strong>
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
            message: "Email sent successfully."
        });
    } catch (error) {
        console.error("BUYER AMENDMENT DOCUSIGN ERROR:", error.response?.data || error);
        res.status(500).json({
            success: false,
            message: "Failed to send Buyer Amendment for signature."
        });
    }
});


// router.get("/start-sign/:partyId", async (req, res) => {
router.get("/start-sign/:partyId/:recipientId", async (req, res) => {
    try {
        const { partyId, recipientId } = req.params;

        const {
            email,
            clientUserId
        } = req.query;

        const rpc = await RPC.findOne({ partyId });

        if (!rpc) {
            return res
                .status(404)
                .send("Residential Purchase Contract not found.");
        }

        if (!rpc.envelopeId) {
            return res
                .status(400)
                .send("Envelope not created yet.");
        }

        if (
            !rpc.signers ||
            rpc.signers.length === 0
        ) {
            return res
                .status(400)
                .send("No signers found.");
        }

        /* ===============================
           FIND CURRENT SIGNER
        =============================== */

        let signer = null;

        if (recipientId) {
            signer = rpc.signers.find(
                s => s.recipientId === String(recipientId)
            );
        }

        if (!signer && email) {
            signer = rpc.signers.find(
                s => s.email.toLowerCase() === String(email).toLowerCase()
            );
        }

        if (!signer && clientUserId) {
            signer = rpc.signers.find(
                s => s.clientUserId === clientUserId
            );
        }

        if (!signer) {
            signer =
                rpc.signers.find(s => s.recipientId === "1") ||
                rpc.signers[0];
        }
        // const signer = rpc.signers.find(
        //     s => s.recipientId === recipientId
        // );

        if (!signer) {
            return res.status(404).send("Signer not found.");
        }
        const accessToken = await getAccessToken();
        /* ===============================
           CREATE RECIPIENT VIEW
        =============================== */

        const viewRes = await axios.post(
            `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${rpc.envelopeId}/views/recipient`,
            {
                authenticationMethod: "none",

                email: signer.email,
                userName: signer.name,

                clientUserId: signer.clientUserId,

                returnUrl:
                    `https://realtorparth.ca/api/rpcpdf/sign-complete/${partyId}` +
                    `?recipientId=${signer.recipientId}` +
                    `&email=${encodeURIComponent(signer.email)}`
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
            "RPC START SIGN ERROR:",
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

        const {
            recipientId,
            email
        } = req.query;

        console.log("========== RPC SIGN COMPLETE ==========");
        console.log("Party:", partyId);
        console.log("Recipient:", recipientId);
        console.log("Email:", email);

        const rpc = await RPC.findOne({ partyId });

        if (!rpc) {
            return res
                .status(404)
                .send("Residential Purchase Contract not found.");
        }

        /* ===============================
           UPDATE CURRENT SIGNER STATUS
        =============================== */

        const now = new Date();

        // switch (String(recipientId)) {

        //     case "1":
        //         rpc.buyer1Signed = true;
        //         rpc.buyer1SignedAt = now;
        //         break;

        //     case "2":
        //         rpc.buyer2Signed = true;
        //         rpc.buyer2SignedAt = now;
        //         break;

        //     case "3":
        //         rpc.seller1Signed = true;
        //         rpc.seller1SignedAt = now;
        //         break;

        //     case "4":
        //         rpc.seller2Signed = true;
        //         rpc.seller2SignedAt = now;
        //         break;

        //     case "5":
        //         rpc.spouseSigned = true;
        //         rpc.spouseSignedAt = now;
        //         break;

        //     case "6":
        //         rpc.buyerWitness1Signed = true;
        //         rpc.buyerWitness1SignedAt = now;
        //         break;

        //     case "7":
        //         rpc.buyerWitness2Signed = true;
        //         rpc.buyerWitness2SignedAt = now;
        //         break;

        //     case "8":
        //         rpc.sellerWitness1Signed = true;
        //         rpc.sellerWitness1SignedAt = now;
        //         break;

        //     case "9":
        //         rpc.sellerWitness2Signed = true;
        //         rpc.sellerWitness2SignedAt = now;
        //         break;

        //     case "10":
        //         rpc.spouseWitnessSigned = true;
        //         rpc.spouseWitnessSignedAt = now;
        //         break;
        // }

        switch (String(recipientId)) {

            case "1":
                rpc.buyer1Signed = true;
                rpc.buyer1SignedAt = now;
                break;

            case "2":
                rpc.buyerWitness1Signed = true;
                rpc.buyerWitness1SignedAt = now;
                break;

            case "3":
                rpc.buyer2Signed = true;
                rpc.buyer2SignedAt = now;
                break;

            case "4":
                rpc.buyerWitness2Signed = true;
                rpc.buyerWitness2SignedAt = now;
                break;

            case "5":
                rpc.seller1Signed = true;
                rpc.seller1SignedAt = now;
                break;

            case "6":
                rpc.sellerWitness1Signed = true;
                rpc.sellerWitness1SignedAt = now;
                break;

            case "7":
                rpc.seller2Signed = true;
                rpc.seller2SignedAt = now;
                break;

            case "8":
                rpc.sellerWitness2Signed = true;
                rpc.sellerWitness2SignedAt = now;
                break;

            case "9":
                rpc.spouseSigned = true;
                rpc.spouseSignedAt = now;
                break;

            case "10":
                rpc.spouseWitnessSigned = true;
                rpc.spouseWitnessSignedAt = now;
                break;
        }

        await rpc.save();

        /* ===============================
           WAIT FOR EVERY REQUIRED SIGNER
        =============================== */

        const everyoneSigned =
            (!rpc.buyerName1 || rpc.buyer1Signed) &&
            (!rpc.buyerName2 || rpc.buyer2Signed) &&
            (!rpc.sellerName1 || rpc.seller1Signed) &&
            (!rpc.sellerName2 || rpc.seller2Signed) &&
            (!rpc.spouseName || rpc.spouseSigned) &&
            (!rpc.buyerWitnessName1 || rpc.buyerWitness1Signed) &&
            (!rpc.buyerWitnessName2 || rpc.buyerWitness2Signed) &&
            (!rpc.sellerWitnessName1 || rpc.sellerWitness1Signed) &&
            (!rpc.sellerWitnessName2 || rpc.sellerWitness2Signed) &&
            (!rpc.spouseWitnessName || rpc.spouseWitnessSigned);

        if (!everyoneSigned) {

            console.log("Waiting for remaining signers...");

            return res.redirect(
                "https://realtorparth.ca/signature-complete"
            );
        }

        /* ===============================
           PREVENT DUPLICATE EMAIL
        =============================== */

        if (rpc.completedEmailSent) {
            return res.redirect(
                "https://realtorparth.ca/signature-complete"
            );
        }

        /* ===============================
           PARTY
        =============================== */

        /* ===============================
       PARTY
    =============================== */

        const party = await TransactionParty.findById(
            partyId
        );

        if (!party) {
            return res.status(404).send(
                "Party not found."
            );
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

        console.log(
            "Sending notification to:",
            transactionUser.email
        );

        /* ===============================
           SEND ADMIN NOTIFICATION
        =============================== */

        await transporter.sendMail({
            from: `"RealtorParth" <hello@realtorparth.ca>`,
            to: transactionUser.email,
            subject:
                "Residential Purchase Contract Signed by All Parties",

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
<strong>Residential Purchase Contract</strong>.
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
Residential Purchase Contract
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
This is an automated notification confirming that every required signer has completed the Residential Purchase Contract signing process.
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

        rpc.completedEmailSent = true;

        await rpc.save();

        console.log("completedEmailSent updated");

        return res.redirect(
            "https://realtorparth.ca/signature-complete"
        );

    } catch (err) {

        console.error(
            "========== RPC SIGN COMPLETE ERROR =========="
        );

        console.error(
            err.response?.data || err
        );

        return res.redirect(
            "https://realtorparth.ca/signature-complete"
        );

    }
});









//         /* ===============================
//            SIGNERS
//         =============================== */

//         const signers = [];

//         const baseEmail = party.email;
//         const [name, domain] = baseEmail.split("@");

//         const buyer1Email = baseEmail;
//         const buyer2Email = `${name}+buyer2@${domain}`;
//         const seller1Email = `${name}+seller1@${domain}`;
//         const seller2Email = `${name}+seller2@${domain}`;
//         const spouseEmail = `${name}+spouse@${domain}`;

//         /* BUYER 1 */

//         if (data.buyerName1) {
//             signers.push({
//                 email: buyer1Email,
//                 name: data.buyerName1,
//                 recipientId: "1",
//                 routingOrder: "1",
//                 clientUserId: `${partyId}_buyer1`,
//                 tabs: {
//                     signHereTabs: [
//                         {
//                             anchorString: "/sign1/"
//                         }
//                     ],
//                     dateSignedTabs: [
//                         {
//                             anchorString: "/date_md4/",
//                             dateFormat: "MMMM d"
//                         },
//                         {
//                             anchorString: "/time4/",
//                             dateFormat: "h:mm a"
//                         }
//                     ]
//                 }
//             });
//         }

//         /* BUYER 2 */

//         if (data.buyerName2) {
//             signers.push({
//                 email: buyer2Email,
//                 name: data.buyerName2,
//                 recipientId: "2",
//                 routingOrder: "2",
//                 clientUserId: `${partyId}_buyer2`,
//                 tabs: {
//                     signHereTabs: [
//                         {
//                             anchorString: "/sign3/"
//                         }
//                     ],
//                     dateSignedTabs: [
//                         {
//                             anchorString: "/date_md5/",
//                             dateFormat: "MMMM d"
//                         },
//                         {
//                             anchorString: "/time5/",
//                             dateFormat: "h:mm a"
//                         }
//                     ]
//                 }
//             });
//         }

//         /* SELLER 1 */

//         if (data.sellerName1) {
//             signers.push({
//                 email: seller1Email,
//                 name: data.sellerName1,
//                 recipientId: "3",
//                 routingOrder: "3",
//                 clientUserId: `${partyId}_seller1`,
//                 tabs: {
//                     signHereTabs: [
//                         {
//                             anchorString: "/sign5/"
//                         }
//                     ],
//                     dateSignedTabs: [
//                         {
//                             anchorString: "/date_md1/",
//                             dateFormat: "MMMM d"
//                         },
//                         {
//                             anchorString: "/time1/",
//                             dateFormat: "h:mm a"
//                         }
//                     ]
//                 }
//             });
//         }

//         /* SELLER 2 */

//         if (data.sellerName2) {
//             signers.push({
//                 email: seller2Email,
//                 name: data.sellerName2,
//                 recipientId: "4",
//                 routingOrder: "4",
//                 clientUserId: `${partyId}_seller2`,
//                 tabs: {
//                     signHereTabs: [
//                         {
//                             anchorString: "/sign7/"
//                         }
//                     ],
//                     dateSignedTabs: [
//                         {
//                             anchorString: "/date_md2/",
//                             dateFormat: "MMMM d"
//                         },
//                         {
//                             anchorString: "/time2/",
//                             dateFormat: "h:mm a"
//                         }
//                     ]
//                 }
//             });
//         }

//         /* SPOUSE */

//         if (data.spouseName) {
//             signers.push({
//                 email: spouseEmail,
//                 name: data.spouseName,
//                 recipientId: "5",
//                 routingOrder: "5",
//                 clientUserId: `${partyId}_spouse`,
//                 tabs: {
//                     signHereTabs: [
//                         {
//                             anchorString: "/sign9/"
//                         }
//                     ],
//                     dateSignedTabs: [
//                         {
//                             anchorString: "/date_md3/",
//                             dateFormat: "MMMM d"
//                         },
//                         {
//                             anchorString: "/time3/",
//                             dateFormat: "h:mm a"
//                         }
//                     ]
//                 }
//             });
//         }

//         console.log("RPC Signers:", signers);

//         if (signers.length === 0) {
//             return res.status(400).json({
//                 success: false,
//                 message: "No signers found."
//             });
//         }

//         /* ===============================
//            CREATE ENVELOPE
//         =============================== */

//         const envelopePayload = {
//             emailSubject: "Please sign the Residential Purchase Contract",

//             documents: [
//                 {
//                     documentBase64: Buffer.from(pdfBytes).toString("base64"),
//                     name: "Residential Purchase Contract.pdf",
//                     fileExtension: "pdf",
//                     documentId: "1"
//                 }
//             ],

//             recipients: {
//                 signers
//             },

//             status: "sent"
//         };

//         const envelopeRes = await axios.post(
//             `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes`,
//             envelopePayload,
//             {
//                 headers: {
//                     Authorization: `Bearer ${accessToken}`,
//                     "Content-Type": "application/json"
//                 }
//             }
//         );

//         const envelopeId = envelopeRes.data.envelopeId;

//         await RPC.findOneAndUpdate(
//             { partyId },
//             {
//                 envelopeId,
//                 signers: signers.map(s => ({
//                     recipientId: s.recipientId,
//                     clientUserId: s.clientUserId || null,
//                     email: s.email,
//                     name: s.name,
//                     routingOrder: s.routingOrder
//                 }))
//             }
//         );

//         const signingLink =
//             `https://realtorparth.ca/api/rpcpdf/start-sign/${partyId}`;


//         await transporter.sendMail({
//             from: `"RealtorParth" <hello@realtorparth.ca>`,
//             to: party.email,
//             subject: "Residential Purchase Contract Ready For Signature",
//             html: `
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
// Hello ${data.buyerName1},
// </h2>

// <p style="font-size:16px;color:#555;line-height:28px;">
// Your <strong>Residential Purchase Contract</strong> document has been prepared and is now ready for your electronic signature.
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
// Sign Residential Purchase Contract
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
//         });

//         return res.json({
//             success: true,
//             message: "Email sent successfully."
//         });
//     } catch (error) {
//         console.error("BUYER AMENDMENT DOCUSIGN ERROR:", error.response?.data || error);
//         res.status(500).json({
//             success: false,
//             message: "Failed to send Buyer Amendment for signature."
//         });
//     }
// });



// router.get("/start-sign/:partyId", async (req, res) => {
//     try {
//         const { partyId } = req.params;

//         const rpc = await RPC.findOne({ partyId });

//         if (!rpc) {
//             return res.status(404).send("Residential Purchase Contract not found.");
//         }

//         if (!rpc.envelopeId) {
//             return res.status(400).send("Envelope not created yet.");
//         }

//         if (!rpc.signers || rpc.signers.length === 0) {
//             return res.status(400).send("No signers found.");
//         }

//         /* ===============================
//            FIRST SIGNER (BUYER 1)
//         =============================== */

//         const signer =
//             rpc.signers.find(
//                 s => s.recipientId === "1"
//             ) || rpc.signers[0];

//         const accessToken = await getAccessToken();

//         /* ===============================
//            CREATE RECIPIENT VIEW
//         =============================== */

//         const viewRes = await axios.post(
//             `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${rpc.envelopeId}/views/recipient`,
//             {
//                 authenticationMethod: "none",

//                 email: signer.email,
//                 userName: signer.name,

//                 clientUserId: signer.clientUserId,

//                 returnUrl: `https://realtorparth.ca/api/rpcpdf/sign-complete/${partyId}`
//             },
//             {
//                 headers: {
//                     Authorization: `Bearer ${accessToken}`,
//                     "Content-Type": "application/json"
//                 }
//             }
//         );

//         return res.redirect(viewRes.data.url);

//     } catch (error) {

//         console.error(
//             "RPC START SIGN ERROR:",
//             error.response?.data || error
//         );

//         return res.status(500).send("Unable to start signing.");

//     }
// });


// router.get("/sign-complete/:partyId", async (req, res) => {
//     try {
//         const { partyId } = req.params;

//         console.log("========== RPC SIGN COMPLETE ==========");
//         console.log("Party ID:", partyId);

//         // ----------------------------------------------------
//         // RPC
//         // ----------------------------------------------------
//         const rpc = await RPC.findOne({ partyId });

//         if (!rpc) {
//             return res.status(404).send("Residential Purchase Contract not found.");
//         }

//         // Prevent duplicate notification
//         if (rpc.completedEmailSent) {
//             console.log("Notification already sent.");

//             return res.redirect(
//                 "https://realtorparth.ca/signature-complete"
//             );
//         }

//         // ----------------------------------------------------
//         // Party
//         // ----------------------------------------------------
//         const party = await TransactionParty.findById(partyId);

//         if (!party) {
//             return res.status(404).send("Party not found.");
//         }

//         // ----------------------------------------------------
//         // Transaction User (Admin / Agent)
//         // ----------------------------------------------------
//         const transactionUser = await TransactionUser.findById(
//             party.userId
//         );

//         if (!transactionUser) {
//             return res.status(404).send("Transaction User not found.");
//         }

//         console.log("Sending notification to:", transactionUser.email);

//         // ----------------------------------------------------
//         // Send Notification Email
//         // ----------------------------------------------------
//         await transporter.sendMail({
//             from: `"RealtorParth" <hello@realtorparth.ca>`,
//             to: transactionUser.email,
//             subject: "Residential Purchase Contract Signed by Client",

//             html: `
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
// <strong>Residential Purchase Contract</strong>.
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
// Residential Purchase Contract
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
//                 dateStyle: "long",
//                 timeStyle: "short"
//             })}
// </td>
// </tr>

// </table>

// <div style="background:#f8f9fb;border-left:4px solid #16a34a;padding:18px;border-radius:6px;">
// <p style="margin:0;font-size:15px;color:#555;line-height:24px;">
// This is an automated notification confirming that the client has completed their portion of the Residential Purchase Contract signing process.
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
//         });

//         console.log("Notification email sent.");

//         // ----------------------------------------------------
//         // Prevent duplicate notification
//         // ----------------------------------------------------
//         rpc.completedEmailSent = true;
//         await rpc.save();

//         console.log("completedEmailSent updated");

//         return res.redirect(
//             "https://realtorparth.ca/signature-complete"
//         );

//     } catch (err) {

//         console.error("========== RPC SIGN COMPLETE ERROR ==========");
//         console.error(err.response?.data || err);

//         return res.redirect(
//             "https://realtorparth.ca/signature-complete"
//         );
//     }
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
                returnUrl: `http://localhost:5173/sign-redirect?partyId=${partyId}&type=rpc`,
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

        if (status !== "completed") {
            return res.status(400).json({
                error: "Not completed yet"
            });
        }

        console.log("✅ All parties signed");

        /* ===============================
           📄 DOWNLOAD FINAL PDF
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

        const pdfBuffer = pdfRes.data;

        /* ===============================
           📄 DOWNLOAD SUMMARY (CERTIFICATE)
        =============================== */
        const certRes = await axios.get(
            `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/documents/certificate`,
            {
                responseType: "arraybuffer",
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );

        const certBuffer = certRes.data;

        console.log("📄 PDF + Summary ready");

        /* ===============================
           📧 SEND EMAIL (TRANSACTION USER)
        =============================== */
        const party = await TransactionParty.findById(partyId);
        const transactionUser = await TransactionUser.findById(party.userId);

        const userEmail = transactionUser?.email;

        if (userEmail) {
            await sendSignedPdfEmail(
                userEmail,
                pdfBuffer,
                certBuffer
            );

            console.log("📧 Email sent with PDF + Summary:", userEmail);
        } else {
            console.warn("⚠️ No transaction user email found");
        }

        /* ===============================
           📥 RETURN PDF TO FRONTEND
        =============================== */
        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": "attachment; filename=Signed.pdf"
        });

        res.send(pdfBuffer);

    } catch (err) {
        console.error("❌ ERROR:", err);
        res.status(500).send("Download + email error");
    }
});


router.get("/rpc/user/:partyId", async (req, res) => {

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

        const data = await RPC.findOne({
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














































// router.post("/generate-rpc", async (req, res) => {

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
//                 message: "partyId is required",
//             });
//         }

//         /* ===============================
//            VERIFY PARTY EXISTS
//         =============================== */

//         const party = await TransactionParty.findById(partyId);

//         if (!party) {
//             return res.json({
//                 success: false,
//                 message: "Invalid party",
//             });
//         }
//         console.log(party)
//         const transactinuser = await TransactionUser.findById(party.userId);

//         /* ===============================
//            SAVE / UPDATE (PER PARTY)
//         =============================== */

//         await RPC.findOneAndUpdate(
//             { partyId }, // 🔥 MAIN FIX
//             {
//                 ...data,
//                 partyId,
//                 transactionId: party.transactionId // ✅ optional (admin use)
//             },
//             {
//                 upsert: true,
//                 new: true
//             }
//         );

//         console.log(RPC)

//         // 👉 continue your PDF logic here...

//         /* ===============================
//            LOAD PDF
//         =============================== */

//         const existingPdfBytes = fs.readFileSync(PDF_PATH);
//         const pdfDoc = await PDFDocument.load(existingPdfBytes, {
//             ignoreEncryption: true
//         });

//         const form = pdfDoc.getForm();
//         const font = await pdfDoc.embedFont(StandardFonts.Helvetica);


//         /* =====================================================
//            SECTION A – BASIC INFO
//         ===================================================== */

//         // Property Address (split example if needed)

//         if (data.agreementNumber) {
//             form.getTextField("txtp_PlatBook")
//                 .setText(data.agreementNumber);
//         }

//         if (data.sellerName1) {
//             form.getTextField("txtseller1")
//                 .setText(data.sellerName1);
//         }
//         if (data.sellerName2) {
//             form.getTextField("txtseller2")
//                 .setText(data.sellerName2);
//         }

//         if (data.buyerName1) {
//             form.getTextField("txtbuyer1")
//                 .setText(data.buyerName1);
//         }

//         if (data.buyerName2) {
//             form.getTextField("txtbuyer2")
//                 .setText(data.buyerName2);
//         }

//         if (data.unitnumber) {
//             form.getTextField("txtp_unitNumber")
//                 .setText(data.unitnumber);
//         }

//         if (data.streetnumber) {
//             form.getTextField("txtp_streetnum")
//                 .setText(data.streetnumber);
//         }

//         if (data.streetname) {
//             form.getTextField("txtp_street")
//                 .setText(data.streetname);
//         }

//         if (data.city) {
//             form.getTextField("txtp_city")
//                 .setText(data.city);
//         }

//         if (data.postalCode) {
//             form.getTextField("txtp_zipcode")
//                 .setText(data.postalCode);
//         }

//         if (data.plan) {
//             form.getTextField("txtp_PageNumber")
//                 .setText(data.plan);
//         }

//         if (data.block) {
//             form.getTextField("txtp_Block")
//                 .setText(data.block);
//         }

//         if (data.lot) {
//             form.getTextField("txtp_LotNumber")
//                 .setText(data.lot);
//         }

//         if (data.legalOther) {
//             form.getTextField("txtLegalOther")
//                 .setText(data.legalOther);
//         }

//         if (data.unattachedGoods) {
//             form.getTextField("txtp_propincludes")
//                 .setText(data.unattachedGoods);
//         }

//         if (data.attachedGoods) {
//             form.getTextField("txtp_propexcludes")
//                 .setText(data.attachedGoods);
//         }

//         if (data.purchasePrice) {
//             form.getTextField("txtp_price")
//                 .setText(data.purchasePrice);
//         }


//         if (data.completionDay) {
//             const [year, month, day] = data.completionDay.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtp_closedate_mmmm").setText(month);
//             form.getTextField("txtp_closedate_dd").setText(day);
//             form.getTextField("txtp_closedate_yy").setText(yy);
//         }


//         if (data.hidbrokerage) {
//             form.getTextField("hidBrokerage")
//                 .setText(data.hidbrokerage);
//         }

//         if (data.depositTrustee) {
//             form.getTextField("txtTrustee")
//                 .setText(data.depositTrustee);
//         }

//         if (data.depositAmount1) {
//             form.getTextField("txtp_Deposit")
//                 .setText(data.depositAmount1);
//         }

//         if (data.depositMethod1) {
//             form.getTextField("txtDepositMethod")
//                 .setText(data.depositMethod1);
//         }

//         if (data.depositTime1) {
//             form.getTextField("txtampmAlter1")
//                 .setText(data.depositTime1);
//         }

//         if (data.depositDate1) {
//             const [year, month, day] = data.depositDate1.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtalterDate_m").setText(month);
//             form.getTextField("txtalterDate_d").setText(day);
//             form.getTextField("txtalterDate_yy").setText(yy);
//         }

//         if (data.depositAmount2) {
//             form.getTextField("txtp_AdditionalDeposit")
//                 .setText(data.depositAmount2);
//         }

//         if (data.depositMethod2) {
//             form.getTextField("txtAddDepositMethod")
//                 .setText(data.depositMethod2);
//         }

//         if (data.depositTime2) {
//             form.getTextField("txtampmAlter2")
//                 .setText(data.depositTime2);
//         }

//         if (data.depositDate2) {
//             const [year, month, day] = data.depositDate2.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtalter2Date_m").setText(month);
//             form.getTextField("txtalter2Date_d").setText(day);
//             form.getTextField("txtalter2Date_yy").setText(yy);
//         }

//         if (data.altertime3) {
//             form.getTextField("txtampmAlter3")
//                 .setText(data.altertime3);
//         }

//         if (data.alterdate3) {
//             const [year, month, day] = data.alterdate3.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtalter3Date_m").setText(month);
//             form.getTextField("txtalter3Date_d").setText(day);
//             form.getTextField("txtalter3Date_yy").setText(yy);
//         }


//         if (data.downPaymentPercent) {
//             form.getTextField("txtp_TotalFinance")
//                 .setText(data.downPaymentPercent);
//         }

//         if (data.financingConditionTime) {
//             form.getTextField("txtFinTime")
//                 .setText(data.financingConditionTime);
//         }

//         if (data.financingConditionDay) {
//             const [year, month, day] = data.financingConditionDay.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtFinancingDate_m").setText(month);
//             form.getTextField("txtFinancingDate_d").setText(day);
//             form.getTextField("txtFinancingDate_yy").setText(yy);
//         }


//         if (data.inspectionConditionTime) {
//             form.getTextField("txtInspectTime")
//                 .setText(data.inspectionConditionTime);
//         }

//         if (data.inspectionConditionDay) {
//             const [year, month, day] = data.inspectionConditionDay.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtInspectionDate_m").setText(month);
//             form.getTextField("txtInspectionDate_d").setText(day);
//             form.getTextField("txtInspectionDate_yy").setText(yy);
//         }

//         if (data.buyerPropertySaleTime) {
//             form.getTextField("txtBuyPropTime")
//                 .setText(data.buyerPropertySaleTime);
//         }

//         if (data.buyerPropertySaleDay) {
//             const [year, month, day] = data.buyerPropertySaleDay.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtBuyerPropSaleDate_m").setText(month);
//             form.getTextField("txtBuyerPropSaleDate_d").setText(day);
//             form.getTextField("txtBuyerPropSaleDate_yy").setText(yy);
//         }


//         if (data.buyerConditions) {
//             form.getTextField("txtAddBuyCond")
//                 .setText(data.buyerConditions);
//         }

//         if (data.buyCondTime) {
//             form.getTextField("txtBuyCondTime")
//                 .setText(data.buyCondTime);
//         }

//         if (data.buyCondDate) {
//             const [year, month, day] = data.buyCondDate.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtBuyerConditionDate_m").setText(month);
//             form.getTextField("txtBuyerConditionDate_d").setText(day);
//             form.getTextField("txtBuyerConditionDate_yy").setText(yy);
//         }

//         if (data.sellerConditions) {
//             form.getTextField("txtSellerCond")
//                 .setText(data.sellerConditions);
//         }

//         if (data.sellerCondTime) {
//             form.getTextField("txtSellCondTime")
//                 .setText(data.sellerCondTime);
//         }

//         if (data.sellerCondDate) {
//             const [year, month, day] = data.sellerCondDate.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtSellerConditionDate_m").setText(month);
//             form.getTextField("txtSellerConditionDate_d").setText(day);
//             form.getTextField("txtSellerConditionDate_yy").setText(yy);
//         }


//         if (data.financingSchedule) {
//             form.getCheckBox("chkOpt_Docs1").check();
//         }

//         if (data.tenancySchedule) {
//             form.getCheckBox("chkOpt_Docs2").check();
//         }

//         if (data.manufacturedHomeSchedule) {
//             form.getCheckBox("chkOpt_Docs3").check();
//         }

//         if (data.saleOfBuyerPropertySchedule) {
//             form.getCheckBox("chkOpt_Docs4").check();
//         }

//         if (data.addendum) {
//             form.getCheckBox("chkOpt_Docs5").check();
//         }

//         if (data.otherAttachment) {
//             form.getTextField("txtAttachOther").setText(data.otherAttachment);
//             form.getCheckBox("chkOpt_Docs6").check();
//         }

//         if (data.otherTerms) {
//             form.getTextField("txtOthTerms").setText(data.otherTerms);
//         }


//         if (data.sellerBrokerage) {
//             form.getTextField("txtl_broker")
//                 .setText(data.sellerBrokerage);
//         }

//         if (data.sellerRepAddr) {
//             form.getTextField("txtl_brkaddr")
//                 .setText(data.sellerRepAddr);
//         }

//         if (data.sellerRepCity) {
//             form.getTextField("txtl_brkcity")
//                 .setText(data.sellerRepCity);
//         }

//         if (data.sellerRepState) {
//             form.getTextField("txtl_brkstate")
//                 .setText(data.sellerRepState);
//         }

//         if (data.sellerRepcode) {
//             form.getTextField("txtl_brkzipcode")
//                 .setText(data.sellerRepcode);
//         }


//         if (data.buyerBrokerage) {
//             form.getTextField("txts_broker")
//                 .setText(data.buyerBrokerage);
//         }

//         if (data.buyerRepAddr) {
//             form.getTextField("txts_brkaddr")
//                 .setText(data.buyerRepAddr);
//         }

//         if (data.buyerRepCity) {
//             form.getTextField("txts_brkcity")
//                 .setText(data.buyerRepCity);
//         }

//         if (data.buyerRepState) {
//             form.getTextField("txts_brkstate")
//                 .setText(data.buyerRepState);
//         }

//         if (data.buyerRepcode) {
//             form.getTextField("txts_brkzipcode")
//                 .setText(data.buyerRepcode);
//         }




//         if (data.brksellerRepName) {
//             form.getTextField("txtl_brkagent")
//                 .setText(data.brksellerRepName);
//         }

//         if (data.brksellerRepPhone) {
//             form.getTextField("txtl_brkagentph")
//                 .setText(data.brksellerRepPhone);
//         }

//         if (data.brksellerRepFax) {
//             form.getTextField("txtl_brkagentfax")
//                 .setText(data.brksellerRepFax);
//         }

//         if (data.brksellerRepEmail) {
//             form.getTextField("txtl_brkagentemail")
//                 .setText(data.brksellerRepEmail);
//         }



//         if (data.brkbuyerRepName) {
//             form.getTextField("txts_brkagent")
//                 .setText(data.brkbuyerRepName);
//         }

//         if (data.brkbuyerRepPhone) {
//             form.getTextField("txts_brkagentph")
//                 .setText(data.brkbuyerRepPhone);
//         }

//         if (data.brkbuyerRepFax) {
//             form.getTextField("txts_brkagentfax")
//                 .setText(data.brkbuyerRepFax);
//         }

//         if (data.brkbuyerRepEmail) {
//             form.getTextField("txts_brkagentemail")
//                 .setText(data.brkbuyerRepEmail);
//         }



//         if (data.sellerAuthorizedPerson) {
//             form.getTextField("txtSellBrkName")
//                 .setText(data.sellerAuthorizedPerson);
//         }

//         if (data.buyerAuthorizedPerson) {
//             form.getTextField("txtBuyBrkName")
//                 .setText(data.buyerAuthorizedPerson);
//         }



//         if (data.offerExpiryTime) {
//             form.getTextField("txtExpireHr")
//                 .setText(data.offerExpiryTime);
//         }

//         if (data.offerExpiryDate) {
//             const [year, month, day] = data.offerExpiryDate.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtExpireDate_m").setText(month);
//             form.getTextField("txtExpireDate_d").setText(day);
//             form.getTextField("txtExpireDate_yy").setText(yy);
//         }



//         if (data.buyerSignedTime1) {
//             form.getTextField("txtSignedTime")
//                 .setText(data.buyerSignedTime1);
//         }

//         if (data.buyerSignedDate1) {
//             const [year, month, day] = data.buyerSignedDate1.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtSignedDate_m").setText(month);
//             form.getTextField("txtSignedDate_d").setText(day);
//             form.getTextField("txtSignedDate_yy").setText(yy);
//         }

//         if (data.buyerWitnessName1) {
//             form.getTextField("txtWitness1Sig")
//                 .setText(data.buyerWitnessName1);
//         }



//         if (data.buyerSignedTime2) {
//             form.getTextField("txtSignedTime2")
//                 .setText(data.buyerSignedTime2);
//         }

//         if (data.buyerSignedDate2) {
//             const [year, month, day] = data.buyerSignedDate2.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtSigned2Date_m").setText(month);
//             form.getTextField("txtSigned2Date_d").setText(day);
//             form.getTextField("txtSigned2Date_yy").setText(yy);
//         }

//         if (data.buyerWitnessName2) {
//             form.getTextField("txtWitness2Sig")
//                 .setText(data.buyerWitnessName2);
//         }


//         if (data.sellerSignedTime1) {
//             form.getTextField("txtAcceptTime")
//                 .setText(data.sellerSignedTime1);
//         }

//         if (data.sellerSignedDate1) {
//             const [year, month, day] = data.sellerSignedDate1.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtAcceptanceDate_m").setText(month);
//             form.getTextField("txtAcceptanceDate_d").setText(day);
//             form.getTextField("txtAcceptanceDate_yy").setText(yy);
//         }


//         if (data.sellerWitnessName1) {
//             form.getTextField("txtWitness3Sig")
//                 .setText(data.sellerWitnessName1);
//         }

//         if (data.sellerSignedTime2) {
//             form.getTextField("txtAcceptTime2")
//                 .setText(data.sellerSignedTime2);
//         }

//         if (data.sellerSignedDate2) {
//             const [year, month, day] = data.sellerSignedDate2.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtAcceptance2Date_m").setText(month);
//             form.getTextField("txtAcceptance2Date_d").setText(day);
//             form.getTextField("txtAcceptance2Date_yy").setText(yy);
//         }

//         if (data.sellerWitnessName2) {
//             form.getTextField("txtWitness4Sig")
//                 .setText(data.sellerWitnessName2);
//         }

//         if (data.spouseSignedTime) {
//             form.getTextField("txtSpouseTime")
//                 .setText(data.spouseSignedTime);
//         }

//         if (data.spouseSignedDate) {
//             const [year, month, day] = data.spouseSignedDate.split("-");
//             const yy = year.slice(-2);
//             form.getTextField("txtSpouseSignedDate_m").setText(month);
//             form.getTextField("txtSpouseSignedDate_d").setText(day);
//             form.getTextField("txtSpouseSignedDate_yy").setText(yy);
//         }

//         if (data.spouseName) {
//             form.getTextField("txtSpouse1Sig")
//                 .setText(data.spouseName);
//         }

//         if (data.spouseWitnessName) {
//             form.getTextField("txtWitness5Sig")
//                 .setText(data.spouseWitnessName);
//         }

//         /* =====================================================
//            CONVEYANCING INFORMATION SELLER
//         ===================================================== */

//         if (data.sellerRepstreetnum) {
//             form.getTextField("txtS_streetnum")
//                 .setText(data.sellerRepstreetnum);
//         }

//         if (data.sellerRepstreet) {
//             form.getTextField("txtS_street")
//                 .setText(data.sellerRepstreet);
//         }

//         if (data.sellerCity) {
//             form.getTextField("txtS_city")
//                 .setText(data.sellerCity);
//         }

//         if (data.sellerState) {
//             form.getTextField("txtS_state")
//                 .setText(data.sellerState);
//         }

//         if (data.sellercode) {
//             form.getTextField("txtS_zipcode")
//                 .setText(data.sellercode);
//         }

//         if (data.sellerRepphone) {
//             form.getTextField("txtS_phone1")
//                 .setText(data.sellerRepphone);
//         }

//         if (data.sellerRepfax) {
//             form.getTextField("txtS_fax")
//                 .setText(data.sellerRepfax);
//         }

//         if (data.brksellerRepLName) {
//             form.getTextField("txts_lawyername")
//                 .setText(data.brksellerRepLName);
//         }

//         if (data.brksellerRepLfirm) {
//             form.getTextField("txts_lawyerfirm")
//                 .setText(data.brksellerRepLfirm);
//         }

//         if (data.brksellerRepLaddr) {
//             form.getTextField("txts_lawyeraddr")
//                 .setText(data.brksellerRepLaddr);
//         }


//         if (data.brksellerRepLcity) {
//             form.getTextField("txts_lawyercity")
//                 .setText(data.brksellerRepLcity);
//         }

//         if (data.brksellerRepLstate) {
//             form.getTextField("txts_lawyerstate")
//                 .setText(data.brksellerRepLstate);
//         }

//         if (data.brksellerRepLcode) {
//             form.getTextField("txts_lawyerzipcode")
//                 .setText(data.brksellerRepLcode);
//         }

//         if (data.brksellerRepLPhone) {
//             form.getTextField("txts_lawyerphone")
//                 .setText(data.brksellerRepLPhone);
//         }

//         if (data.brksellerRepLFax) {
//             form.getTextField("txts_lawyerfax")
//                 .setText(data.brksellerRepLFax);
//         }

//         if (data.brksellerRepLEmail) {
//             form.getTextField("txts_lawyeremail")
//                 .setText(data.brksellerRepLEmail);
//         }

//         /* =====================================================
//            CONVEYANCING INFORMATION BUYER
//         ===================================================== */

//         if (data.buyerRepstreetNum) {
//             form.getTextField("txtb_streetnum123")
//                 .setText(data.buyerRepstreetNum);
//         }

//         if (data.buyerRepStreet) {
//             form.getTextField("txtb_street123")
//                 .setText(data.buyerRepStreet);
//         }

//         if (data.buyerRepCity2) {
//             form.getTextField("txtb_city123")
//                 .setText(data.buyerRepCity2);
//         }

//         if (data.buyerRepState2) {
//             form.getTextField("txtb_state123")
//                 .setText(data.buyerRepState2);
//         }

//         if (data.buyerRepcode2) {
//             form.getTextField("txtb_zipcode123")
//                 .setText(data.buyerRepcode2);
//         }

//         if (data.brkbuyerRepPhone) {
//             form.getTextField("txtb_phone1123")
//                 .setText(data.brkbuyerRepPhone);
//         }

//         if (data.brkbuyerRepFax) {
//             form.getTextField("txtb_fax123")
//                 .setText(data.brkbuyerRepFax);
//         }

//         if (data.brkbuyerRepLName) {
//             form.getTextField("txtb_lawyername")
//                 .setText(data.brkbuyerRepLName);
//         }

//         if (data.brkbuyerRepLFirm) {
//             form.getTextField("txtb_lawyerfirm")
//                 .setText(data.brkbuyerRepLFirm);
//         }

//         if (data.brkbuyerRepLAddr) {
//             form.getTextField("txtb_lawyeraddr")
//                 .setText(data.brkbuyerRepLAddr);
//         }

//         if (data.brkbuyerRepLCity) {
//             form.getTextField("txtb_lawyercity")
//                 .setText(data.brkbuyerRepLCity);
//         }

//         if (data.brkbuyerRepLstate) {
//             form.getTextField("txtb_lawyerstate")
//                 .setText(data.brkbuyerRepLstate);
//         }

//         if (data.brkbuyerRepLZip) {
//             form.getTextField("txtb_lawyerzipcode")
//                 .setText(data.brkbuyerRepLZip);
//         }

//         if (data.brkbuyerRepLPhone) {
//             form.getTextField("txtb_lawyerphone")
//                 .setText(data.brkbuyerRepLPhone);
//         }

//         if (data.brkbuyerRepLFax) {
//             form.getTextField("txtb_lawyerfax")
//                 .setText(data.brkbuyerRepLFax);
//         }

//         if (data.brkbuyerRepLEmail) {
//             form.getTextField("txtb_lawyeremail")
//                 .setText(data.brkbuyerRepLEmail);
//         }




//         /* ===============================
//            SAVE PDF
//         =============================== */

//         // 1️⃣ Regenerate all field appearances (VERY IMPORTANT)
//         form.updateFieldAppearances(font);

//         // 2️⃣ Flatten AFTER updating appearances
//         form.flatten();

//         const pdfBytes = await pdfDoc.save({
//             updateFieldAppearances: true
//         });

//         /* ===============================
//     🟡 ADMIN MODE → DIRECT PDF
//     =============================== */
//         if (isAdmin) {
//             return res
//                 .status(200)
//                 .set({
//                     "Content-Type": "application/pdf",
//                     "Content-Disposition": "attachment; filename=Buyer_Amendment.pdf"
//                 })
//                 .send(Buffer.from(pdfBytes));
//         }

//         /* ===============================
//           DOCUSIGN FLOW
//        =============================== */

//         const accessToken = await getAccessToken();
//         const isEmbedded = !sendEmail;

//         const embeddedSigners = [];
//         const emailSigners = [];

//         let recipientId = 1;

//         const baseEmail = party.email;
//         const [name, domain] = baseEmail.split("@");

//         const buyer1Email = baseEmail;
//         const buyer2Email = `${name}+buyer2@${domain}`;
//         const seller1Email = `${name}+seller1@${domain}`;
//         const seller2Email = `${name}+seller2@${domain}`;
//         const spouseEmail = `${name}+spouse@${domain}`;

//         /* 🟢 BUYER 1 */
//         if (data.buyerName1) {
//             embeddedSigners.push({
//                 email: buyer1Email,
//                 name: data.buyerName1,
//                 recipientId: String(recipientId),
//                 routingOrder: String(recipientId),
//                 ...(isEmbedded && {
//                     clientUserId: `${party._id}_buyer1`
//                 }),
//                 tabs: {
//                     signHereTabs: [{ anchorString: "/sign1/" }]
//                 }
//             });
//             recipientId++;
//         }

//         /* 🔵 BUYER 2 */
//         if (data.buyerName2) {
//             embeddedSigners.push({
//                 email: buyer2Email,
//                 name: data.buyerName2,
//                 recipientId: String(recipientId),
//                 routingOrder: String(recipientId),
//                 ...(isEmbedded && {
//                     clientUserId: `${party._id}_buyer2`
//                 }),
//                 tabs: {
//                     signHereTabs: [{ anchorString: "/sign3/" }]
//                 }
//             });
//             recipientId++;
//         }

//         /* 🔵 SELLER 1 */
//         if (data.sellerName1) {
//             embeddedSigners.push({
//                 email: seller1Email,
//                 name: data.sellerName1,
//                 recipientId: String(recipientId),
//                 routingOrder: String(recipientId),
//                 ...(isEmbedded && {
//                     clientUserId: `${party._id}_seller1`
//                 }),
//                 tabs: {
//                     signHereTabs: [{ anchorString: "/sign5/" }]
//                 }
//             });
//             recipientId++;
//         }

//         /* 🔵 SELLER 2 */
//         if (data.sellerName2) {
//             embeddedSigners.push({
//                 email: seller2Email,
//                 name: data.sellerName2,
//                 recipientId: String(recipientId),
//                 routingOrder: String(recipientId),
//                 ...(isEmbedded && {
//                     clientUserId: `${party._id}_seller2`
//                 }),
//                 tabs: {
//                     signHereTabs: [{ anchorString: "/sign7/" }]
//                 }
//             });
//             recipientId++;
//         }

//         /* 🔵 SPOUSE 2 */
//         if (data.spouseName) {
//             embeddedSigners.push({
//                 email: spouseEmail,
//                 name: data.spouseName,
//                 recipientId: String(recipientId),
//                 routingOrder: String(recipientId),
//                 ...(isEmbedded && {
//                     clientUserId: `${party._id}_spouse`
//                 }),
//                 tabs: {
//                     signHereTabs: [{ anchorString: "/sign9/" }]
//                 }
//             });
//             recipientId++;
//         }

//         /* 🟣 REP (EMAIL ONLY) */
//         // if (data.brokerPrint && transactinuser?.email) {
//         //   emailSigners.push({
//         //     email: transactinuser.email,
//         //     name: data.brokerPrint,
//         //     recipientId: String(recipientId),
//         //     routingOrder: String(recipientId),
//         //     tabs: {
//         //       signHereTabs: [{ anchorString: "/sign5/" }]
//         //     }
//         //   });
//         //   recipientId++;
//         // }

//         const allSigners = [...embeddedSigners, ...emailSigners];

//         if (allSigners.length === 0) {
//             return res.status(400).json({ error: "No signers found" });
//         }

//         /* ===============================
//            CREATE ENVELOPE
//         =============================== */
//         const envelopeRes = await axios.post(
//             `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes`,
//             {
//                 emailSubject: "Please sign Buyer Amendment document",
//                 documents: [
//                     {
//                         documentBase64: Buffer.from(pdfBytes).toString("base64"),
//                         name: "Residential Purchase Contract.pdf",
//                         fileExtension: "pdf",
//                         documentId: "1"
//                     }
//                 ],
//                 recipients: { signers: allSigners },
//                 status: "sent"
//             },
//             {
//                 headers: {
//                     Authorization: `Bearer ${accessToken}`,
//                     "Content-Type": "application/json"
//                 }
//             }
//         );

//         const envelopeId = envelopeRes.data.envelopeId;

//         /* ===============================
//            STORE SESSION (ONLY BUYERS)
//         =============================== */
//         global.signingSessions = global.signingSessions || {};

//         global.signingSessions[partyId] = {
//             envelopeId,
//             signers: embeddedSigners,
//             currentIndex: 0
//         };

//         /* ===============================
//            START SIGNING (BUYER 1)
//         =============================== */
//         let signingUrl = null;

//         if (isEmbedded && embeddedSigners.length > 0) {
//             const firstSigner = embeddedSigners[0];

//             const viewRes = await axios.post(
//                 `https://demo.docusign.net/restapi/v2.1/accounts/${process.env.DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}/views/recipient`,
//                 {
//                     // returnUrl: `${process.env.FRONTEND_URL}/sign-redirect?partyId=${partyId}&type=rpc`,
//                     returnUrl: `http://localhost:5173/sign-redirect?partyId=${partyId}&type=rpc`,
//                     authenticationMethod: "none",
//                     email: firstSigner.email,
//                     userName: firstSigner.name,
//                     clientUserId: firstSigner.clientUserId
//                 },
//                 {
//                     headers: {
//                         Authorization: `Bearer ${accessToken}`,
//                         "Content-Type": "application/json"
//                     }
//                 }
//             );

//             signingUrl = viewRes.data.url;
//         }

//         return res.json({
//             success: true,
//             envelopeId,
//             signingUrl
//         });


//         // res.setHeader("Content-Type", "application/pdf");
//         // res.setHeader(
//         //     "Content-Disposition",
//         //     "attachment; filename=RPC.pdf"
//         // );

//         // res.send(Buffer.from(pdfBytes));

//     } catch (err) {
//         console.error("RPC ERROR:", err);
//         res.status(500).json({
//             error: "Failed to generate RPC PDF",
//         });
//     }
// });