import mongoose from "mongoose";

const homeValuationSchema = new mongoose.Schema({
  address: String,
  propertyType: String,
  bedrooms: String,
  upgrades: String,
  name: String,
  email: String,
  phone: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("HomeValuation", homeValuationSchema);