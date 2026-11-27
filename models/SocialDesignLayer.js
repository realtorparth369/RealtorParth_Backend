// ============================================================
// SOCIAL DESIGN LAYER MODEL
// backend/src/models/SocialDesignLayer.js
//
// Supports:
// 1. None layer (handled by the frontend/API without saving a layer)
// 2. Default layer
// 3. Customized layer
// 4. AI-generated premium layer
// 5. Persistent settings and element data
// 6. Agent and brokerage profile data
// 7. Backward compatibility with existing fields
// ============================================================

import mongoose from "mongoose";

// ============================================================
// PROFILE SCHEMA
// ============================================================

const DesignLayerProfileSchema = new mongoose.Schema(
  {
    agentName: {
      type: String,
      default: "",
      trim: true,
    },

    agentPhone: {
      type: String,
      default: "",
      trim: true,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    agentRole: {
      type: String,
      default: "REALTOR",
      trim: true,
    },

    realtor: {
      type: String,
      default: "",
      trim: true,
    },

    realtorText: {
      type: String,
      default: "",
      trim: true,
    },

    brokerage: {
      type: String,
      default: "Diamond Realty & Associates Ltd.",
      trim: true,
    },

    agentPhoto: {
      type: String,
      default: "",
      trim: true,
    },

    brokerageLogo: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    _id: false,
  }
);

// ============================================================
// ELEMENT SCHEMA
// Supports text, images, shapes, backgrounds and renderer data.
// ============================================================

const DesignLayerElementSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    enabled: {
      type: Boolean,
      default: true,
    },

    // Position
    x: {
      type: Number,
      default: 0,
    },

    y: {
      type: Number,
      default: 0,
    },

    // Dimensions
    width: {
      type: Number,
      default: 0,
      min: 0,
    },

    height: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Text
    text: {
      type: String,
      default: "",
    },

    textKey: {
      type: String,
      default: "",
      trim: true,
    },

    textTemplate: {
      type: String,
      default: "",
      trim: true,
    },

    // Typography
    fontSize: {
      type: Number,
      default: 0,
      min: 0,
    },

    fontWeight: {
      type: String,
      default: "normal",
      trim: true,
    },

    fontFamily: {
      type: String,
      default: "Arial",
      trim: true,
    },

    textAlign: {
      type: String,
      enum: ["left", "center", "right"],
      default: "left",
    },

    textBaseline: {
      type: String,
      enum: ["top", "baseline"],
      default: "top",
    },

    color: {
      type: String,
      default: "#000000",
      trim: true,
    },

    lineHeight: {
      type: Number,
      default: 1.2,
      min: 0,
    },

    letterSpacing: {
      type: Number,
      default: 0,
    },

    // Background
    background: {
      type: String,
      default: "transparent",
      trim: true,
    },

    opacity: {
      type: Number,
      default: 1,
      min: 0,
      max: 1,
    },

    // Border and shape
    borderRadius: {
      type: Number,
      default: 0,
      min: 0,
    },

    borderWidth: {
      type: Number,
      default: 0,
      min: 0,
    },

    borderColor: {
      type: String,
      default: "transparent",
      trim: true,
    },

    // Images and assets
    assetUrl: {
      type: String,
      default: "",
      trim: true,
    },

    assetKey: {
      type: String,
      default: "",
      trim: true,
    },

    fit: {
      type: String,
      enum: ["cover", "contain", "fill"],
      default: "contain",
    },

    objectPosition: {
      type: String,
      default: "center",
      trim: true,
    },

    useReferenceAgentLayout: {
      type: Boolean,
      default: false,
    },

    // Transform
    rotation: {
      type: Number,
      default: 0,
    },

    zIndex: {
      type: Number,
      default: 0,
    },

    // Renderer-specific configuration
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  {
    _id: true,
  }
);

// ============================================================
// MAIN SCHEMA
// ============================================================

