// routes/reminder.js

import express from "express";
import Party from "../models/TransactionParty.js"; // 🔥 your model
import { sendReminderEmail } from "../utils/sendReminderEmail.js";

const router = express.Router();

router.post("/send", async (req, res) => {
  try {
    const { partyId, documentKey, documentName } = req.body;
    console.log("Received reminder request:", { partyId, documentKey, documentName });

    if (!partyId || !documentKey) {
      return res.status(400).json({ success: false, message: "Missing data" });
    }

    // ✅ GET PARTY
    const party = await Party.findById(partyId);

    if (!party) {
      return res.status(404).json({ success: false, message: "Party not found" });
    }

    if (!party.email) {
      return res.status(400).json({ success: false, message: "Party has no email" });
    }
console.log("Sending reminder to:", party.email);
console.log("Document:", documentKey);
console.log("Document Name:", documentName);
    // ✅ SEND EMAIL
    await sendReminderEmail(party, documentKey, documentName);

    res.json({ success: true });

  } catch (err) {
    console.error("Reminder Error:", err);
    res.status(500).json({ success: false });
  }
});

export default router;