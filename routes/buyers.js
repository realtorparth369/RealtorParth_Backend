import express from "express";
import nodemailer from "nodemailer";

const router = express.Router();

router.post("/mail", async (req, res) => {
  try {
    const { name, email, phone, budget, timeline, preApproved, neighborhoods, homeType, goals } = req.body;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        // user: "sonidhruvit7000@gmail.com", // ⚠️ Replace with your Gmail
        // pass: "obrlpucoewkhomec", // ⚠️ Use App Password
                user: "realtorparth1212@gmail.com",
        pass: "gsllvbfjtzkdmhtk", // your Gmail app password
      },
    });

//     const transporter = nodemailer.createTransport({
//   host: "smtp.zoho.com",        // Zoho SMTP host
//   port: 465,                     // SSL port (465) or 587 for TLS
//   secure: true,                  // true for 465, false for 587
//   auth: {
//     user: "submission@realtorparth.ca", // Your Zoho email
//     pass: "YA64HeWPSXFL" // Your Zoho app password
//   },
// });


    const mailOptions = {
      from: `"Buyer Leads" <submission@realtorparth.ca>`,
      to: "realtorparth1212@gmail.com", // Your receiving email
      subject: "📊 New Buyer Lead Submission",
      html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; background-color: #f8f9fa; padding: 20px;">
        <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
          
          <div style="background: linear-gradient(90deg, #4A00E0, #8E2DE2); padding: 20px; color: white; text-align: center;">
            <h2 style="margin: 0; font-size: 24px;">New Buyer Lead</h2>
            <p style="margin: 5px 0 0;">A new buyer has submitted their information</p>
          </div>
          
          <div style="padding: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              ${[
                { label: 'Name', value: name },
                { label: 'Email', value: email },
                { label: 'Phone', value: phone },
                { label: 'Budget', value: budget },
                { label: 'Timeline', value: timeline },
                { label: 'Pre Approved', value: preApproved },
                { label: 'Neighborhoods', value: neighborhoods },
                { label: 'Home Type', value: homeType },
                { label: 'Goals', value: goals },
              ].map((item, index) => `
                <tr style="background-color: ${index % 2 === 0 ? '#f1f1f1' : '#ffffff'};">
                  <td style="padding: 12px; font-weight: bold; width: 180px;">${item.label}:</td>
                  <td style="padding: 12px;">${item.value || '-'}</td>
                </tr>
              `).join('')}
            </table>

            <p style="margin-top: 20px; font-size: 0.9rem; color: #555;">
              This email was generated automatically from the Buyer Lead form.
            </p>
          </div>

          <div style="background-color: #f1f1f1; padding: 15px; text-align: center; font-size: 0.85rem; color: #777;">
            © ${new Date().getFullYear()} Buyer Leads Network. All rights reserved.
          </div>

        </div>
      </div>
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

















// import express from "express";
// import nodemailer from "nodemailer";

// const router = express.Router();

// router.post("/mail", async (req, res) => {
//     try {
//         const { name, email, phone, budget, timeline, preApproved, neighborhoods, homeType, goals } = req.body;
//         console.log(req.body)
//         const transporter = nodemailer.createTransport({
//             service: "gmail",
//             auth: {
//                 user: "sonidhruvit7000@gmail.com", // ⚠️ Replace
//                 pass: "obrlpucoewkhomec",  // ⚠️ Use App Password (not real Gmail password)
//             },
//         });

//         const mailOptions = {
//             from: email,
//             to: "sonidhruvit7000@gmail.com", // ⚠️ Your email to receive data
//             subject: "📊 New Buyers Data",
//             html: `
//         <h2>Buyers Data</h2>
//         <p><b>Name: </b> ${name}</p>
//         <p><b>Email: </b> ${email}</p>
//         <p><b>Phone: </b> ${phone}</p>
//         <p><b>Budget: </b> ${budget}</p>
//         <p><b>Timeline: </b> ${timeline}</p>
//         <p><b>Pre Approved: </b> ${preApproved}</p>
//         <p><b>Neighborhoods: </b> ${neighborhoods}</p>
//         <p><b>Home Type: </b> ${homeType}</p>
//         <p><b>Goals: </b> ${goals}</p>
//       `,
//         };

//         await transporter.sendMail(mailOptions);
//         res.status(200).json({ success: true, message: "Email sent successfully!" });
//     } catch (error) {
//         console.error("❌ Error sending email:", error);
//         res.status(500).json({ success: false, message: "Error sending email." });
//     }
// });

// export default router;
