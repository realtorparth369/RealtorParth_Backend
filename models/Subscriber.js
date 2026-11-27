import mongoose from "mongoose";

const subscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,   // auto normalize
      trim: true,
    },

    status: {
      type: String,
      enum: ["Active", "Unsubscribed"],
      default: "Active",
    },

    subscribedAt: {
      type: Date,
      default: Date.now,
    },

    unsubscribedAt: {
      type: Date,
      default: null,
    },

    // 🔐 (optional but future-proof)
    unsubscribeToken: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true, // adds createdAt + updatedAt automatically
  }
);

// Index for faster lookup
subscriberSchema.index({ email: 1 });

export default mongoose.model("Subscriber", subscriberSchema);