import mongoose from "mongoose";

const esraaSchema = new mongoose.Schema(
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
    /* ================= BROKERAGE ================= */
    brokerageName1: String,
    brokerageName2: String,
    /* ================= SELLERS ================= */
    sellerName1: String,
    sellerName2: String,
    sellerSignatureEmail1: String,
    sellerSignatureEmail2: String,

    /* ================= AGREEMENT DETAILS ================= */

    listingNumber: String,
    exclusiveselleragreement: String,

    /* ================= PROPERTY ================= */

    unitNum: String,
    streetNum: String,
    street: String,
    city: String,
    state: String,
    zipcode: String,
    /* ================= EFFECTIVE DATE ================= */
    effectiveTime: String,
    effectiveDate: String,
    /* ================= END DATE ================= */
    endTime: String,
    endDate: String,
    /* ================= PRICE ================= */

    price: String,
    /* ================= OTHER AMENDMENTS ================= */
    otherAmendments: String,
    /* ================= SIGNATURES ================= */
    signedDate: String,
    sellerPrint1: String,
    sellerPrint2: String,
    witnessPrint1: String,
    witnessPrint2: String,
    repPrintName: String,
    /* ================= EMAILS ================= */
    witnessEmail1: String,
    witnessEmail2: String,
    brokerEmail: String,
    /* ================= SIGNING STATUS ================= */

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
    /* ================= DOCUSIGN ================= */
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
export default mongoose.model("ESRAA", esraaSchema);





















// import mongoose from "mongoose";

// const esraaSchema = new mongoose.Schema(
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

//     /* ================= BROKERAGE ================= */
//     brokerageName1: String,
//     brokerageName2: String,

//     /* ================= SELLER ================= */
//     sellerName1: String,
//     sellerName2: String,

//     /* ================= AGREEMENT DETAILS ================= */
//     listingNumber: String,
//     exclusiveselleragreement: String,

//     /* ================= PROPERTY ================= */
//     unitNum: String,
//     streetNum: String,
//     street: String,
//     city: String,
//     state: String,
//     zipcode: String,

//     /* ================= EFFECTIVE DATE ================= */
//     effectiveTime: String,
//     effectiveDate: String,

//     /* ================= END DATE ================= */
//     endTime: String,
//     endDate: String,

//     /* ================= PRICE ================= */
//     price: String,

//     /* ================= OTHER AMENDMENTS ================= */
//     otherAmendments: String,

//     /* ================= SIGNATURE ================= */
//     signedDate: String,

//     sellerPrint1: String,
//     sellerPrint2: String,

//     witnessPrint1: String,
//     witnessPrint2: String,

//     repPrintName: String,

//     /* ===============================
//        DOCUSIGN
//     =============================== */

//     envelopeId: String,

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

// export default mongoose.model("ESRAA", esraaSchema);































// import mongoose from "mongoose";

// const esraaSchema = new mongoose.Schema(
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

//     /* ================= BROKERAGE ================= */
//     brokerageName1: String,
//     brokerageName2: String,

//     /* ================= SELLER ================= */
//     sellerName1: String,
//     sellerName2: String,

//     /* ================= AGREEMENT DETAILS ================= */
//     listingNumber: String,
//     exclusiveselleragreement: String,

//     /* ================= PROPERTY ================= */
//     unitNum: String,
//     streetNum: String,
//     street: String,
//     city: String,
//     state: String,
//     zipcode: String,

//     /* ================= EFFECTIVE DATE ================= */
//     effectiveTime: String,
//     effectiveDate: String,

//     /* ================= END DATE ================= */
//     endTime: String,
//     endDate: String,

//     /* ================= PRICE ================= */
//     price: String,

//     /* ================= OTHER AMENDMENTS ================= */
//     otherAmendments: String,

//     /* ================= SIGNATURE ================= */
//     signedDate: String,

//     sellerPrint1: String,
//     sellerPrint2: String,

//     witnessPrint1: String,
//     witnessPrint2: String,

//     repPrintName: String
//   },
//   { timestamps: true }
// );

// export default mongoose.model("ESRAA", esraaSchema);