const SocialDesignLayerSchema = new mongoose.Schema(
  {
    // Basic information
    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    // Supports both existing and new API type names.
    type: {
      type: String,
      enum: [
        "default",
        "custom",
        "customize",
        "ai",
        "ai-generated",
      ],
      default: "custom",
      trim: true,
      lowercase: true,
    },

    // AI metadata
    aiGenerated: {
      type: Boolean,
      default: false,
    },

    aiPrompt: {
      type: String,
      default: "",
      trim: true,
    },

    sourceLayerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SocialDesignLayer",
      default: null,
    },

    version: {
      type: Number,
      default: 1,
      min: 1,
    },

    // Status
    isActive: {
      type: Boolean,
      default: true,
    },

    isDefault: {
      type: Boolean,
      default: false,
    },

    // Added for the API's layer-selection functionality.
    isSelected: {
      type: Boolean,
      default: false,
    },

    showMLS: {
      type: Boolean,
      default: false,
    },

    // Canvas dimensions
    canvas: {
      width: {
        type: Number,
        default: 1080,
        min: 1,
      },

      height: {
        type: Number,
        default: 1350,
        min: 1,
      },

      background: {
        type: String,
        default: "transparent",
        trim: true,
      },

      backgroundImage: {
        type: String,
        default: "",
        trim: true,
      },
    },

    // Design elements
    elements: {
      type: [DesignLayerElementSchema],
      default: [],
    },

    // Added for the API's customizable footer settings.
    // Examples: backgroundColor, logoBackgroundColor, textColor,
    // name, role, phone, layout and logo/agent image references.
    settings: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },

    // Nested agent/brokerage profile
    profile: {
      type: DesignLayerProfileSchema,
      default: () => ({}),
    },

    // Flat fields retained for existing frontend compatibility
    agentName: {
      type: String,
      default: "",
      trim: true,
    },

    agentPhone: {
      type: String,
      default: "",
      trim: true,
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    agentRole: {
      type: String,
      default: "",
      trim: true,
    },

    realtor: {
      type: String,
      default: "",
      trim: true,
    },

    realtorText: {
      type: String,
      default: "",
      trim: true,
    },

    brokerage: {
      type: String,
      default: "Diamond Realty & Associates Ltd.",
      trim: true,
    },

    agentPhoto: {
      type: String,
      default: "",
      trim: true,
    },

    brokerageLogo: {
      type: String,
      default: "",
      trim: true,
    },

    // Ownership
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // Sorting
    sortOrder: {
      type: Number,
      default: 0,
    },

    // Additional metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// ============================================================
// INDEXES
// ============================================================

SocialDesignLayerSchema.index({
  isActive: 1,
  sortOrder: 1,
});

SocialDesignLayerSchema.index({
  isDefault: 1,
});

SocialDesignLayerSchema.index({
  type: 1,
  isActive: 1,
});

SocialDesignLayerSchema.index({
  aiGenerated: 1,
  isActive: 1,
});

SocialDesignLayerSchema.index({
  userId: 1,
  isActive: 1,
});

SocialDesignLayerSchema.index({
  userId: 1,
  isDefault: 1,
});

SocialDesignLayerSchema.index({
  userId: 1,
  type: 1,
  isActive: 1,
});

SocialDesignLayerSchema.index({
  userId: 1,
  isSelected: 1,
});

// ============================================================
// NORMALIZE BEFORE SAVE
// ============================================================

SocialDesignLayerSchema.pre("save", function (next) {
  try {
    if (this.name) {
      this.name = this.name.trim();
    }

    if (this.description) {
      this.description = this.description.trim();
    }

    if (this.type) {
      this.type = String(this.type).trim().toLowerCase();
    }

    // Both AI type names are supported.
    if (
      this.type === "ai" ||
      this.type === "ai-generated"
    ) {
      this.aiGenerated = true;
    }

    // Both customization type names are supported.
    if (
      this.type === "custom" ||
      this.type === "customize"
    ) {
      this.aiGenerated = false;
    }

    // Protect the built-in default layer.
    if (this.type === "default") {
      this.isDefault = true;
      this.aiGenerated = false;
    }

    if (this.name === "RealtorParth Default") {
      this.type = "default";
      this.isDefault = true;
      this.aiGenerated = false;
      this.isActive = true;
    }

    if (this.aiPrompt) {
      this.aiPrompt = String(this.aiPrompt).trim();
    }

    if (!this.version || this.version < 1) {
      this.version = 1;
    }

    // Normalize flat profile fields.
    const profileFields = [
      "agentName",
      "agentPhone",
      "phone",
      "agentRole",
      "realtor",
      "realtorText",
      "brokerage",
      "agentPhoto",
      "brokerageLogo",
    ];

    for (const field of profileFields) {
      if (typeof this[field] === "string") {
        this[field] = this[field].trim();
      }
    }

    // Keep nested and flat profile fields compatible.
    if (this.profile) {
      for (const field of profileFields) {
        if (typeof this.profile[field] === "string") {
          this.profile[field] = this.profile[field].trim();
        }
      }

      // Fill nested fields from flat fields when empty.
      for (const field of profileFields) {
        if (!this.profile[field] && this[field]) {
          this.profile[field] = this[field];
        }
      }

      // Fill flat fields from nested fields when empty.
      for (const field of profileFields) {
        if (!this[field] && this.profile[field]) {
          this[field] = this.profile[field];
        }
      }
    }

    // Normalize element data.
    if (Array.isArray(this.elements)) {
      this.elements.forEach((element) => {
        if (element.type) {
          element.type = String(element.type)
            .trim()
            .toLowerCase();
        }

        for (const field of [
          "assetKey",
          "assetUrl",
          "textKey",
          "textTemplate",
          "fontFamily",
          "fontWeight",
          "objectPosition",
        ]) {
          if (typeof element[field] === "string") {
            element[field] = element[field].trim();
          }
        }
      });
    }

    // Keep settings as flexible user-defined design data.
    if (
      !this.settings ||
      typeof this.settings !== "object"
    ) {
      this.settings = {};
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ============================================================
// JSON OUTPUT
// ============================================================

SocialDesignLayerSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
});

// ============================================================
// MODEL
// ============================================================

const SocialDesignLayer =
  mongoose.models.SocialDesignLayer ||
  mongoose.model(
    "SocialDesignLayer",
    SocialDesignLayerSchema
  );

export default SocialDesignLayer;
