import mongoose from "mongoose";

const sharedReportSchema =
    new mongoose.Schema(
        {
            shortId: {
                type: String,
                unique: true,
            },

            reportUrl: String,

            expiresAt: {
                type: Date,
                expires: 0, // AUTO DELETE
            },
        },
        {
            timestamps: true,
        }
    );

export default mongoose.model(
    "SharedReport",
    sharedReportSchema
);