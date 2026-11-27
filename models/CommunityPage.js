import mongoose from 'mongoose';

const communityPageSchema = new mongoose.Schema({
  community: {
    type: String,
    required: true,
    unique: true,
  },

  slug: {
    type: String,
    required: true,
    unique: true,
  },

  heroImage: String,
  heroImageURL: String,
  tagline: String,
  description: String,

  schools: String,
  safety: String,

  commute: {
    downtown: String,
    airport: String,
    mall: String,
  },

  keyFeatures: {
    type: [String],
    default: [],
  },

  marketSnapshot: {
    startingPrice: String,
    avgDaysOnMarket: String,
    propertyType: String,
  },

  seo: {
    metaTitle: String,
    metaDescription: String,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('CommunityPage', communityPageSchema);