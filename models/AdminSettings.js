import mongoose from "mongoose";

const adminSettingsSchema = new mongoose.Schema(
{
  // optional (if multi admin later)
//   userId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "TransactionUser"
//   },

//    transactionId: {
//      type: mongoose.Schema.Types.ObjectId,
//      ref: "Transaction",
//      required: true
//    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransactionUser",
      required: true
    },

  // ================= BROKERAGE =================
  brokerageName: String,
  brokerageStreetNum: String,
  brokerageStreet: String,
  brokerageCity: String,
  brokerageState: String,
  brokeragePostalCode: String,
  brokeragePhone: String,
  brokerageEmail: String,

  // ================= REPRESENTATIVE =================
  repName: String,
  repPhone: String,
  repEmail: String

},
{ timestamps: true }
);

export default mongoose.model("AdminSettings", adminSettingsSchema);
























// import mongoose from "mongoose";

// const adminSettingsSchema = new mongoose.Schema(
//     {
//         // optional (if multi admin later)
//         //   userId: {
//         //     type: mongoose.Schema.Types.ObjectId,
//         //     ref: "TransactionUser"
//         //   },
//         transactionId: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "Transaction",
//             required: true
//         },
//         // userId: {
//         //   type: mongoose.Schema.Types.ObjectId,
//         //   ref: "TransactionUser",
//         //   required: true
//         // },

//         // ================= BROKERAGE =================
//         brokerageName: String,
//         brokerageStreetNum: String,
//         brokerageStreet: String,
//         brokerageCity: String,
//         brokerageState: String,
//         brokeragePostalCode: String,
//         brokeragePhone: String,
//         brokerageEmail: String,

//         // ================= REPRESENTATIVE =================
//         repName: String,
//         repPhone: String,
//         repEmail: String

//     },
//     { timestamps: true }
// );

// export default mongoose.model("AdminSettings", adminSettingsSchema);