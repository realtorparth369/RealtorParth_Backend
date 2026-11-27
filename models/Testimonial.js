// models/Testimonial.js

import mongoose from "mongoose";

const testimonialSchema = new mongoose.Schema(
    {
        name: String,
        role: String,
        rating: Number,
        date: String,
        content: String,
        image_url: String,
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Testimonial", testimonialSchema);