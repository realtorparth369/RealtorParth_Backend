import mongoose from "mongoose";

const ScheduledSocialPostSchema =
    new mongoose.Schema({

        socialPostIds: {
            type: Object,
            default: {}
        },

        // ===============================
        // PLATFORM STATUSES
        // ===============================

        platformStatuses: {
            type: Object,
            default: {}
        },

        topic: {
            type: String,
            required: true,
        },

        caption: {
            type: String,
            required: true,
        },

        images: [
            {
                type: String
            }
        ],

        platforms: [
            {
                type: String,
            }
        ],

        publishDate: {
            type: Date,
            required: true,
        },

        // ===============================
        // GLOBAL STATUS
        // ===============================

        status: {
            type: String,
            default: "scheduled",
        },

        repliedComments: {
            type: [{
                commentId: String,
                platform: String,
                repliedAt: Date
            }],
            default: []
        },

        createdAt: {
            type: Date,
            default: Date.now,
        },

    });

export default mongoose.model(
    "ScheduledSocialPost",
    ScheduledSocialPostSchema
);