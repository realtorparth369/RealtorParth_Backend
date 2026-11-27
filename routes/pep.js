import express from "express";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { PDFDocument, StandardFonts } from "pdf-lib";
import Pep from "../models/PepModel.js";
import Transaction from "../models/Transaction.js";
import TransactionParty from "../models/TransactionParty.js";

const router = express.Router();

const PDF_PATH = path.join(process.cwd(), "Politically Exposed PersonHead of International Organization Checklist.pdf");


/* ===============================
   GENERATE + SAVE PEP
================================ */

//router.post("/generate-pep", async (req, res) => {

//  try {

//    const data = req.body;

//    if (!data.transactionUserId) {
//      return res.status(400).json({
//        success: false,
//        message: "transactionUserId required"
//      });
//    }

//    const userId = new mongoose.Types.ObjectId(data.transactionUserId);

    /* ===============================
       SAVE OR UPDATE DB
    ================================ */

//    await Pep.findOneAndUpdate(
//      { transactionUserId: userId },
//      { $set: data },
//      { new: true, upsert: true }
//    );

// router.post("/generate-pep", async (req, res) => {

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
//        SAVE OR UPDATE DB
//     =============================== */

//     await Pep.findOneAndUpdate(
//       { transactionId },          // ✅ KEY FIX
//       { ...data, transactionId }, // ✅ store transactionId
//       { new: true, upsert: true }
//     );




// router.post("/generate-pep", async (req, res) => {

//   try {

//     const { transactionId, userId, partyId, ...data } = req.body;

//     // ✅ VALIDATION
//     if (!transactionId || !userId || !partyId) {
//       return res.status(400).json({
//         success: false,
//         message: "transactionId, userId or partyId required"
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
//        VERIFY PARTY BELONGS TO TRANSACTION
//     =============================== */

//     const party = await TransactionParty.findOne({
//       _id: partyId,
//       transactionId
//     });

//     if (!party) {
//       return res.json({
//         success: false,
//         message: "Invalid party"
//       });
//     }

//     /* ===============================
//        SAVE OR UPDATE DB (PER PARTY)
//     =============================== */

//     await Pep.findOneAndUpdate(
//       { partyId }, // 🔥 MAIN FIX
//       {
//         ...data,
//         transactionId,
//         partyId
//       },
//       {
//         new: true,
//         upsert: true
//       }
//     );

//     // 👉 continue your PDF logic here...



