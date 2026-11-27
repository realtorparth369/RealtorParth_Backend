import express from "express";
import nodemailer from "nodemailer";
import HomeValuation from "../models/HomeValuation.js";
import multer from "multer";
import fs from "fs";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_PASSWORD,
  },
});
// POST: Submit Home Valuation
router.post("/submit", async (req, res) => {
  try {
    const {
      address,
      propertyType,
      bedrooms,
      upgrades,
      name,
      email,
      phone,
    } = req.body;

    // ✅ Basic validation
    if (!address || !name || !email || !phone) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // ✅ 1. Save to DB
    const newEntry = new HomeValuation({
      address,
      propertyType,
      bedrooms,
      upgrades,
      name,
      email,
      phone,
    });

    await newEntry.save();

    // ✅ 3. Send Email
    await transporter.sendMail({
      from: `"Parth Brahmbhatt" <hello@realtorparth.ca>`, // FIXED FORMAT
      to: email,
      subject: "Your Home Valuation Request Received",
      html: `
<div style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">

  <div style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.05);">

    <div style="background:#111827;padding:24px;text-align:center;">

      <img
        src="https://realtorparth.ca/logo_white.png"
        alt="Parth Brahmbhatt"
        style="max-width:140px;margin-bottom:12px;"
      />

      <h1 style="color:#ffffff;margin:0;font-size:20px;">Home Valuation Request</h1>
      <p style="color:#d1d5db;font-size:13px;margin-top:6px;">
        Parth Brahmbhatt Real Estate
      </p>
    </div>

    <div style="padding:28px;">

      <h2 style="margin-top:0;color:#111827;">Request Received ✅</h2>

      <p style="color:#374151;font-size:14px;">
        Hi <strong>${name}</strong>,
      </p>

      <p style="color:#374151;font-size:14px;line-height:1.6;">
        I don't rely on automated estimates for something as important as your home.
        I'm personally starting your
        <strong>Manual Risk & Value Audit</strong> right now.
      </p>

      <div style="background:#f9fafb;padding:16px;border-radius:10px;margin:20px 0;">
        <p style="margin:0;color:#374151;font-size:14px;">
          📩 You’ll receive your detailed valuation report within <strong>24 hours</strong>.
        </p>
      </div>

      <div style="margin-top:20px;">
        <h3 style="font-size:15px;color:#111827;margin-bottom:10px;">
          Your Submitted Details
        </h3>

        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:8px 0;color:#6b7280;">Address</td>
            <td style="padding:8px 0;color:#111827;"><strong>${address}</strong></td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;">Property Type</td>
            <td style="padding:8px 0;color:#111827;">${propertyType}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;">Bedrooms</td>
            <td style="padding:8px 0;color:#111827;">${bedrooms}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;">Upgrades</td>
            <td style="padding:8px 0;color:#111827;">${upgrades || "N/A"}</td>
          </tr>
        </table>
      </div>

      <div style="margin-top:30px;">
        <p style="margin:0;color:#374151;font-size:14px;">
          — <strong>Parth Brahmbhatt</strong>
        </p>
        <p style="margin:4px 0 0;color:#9ca3af;font-size:12px;">
          Real Estate Professional
        </p>
      </div>
    </div>

    <div style="background:#f9fafb;padding:16px;text-align:center;font-size:12px;color:#9ca3af;">
      This email was sent in response to your home valuation request.
    </div>

  </div>
</div>
`
    });

    // ✅ Success
    res.status(200).json({
      success: true,
      message: "Saved and email sent",
    });

  } catch (error) {
    console.error("🔥 Home Valuation Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});


// GET: All Home Valuations (Admin)
router.get("/", async (req, res) => {
  try {
    const valuations = await HomeValuation.find()
      .sort({ createdAt: -1 }); // ✅ NO limit

    res.json(valuations);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: "Failed to fetch" });
  }
});


// DELETE valuation
router.delete("/:id", async (req, res) => {
  try {
    await HomeValuation.findByIdAndDelete(req.params.id);

    res.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete" });
  }
});


// 📩 SEND EMAIL
// 📩 SEND EMAIL
router.post(
  "/send-mail",
  upload.array("files"),
  async (req, res) => {

    try {

      const {
        to,
        subject,
        message
      } = req.body;

      const attachments =
        req.files?.map(file => ({
          filename:
            file.originalname,

          path:
            file.path
        })) || [];

      const mailOptions = {

        from:
          `"Parth Brahmbhatt" <hello@realtorparth.ca>`,

        to,
        subject,

        // Plain text fallback
        text: message,

        html: `
<div style="margin:0;padding:40px 20px;background:#F5F5F3;font-family:'Segoe UI',Arial,sans-serif;">

    <div style="
        max-width:680px;
        margin:0 auto;
        background:#ffffff;
        border:1px solid #E8E2D6;
        border-radius:18px;
        overflow:hidden;
        box-shadow:0 20px 50px rgba(0,0,0,.08);
    ">

        <!-- Header -->

        <div style="
            background:#1F2937;
            text-align:center;
            padding:40px 30px;
        ">

            <img
                src="https://realtorparth.ca/logo_white.png"
                alt="Parth Brahmbhatt"
                style="width:170px;max-width:100%;display:block;margin:0 auto 18px;"
            />

            <div style="
                width:60px;
                height:3px;
                background:#B8860B;
                margin:0 auto;
                border-radius:999px;
            "></div>

        </div>

        <!-- Body -->

        <div style="padding:40px;">

            <div style="
                color:#374151;
                font-size:15px;
                line-height:1.9;
            ">
                ${message.replace(/\n/g, "<br/>")}
            </div>

            <div style="
                margin-top:40px;
                padding-top:28px;
                border-top:1px solid #ECE8DF;
            ">

                <div style="
                    font-size:20px;
                    font-weight:700;
                    color:#1F2937;
                ">
                    Parth Brahmbhatt
                </div>

                <div style="
                    margin-top:4px;
                    color:#B8860B;
                    font-size:14px;
                    font-weight:600;
                ">
                    REALTOR®
                </div>

                <div style="
                    margin-top:18px;
                    color:#6B7280;
                    font-size:14px;
                    line-height:1.8;
                ">
                    📧 info@realtorparth.ca<br>
                    🌐 www.realtorparth.ca
                </div>

            </div>

        </div>

        <!-- Footer -->

        <div style="
            background:#FAFAF8;
            border-top:1px solid #E8E2D6;
            padding:24px;
            text-align:center;
        ">

            <div style="
                color:#1F2937;
                font-size:14px;
                font-weight:600;
            ">
                Helping You Make Smarter Real Estate Decisions
            </div>

            <div style="
                margin-top:8px;
                color:#9CA3AF;
                font-size:12px;
                line-height:1.7;
            ">
                RealtorParth.ca<br>
                Professional Real Estate Services
            </div>

        </div>

    </div>

</div>
`,

        attachments
      };

      await transporter.sendMail(
        mailOptions
      );

      // ==========================
      // DELETE TEMP FILES
      // ==========================

      if (
        req.files &&
        req.files.length
      ) {

        for (
          const file of req.files
        ) {

          try {

            fs.unlinkSync(
              file.path
            );

          } catch (err) {

            console.error(
              "File cleanup error:",
              err.message
            );
          }
        }
      }

      res.json({
        success: true
      });

    } catch (err) {

      console.error(
        "Mail error:",
        err
      );

      res.status(500).json({
        error:
          "Failed to send email"
      });
    }
  }
);

// router.post("/send-mail", upload.single("file"), async (req, res) => {
//   try {
//     const { to, subject, message } = req.body;

//     const mailOptions = {
//       from: `"Parth Brahmbhatt" <hello@realtorparth.ca>`,
//       to,
//       subject,

//       // ✅ Fallback text (important for Gmail/Outlook)
//       text: message,

//       // ✅ FULL HTML TEMPLATE WRAPPER
//       html: `
//   <div style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">

//     <div style="max-width:600px;margin:30px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.05);">

//       <!-- HEADER -->
//       <div style="background:#111827;padding:20px;text-align:center;">
//         <img
//           src="https://realtorparth.ca/logo_white.png"
//           alt="Parth Brahmbhatt"
//           style="max-width:130px;margin-bottom:10px;"
//         />
//       </div>

//       <!-- BODY -->
//       <div style="padding:24px;">

//         <div style="font-size:14px;color:#374151;line-height:1.6;">
//           ${message.replace(/\n/g, "<br/>")}
//         </div>

//         <!-- SIGNATURE -->
//         <div style="margin-top:30px;">
//           <p style="margin:0;color:#111827;font-weight:600;">
//             Parth Brahmbhatt
//           </p>
//           <p style="margin:4px 0 0;color:#9ca3af;font-size:12px;">
//             Real Estate Professional
//           </p>
//         </div>
//       </div>

//       <!-- FOOTER -->
//       <div style="background:#f9fafb;padding:14px;text-align:center;font-size:12px;color:#9ca3af;">
//         RealtorParth.ca • Helping you make smarter property decisions
//       </div>

//     </div>
//   </div>
//   `,

//       // ✅ ATTACHMENT SUPPORT
//       attachments: req.file
//         ? [
//           {
//             filename: req.file.originalname,
//             path: req.file.path,
//           },
//         ]
//         : [],
//     };

//     await transporter.sendMail(mailOptions);

//     res.json({ success: true });
//   } catch (err) {
//     console.error("Mail error:", err);
//     res.status(500).json({ error: "Failed to send email" });
//   }
// });


export default router;