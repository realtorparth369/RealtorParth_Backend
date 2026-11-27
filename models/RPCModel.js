import mongoose from "mongoose";

const rpcSchema = new mongoose.Schema(
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
    /* ================= SELLER ================= */
    sellerName1: String,
    sellerName2: String,
    /* ================= BUYER ================= */
    buyerName1: String,
    buyerName2: String,
    /* ================= BUYER SIGNATURE EMAILS ================= */

    buyerSignatureEmail1: String,
    buyerSignatureEmail2: String,

    /* ================= PROPERTY ================= */
    unitnumber: String,
    streetnumber: String,
    streetname: String,
    city: String,
    postalCode: String,
    /* ================= LEGAL ================= */
    plan: String,
    block: String,
    lot: String,
    legalOther: String,
    unattachedGoods: String,
    attachedGoods: String,
    /* ================= PRICE ================= */
    purchasePrice: String,
    completionDay: String,
    /* ================= GENERAL ================= */
    hidbrokerage: String,
    /* ================= DEPOSITS ================= */
    depositTrustee: String,
    depositAmount1: String,
    depositMethod1: String,
    depositTime1: String,
    depositDate1: String,
    depositAmount2: String,
    depositMethod2: String,
    depositTime2: String,
    depositDate2: String,
    /* ================= DOWER ================= */
    altertime3: String,
    alterdate3: String,
    /* ================= CONDITIONS ================= */
    downPaymentPercent: String,
    financingConditionTime: String,
    financingConditionDay: String,
    inspectionConditionTime: String,
    inspectionConditionDay: String,
    buyerPropertySaleTime: String,
    buyerPropertySaleDay: String,
    buyerConditions: String,
    buyCondTime: String,
    buyCondDate: String,
    sellerConditions: String,
    sellerCondTime: String,
    sellerCondDate: String,
    /* ================= ATTACHMENTS ================= */
    financingSchedule: Boolean,
    tenancySchedule: Boolean,
    manufacturedHomeSchedule: Boolean,
    saleOfBuyerPropertySchedule: Boolean,
    addendum: Boolean,
    otherAttachment: String,
    otherTerms: String,
    /* ================= AUTHORIZATION ================= */
    sellerBrokerage: String,
    sellerRepAddr: String,
    sellerRepCity: String,
    sellerRepState: String,
    sellerRepcode: String,
    brksellerRepName: String,
    brksellerRepPhone: String,
    brksellerRepFax: String,
    brksellerRepEmail: String,
    buyerBrokerage: String,
    buyerRepAddr: String,
    buyerRepCity: String,
    buyerRepState: String,
    buyerRepcode: String,
    brkbuyerRepName: String,
    brkbuyerRepPhone: String,
    brkbuyerRepFax: String,
    brkbuyerRepEmail: String,
    sellerAuthorizedPerson: String,
    buyerAuthorizedPerson: String,
    /* ================= OFFER ================= */

    offerExpiryTime: String,
    offerExpiryDate: String,

    buyerSignedTime1: String,
    buyerSignedDate1: String,

    buyerWitnessName1: String,
    buyerWitnessEmail1: String,

    buyerSignedTime2: String,
    buyerSignedDate2: String,

    buyerWitnessName2: String,
    buyerWitnessEmail2: String,
    /* ================= ACCEPTANCE ================= */

    sellerSignedTime1: String,
    sellerSignedDate1: String,

    sellerSignatureEmail1: String,

    sellerWitnessName1: String,
    sellerWitnessEmail1: String,

    sellerSignedTime2: String,
    sellerSignedDate2: String,

    sellerSignatureEmail2: String,

    sellerWitnessName2: String,
    sellerWitnessEmail2: String,
    /* ================= SPOUSE ================= */

    spouseSignedTime: String,
    spouseSignedDate: String,

    spouseName: String,
    spouseSignatureEmail: String,

    spouseWitnessName: String,
    spouseWitnessEmail: String,
    /* ================= REJECTION ================= */
    rejectionDateSeller: String,
    rejectionDateBuyer: String,
    rejectionSellerName: String,
    rejectionBuyerName: String,
    /* ================= CONVEYANCING ================= */
    sellerRepstreetnum: String,
    sellerRepstreet: String,
    sellerCity: String,
    sellerState: String,
    sellercode: String,
    sellerRepphone: String,
    sellerRepfax: String,
    brksellerRepLName: String,
    brksellerRepLfirm: String,
    brksellerRepLaddr: String,
    brksellerRepLcity: String,
    brksellerRepLstate: String,
    brksellerRepLcode: String,
    brksellerRepLPhone: String,
    brksellerRepLFax: String,
    brksellerRepLEmail: String,
    buyerRepstreetNum: String,
    buyerRepStreet: String,
    buyerRepCity2: String,
    buyerRepState2: String,
    buyerRepcode2: String,
    brkbuyerRepPhone: String,
    brkbuyerRepFax: String,
    brkbuyerRepLName: String,
    brkbuyerRepLFirm: String,
    brkbuyerRepLAddr: String,
    brkbuyerRepLCity: String,
    brkbuyerRepLstate: String,
    brkbuyerRepLZip: String,
    brkbuyerRepLPhone: String,
    brkbuyerRepLFax: String,
    brkbuyerRepLEmail: String,

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

    buyerWitness1Signed: {
      type: Boolean,
      default: false
    },

    buyerWitness2Signed: {
      type: Boolean,
      default: false
    },

    seller1Signed: {
      type: Boolean,
      default: false
    },

    seller2Signed: {
      type: Boolean,
      default: false
    },

    sellerWitness1Signed: {
      type: Boolean,
      default: false
    },

    sellerWitness2Signed: {
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

    buyer1SignedAt: Date,
    buyer2SignedAt: Date,

    buyerWitness1SignedAt: Date,
    buyerWitness2SignedAt: Date,

    seller1SignedAt: Date,
    seller2SignedAt: Date,

    sellerWitness1SignedAt: Date,
    sellerWitness2SignedAt: Date,

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
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("RPC", rpcSchema);




























// import mongoose from "mongoose";

// const rpcSchema = new mongoose.Schema(
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
//     /* ================= SELLER ================= */
//     sellerName1: String,
//     sellerName2: String,
//     /* ================= BUYER ================= */
//     buyerName1: String,
//     buyerName2: String,
//     /* ================= PROPERTY ================= */
//     unitnumber: String,
//     streetnumber: String,
//     streetname: String,
//     city: String,
//     postalCode: String,
//     /* ================= LEGAL ================= */
//     plan: String,
//     block: String,
//     lot: String,
//     legalOther: String,
//     unattachedGoods: String,
//     attachedGoods: String,
//     /* ================= PRICE ================= */
//     purchasePrice: String,
//     completionDay: String,
//     /* ================= GENERAL ================= */
//     hidbrokerage: String,
//     /* ================= DEPOSITS ================= */
//     depositTrustee: String,
//     depositAmount1: String,
//     depositMethod1: String,
//     depositTime1: String,
//     depositDate1: String,
//     depositAmount2: String,
//     depositMethod2: String,
//     depositTime2: String,
//     depositDate2: String,
//     /* ================= DOWER ================= */
//     altertime3: String,
//     alterdate3: String,
//     /* ================= CONDITIONS ================= */
//     downPaymentPercent: String,
//     financingConditionTime: String,
//     financingConditionDay: String,
//     inspectionConditionTime: String,
//     inspectionConditionDay: String,
//     buyerPropertySaleTime: String,
//     buyerPropertySaleDay: String,
//     buyerConditions: String,
//     buyCondTime: String,
//     buyCondDate: String,
//     sellerConditions: String,
//     sellerCondTime: String,
//     sellerCondDate: String,
//     /* ================= ATTACHMENTS ================= */
//     financingSchedule: Boolean,
//     tenancySchedule: Boolean,
//     manufacturedHomeSchedule: Boolean,
//     saleOfBuyerPropertySchedule: Boolean,
//     addendum: Boolean,
//     otherAttachment: String,
//     otherTerms: String,
//     /* ================= AUTHORIZATION ================= */
//     sellerBrokerage: String,
//     sellerRepAddr: String,
//     sellerRepCity: String,
//     sellerRepState: String,
//     sellerRepcode: String,
//     brksellerRepName: String,
//     brksellerRepPhone: String,
//     brksellerRepFax: String,
//     brksellerRepEmail: String,
//     buyerBrokerage: String,
//     buyerRepAddr: String,
//     buyerRepCity: String,
//     buyerRepState: String,
//     buyerRepcode: String,
//     brkbuyerRepName: String,
//     brkbuyerRepPhone: String,
//     brkbuyerRepFax: String,
//     brkbuyerRepEmail: String,
//     sellerAuthorizedPerson: String,
//     buyerAuthorizedPerson: String,
//     /* ================= OFFER ================= */
//     offerExpiryTime: String,
//     offerExpiryDate: String,
//     buyerSignedTime1: String,
//     buyerSignedDate1: String,
//     buyerWitnessName1: String,
//     buyerSignedTime2: String,
//     buyerSignedDate2: String,
//     buyerWitnessName2: String,
//     /* ================= ACCEPTANCE ================= */
//     sellerSignedTime1: String,
//     sellerSignedDate1: String,
//     sellerWitnessName1: String,
//     sellerSignedTime2: String,
//     sellerSignedDate2: String,
//     sellerWitnessName2: String,
//     /* ================= SPOUSE ================= */
//     spouseSignedTime: String,
//     spouseSignedDate: String,
//     spouseName: String,
//     spouseWitnessName: String,
//     /* ================= REJECTION ================= */
//     rejectionDateSeller: String,
//     rejectionDateBuyer: String,
//     rejectionSellerName: String,
//     rejectionBuyerName: String,
//     /* ================= CONVEYANCING ================= */
//     sellerRepstreetnum: String,
//     sellerRepstreet: String,
//     sellerCity: String,
//     sellerState: String,
//     sellercode: String,
//     sellerRepphone: String,
//     sellerRepfax: String,
//     brksellerRepLName: String,
//     brksellerRepLfirm: String,
//     brksellerRepLaddr: String,
//     brksellerRepLcity: String,
//     brksellerRepLstate: String,
//     brksellerRepLcode: String,
//     brksellerRepLPhone: String,
//     brksellerRepLFax: String,
//     brksellerRepLEmail: String,
//     buyerRepstreetNum: String,
//     buyerRepStreet: String,
//     buyerRepCity2: String,
//     buyerRepState2: String,
//     buyerRepcode2: String,
//     brkbuyerRepPhone: String,
//     brkbuyerRepFax: String,
//     brkbuyerRepLName: String,
//     brkbuyerRepLFirm: String,
//     brkbuyerRepLAddr: String,
//     brkbuyerRepLCity: String,
//     brkbuyerRepLstate: String,
//     brkbuyerRepLZip: String,
//     brkbuyerRepLPhone: String,
//     brkbuyerRepLFax: String,
//     brkbuyerRepLEmail: String,
//     /* ===============================
//        DOCUSIGN
//     =============================== */
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

// export default mongoose.model("RPC", rpcSchema);





































// import mongoose from "mongoose";

// const rpcSchema = new mongoose.Schema(
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

//     /* ================= SELLER ================= */
//     sellerName1: String,
//     sellerName2: String,

//     /* ================= BUYER ================= */
//     buyerName1: String,
//     buyerName2: String,

//     /* ================= PROPERTY ================= */
//     unitnumber: String,
//     streetnumber: String,
//     streetname: String,
//     city: String,
//     postalCode: String,

//     /* ================= LEGAL ================= */
//     plan: String,
//     block: String,
//     lot: String,
//     legalOther: String,
//     unattachedGoods: String,
//     attachedGoods: String,

//     /* ================= PRICE ================= */
//     purchasePrice: String,
//     completionDay: String,

//     /* ================= GENERAL ================= */
//     hidbrokerage: String,

//     /* ================= DEPOSITS ================= */
//     depositTrustee: String,

//     depositAmount1: String,
//     depositMethod1: String,
//     depositTime1: String,
//     depositDate1: String,

//     depositAmount2: String,
//     depositMethod2: String,
//     depositTime2: String,
//     depositDate2: String,

//     /* ================= DOWER ================= */
//     altertime3: String,
//     alterdate3: String,

//     /* ================= CONDITIONS ================= */
//     downPaymentPercent: String,

//     financingConditionTime: String,
//     financingConditionDay: String,

//     inspectionConditionTime: String,
//     inspectionConditionDay: String,

//     buyerPropertySaleTime: String,
//     buyerPropertySaleDay: String,

//     buyerConditions: String,
//     buyCondTime: String,
//     buyCondDate: String,

//     sellerConditions: String,
//     sellerCondTime: String,
//     sellerCondDate: String,

//     /* ================= ATTACHMENTS ================= */
//     financingSchedule: Boolean,
//     tenancySchedule: Boolean,
//     manufacturedHomeSchedule: Boolean,
//     saleOfBuyerPropertySchedule: Boolean,
//     addendum: Boolean,

//     otherAttachment: String,
//     otherTerms: String,

//     /* ================= AUTHORIZATION ================= */
//     sellerBrokerage: String,
//     sellerRepAddr: String,
//     sellerRepCity: String,
//     sellerRepState: String,
//     sellerRepcode: String,

//     brksellerRepName: String,
//     brksellerRepPhone: String,
//     brksellerRepFax: String,
//     brksellerRepEmail: String,

//     buyerBrokerage: String,
//     buyerRepAddr: String,
//     buyerRepCity: String,
//     buyerRepState: String,
//     buyerRepcode: String,

//     brkbuyerRepName: String,
//     brkbuyerRepPhone: String,
//     brkbuyerRepFax: String,
//     brkbuyerRepEmail: String,

//     sellerAuthorizedPerson: String,
//     buyerAuthorizedPerson: String,

//     /* ================= OFFER ================= */
//     offerExpiryTime: String,
//     offerExpiryDate: String,

//     buyerSignedTime1: String,
//     buyerSignedDate1: String,
//     buyerWitnessName1: String,

//     buyerSignedTime2: String,
//     buyerSignedDate2: String,
//     buyerWitnessName2: String,

//     /* ================= ACCEPTANCE ================= */
//     sellerSignedTime1: String,
//     sellerSignedDate1: String,
//     sellerWitnessName1: String,

//     sellerSignedTime2: String,
//     sellerSignedDate2: String,
//     sellerWitnessName2: String,

//     /* ================= SPOUSE ================= */
//     spouseSignedTime: String,
//     spouseSignedDate: String,
//     spouseName: String,
//     spouseWitnessName: String,

//     /* ================= REJECTION ================= */
//     rejectionDateSeller: String,
//     rejectionDateBuyer: String,
//     rejectionSellerName: String,
//     rejectionBuyerName: String,

//     /* ================= CONVEYANCING ================= */
//     sellerRepstreetnum: String,
//     sellerRepstreet: String,
//     sellerCity: String,
//     sellerState: String,
//     sellercode: String,
//     sellerRepphone: String,
//     sellerRepfax: String,

//     brksellerRepLName: String,
//     brksellerRepLfirm: String,
//     brksellerRepLaddr: String,
//     brksellerRepLcity: String,
//     brksellerRepLstate: String,
//     brksellerRepLcode: String,
//     brksellerRepLPhone: String,
//     brksellerRepLFax: String,
//     brksellerRepLEmail: String,

//     buyerRepstreetNum: String,
//     buyerRepStreet: String,
//     buyerRepCity2: String,
//     buyerRepState2: String,
//     buyerRepcode2: String,
//     brkbuyerRepPhone: String,
//     brkbuyerRepFax: String,

//     brkbuyerRepLName: String,
//     brkbuyerRepLFirm: String,
//     brkbuyerRepLAddr: String,
//     brkbuyerRepLCity: String,
//     brkbuyerRepLstate: String,
//     brkbuyerRepLZip: String,
//     brkbuyerRepLPhone: String,
//     brkbuyerRepLFax: String,
//     brkbuyerRepLEmail: String,
//   },
//   { timestamps: true }
// );

// export default mongoose.model("RPC", rpcSchema);