import express from "express";
import Subscriber from "../models/Subscriber.js";
import nodemailer from "nodemailer";
import multer from "multer";

const router = express.Router();

// ✅ Create transporter ONCE (better performance)
const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.BREVO_USER,
        pass: process.env.BREVO_PASSWORD,
    },
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB per file
        files: 20,                  // max 20 files
    },
});




// =====================================================
// DASHBOARD - SUBSCRIBER STATISTICS
// GET /subscribe/dashboard-stats
// =====================================================

router.get("/dashboard-stats", async (req, res) => {
  try {
    const [
      totalSubscribers,
      activeSubscribers,
      unsubscribedSubscribers,
    ] = await Promise.all([
      // Total subscribers
      Subscriber.countDocuments(),

      // Active subscribers
      Subscriber.countDocuments({
        status: {
          $ne: "Unsubscribed",
        },
      }),

      // Unsubscribed
      Subscriber.countDocuments({
        status: "Unsubscribed",
      }),
    ]);

    return res.json({
      success: true,

      totalSubscribers,
      activeSubscribers,
      unsubscribedSubscribers,
    });

  } catch (error) {
    console.error(
      "Dashboard Subscriber Stats Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch subscriber statistics",
    });
  }
});

// ==========================
// ✅ SUBSCRIBE
// ==========================
router.post("/", async (req, res) => {
    try {
        let { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        email = email.toLowerCase().trim();

        let existing = await Subscriber.findOne({ email });

        // 🔁 RESUBSCRIBE
        if (existing) {
            if (existing.status === "Unsubscribed") {
                existing.status = "Active";
                existing.unsubscribedAt = null;
                await existing.save();

                return res.json({ message: "Resubscribed successfully" });
            }

            return res.json({ message: "Already subscribed" });
        }

        // 🆕 NEW SUBSCRIBER
        const newSubscriber = await Subscriber.create({
            email,
            status: "Active",
        });

        // 📧 Welcome Email
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>

<body style="margin:0; padding:0; background:#f5f5f5; font-family:Arial, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px 0;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="100%" style="max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.05);">

          <!-- Header -->
          <tr>
            <td style="background:#1f2937; padding:30px; text-align:center;">
              <h1 style="color:#ffffff; margin:0; font-size:24px;">
                Realtor Parth
              </h1>
              <p style="color:#d1d5db; margin-top:8px; font-size:14px;">
                Real Estate Insights & Opportunities
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:30px;">

              <h2 style="margin-top:0; color:#111827;">
                🎉 Welcome aboard!
              </h2>

              <p style="color:#4b5563; font-size:15px; line-height:1.6;">
                Thanks for subscribing — you're now part of our exclusive real estate community.
              </p>

              <p style="color:#4b5563; font-size:15px;">
                Here’s what you’ll receive:
              </p>

              <ul style="padding-left:20px; color:#4b5563; font-size:15px; line-height:1.8;">
                <li>🔥 Latest property listings before they hit the market</li>
                <li>📊 Real-time market insights & trends</li>
                <li>💡 Expert tips for buyers & sellers</li>
              </ul>

              <!-- CTA -->
              <div style="text-align:center; margin:30px 0;">
                <a href="https://realtorparth.ca"
                   style="background:#c19a6b; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:30px; font-weight:bold;">
                   Explore Listings
                </a>
              </div>

              <p style="color:#6b7280; font-size:14px;">
                Stay tuned — exciting opportunities are coming your way!
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb; padding:20px; text-align:center;">

              <p style="font-size:12px; color:#9ca3af; margin:0;">
                © ${new Date().getFullYear()} Realtor Parth. All rights reserved.
              </p>

              <p style="margin-top:10px; font-size:12px; color:#9ca3af;">
                Don’t want these emails?
                <br/>
                <a href="https://realtorparth.ca/unsubscribe?email=${encodeURIComponent(email)}" style="color:#c19a6b;">
                  Unsubscribe
                </a>
              </p>

            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
`;

        await transporter.sendMail({
            from: `"Realtor Parth" <hello@realtorparth.ca>`,
            to: email,
            subject: "🎉 Welcome to Realtor Parth!",
            html,
        });

        return res.json({
            success: true,
            message: "Subscribed successfully",
        });

    } catch (error) {
        console.error("Subscribe Error:", error);
        return res.status(500).json({ message: "Server error" });
    }
});


// ==========================
// ✅ UNSUBSCRIBE
// ==========================
router.get("/unsubscribe", async (req, res) => {
    try {
        const { email } = req.query;

        if (!email) {
            return res.status(400).send("Invalid unsubscribe request");
        }

        const user = await Subscriber.findOne({ email });

        if (!user) {
            return res.send("Email not found.");
        }

        user.status = "Unsubscribed";
        user.unsubscribedAt = new Date();

        await user.save();

        return res.send(`
            <div style="font-family:Arial; text-align:center; padding:40px;">
                <h2>You've been unsubscribed</h2>
                <p>You will no longer receive emails from us.</p>
            </div>
        `);

    } catch (error) {
        console.error("Unsubscribe Error:", error);
        res.status(500).send("Something went wrong");
    }
});


// ==========================
// ✅ GET SUBSCRIBERS
// ==========================
router.get("/", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        const skip = (page - 1) * limit;

        const subscribers = await Subscriber.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Subscriber.countDocuments();

        return res.json({
            success: true,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            data: subscribers,
        });

    } catch (error) {
        console.error("Fetch Subscribers Error:", error);
        return res.status(500).json({ message: "Server error" });
    }
});


// ==========================
// ✅ SEND NEWSLETTER
// ==========================
// router.post("/send-newsletter", async (req, res) => {
//     try {
//         const { subject, content } = req.body;

//         if (!subject || !content) {
//             return res.status(400).json({ message: "Missing subject or content" });
//         }

//         // const subscribers = await Subscriber.find({ status: "Active" }).select("email");
//         const subscribers = await Subscriber.find({
//             $or: [
//                 { status: "Active" },
//                 { status: { $exists: false } }
//             ]
//         }).select("email");

//         if (!subscribers.length) {
//             return res.status(400).json({ message: "No active subscribers" });
//         }

//         const BATCH_SIZE = 20;
//         const DELAY_MS = 1000;

//         let successCount = 0;
//         let failCount = 0;

//         const delay = (ms) => new Promise((res) => setTimeout(res, ms));

//         for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
//             const batch = subscribers.slice(i, i + BATCH_SIZE);

//             const results = await Promise.allSettled(
//                 batch.map((sub) => {
//                     const finalHtml = `
//                         ${content}

//                         <hr style="margin-top:30px;" />

//                         <p style="font-size:12px; text-align:center;">
//                             <a href="https://realtorparth.ca/unsubscribe?email=${encodeURIComponent(sub.email)}">
//                                 Unsubscribe
//                             </a>
//                         </p>
//                     `;
//                     // const finalHtml = `
//                     //     ${content}

//                     //     <hr style="margin-top:30px;" />

//                     //     <p style="font-size:12px; text-align:center;">
//                     //         <a href="http://localhost:5173/unsubscribe?email=${encodeURIComponent(sub.email)}">
//                     //             Unsubscribe
//                     //         </a>
//                     //     </p>
//                     // `;

//                     return transporter.sendMail({
//                         from: `"Realtor Parth" <hello@realtorparth.ca>`,
//                         to: sub.email,
//                         subject,
//                         html: finalHtml,
//                     });
//                 })
//             );

//             results.forEach((r) => {
//                 if (r.status === "fulfilled") successCount++;
//                 else failCount++;
//             });

//             await delay(DELAY_MS);
//         }

//         return res.json({
//             success: true,
//             total: subscribers.length,
//             sent: successCount,
//             failed: failCount,
//         });

//     } catch (error) {
//         console.error("Newsletter Error:", error);
//         return res.status(500).json({ message: "Failed to send newsletter" });
//     }
// });


// ==========================
// ✅ SEND NEWSLETTER
// ==========================
router.post(
    "/send-newsletter",
    upload.array("attachments", 20),
    async (req, res) => {
        try {
            const { subject, content } = req.body;

            if (!subject || !content) {
                return res
                    .status(400)
                    .json({ message: "Missing subject or content" });
            }

            const subscribers = await Subscriber.find({
                $or: [
                    { status: "Active" },
                    { status: { $exists: false } },
                ],
            }).select("email");

            if (!subscribers.length) {
                return res
                    .status(400)
                    .json({ message: "No active subscribers" });
            }

            // Build attachment array once
            const mailAttachments = (req.files || []).map((file) => ({
                filename: file.originalname,
                content: file.buffer,
                contentType: file.mimetype,
            }));

            const BATCH_SIZE = 20;
            const DELAY_MS = 1000;

            let successCount = 0;
            let failCount = 0;

            const delay = (ms) =>
                new Promise((resolve) => setTimeout(resolve, ms));

            for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
                const batch = subscribers.slice(i, i + BATCH_SIZE);

                const results = await Promise.allSettled(
                    batch.map(async (sub) => {
                        // const finalHtml = `
                        //     ${content}

                        //     <hr style="margin-top:30px;" />

                        //     <p style="font-size:12px; text-align:center;">
                        //         <a href="https://realtorparth.ca/unsubscribe?email=${encodeURIComponent(
                        //             sub.email
                        //         )}">
                        //             Unsubscribe
                        //         </a>
                        //     </p>
                        // `;

                        const finalHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
</head>

<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.08);">

<!-- Header -->
<tr>
<td style="background:#0f4c81;padding:28px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;">
RealtorParth
</h1>
</td>
</tr>

<!-- Newsletter Content -->
<tr>
<td style="padding:40px;">

${content}

</td>
</tr>

<!-- Footer -->
<tr>
<td style="background:#f7f7f7;padding:25px;text-align:center;">

<p style="margin:0;color:#222;font-size:15px;font-weight:600;">
RealtorParth
</p>

<p style="margin:10px 0 0;color:#777;font-size:13px;line-height:22px;">
Helping you make smarter real estate decisions.
</p>

<div style="margin:22px 0;border-top:1px solid #dddddd;"></div>

<p style="margin:0;font-size:12px;color:#888;line-height:22px;">
You're receiving this email because you subscribed to RealtorParth updates.
</p>

<p style="margin:12px 0 0;">
<a
href="https://realtorparth.ca/unsubscribe?email=${encodeURIComponent(sub.email)}"
style="
display:inline-block;
padding:10px 22px;
background:#ffffff;
border:1px solid #d1d5db;
border-radius:6px;
color:#555;
font-size:13px;
text-decoration:none;
"
>
Unsubscribe
</a>
</p>

<p style="margin-top:20px;font-size:11px;color:#999;">
© ${new Date().getFullYear()} RealtorParth. All rights reserved.
</p>

</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`;

                        return transporter.sendMail({
                            from: `"Realtor Parth" <hello@realtorparth.ca>`,
                            to: sub.email,
                            subject,
                            html: finalHtml,

                            // ✅ Multiple attachments
                            attachments: mailAttachments,
                        });
                    })
                );

                results.forEach((result) => {
                    if (result.status === "fulfilled") {
                        successCount++;
                    } else {
                        failCount++;
                        console.error(result.reason);
                    }
                });

                if (i + BATCH_SIZE < subscribers.length) {
                    await delay(DELAY_MS);
                }
            }

            return res.json({
                success: true,
                total: subscribers.length,
                sent: successCount,
                failed: failCount,
                attachments: mailAttachments.length,
            });
        } catch (error) {
            console.error("Newsletter Error:", error);

            return res.status(500).json({
                success: false,
                message: "Failed to send newsletter",
                error: error.message,
            });
        }
    }
);

export default router;