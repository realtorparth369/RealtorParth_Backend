import mongoose from "mongoose";

const WishlistSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  savedProperties: [
    {
      listingId: { type: String, required: true },
      listOfficeKey: { type: String, required: true },
      savedAt: { type: Date, default: Date.now },
    },
  ],
}, { timestamps: true });

export default mongoose.model("Wishlist", WishlistSchema);
