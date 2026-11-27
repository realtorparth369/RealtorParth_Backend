import mongoose from "mongoose";

const BuyerAgreementSchema = new mongoose.Schema(
  {
    /* ===============================
       🔥 MAIN LINK
    =============================== */

    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransactionParty",
      required: true,
      index: true
    },

    /* ===============================
       OPTIONAL
    =============================== */

    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction"
    },

    /* ===============================
       AGREEMENT
    =============================== */

    agreementNumber: String,

    /* ===============================
       BROKERAGE
    =============================== */

    brokerageName1: String,
    brokerageName2: String,

    /* ===============================
       BUYERS
    =============================== */

    buyerName1: String,
    buyerName2: String,

    /* ===============================
       PROPERTY
    =============================== */

    propertyType: String,
    marketAreas: String,

    /* ===============================
       AGENCY
    =============================== */

    designatedAgentName: String,

    startDate: String,
    startYear: String,
    startTime: String,

    endDate: String,
    endYear: String,
    endTime: String,

    /* ===============================
       SERVICES
    =============================== */

    agentServices: String,

    daysAfterAgreement: String,

    ourFee: String,
    retainerAmount: String,
    retainerMonth: String,
    retainerDay: String,
    retainerYear: String,

    refundDays: String,

    otherPaymentTerms: String,

    contractDaysAfterAgreement: String,
    paymentAfterPurchaseDays: String,
    refundDifferenceDays: String,
    differencePaymentDays: String,

    reasonableExpenses: String,

    additionalTerms: String,
    attachedDocuments: String,

    /* ===============================
       CONTACT INFORMATION
    =============================== */

    buyer1Name: String,
    buyer1Address: String,
    buyer1Phone: String,
    buyer1Fax: String,
    buyer1Email: String,

    buyer2Name: String,
    buyer2Address: String,
    buyer2Phone: String,
    buyer2Fax: String,
    buyer2Email: String,

    brokerageName: String,
    brokerageAddress: String,
    brokeragePhone: String,
    brokerageFax: String,
    brokerageEmail: String,

    repName: String,
    repPhone: String,
    repFax: String,
    repEmail: String,

    /* ===============================
       SIGN DATE
    =============================== */

    signedDateM: String,
    signedDateD: String,
    signedYear: String,

    /* ===============================
       SIGNATURE PRINT NAMES
    =============================== */

    buyersig1: String,
    buyersig2: String,

    witness1sig: String,
    witness2sig: String,

    agentsig: String,

    /* ===============================
       SIGNATURE EMAILS
    =============================== */

    buyerSignatureEmail1: String,
    buyerSignatureEmail2: String,

    witness1Email: String,
    witness2Email: String,

    agentEmail: String,

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

    agentSigned: {
      type: Boolean,
      default: false
    },

    buyer1SignedAt: Date,
    buyer2SignedAt: Date,

    witness1SignedAt: Date,
    witness2SignedAt: Date,

    agentSignedAt: Date,

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
  "BuyerAgreement",
  BuyerAgreementSchema
);




































// import mongoose from "mongoose";

// const BuyerAgreementSchema = new mongoose.Schema(
//   {
//     // ===============================
//     // RELATIONS
//     // ===============================
//     partyId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "TransactionParty",
//       required: true,
//       index: true
//     },

//     transactionId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Transaction"
//     },

//     // ===============================
//     // DOCUSIGN
//     // ===============================
//     envelopeId: {
//       type: String,
//       default: ""
//     },

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
//     ],

//     // ===============================
//     // FORM DATA
//     // ===============================
//     agreementNumber: String,

//     brokerageName1: String,
//     brokerageName2: String,

//     buyerName1: String,
//     buyerName2: String,

//     propertyType: String,
//     marketAreas: String,

//     designatedAgentName: String,

//     startDate: String,
//     startYear: String,
//     startTime: String,

//     endDate: String,
//     endYear: String,
//     endTime: String,

//     agentServices: String,

//     daysAfterAgreement: String,

//     ourFee: String,
//     retainerAmount: String,
//     retainerMonth: String,
//     retainerDay: String,
//     retainerYear: String,
//     refundDays: String,
//     otherPaymentTerms: String,

//     contractDaysAfterAgreement: String,
//     paymentAfterPurchaseDays: String,
//     refundDifferenceDays: String,
//     differencePaymentDays: String,

//     reasonableExpenses: String,

//     additionalTerms: String,
//     attachedDocuments: String,

//     buyer1Name: String,
//     buyer1Address: String,
//     buyer1Phone: String,
//     buyer1Fax: String,
//     buyer1Email: String,

//     buyer2Name: String,
//     buyer2Address: String,
//     buyer2Phone: String,
//     buyer2Fax: String,
//     buyer2Email: String,

//     brokerageName: String,
//     brokerageAddress: String,
//     brokeragePhone: String,
//     brokerageFax: String,
//     brokerageEmail: String,

//     repName: String,
//     repPhone: String,
//     repFax: String,
//     repEmail: String,

//     signedDateM: String,
//     signedDateD: String,
//     signedYear: String,

//     buyersig1: String,
//     buyersig2: String,
//     witness1sig: String,
//     witness2sig: String,
//     agentsig: String
//   },
//   {
//     timestamps: true
//   }
// );

// export default mongoose.model("BuyerAgreement", BuyerAgreementSchema);





















// import mongoose from "mongoose";

// const BuyerAgreementSchema = new mongoose.Schema(
//   {

//     // 🔥 MAIN LINK (MOST IMPORTANT)
//     partyId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "TransactionParty",
//       required: true
//     },

//     // ✅ OPTIONAL (for admin/reporting)
//     transactionId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Transaction"
//     },

//     agreementNumber: String,

//     brokerageName1: String,
//     brokerageName2: String,

//     buyerName1: String,
//     buyerName2: String,

//     propertyType: String,
//     marketAreas: String,

//     designatedAgentName: String,

//     startDate: String,
//     startYear: String,
//     startTime: String,

//     endDate: String,
//     endYear: String,
//     endTime: String,

//     agentServices: String,

//     daysAfterAgreement: String,

//     ourFee: String,
//     retainerAmount: String,
//     retainerMonth: String,
//     retainerDay: String,
//     retainerYear: String,
//     refundDays: String,
//     otherPaymentTerms: String,

//     contractDaysAfterAgreement: String,
//     paymentAfterPurchaseDays: String,
//     refundDifferenceDays: String,
//     differencePaymentDays: String,

//     reasonableExpenses: String,

//     additionalTerms: String,
//     attachedDocuments: String,

//     buyer1Name: String,
//     buyer1Address: String,
//     buyer1Phone: String,
//     buyer1Fax: String,
//     buyer1Email: String,

//     buyer2Name: String,
//     buyer2Address: String,
//     buyer2Phone: String,
//     buyer2Fax: String,
//     buyer2Email: String,

//     brokerageName: String,
//     brokerageAddress: String,
//     brokeragePhone: String,
//     brokerageFax: String,
//     brokerageEmail: String,

//     repName: String,
//     repPhone: String,
//     repFax: String,
//     repEmail: String,

//     signedDateM: String,
//     signedDateD: String,
//     signedYear: String,

//     buyersig1: String,
//     buyersig2: String,
//     witness1sig: String,
//     witness2sig: String,
//     agentsig: String,

//   },
//   {
//     timestamps: true
//   }
// );

// export default mongoose.model("BuyerAgreement", BuyerAgreementSchema);