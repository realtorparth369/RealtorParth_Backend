import mongoose from "mongoose";

const pepSchema = new mongoose.Schema({

  // 🔥 NEW: link to party
  partyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TransactionParty",
    required: true
  },

  // ✅ keep transactionId (useful for admin queries)
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Transaction",
    required: true
  },

  txtIndividual: String,

  chkOpt_Determine1: Boolean,
  chkOpt_Determine2: Boolean,
  chkOpt_Determine3: Boolean,
  chkOpt_Determine4: Boolean,

  chkOpt_Determination1: Boolean,
  chkOpt_Determination2: Boolean,
  chkOpt_Determination3: Boolean,
  chkOpt_Determination4: Boolean,

  txtDeterminationOther: String,
  txtDetermineDate: String,

  txtPEP: String,
  txtOrganization: String,

  chkOpt_Risk: String,
  txtSource: String,
  chkOpt_Completed: Boolean,

  radio_group_27zujm: String,

  txtCashSource: String,
  txtWealthSource: String,
  txtManagement: String,
  txtManagementDate: String

}, { timestamps: true });

export default mongoose.model("Pep", pepSchema);