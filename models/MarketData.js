import mongoose from "mongoose";

const MarketDataSchema = new mongoose.Schema(
  {
    neighborhood: { type: String, required: true },
    avgPrice: { type: String, required: true },
    priceChange: { type: String, required: true },
    daysOnMarket: { type: Number, required: true },
    salesQ4: { type: Number, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("MarketData", MarketDataSchema);