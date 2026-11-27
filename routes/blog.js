import { fetchProperties } from "../metadata.js";
import express from "express";
import mongoose from "mongoose";
import axios from "axios";
import { getAccessToken } from "../auth.js";
import Property from "../models/Property.js"; // your schema
import cors from 'cors';
import Wishlist from "../models/WishList.js"; // your MongoDB model
import cron from "node-cron";
import PropertyModel from "../models/Property.js"; // make sure you have .js here
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import Blog from "../models/Blog.js";


const router = express.Router();

// Get all blogs

router.get("/blogs", async (req, res) => {
  try {
    const { status } = req.query;

    const filter = status ? { status } : {};

    const blogs = await Blog.find(filter).sort({ createdAt: -1 });

    res.json(blogs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch blogs" });
  }
});

// =====================================================
// DASHBOARD - BLOG STATISTICS
// GET /blogs/dashboard-stats
// =====================================================

router.get("/dashboard-stats", async (req, res) => {
  try {
    const [
      totalBlogs,
      publishedBlogs,
      draftBlogs,
      recentBlogs,
    ] = await Promise.all([
      // Total
      Blog.countDocuments(),

      // Published
      Blog.countDocuments({
        status: "published",
      }),

      // Draft
      Blog.countDocuments({
        status: "draft",
      }),

      // Only latest 2 for Dashboard Recent Activity
      Blog.find()
        .sort({ createdAt: -1 })
        .select("title createdAt status")
        .limit(2)
        .lean(),
    ]);

    return res.json({
      success: true,

      totalBlogs,
      publishedBlogs,
      draftBlogs,

      recentBlogs,
    });

  } catch (error) {
    console.error(
      "Dashboard Blog Stats Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch blog statistics",
    });
  }
});


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Configure multer for file uploads
// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

router.post("/addblog", upload.single("image"), async (req, res) => {
  try {
    const { title, author, content, imageURL, tags, publishDate } = req.body;

    // ✅ Ensure tags always become an array
    let parsedTags = [];
    if (tags) {
      if (Array.isArray(tags)) {
        parsedTags = tags;
      } else if (typeof tags === "string") {
        parsedTags = tags.split(",").map(t => t.trim()).filter(Boolean);
      }
    }


    const newBlog = new Blog({
      title,
      author,
      content,
      tags: parsedTags, // ✅ Always array now
      publishDate: publishDate || null,
    });

    if (req.file) newBlog.image = req.file.filename;
    else if (imageURL) newBlog.imageURL = imageURL;

    await newBlog.save();

    res.status(201).json({
      message: "Blog created successfully!",
      blog: newBlog,
    });
  } catch (err) {
    console.error("❌ Error creating blog:", err);
    res.status(500).json({ message: "Server error. Could not create blog." });
  }
});


// Delete blog
router.delete("/blogs/:id", async (req, res) => {
  try {
    await Blog.findByIdAndDelete(req.params.id);
    res.json({ message: "Blog deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete blog" });
  }
});


// Update blog
// Update blog
router.put("/blogs/:id", upload.single("image"), async (req, res) => {
  try {
    const { title, author, content, imageURL, tags, publishDate } = req.body;

    // Prepare parsed tags as an array
    let parsedTags = [];
    if (tags) {
      if (Array.isArray(tags)) {
        parsedTags = tags;
      } else if (typeof tags === "string") {
        parsedTags = tags.split(",").map(t => t.trim()).filter(Boolean);
      }
    }

    const updateData = { title, author, content, tags: parsedTags, ...(publishDate !== undefined && {publishDate}) };

    if (req.file) {
      updateData.image = req.file.filename; // Save uploaded file
      updateData.imageURL = undefined;      // Clear imageURL if uploading
    } else if (imageURL) {
      updateData.imageURL = imageURL;
      updateData.image = undefined;         // Clear previous uploaded image
    }

    const updatedBlog = await Blog.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json(updatedBlog);
  } catch (err) {
    console.error("Error updating blog:", err);
    res.status(500).json({ error: "Failed to update blog" });
  }
});


// Get single blog detail
router.get("/blogdetail/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Find blog by _id
    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    res.json(blog);
  } catch (err) {
    console.error("Error fetching blog detail:", err);
    res.status(500).json({ error: "Failed to fetch blog detail" });
  }
});


router.patch("/blogs/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

    if (!["draft", "published"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    // 🔍 get existing blog
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ error: "Not found" });

    const updateData = { status };

    // ✅ ONLY set publishDate if it's first time publishing
    if (status === "published" && !blog.publishDate) {
      updateData.publishDate = new Date().toISOString();
    }

    const updatedBlog = await Blog.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json(updatedBlog);
  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});


export default router;