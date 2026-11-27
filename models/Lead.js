import mongoose from "mongoose";

const leadSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    phone: String,
    chat_summary: String,
    classification_tag: {
      type: String,
      default: "buyer",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Lead", leadSchema);