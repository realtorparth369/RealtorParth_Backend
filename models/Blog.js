import mongoose from "mongoose";

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String, required: true },
  content: { type: String, required: true },
  image: { type: String },
  imageURL: { type: String },
  tags: { type: [String], default: [] },

  publishDate: { type: String },

  // ✅ ADD THIS
  status: {
    type: String,
    enum: ["draft", "published"],
    default: "draft",
  },

  createdAt: { type: Date, default: Date.now },
});

const Blog = mongoose.model("Blog", blogSchema);
export default Blog;