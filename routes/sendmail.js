import express from "express";
import nodemailer from "nodemailer";

const router = express.Router();

router.post("/send-market-email", async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "sonidhruvit7000@gmail.com", // ⚠️ Replace
        pass: "obrlpucoewkhomec",  // ⚠️ Use App Password (not real Gmail password)
      },
    });

    const mailOptions = {
      from: email,
      to: "sonidhruvit7000@gmail.com", // ⚠️ Your email to receive data
      subject: "📊 New Market Report Request",
      html: `
        <h2>New Market Report Request</h2>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Phone:</b> ${phone}</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: "Email sent successfully!" });
  } catch (error) {
    console.error("❌ Error sending email:", error);
    res.status(500).json({ success: false, message: "Error sending email." });
  }
});

router.post("/send-download-email", async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "sonidhruvit7000@gmail.com", // ⚠️ Replace
        pass: "obrlpucoewkhomec",  // ⚠️ Use App Password (not real Gmail password)
      },
    });

    const mailOptions = {
      from: email,
      to: "sonidhruvit7000@gmail.com", // ⚠️ Your email to receive data
      subject: "📊 New Download Request",
      html: `
        <h2>New Download Request</h2>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Phone:</b> ${phone}</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: "Email sent successfully!" });
  } catch (error) {
    console.error("❌ Error sending email:", error);
    res.status(500).json({ success: false, message: "Error sending email." });
  }
});

export default router;