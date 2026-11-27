import express from "express";
import mongoose from "mongoose";
import Testimonial from "../models/Testimonial.js";

const router = express.Router();

// GET ALL TESTIMONIALS
router.get("/", async (req, res) => {
    try {
        const testimonials = await Testimonial.find().sort({
            createdAt: -1,
        })
        return res.status(200).json({
            success: true,
            count: testimonials.length,
            data: testimonials
        });
    } catch (err) {
        console.log("GET TESTIMONIALS ERROR:", err)
        return res.status(500).json({
            success: false,
            message: "Failed to fetch testimonials.",
        });
    }
});


//CREATE TESTIMONIALS
router.post("/", async (req, res) => {
    try {
        const { name, role, rating, content, date, image_url } = req.body;
        if (!name || !content) {
            return res.status(400).json({
                success: false,
                message: "Name and content are required."
            });
        }
        const testimonial = await Testimonial.create({ name, role, rating, content, date, image_url });
        return res.status(201).json({
            success: true,
            message: "Testimonial created successfully.",
            data: testimonial
        });
    } catch (err) {
        console.log("CREATE TESTIMONIAL ERROR:", err)
        return res.status(500).json({
            success: false,
            message: "Failed to create testimonial.",
        });
    }
});


//UPDATE TESTIMONIAL
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                messsage: "Invalid testimoial ID."
            })
        }

        const testimonial = await Testimonial.findByIdAndUpdate(
            id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        );
        if (!testimonial) {
            return res.status(404).json({
                success: false,
                message: "Testimonial not found."
            });
        }
        return res.status(201).json({
            success: true,
            message: "Testimonial updated successfully.",
            data: testimonial
        });
    } catch (err) {
        console.log("UPDATE TESTIMONIAL ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to update testimonial.",
        });
    }
});


//DELETE TESTIMONIAL
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                messsage: "Invalid testimoial ID."
            })
        }

        const testimonial = await Testimonial.findByIdAndDelete(id);
        if (!testimonial) {
            return res.status(404).json({
                success: false,
                message: "Testimonial not found."
            });
        }
        return res.status(200).json({
            success: true,
            message: "Testimonial deleted successfully."
        });
    } catch (err) {
        console.log("DELETE TESTIMONIAL ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to delete testimonial.",
        });
    }
});


export default router;