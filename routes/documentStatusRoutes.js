import express from "express";
import mongoose from "mongoose";

import TransactionParty from "../models/TransactionParty.js";
import BuyerAmendment from "../models/BuyerAmendmentModel.js";
import BuyerTermination from "../models/BuyerTerminationModel.js";
import RPC from "../models/RPCModel.js";
import BuyerAgreement from "../models/BuyerAgreementModel.js";

import Crg from "../models/CrgModel.js";

import SCSAAFA from "../models/SCSAAFAModel.js";
import IDMMGOL from "../models/IDMMGOLModel.js";
import ESRAA from "../models/ESRAAModel.js";
import {
  getCRGStatus,
  getEBRADAStatus,
  getEBRAAStatus,
  getEBRATDAStatus,
  getRPCStatus,
  getSCSAAFAStatus,
  getIDMMGOLStatus,
  getESRAAStatus,
} from "../utils/signingStatus.js";

const router = express.Router();


router.get("/document-status/:partyId", async (req, res) => {
  try {
    const { partyId } = req.params;

    const [
      crg,
      ebrada,
      ebraa,
      ebratda,
      rpc,
      scsaafa,
      idmmgol,
      esraa,
    ] = await Promise.all([
      Crg.findOne({ partyId }),
      BuyerAgreement.findOne({ partyId }),
      BuyerAmendment.findOne({ partyId }),
      BuyerTermination.findOne({ partyId }),
      RPC.findOne({ partyId }),
      SCSAAFA.findOne({ partyId }),
      IDMMGOL.findOne({ partyId }),
      ESRAA.findOne({ partyId }),
    ]);

    console.log("RPC DB:", {
      buyer1Signed: rpc?.buyer1Signed,
      buyerWitness1Signed: rpc?.buyerWitness1Signed,
      buyer2Signed: rpc?.buyer2Signed,
      buyerWitness2Signed: rpc?.buyerWitness2Signed,
      seller1Signed: rpc?.seller1Signed,
      sellerWitness1Signed: rpc?.sellerWitness1Signed,
      seller2Signed: rpc?.seller2Signed,
      sellerWitness2Signed: rpc?.sellerWitness2Signed,
      spouseSigned: rpc?.spouseSigned,
      spouseWitnessSigned: rpc?.spouseWitnessSigned,
    });

    console.log(ebraa)
    return res.json({
      success: true,
      data: {
        crg: {
          filled: !!crg,
          signing: getCRGStatus(crg),
        },

        EBRADA: {
          filled: !!ebrada,
          signing: getEBRADAStatus(ebrada),
        },

        EBRAA: {
          filled: !!ebraa,
          signing: getEBRAAStatus(ebraa),
        },

        EBRATDA: {
          filled: !!ebratda,
          signing: getEBRATDAStatus(ebratda),
        },

        RPC: {
          filled: !!rpc,
          signing: getRPCStatus(rpc),
        },

        SCSAAFA: {
          filled: !!scsaafa,
          signing: getSCSAAFAStatus(scsaafa),
        },

        IDMMGOL: {
          filled: !!idmmgol,
          signing: getIDMMGOLStatus(idmmgol),
        },

        ESRAA: {
          filled: !!esraa,
          signing: getESRAAStatus(esraa),
        },
      },
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});


router.get("/document-status/:partyId", async (req, res) => {

  try {

    const { partyId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(partyId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid partyId"
      });
    }

    const party = await TransactionParty.findById(partyId);

    if (!party) {
      return res.json({
        success: false,
        message: "Party not found"
      });
    }

    /* ===============================
       FETCH ALL DOCUMENTS
    =============================== */

    const [
      amendment,
      termination,
      rpc,
      buyeragreement,

      scsaafa,
      idmmgol,
      esraa

    ] = await Promise.all([

      // BUYING
      BuyerAmendment.findOne({ partyId }),
      BuyerTermination.findOne({ partyId }),
      RPC.findOne({ partyId }),
      BuyerAgreement.findOne({ partyId }),

      // SELLING
      SCSAAFA.findOne({ partyId }),
      IDMMGOL.findOne({ partyId }),
      ESRAA.findOne({ partyId })

    ]);

    /* ===============================
       RESPONSE
    =============================== */

    //     res.json({
    //   success: true,
    //   data: {
    //     role: party.role,
    //     buyerDocs: {
    //       EBRAA: !!amendment,
    //       EBRATDA: !!termination,
    //       RPC: !!rpc,
    //       EBRADA: !!buyeragreement,
    //     },
    //     sellerDocs: {
    //       SCSAAFA: !!scsaafa,
    //       IDMMGOL: !!idmmgol,
    //       ESRAA: !!esraa,
    //     }
    //   }
    // });

    res.json({
      success: true,
      data: {

        // BUYING
        EBRAA: !!amendment,
        EBRATDA: !!termination,
        RPC: !!rpc,
        EBRADA: !!buyeragreement,

        // SELLING
        SCSAAFA: !!scsaafa,
        IDMMGOL: !!idmmgol,
        ESRAA: !!esraa
      }
    });

  } catch (err) {

    console.error("Document status error:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});

export default router;





/* ===============================
   GET DOCUMENT STATUS (BY PARTY)
================================ */

// router.get("/document-status/:partyId", async (req, res) => {

//   try {

//     const { partyId } = req.params;

//     /* ===============================
//        VALIDATE PARTY ID
//     =============================== */

//     if (!mongoose.Types.ObjectId.isValid(partyId)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid partyId"
//       });
//     }

//     /* ===============================
//        VERIFY PARTY EXISTS
//     =============================== */

//     const party = await TransactionParty.findById(partyId);

//     if (!party) {
//       return res.json({
//         success: false,
//         message: "Party not found"
//       });
//     }

//     /* ===============================
//        FETCH DOCUMENTS (PER PARTY)
//     =============================== */

//     const [amendment, termination, rpc, buyeragreement] = await Promise.all([
//       BuyerAmendment.findOne({ partyId }),
//       BuyerTermination.findOne({ partyId }),
//       RPC.findOne({ partyId }),
//       BuyerAgreement.findOne({ partyId })
//     ]);

//     /* ===============================
//        RESPONSE
//     =============================== */

//     res.json({
//       success: true,
//       data: {
//         EBRAA: !!amendment,
//         EBRATDA: !!termination,
//         RPC: !!rpc,
//         EBRADA: !!buyeragreement
//       }
//     });

//   } catch (err) {

//     console.error("Document status error:", err);

//     res.status(500).json({
//       success: false,
//       message: "Server error"
//     });

//   }

// });



















// import express from "express";
// import mongoose from "mongoose";

// import Transaction from "../models/Transaction.js";
// import BuyerAmendment from "../models/BuyerAmendmentModel.js";
// import BuyerTermination from "../models/BuyerTerminationModel.js";
// import RPC from "../models/RPCModel.js";
// import BuyerAgreement from "../models/BuyerAgreementModel.js";

// const router = express.Router();

// router.get("/document-status/:transactionId/:userId", async (req, res) => {

//   try {

//     const { transactionId, userId } = req.params;

//     /* ===============================
//        VALIDATE IDS
//     =============================== */

//     if (
//       !mongoose.Types.ObjectId.isValid(transactionId) ||
//       !mongoose.Types.ObjectId.isValid(userId)
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid transactionId or userId"
//       });
//     }

//     /* ===============================
//        VERIFY TRANSACTION OWNERSHIP
//     =============================== */

//     const transaction = await Transaction.findOne({
//       _id: transactionId,
//       userId
//     });

//     if (!transaction) {
//       return res.json({
//         success: false,
//         message: "Unauthorized"
//       });
//     }

//     /* ===============================
//        FETCH DOCUMENTS (PER TRANSACTION)
//     =============================== */

//     const [amendment, termination, rpc, buyeragreement] = await Promise.all([
//       BuyerAmendment.findOne({ transactionId }),
//       BuyerTermination.findOne({ transactionId }),
//       RPC.findOne({ transactionId }),
//       BuyerAgreement.findOne({ transactionId })
//     ]);

//     /* ===============================
//        RESPONSE
//     =============================== */

//     res.json({
//       success: true,
//       data: {
//         EBRAA: !!amendment,
//         EBRATDA: !!termination,
//         RPC: !!rpc,
//         EBRADA: !!buyeragreement
//       }
//     });

//   } catch (err) {

//     console.error("Document status error:", err);

//     res.status(500).json({
//       success: false,
//       message: "Server error"
//     });

//   }

// });

// export default router;