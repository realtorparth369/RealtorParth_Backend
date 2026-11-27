import mongoose from "mongoose";

const transactionUserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },

  password: {
    type: String,
    required: true,
  },

  // ✅ Role Access
  isSuperAdmin: {
    type: Boolean,
    default: false,
  },

  // ✅ Optional Future Roles
  role: {
    type: String,
    enum: ["user", "admin", "superadmin"],
    default: "user",
  },

  // ✅ Account Status
  isActive: {
    type: Boolean,
    default: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model(
  "TransactionUser",
  transactionUserSchema
);