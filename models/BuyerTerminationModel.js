import mongoose from "mongoose";

const buyerTerminationSchema = new mongoose.Schema(
  {
    /* ===============================
       🔥 MAIN LINK
    =============================== */

    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransactionParty",
      required: true
    },

    /* ===============================
       OPTIONAL
    =============================== */

    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction"
    },

    /* ===============================
       BROKERAGE
    =============================== */

    brokerageName1: String,
    brokerageName2: String,

    /* ===============================
       BUYERS
    =============================== */

    buyerName1: String,
    buyerEmail1: String,

    buyerName2: String,
    buyerEmail2: String,

    /* ===============================
       TERMINATION
    =============================== */

    terminateAgreement: String,

    terminationTime: String,
    terminationDate: String,

    terminationType: String,

    additionalTerms: String,

    signedDate: String,

    /* ===============================
       SIGNATURE PRINT NAMES
    =============================== */

    buyerPrint1: String,
    buyerPrint2: String,

    witnessPrint1: String,
    witnessPrint2: String,

    brokerPrint: String,

    /* ===============================
       EMAILS
    =============================== */

    witnessEmail1: String,
    witnessEmail2: String,

    brokerEmail: String,

    /* ===============================
       SIGNING STATUS
    =============================== */

    buyer1Signed: {
      type: Boolean,
      default: false
    },

    buyer2Signed: {
      type: Boolean,
      default: false
    },

    witness1Signed: {
      type: Boolean,
      default: false
    },

    witness2Signed: {
      type: Boolean,
      default: false
    },

    brokerSigned: {
      type: Boolean,
      default: false
    },

    buyer1SignedAt: Date,
    buyer2SignedAt: Date,

    witness1SignedAt: Date,
    witness2SignedAt: Date,

    brokerSignedAt: Date,

    /* ===============================
       DOCUSIGN
    =============================== */

    envelopeId: {
      type: String,
      default: null
    },

    signers: [
      {
        recipientId: String,
        clientUserId: String,
        email: String,
        name: String,
        routingOrder: String
      }
    ],

    completedEmailSent: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model(
  "BuyerTermination",
  buyerTerminationSchema
);


























// import mongoose from "mongoose";

// const buyerTerminationSchema = new mongoose.Schema(
//   {
//     // 🔥 MAIN LINK
//     partyId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "TransactionParty",
//       required: true
//     },

//     // 🔥 Optional
//     transactionId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Transaction"
//     },

//     brokerageName1: String,
//     brokerageName2: String,

//     buyerName1: String,
//     buyerName2: String,

//     terminateAgreement: String,

//     terminationTime: String,
//     terminationDate: String,

//     terminationType: String,

//     additionalTerms: String,

//     signedDate: String,

//     buyerPrint1: String,
//     buyerPrint2: String,

//     witnessPrint1: String,
//     witnessPrint2: String,

//     brokerPrint: String,

//     // ===============================
//     // DOCUSIGN
//     // ===============================

//     envelopeId: {
//       type: String,
//       default: null
//     },

//     signers: [
//       {
//         recipientId: String,
//         clientUserId: String,
//         email: String,
//         name: String,
//         routingOrder: String
//       }
//     ],

//     completedEmailSent: {
//       type: Boolean,
//       default: false
//     }
//   },
//   {
//     timestamps: true
//   }
// );

// export default mongoose.model(
//   "BuyerTermination",
//   buyerTerminationSchema
// );




























// import mongoose from "mongoose";

// const buyerTerminationSchema = new mongoose.Schema({

//   // 🔥 MAIN LINK (MOST IMPORTANT)
//   partyId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "TransactionParty",
//     required: true
//   },

//   // ✅ OPTIONAL (for admin/reporting)
//   transactionId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Transaction"
//   },

//   brokerageName1: String,
//   brokerageName2: String,

//   buyerName1: String,
//   buyerName2: String,

//   terminateAgreement: String,

//   terminationTime: String,
//   terminationDate: String,

//   terminationType: String,

//   additionalTerms: String,

//   signedDate: String,

//   buyerPrint1: String,
//   buyerPrint2: String,

//   witnessPrint1: String,
//   witnessPrint2: String,

//   brokerPrint: String

// }, { timestamps: true });

// export default mongoose.model("BuyerTermination", buyerTerminationSchema);