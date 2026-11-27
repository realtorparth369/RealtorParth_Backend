import express from "express";
import AdminSettings from "../models/AdminSettings.js";
import Transaction from "../models/Transaction.js";

import TransactionParty from "../models/TransactionParty.js";

const router = express.Router();

router.get("/settings/by-party/:partyId", async (req, res) => {
  try {

    const party = await TransactionParty.findById(req.params.partyId);
//    console.log("PARTY:", party);
    if (!party) {
      return res.json({ success: false });
    }

    // ✅ DIRECT ACCESS (NO TRANSACTION QUERY)
    const settings = await AdminSettings.findOne({
      userId: party.userId
    });
//    console.log("SETTINGS:", settings);
    res.json({
      success: true,
      data: settings || {}
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// ================= GET SETTINGS =================
// GET /api/admin/settings/:transactionId/:userId
router.get("/settings/:userId", async (req, res) => {
  try {

    const { userId } = req.params;

    // ✅ VERIFY TRANSACTION
    // const transaction = await Transaction.findOne({
    //   _id: transactionId,
    //   userId
    // });

    // if (!transaction) {
    //   return res.json({
    //     success: false,
    //     message: "Unauthorized"
    //   });
    // }

    const settings = await AdminSettings.findOne({ userId });

    res.json({
      success: true,
      data: settings || {}
    });

  } catch (error) {

//    console.error("GET SETTINGS ERROR:", error);

    res.status(500).json({
      success: false
    });

  }
});


// ================= CREATE / UPDATE =================
// POST /api/admin/settings/save
router.post("/settings/save", async (req, res) => {
  try {

    const {
      userId,

      brokerageName,
      brokerageStreetNum,
      brokerageStreet,
      brokerageCity,
      brokerageState,
      brokeragePostalCode,
      brokeragePhone,
      brokerageEmail,

      repName,
      repPhone,
      repEmail

    } = req.body;

    // ❌ VALIDATION
    if (!userId) {
      return res.json({
        success: false,
        message: "Missing user"
      });
    }

    // ✅ VERIFY TRANSACTION
    // const transaction = await Transaction.findOne({
    //   _id: transactionId,
    //   userId
    // });

    // if (!transaction) {
    //   return res.json({
    //     success: false,
    //     message: "Unauthorized"
    //   });
    // }

    // ✅ CHECK EXISTING
    let settings = await AdminSettings.findOne({ userId });

    // ================= UPDATE =================
    if (settings) {

      settings.brokerageName = brokerageName;
      settings.brokerageStreetNum = brokerageStreetNum;
      settings.brokerageStreet = brokerageStreet;
      settings.brokerageCity = brokerageCity;
      settings.brokerageState = brokerageState;
      settings.brokeragePostalCode = brokeragePostalCode;
      settings.brokeragePhone = brokeragePhone;
      settings.brokerageEmail = brokerageEmail;

      settings.repName = repName;
      settings.repPhone = repPhone;
      settings.repEmail = repEmail;

      await settings.save();

    }

    // ================= CREATE =================
    else {

      settings = new AdminSettings({
        userId,

        brokerageName,
        brokerageStreetNum,
        brokerageStreet,
        brokerageCity,
        brokerageState,
        brokeragePostalCode,
        brokeragePhone,
        brokerageEmail,

        repName,
        repPhone,
        repEmail
      });

      await settings.save();
    }

    res.json({
      success: true,
      data: settings
    });

  } catch (error) {

    console.error("SAVE SETTINGS ERROR:", error);

    res.status(500).json({
      success: false
    });

  }
});

export default router;