router.post("/generate-pep", async (req, res) => {

  try {

    const { partyId, ...data } = req.body;

    // ✅ VALIDATION
    if (!partyId) {
      return res.status(400).json({
        success: false,
        message: "partyId required"
      });
    }

    /* ===============================
       GET PARTY + TRANSACTION
    =============================== */

    const party = await TransactionParty.findById(partyId);

    if (!party) {
      return res.json({
        success: false,
        message: "Invalid party"
      });
    }

    const transactionId = party.transactionId;

    /* ===============================
       SAVE OR UPDATE DB (PER PARTY)
    =============================== */

    const pep = await Pep.findOneAndUpdate(
      { partyId }, // 🔥 ONE PEP PER PARTY
      {
        ...data,
        partyId,
        transactionId // 🔥 auto attach
      },
      {
        new: true,
        upsert: true
      }
    );

    // 👉 continue your PDF logic here...




    /* ===============================
       LOAD PDF
    ================================ */

    const existingPdfBytes = fs.readFileSync(PDF_PATH);

    const pdfDoc = await PDFDocument.load(existingPdfBytes, {
      ignoreEncryption: true
    });

    const form = pdfDoc.getForm();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);


    /* ===============================
       MAP TEXT FIELDS
    ================================ */


// Property Address (split example if needed)
    if (data.txtIndividual) {
      form.getTextField("txtIndividual").setText(data.txtIndividual);
    }

    if (data.chkOpt_Determine1) {
      form.getCheckBox("chkOpt_Determine1").check();
    }
    if (data.chkOpt_Determine2) {
      form.getCheckBox("chkOpt_Determine2").check();
    }
    if (data.chkOpt_Determine3) {
      form.getCheckBox("chkOpt_Determine3").check();
    }
    if (data.chkOpt_Determine4) {
      form.getCheckBox("chkOpt_Determine4").check();
    }


    if (data.chkOpt_Determination1) {
      form.getCheckBox("chkOpt_Determination1").check();
    }
    if (data.chkOpt_Determination2) {
      form.getCheckBox("chkOpt_Determination2").check();
    }
    if (data.chkOpt_Determination3) {
      form.getCheckBox("chkOpt_Determination3").check();
    }
    if (data.chkOpt_Determination4) {
      form.getCheckBox("chkOpt_Determination4").check();
    }
    if (data.txtDeterminationOther) {
      form.getTextField("txtDeterminationOther").setText(data.txtDeterminationOther);
    }
    if (data.txtDetermineDate) {
      form.getTextField("txtDetermineDate").setText(data.txtDetermineDate);
    }
    if (data.txtPEP) {
      form.getTextField("txtPEP").setText(data.txtPEP);
    }
    if (data.txtOrganization) {
      form.getTextField("txtOrganization").setText(data.txtOrganization);
    }


    if (data.chkOpt_Risk) {
      try {
        const radioField = form.getRadioGroup("radio_group_25wurc");

        if (data.chkOpt_Risk === "yes") {
          radioField.select("yes");
        }

        if (data.chkOpt_Risk === "no") {
          radioField.select("no");
        }

      } catch (err) {
        console.log("Third party radio group not found");
      }
    }


    if (data.txtSource) {
      const maxLengthLine1 = 80; // adjust based on PDF field width
      let words = data.txtSource.trim().split(" ");
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
      form.getTextField("txtSource1").setText(line1);
      form.getTextField("txtSource2").setText(line2);
    }

    if (data.chkOpt_Completed) {
      form.getCheckBox("chkOpt_Completed").check();
    }



    if (data.radio_group_27zujm) {
      try {
        const radioField = form.getRadioGroup("radio_group_27zujm");

        if (data.radio_group_27zujm === "yes") {
          radioField.select("yes");
        }

        if (data.radio_group_27zujm === "no") {
          radioField.select("no");
        }

      } catch (err) {
        console.log("Third party radio group not found");
      }
    }

        if (data.txtCashSource) {
      form.getTextField("txtCashSource").setText(data.txtCashSource);
    }
        if (data.txtWealthSource) {
      form.getTextField("txtWealthSource").setText(data.txtWealthSource);
    }
        if (data.txtManagement) {
      form.getTextField("txtManagement").setText(data.txtManagement);
    }
        if (data.txtManagementDate) {
      form.getTextField("txtManagementDate").setText(data.txtManagementDate);
    }


    /* ===============================
       FINALIZE PDF
    ================================ */

    form.updateFieldAppearances(font);

    form.flatten();

    const pdfBytes = await pdfDoc.save({
      updateFieldAppearances: true
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=PEP_Filled.pdf"
    );

    res.send(Buffer.from(pdfBytes));

  }





  catch (err) {

    console.error(err);

    res.status(500).send("Error generating PEP PDF");

  }

});


/* ===============================
   GET PEP BY USER
================================ */

//router.get("/pep/user/:userId", async (req, res) => {

//  try {

//    const pep = await Pep.findOne({
//      transactionUserId: req.params.userId
//    });

//    res.json({
//      success: true,
//      data: pep
//    });

//  }

//  catch (err) {

//    res.status(500).json({
//      success: false,
//      message: "Server error"
//    });

//  }

//});



router.get("/pep/user/:partyId", async (req, res) => {

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

    const pep = await Pep.findOne({
      partyId // 🔥 MAIN FIX
    });

    res.json({
      success: true,
      data: pep || null
    });

  } catch (err) {

    console.error("GET PEP ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});



// router.get("/pep/user/:transactionId/:userId", async (req, res) => {

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

//     const pep = await Pep.findOne({
//       transactionId   // ✅ KEY FIX
//     });

//     res.json({
//       success: true,
//       data: pep || null
//     });

//   } catch (err) {

//     console.error(err);

//     res.status(500).json({
//       success: false,
//       message: "Server error"
//     });

//   }

// });


export default router;