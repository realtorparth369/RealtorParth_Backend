import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
{
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TransactionUser",
    required: true,
    index: true
  },

  name: {
    type: String,
    required: true
  },

  propertyAddress: {
    type: String,
    required: true
  },
        agreementnumber: {
            type: String,
            required: true
        },

  notes: {
    type: String,
    default: ""
  },

  status: {
    type: String,
    enum: ["In Progress", "Completed"],
    default: "In Progress"
  },
        isArchived: {
            type: Boolean,
            default: false
        }

},
{
  timestamps: true
}
);

export default mongoose.model("Transaction", transactionSchema);