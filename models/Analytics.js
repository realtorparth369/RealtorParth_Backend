// import mongoose from "mongoose";

// const analyticsSchema = new mongoose.Schema(
//     {
//         page: {
//             type: String,
//             required: true,
//         },

//         country: {
//             type: String,
//             default: "Unknown",
//         },

//         countryCode: {
//             type: String,
//             default: "UN",
//         },

//         device: {
//             type: String,
//             enum: [
//                 "Desktop",
//                 "Mobile",
//                 "Tablet",
//                 "Unknown",
//             ],
//             default: "Unknown",
//         },

//         userAgent: {
//             type: String,
//             default: "",
//         },

//         createdAt: {
//             type: Date,
//             default: Date.now,
//         },
//     }
// );

// const Analytics = mongoose.model(
//     "Analytics",
//     analyticsSchema
// );

// export default Analytics;






import mongoose from "mongoose";

const analyticsSchema = new mongoose.Schema(
    {
        page: {
            type: String,
            required: true,
        },

        country: {
            type: String,
            default: "Unknown",
        },

        countryCode: {
            type: String,
            default: "UN",
        },

        device: {
            type: String,
            enum: [
                "Desktop",
                "Mobile",
                "Tablet",
                "Unknown",
            ],
            default: "Unknown",
        },

        userAgent: {
            type: String,
            default: "",
        },

        /* HASHED VISITOR IP */

        ipHash: {
            type: String,
            unique: true,
            sparse: true,
        },

        createdAt: {
            type: Date,
            default: Date.now,
        },
    }
);

const Analytics = mongoose.model(
    "Analytics",
    analyticsSchema
);

export default Analytics;












// import mongoose from "mongoose";

// const analyticsSchema = new mongoose.Schema({

//     page: {

//         type: String,

//         required: true,a

//     },

//     createdAt: {

//         type: Date,

//         default: Date.now,

//     },

// });

// const Analytics = mongoose.model(
//     "Analytics",
//     analyticsSchema
// );

// export default Analytics;