import mongoose from "mongoose";

const scsaafaSchema = new mongoose.Schema(
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

    /* ================= SELLER ================= */
    sellerName1: String,
    sellerName2: String,

    /* ================= PROPERTY ================= */
    propertyUnitNumber: String,

    streetNumber: String,
    street: String,
    city: String,
    state: String,
    zipcode: String,

    // Non-Condo
    plan: String,
    block: String,
    lot: String,

    // Condo
    condoPlan: String,
    unitNumber: String,

    // ATS
    meridian: String,
    range: String,
    township: String,
    section: String,

    /* ================= FEE ================= */
    feeAmount: String,
    feeDays1: String,
    feeDays2: String,

    /* ================= DOWER ================= */
    married: String,
    resided: String,

    /* ================= CONTACT - SELLER 1 ================= */
    seller1Name: String,

    seller1Streetnum: String,
    seller1Street: String,
    seller1City: String,
    seller1State: String,
    seller1Zipcode: String,

    seller1Phone: String,
    seller1Fax: String,
    seller1Email: String,

    /* ================= CONTACT - SELLER 2 ================= */
    seller2Name: String,

    seller2Streetnum: String,
    seller2Street: String,
    seller2City: String,
    seller2State: String,
    seller2Zipcode: String,

    seller2Phone: String,
    seller2Fax: String,
    seller2Email: String,

    /* ================= BROKERAGE CONTACT ================= */
    brokerageAddress: String,
    brokeragePhone: String,
    brokerageFax: String,
    brokerageEmail: String,

    /* ================= BROKERAGE REP ================= */
    repName: String,
    repAddress: String,
    repPhone: String,
    repFax: String,
    repEmail: String,

    /* ================= SIGNATURE ================= */

    signedDate: String,

    sellerPrint1: String,
    sellerPrint2: String,

    witnessPrint1: String,
    witnessPrint2: String,

    repPrintName: String,

    /* ================= EMAILS ================= */

    sellerSignatureEmail1: String,
    sellerSignatureEmail2: String,

    witnessEmail1: String,
    witnessEmail2: String,

    repSignatureEmail: String,

    spouseSignatureEmail: String,
    spouseWitnessEmail: String,

    /* ================= SPOUSE ================= */

    spouseLocation: String,
    spouseTime: String,
    spouseDate: String,

    spouseName: String,
    spouseWitnessName: String,

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

    spouseSigned: {
      type: Boolean,
      default: false
    },

    spouseWitnessSigned: {
      type: Boolean,
      default: false
    },

    seller1SignedAt: Date,
    seller2SignedAt: Date,

    witness1SignedAt: Date,
    witness2SignedAt: Date,

    brokerSignedAt: Date,

    spouseSignedAt: Date,
    spouseWitnessSignedAt: Date,

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

export default mongoose.model("SCSAAFA", scsaafaSchema);





























// import mongoose from "mongoose";

// const scsaafaSchema = new mongoose.Schema(
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

//     /* ================= PROPERTY ================= */
//     propertyUnitNumber: String,

//     streetNumber: String,
//     street: String,
//     city: String,
//     state: String,
//     zipcode: String,

//     // Non-Condo
//     plan: String,
//     block: String,
//     lot: String,

//     // Condo
//     condoPlan: String,
//     unitNumber: String,

//     // ATS
//     meridian: String,
//     range: String,
//     township: String,
//     section: String,

//     /* ================= FEE ================= */
//     feeAmount: String,
//     feeDays1: String,
//     feeDays2: String,

//     /* ================= DOWER ================= */
//     married: String,
//     resided: String,

//     /* ================= CONTACT - SELLER 1 ================= */
//     seller1Name: String,

//     seller1Streetnum: String,
//     seller1Street: String,
//     seller1City: String,
//     seller1State: String,
//     seller1Zipcode: String,

//     seller1Phone: String,
//     seller1Fax: String,
//     seller1Email: String,

//     /* ================= CONTACT - SELLER 2 ================= */
//     seller2Name: String,

//     seller2Streetnum: String,
//     seller2Street: String,
//     seller2City: String,
//     seller2State: String,
//     seller2Zipcode: String,

//     seller2Phone: String,
//     seller2Fax: String,
//     seller2Email: String,

//     /* ================= BROKERAGE CONTACT ================= */
//     brokerageAddress: String,
//     brokeragePhone: String,
//     brokerageFax: String,
//     brokerageEmail: String,

//     /* ================= BROKERAGE REP ================= */
//     repName: String,
//     repAddress: String,
//     repPhone: String,
//     repFax: String,
//     repEmail: String,

//     /* ================= SIGNATURE ================= */
//     signedDate: String,

//     sellerPrint1: String,
//     sellerPrint2: String,

//     witnessPrint1: String,
//     witnessPrint2: String,

//     repPrintName: String,

//     /* ================= SPOUSE ================= */
//     spouseLocation: String,
//     spouseTime: String,
//     spouseDate: String,

//     spouseName: String,
//     spouseWitnessName: String,

//     /* ================= DOCUSIGN ================= */

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

// export default mongoose.model("SCSAAFA", scsaafaSchema);

























// import mongoose from "mongoose";

// const scsaafaSchema = new mongoose.Schema(
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

//     /* ================= PROPERTY ================= */
//     propertyUnitNumber: String,

//     streetNumber: String,
//     street: String,
//     city: String,
//     state: String,
//     zipcode: String,

//     // Non-Condo
//     plan: String,
//     block: String,
//     lot: String,

//     // Condo
//     condoPlan: String,
//     unitNumber: String,

//     // ATS
//     meridian: String,
//     range: String,
//     township: String,
//     section: String,

//     /* ================= FEE ================= */
//     feeAmount: String,
//     feeDays1: String,
//     feeDays2: String,

//     /* ================= DOWER ================= */
//     married: String,
//     resided: String,

//     /* ================= CONTACT - SELLER 1 ================= */
//     seller1Name: String,

//     seller1Streetnum: String,
//     seller1Street: String,
//     seller1City: String,
//     seller1State: String,
//     seller1Zipcode: String,

//     seller1Phone: String,
//     seller1Fax: String,
//     seller1Email: String,

//     /* ================= CONTACT - SELLER 2 ================= */
//     seller2Name: String,

//     seller2Streetnum: String,
//     seller2Street: String,
//     seller2City: String,
//     seller2State: String,
//     seller2Zipcode: String,

//     seller2Phone: String,
//     seller2Fax: String,
//     seller2Email: String,

//     /* ================= BROKERAGE CONTACT ================= */
//     brokerageAddress: String,
//     brokeragePhone: String,
//     brokerageFax: String,
//     brokerageEmail: String,

//     /* ================= BROKERAGE REP ================= */
//     repName: String,
//     repAddress: String,
//     repPhone: String,
//     repFax: String,
//     repEmail: String,

//     /* ================= SIGNATURE ================= */
//     signedDate: String,

//     sellerPrint1: String,
//     sellerPrint2: String,

//     witnessPrint1: String,
//     witnessPrint2: String,

//     repPrintName: String,

//     /* ================= SPOUSE ================= */
//     spouseLocation: String,
//     spouseTime: String,
//     spouseDate: String,

//     spouseName: String,
//     spouseWitnessName: String
//   },
//   { timestamps: true }
// );

// export default mongoose.model("SCSAAFA", scsaafaSchema);