import mongoose from "mongoose";

const DesignBrandingSchema =
    new mongoose.Schema(
        {
            adminEmail: {
                type: String,
                required: true,
                unique: true,
            },

            agentName: {
                type: String,
                default: "",
            },

            phone: {
                type: String,
                default: "",
            },

            // Agent Photo
            agentImage: {
                type: String,
                default: "",
            },

            // White & Black Templates
            brokerageLogo: {
                type: String,
                default: "",
            },

            // Golden & Black Templates
            goldenBrokerageLogo: {
                type: String,
                default: "",
            },
        },
        {
            timestamps: true,
        }
    );

export default mongoose.model(
    "DesignBranding",
    DesignBrandingSchema
);

















// import mongoose from "mongoose";

// const DesignBrandingSchema =
//     new mongoose.Schema(
//         {
//             adminEmail: {
//                 type: String,
//                 required: true,
//                 unique: true,
//             },

//             agentName: {
//                 type: String,
//                 default: "",
//             },

//             phone: {
//                 type: String,
//                 default: "",
//             },

//             agentImage: {
//                 type: String,
//                 default: "",
//             },

//             brokerageLogo: {
//                 type: String,
//                 default: "",
//             },
//         },
//         {
//             timestamps: true,
//         }
//     );

// export default mongoose.model(
//     "DesignBranding",
//     DesignBrandingSchema
// );