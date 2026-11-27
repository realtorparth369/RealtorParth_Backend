import { getDocumentLink } from "./docLinks.js";
import nodemailer from "nodemailer";

// 🔥 CREATE TRANSPORTER ONCE (BEST PRACTICE)
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_PASSWORD,
  },
});

// 🔥 FORMAT DOCUMENT NAME (CUSTOM LOGIC)
const formatDocName = (docKey, docName) => {
  // ✅ SPECIAL CASE (YOUR REQUIREMENT)
  if (docKey === "IDMMGOL") {
    return "CREB - IDMMGOL";
  }

  // ✅ DEFAULT CLEAN
  return docName.replace(/[^\x00-\x7F]/g, "").trim();
};

export const sendReminderEmail = async (party, docKey, docName) => {
  try {
    console.log("📩 Preparing email...");
    console.log("Party:", party.email);
    console.log("DocKey:", docKey);

    // ✅ GENERATE LINK
    const link = getDocumentLink(docKey, party._id);
    console.log("🔗 Generated link:", link);

    if (!link) {
      throw new Error("Invalid document link");
    }

    // ✅ USE FORMATTED NAME
    const cleanDocName = formatDocName(docKey, docName);

    // ✅ SEND EMAIL
    const info = await transporter.sendMail({
      from: `"Realtor Parth" <hello@realtorparth.ca>`,
      to: party.email,

      subject: `Reminder: Complete ${cleanDocName}`,

      html: `
        <div style="font-family: Arial; line-height: 1.6; padding:20px;">

          <h2>Hello ${party.name},</h2>

          <p>You have a pending document to complete:</p>

          <h3 style="color:#B8860B;">${cleanDocName}</h3>

          <p>Please click below to complete it:</p>

          <a href="${link}"
             style="
               display:inline-block;
               padding:12px 20px;
               background:#B8860B;
               color:#fff;
               text-decoration:none;
               border-radius:6px;
               font-weight:bold;
             ">
            Complete Document
          </a>

          <br/><br/>

          <p>If the button doesn't work, use this link:</p>
          <p>${link}</p>

          <br/>

          <p>Thank you,<br/>Realtor Parth Team</p>

        </div>
      `,
    });

    console.log("✅ EMAIL SENT:", info.response);

    return true;

  } catch (error) {
    console.error("❌ EMAIL FAILED:", error);
    throw error;
  }
};