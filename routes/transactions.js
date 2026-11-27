import express from "express";
import Transaction from "../models/Transaction.js";
import TransactionParty from "../models/TransactionParty.js";

const router = express.Router();


// CREATE TRANSACTION
router.post("/create", async (req, res) => {

  try {

    const { transactionName, propertyAddress, agreementnumber, notes, userId } = req.body;

    if (!userId) {

      return res.json({
        success: false,
        message: "User not authenticated"
      });

    }

    const transaction = new Transaction({
      userId,
      name: transactionName,
      propertyAddress,
      agreementnumber,
      notes
    });

    await transaction.save();

    res.json({
      success: true,
      transaction
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});


// GET USER TRANSACTIONS
// router.get("/list/:userId", async (req, res) => {

//   try {

//     //   .find({ userId: req.params.userId })
//     const transactions = await Transaction
//     .find({ userId: req.params.userId, isArchived: false })
//     .sort({ createdAt: -1 });

//     res.json({
//       success: true,
//       transactions
//     });

//   } catch (error) {

//     console.error(error);

//     res.status(500).json({
//       success: false
//     });

//   }

// });



router.get("/transaction/settings/:partyId", async (req, res) => {
  try {

    const party = await TransactionParty.findById(req.params.partyId);

    if (!party) {
      return res.json({ success: false });
    }

    // ✅ CORRECT: use transactionId instead of userId
    const transactionsettings = await Transaction.findById(
      party.transactionId
    );

    res.json({
      success: true,
      data: transactionsettings || {}
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});


// router.get("/transaction/settings/:partyId", async (req, res) => {
//   try {

//     const party = await TransactionParty.findById(req.params.partyId);
//     console.log("PARTY:", party);
//     if (!party) {
//       return res.json({ success: false });
//     }

//     // ✅ DIRECT ACCESS (NO TRANSACTION QUERY)
//     const transactionsettings = await Transaction.findOne({
//       userId: party.userId,
//     });
//     console.log("transactionsettings:", transactionsettings);
//     res.json({
//       success: true,
//       data: transactionsettings || {}
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false });
//   }
// });




router.get("/list/:userId", async (req, res) => {

  try {

    const transactions = await Transaction
      .find({
        userId: req.params.userId,
        $or: [
          { isArchived: false },
          { isArchived: { $exists: false } } // 🔥 IMPORTANT FIX
        ]
      })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      transactions
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false
    });

  }

});


// ARCHIVE TRANSACTION
router.put("/archive/:id", async (req, res) => {
  try {
    const { userId } = req.body;

    const updated = await Transaction.findOneAndUpdate(
      {
        _id: req.params.id,
        userId
      },
      {
        isArchived: true
      },
      { new: true }
    );

    if (!updated) {
      return res.json({
        success: false,
        message: "Transaction not found"
      });
    }

    res.json({
      success: true,
      message: "Transaction archived"
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
});

// RESTORE TRANSACTION
router.put("/restore/:id", async (req, res) => {
  try {
    const { userId } = req.body;

    const updated = await Transaction.findOneAndUpdate(
      {
        _id: req.params.id,
        userId
      },
      {
        isArchived: false
      },
      { new: true }
    );

    if (!updated) {
      return res.json({
        success: false,
        message: "Transaction not found"
      });
    }

    res.json({
      success: true,
      message: "Transaction restored"
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
});

// GET ARCHIVED TRANSACTIONS
router.get("/archived/:userId", async (req, res) => {
  try {
    const transactions = await Transaction
      .find({ userId: req.params.userId, isArchived: true })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      transactions
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
});


// GET SINGLE TRANSACTION
router.get("/:id/:userId", async (req, res) => {

  try {

    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.params.userId
    });

    if (!transaction) {

      return res.json({
        success: false,
        message: "Transaction not found"
      });

    }

    res.json({
      success: true,
      transaction
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false
    });

  }

});


// UPDATE TRANSACTION
router.put("/:id", async (req, res) => {

  try {

    const { transactionName, propertyAddress, agreementnumber, notes, userId } = req.body;

    const updated = await Transaction.findOneAndUpdate(
      {
        _id: req.params.id,
        userId
      },
      {
        name: transactionName,
        propertyAddress,
        agreementnumber,
        notes
      },
      { new: true }
    );

    if (!updated) {

      return res.json({
        success: false,
        message: "Transaction not found"
      });

    }

    res.json({
      success: true,
      transaction: updated
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false
    });

  }

});

export default router;