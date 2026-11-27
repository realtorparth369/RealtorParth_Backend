import express from "express";
import nodemailer from "nodemailer";
import Lead from "../models/Lead.js"; // ✅ USE YOUR MODEL

const router = express.Router();


// ✅ Create transporter ONCE
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
      auth: {
        user: process.env.BREVO_USER,
        pass: process.env.BREVO_PASSWORD,
      },
});


// ==========================
// ✅ CONTACT FORM ROUTE
// ==========================
router.post("/submissionContact", async (req, res) => {
  console.log("Incoming contact form submission:", req.body);

  try {
    let { name, email, phone, subject, message } = req.body;

    // ==========================
    // ✅ VALIDATION
    // ==========================
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing.",
      });
    }

    email = email.toLowerCase().trim();

    // ==========================
    // ✅ AUTO CLASSIFY LEAD
    // ==========================
    let tag = "buyer";

    if (message.toLowerCase().includes("sell")) tag = "seller";
    else if (message.toLowerCase().includes("invest")) tag = "investor";
    else if (message.toLowerCase().includes("urgent")) tag = "hot_lead";

    // ==========================
    // ✅ SAVE TO DB (USING YOUR MODEL)
    // ==========================
    await Lead.create({
      name,
      email,
      phone,
      chat_summary: message,
      classification_tag: tag,
    });

    console.log("Lead saved");

    // ==========================
    // ✅ EMAIL CONTENT
    // ==========================
    const mailOptions = {
      from: `"Contact Form" <hello@realtorparth.ca>`,
      to: "hello@realtorparth.ca",
      subject: "📩 New Contact Form Submission",
      html: `
      <div style="font-family: 'Segoe UI', sans-serif; background:#f0f2f5; padding:20px;">
        <div style="max-width:600px; margin:auto; background:#ffffff; border-radius:12px; padding:30px;">

          <h2 style="color:#6b5bff; text-align:center;">📬 New Lead Received</h2>

          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone || "N/A"}</p>
          <p><strong>Subject:</strong> ${subject || "-"}</p>

          <p style="margin-top:20px;">
            <strong>Message:</strong><br/>
            ${message}
          </p>

          <hr style="margin:30px 0;" />

          <p style="text-align:center; font-size:12px; color:#888;">
            Auto-generated from website contact form
          </p>

        </div>
      </div>
      `,
    };

    // ==========================
    // ✅ SEND EMAIL
    // ==========================
    await transporter.sendMail(mailOptions);

    console.log("Email sent");

    return res.status(200).json({
      success: true,
      message: "Form submitted successfully",
    });

  } catch (error) {
    console.error("❌ Contact Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error processing request",
    });
  }
});



// =====================================================
// DASHBOARD - LEAD STATISTICS
// GET /contact/dashboard-stats
// =====================================================

router.get("/dashboard-stats", async (req, res) => {
  try {
    const [
      totalLeads,
      recentLeads,
      activityLeads,
    ] = await Promise.all([
      // Total lead count
      Lead.countDocuments(),

      // Latest 5 leads for Dashboard Recent Leads
      Lead.find()
        .sort({ createdAt: -1 })
        .select(
          "email phone classification_tag createdAt"
        )
        .limit(5)
        .lean(),

      // Latest 2 leads for Recent Activity
      Lead.find()
        .sort({ createdAt: -1 })
        .select("email createdAt")
        .limit(2)
        .lean(),
    ]);

    return res.json({
      success: true,

      totalLeads,

      recentLeads,

      activityLeads,
    });

  } catch (error) {
    console.error(
      "Dashboard Lead Stats Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch lead statistics",
    });
  }
});

// ==========================
// ✅ GET ALL LEADS
// ==========================
router.get("/", async (req, res) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 });

    return res.json({
      success: true,
      total: leads.length,
      data: leads,
    });

  } catch (error) {
    console.error("Fetch Leads Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch leads",
    });
  }
});


// UPDATE lead
router.put("/:id", async (req, res) => {
  try {
    const updated = await Lead.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ message: "Update failed" });
  }
});

// DELETE lead
router.delete("/:id", async (req, res) => {
  try {
    await Lead.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Delete failed" });
  }
});

export default router;