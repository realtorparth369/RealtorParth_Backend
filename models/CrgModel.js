import mongoose from "mongoose";

const crgSchema = new mongoose.Schema(
  {
    /* ===============================
       🔥 MAIN LINK (PER PARTY)
    =============================== */
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransactionParty",
      required: true
    },

    /* ===============================
       OPTIONAL (ADMIN USE)
    =============================== */
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true
    },

    /* ===============================
       FORM DATA
    =============================== */

    // Consumer 1
    consumerPrintName1: String,
    consumerEmail1: String,

    // Consumer 2 (Optional)
    consumerPrintName2: String,
    consumerEmail2: String,

    signedDateM: String,
    signedDateD: String,
    signedYear: String,

    /* ===============================
       SIGNING STATUS
    =============================== */

    consumer1Signed: {
      type: Boolean,
      default: false
    },

    consumer2Signed: {
      type: Boolean,
      default: false
    },

    consumer1SignedAt: Date,
    consumer2SignedAt: Date,

    /* ===============================
       DOCUSIGN
    =============================== */

    envelopeId: String,

    completedEmailSent: {
      type: Boolean,
      default: false
    },

    signers: [
      {
        recipientId: String,
        clientUserId: String,
        email: String,
        name: String,
        routingOrder: String
      }
    ]
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Crg", crgSchema);
























// import mongoose from "mongoose";

// const crgSchema = new mongoose.Schema(
//   {
//     /* ===============================
//        🔥 MAIN LINK (PER PARTY)
//     =============================== */
//     partyId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "TransactionParty",
//       required: true
//     },

//     /* ===============================
//        OPTIONAL (ADMIN USE)
//     =============================== */
//     transactionId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Transaction",
//       required: true
//     },

//     /* ===============================
//        FORM DATA
//     =============================== */

//     consumerPrintName1: String,
//     consumerPrintName2: String,

//     signedDateM: String,
//     signedDateD: String,
//     signedYear: String,

//     /* ===============================
//        DOCUSIGN
//     =============================== */

//     envelopeId: String,

//     completedEmailSent: {
//       type: Boolean,
//       default: false
//     },

//     signers: [
//       {
//         recipientId: String,
//         clientUserId: String,
//         email: String,
//         name: String,
//         routingOrder: String
//       }
//     ]
//   },
//   {
//     timestamps: true
//   }
// );

// export default mongoose.model("Crg", crgSchema);



































// import mongoose from "mongoose";

// const crgSchema = new mongoose.Schema({

//   // 🔥 NEW: link to party
//   partyId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "TransactionParty",
//     required: true
//   },

//   // ✅ keep transactionId (useful for admin side)
//   transactionId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Transaction",
//     required: true
//   },

//   consumerPrintName1: String,
//   consumerPrintName2: String,

//   signedDateM: String,
//   signedDateD: String,
//   signedYear: String

// }, { timestamps: true });

// export default mongoose.model("Crg", crgSchema);