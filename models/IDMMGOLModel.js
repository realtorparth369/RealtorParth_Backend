import mongoose from "mongoose";

const idmmgolSchema = new mongoose.Schema(
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
      ref: "Transaction"
    },

    /* ================= HEADER ================= */
    agreementNumber: String,
    listingContractNumber: String,

    /* ================= SELLER ================= */
    sellerFirstName1: String,
    sellerLastName1: String,

    sellerFirstName2: String,
    sellerLastName2: String,

    /* ================= BROKERAGE ================= */
    brokerageName: String,
    brokerageRepName: String,

    /* ================= PROPERTY ================= */
    streetNum: String,
    street: String,
    unitNum: String,
    city: String,
    state: String,
    zipCode: String,

    plan: String,
    block: String,
    lotUnit: String,

    /* ================= SELLER SIGNATURE ================= */
    sellerSignDate: String,

    sellerPrint1: String,
    sellerPrint2: String,

    witness1: String,
    witness2: String,

    /* ================= EMAILS ================= */

    sellerSignatureEmail1: String,
    sellerSignatureEmail2: String,

    witnessEmail1: String,
    witnessEmail2: String,

    brokerEmail: String,

    /* ================= BROKERAGE SIGNATURE ================= */

    brokerageSignDate: String,

    repPrintName: String,

    /* ===============================
       SIGNING STATUS
    =============================== */

    seller1Signed: {
      type: Boolean,
      default: false
    },

    seller2Signed: {
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

    seller1SignedAt: Date,
    seller2SignedAt: Date,

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

export default mongoose.model("IDMMGOL", idmmgolSchema);

























// import mongoose from "mongoose";

// const idmmgolSchema = new mongoose.Schema(
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
//       ref: "Transaction"
//     },

//     /* ================= HEADER ================= */
//     agreementNumber: String,
//     listingContractNumber: String,

//     /* ================= SELLER ================= */
//     sellerFirstName1: String,
//     sellerLastName1: String,

//     sellerFirstName2: String,
//     sellerLastName2: String,

//     /* ================= BROKERAGE ================= */
//     brokerageName: String,
//     brokerageRepName: String,

//     /* ================= PROPERTY ================= */
//     streetNum: String,
//     street: String,
//     unitNum: String,
//     city: String,
//     state: String,
//     zipCode: String,

//     plan: String,
//     block: String,
//     lotUnit: String,

//     /* ================= SELLER SIGNATURE ================= */
//     sellerSignDate: String,

//     sellerPrint1: String,
//     sellerPrint2: String,

//     witness1: String,
//     witness2: String,

//     /* ================= BROKERAGE SIGNATURE ================= */
//     brokerageSignDate: String,
//     repPrintName: String,

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

// export default mongoose.model("IDMMGOL", idmmgolSchema);




























// import mongoose from "mongoose";

// const idmmgolSchema = new mongoose.Schema(
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
//       ref: "Transaction"
//     },

//     /* ================= HEADER ================= */
//     agreementNumber: String,
//     listingContractNumber: String,

//     /* ================= SELLER ================= */
//     sellerFirstName1: String,
//     sellerLastName1: String,

//     sellerFirstName2: String,
//     sellerLastName2: String,

//     /* ================= BROKERAGE ================= */
//     brokerageName: String,
//     brokerageRepName: String,

//     /* ================= PROPERTY ================= */
//     streetNum: String,
//     street: String,
//     unitNum: String,
//     city: String,
//     state: String,
//     zipCode: String,

//     plan: String,
//     block: String,
//     lotUnit: String,

//     /* ================= SELLER SIGNATURE ================= */
//     sellerSignDate: String,

//     sellerPrint1: String,
//     sellerPrint2: String,

//     witness1: String,
//     witness2: String,

//     /* ================= BROKERAGE SIGNATURE ================= */
//     brokerageSignDate: String,
//     repPrintName: String
//   },
//   { timestamps: true }
// );

// export default mongoose.model("IDMMGOL", idmmgolSchema);