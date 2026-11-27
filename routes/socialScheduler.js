import cron from "node-cron";
import axios from "axios";
import ScheduledSocialPost from "../models/ScheduledSocialPost.js";

const MAKE_WEBHOOK_URL =
    process.env.MAKE_WEBHOOK_URL;

cron.schedule("* * * * *", async () => {

    console.log("⏰ Checking scheduled posts...");

    try {

        const now = new Date();

        const posts =
            await ScheduledSocialPost.find({

                status: "scheduled",

                publishDate: {
                    $lte: now
                }
            });

        for (const post of posts) {

            try {

                console.log(
                    "🚀 Posting:",
                    post.topic
                );

                await axios.post(
                    MAKE_WEBHOOK_URL,
                    {
                        action: "create",

                        postId: post._id,

                        topic: post.topic,

                        caption: post.caption,

                        // MULTIPLE IMAGES
                        // images: post.images,
                        photos:
                            post.images.map(
                                (img) => ({
                                    url: img,
                                    type: "url"
                                })
                            ),

                        platforms: post.platforms,
                    }
                );

                post.status = "posted";

                post.postedAt = new Date();

                await post.save();

                console.log(
                    "✅ Posted successfully"
                );

            } catch (err) {

                console.error(
                    "❌ Failed posting:",
                    err.response?.data || err.message
                    // err.message
                );

                // OPTIONAL
                post.status = "failed";

                await post.save();
            }
        }

    } catch (err) {

        console.error(
            "❌ Scheduler error:",
            err.message
        );
    }
});




// ===============================
// SOCIAL STATUS SYNC
// EVERY 1 HOUR
// ===============================


cron.schedule(
  "0 * * * *",
  async () => {

    console.log(
      "🔄 Syncing social posts..."
    );

    // ===============================
    // FACEBOOK
    // ===============================

    try {

      await axios.post(
        "https://realtorparth.ca/api/socialpost/get-facebook-posts"
      );

      console.log(
        "✅ Facebook sync triggered"
      );

    } catch (err) {

      console.error(
        "❌ Facebook sync failed:",
        err.message
      );
    }

    // ===============================
    // WAIT 10 SECONDS
    // ===============================

    await new Promise(
      (resolve) =>
        setTimeout(resolve, 10000)
    );

    // ===============================
    // INSTAGRAM
    // ===============================

    try {

      await axios.post(
        "https://realtorparth.ca/api/socialpost/get-instagram-posts"
      );

      console.log(
        "✅ Instagram sync triggered"
      );

    } catch (err) {

      console.error(
        "❌ Instagram sync failed:",
        err.message
      );
    }
  }
);