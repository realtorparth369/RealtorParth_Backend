import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      trim: true,
    },

    password: {
      type: String,
    },

    // ============================================================
    // SELECTED PROPERTIES
    // ============================================================

    selectedProperties: {
      type: [String],
      default: [],
    },

    // ============================================================
    // SOCIAL DESIGN PREFERENCES
    // ============================================================
    //
    // Controls the user's preferred branding behavior
    // in the Social Post Creator.
    //
    // branding modes:
    //
    // none    -> No branding/design layer
    // default  -> RealtorParth default branding
    // saved    -> User-selected saved/custom layer
    // ai       -> AI automatically creates a design layer
    //
    // ============================================================

    socialDesignPreferences: {
      // ----------------------------------------------------------
      // DEFAULT BRANDING MODE
      // ----------------------------------------------------------

      defaultBrandingMode: {
        type: String,
        enum: ["none", "default", "saved", "ai"],
        default: "default",
      },

      // ----------------------------------------------------------
      // SELECTED SAVED/CUSTOM LAYER
      // ----------------------------------------------------------
      //
      // Used when defaultBrandingMode = "saved"
      //
      // ----------------------------------------------------------

      defaultLayerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SocialDesignLayer",
        default: null,
      },

      // ----------------------------------------------------------
      // SHOW MLS BY DEFAULT
      // ----------------------------------------------------------

      defaultShowMLS: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
  }
);

// ============================================================
// MODEL
// ============================================================

export default mongoose.model(
  "User",
  UserSchema
);


















// import mongoose from "mongoose";

// const UserSchema = new mongoose.Schema({
//   email: String,
//   password: String,

//   // ⭐ Add this field
//   selectedProperties: {
//     type: [String],
//     default: [],
//   },
// });

// export default mongoose.model("User", UserSchema);