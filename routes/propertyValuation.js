import express from "express";
import nodemailer from "nodemailer";

const router = express.Router();

// POST /api/propertyValue/mail
router.post("/mail", async (req, res) => {
  console.log("📩 Incoming Property Value Request:", req.body);

  try {
    const {
      name,
      email,
      phone,
      address,
      propertyType,
      timeline,
      goals
    } = req.body;

    // --- VALIDATION ---
    if (!name || !email || !phone || !address || !propertyType || !timeline) {
      return res.status(400).json({
        success: false,
        message: "Please fill all required fields before submitting.",
      });
    }

    // --- EMAIL TRANSPORTER ---
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "realtorparth1212@gmail.com",
        pass: "gsllvbfjtzkdmhtk", // your Gmail app password
        // user: "sonidhruvit7000@gmail.com",
        // pass: "obrlpucoewkhomec", // your Gmail app password
      },
    });

    //     const transporter = nodemailer.createTransport({
    //   host: "smtp.zoho.com",        // Zoho SMTP host
    //   port: 465,                     // SSL port (465) or 587 for TLS
    //   secure: true,                  // true for 465, false for 587
    //   auth: {
    //     // user: "dhruvit.soni@paramsolutions.ca", // Your Zoho email
    //     // pass: "4NU4mujjG0Rm" // Your Zoho app password
    //     user: "submission@realtorparth.ca", // Your Zoho email
    //     pass: "YA64HeWPSXFL" // Your Zoho app password
    //   },
    // });

    // --- EMAIL CONTENT ---
    const mailOptions = {
      from: `"Home Valuation Form" <submission@realtorparth.ca>`,
      to: "realtorparth1212@gmail.com",
      subject: "🏡 New Home Valuation Request",
      html: `
      <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f3f4f6;padding:20px;">
        <div style="max-width:600px;margin:auto;background:linear-gradient(135deg,#3b82f6,#f97316);border-radius:15px;overflow:hidden;box-shadow:0 8px 25px rgba(0,0,0,0.1);">
          <div style="background-color:#fff;padding:30px;">
            <h2 style="color:#3b82f6;margin-bottom:20px;text-align:center;">🏠 New Home Valuation Request</h2>
            
            <div style="margin-bottom:15px;"><strong>Name:</strong> ${name}</div>
            <div style="margin-bottom:15px;"><strong>Email:</strong> ${email}</div>
            <div style="margin-bottom:15px;"><strong>Phone:</strong> ${phone}</div>
            <div style="margin-bottom:15px;"><strong>Address:</strong> ${address}</div>
            <div style="margin-bottom:15px;"><strong>Property Type:</strong> ${propertyType}</div>
            <div style="margin-bottom:15px;"><strong>Timeline:</strong> ${timeline}</div>
            <div style="margin-bottom:20px; line-height:1.6;">
              <strong>Goals / Notes:</strong><br>${goals || "N/A"}
            </div>

            <div style="text-align:center;margin-top:30px;padding:15px;background:#3b82f6;color:#fff;border-radius:10px;">
              <p style="margin:0;font-weight:bold;">This lead came from the Property Value Modal on your website.</p>
            </div>
          </div>
        </div>
      </div>
      `,
    };

    // --- SEND EMAIL ---
    await transporter.sendMail(mailOptions);
    console.log("✅ Property valuation email sent successfully!");

    // --- SUCCESS RESPONSE ---
    res.status(200).json({ success: true, message: "Email sent successfully!" });

  } catch (error) {
    console.error("❌ Error sending property value email:", error);
    res.status(500).json({
      success: false,
      message: "Error sending email. Please try again later.",
    });
  }
});

export default router;
