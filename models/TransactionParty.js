import mongoose from "mongoose";

const partySchema = new mongoose.Schema(
  {
    // ============================================================
    // TRANSACTION
    // ============================================================

    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },

    // ============================================================
    // USER
    // ============================================================

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransactionUser",
      required: true,
    },

    // ============================================================
    // PARTY INFORMATION
    // ============================================================

    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
    },

    phone: {
      type: String,
      default: "",
    },

    role: {
      type: String,
      enum: ["Buyer", "Seller", "Agent", "Lawyer"],
      default: "Buyer",
    },

    // ============================================================
    // IDENTITY DOCUMENT IMAGES
    //
    // User can upload:
    //
    // 1. Driving Licence only
    // 2. Passport only
    // 3. Both
    // ============================================================

    licenseImage: {
      type: String,
      default: "",
    },

    passportImage: {
      type: String,
      default: "",
    },

    // ============================================================
    // OCR / EXTRACTED IDENTITY DATA
    // ============================================================

    identityData: {
      // ==========================================================
      // PASSPORT
      // ==========================================================

      passport: {
        documentType: {
          type: String,
          default: "",
        },

        fullName: {
          type: String,
          default: "",
        },

        firstName: {
          type: String,
          default: "",
        },

        lastName: {
          type: String,
          default: "",
        },

        documentNumber: {
          type: String,
          default: "",
        },

        dateOfBirth: {
          type: String,
          default: "",
        },

        issueDate: {
          type: String,
          default: "",
        },

        expiryDate: {
          type: String,
          default: "",
        },

        nationality: {
          type: String,
          default: "",
        },

        issuingCountry: {
          type: String,
          default: "",
        },

        address: {
          type: String,
          default: "",
        },

        sex: {
          type: String,
          default: "",
        },

        placeOfBirth: {
          type: String,
          default: "",
        },

        raw: {
          type: mongoose.Schema.Types.Mixed,
          default: {},
        },
      },

      // ==========================================================
      // DRIVING LICENCE
      // ==========================================================

      license: {
        documentType: {
          type: String,
          default: "",
        },

        fullName: {
          type: String,
          default: "",
        },

        firstName: {
          type: String,
          default: "",
        },

        lastName: {
          type: String,
          default: "",
        },

        documentNumber: {
          type: String,
          default: "",
        },

        dateOfBirth: {
          type: String,
          default: "",
        },

        issueDate: {
          type: String,
          default: "",
        },

        expiryDate: {
          type: String,
          default: "",
        },

        nationality: {
          type: String,
          default: "",
        },

        issuingCountry: {
          type: String,
          default: "",
        },

        issuingProvince: {
          type: String,
          default: "",
        },

        address: {
          type: String,
          default: "",
        },

        sex: {
          type: String,
          default: "",
        },

        class: {
          type: String,
          default: "",
        },

        restrictions: {
          type: String,
          default: "",
        },

        raw: {
          type: mongoose.Schema.Types.Mixed,
          default: {},
        },
      },
    },

    // ============================================================
    // IDENTITY VERIFICATION
    // ============================================================

    identityVerification: {
      // ==========================================================
      // OVERALL STATUS
      // ==========================================================

      status: {
        type: String,
        enum: [
          "pending",
          "document_verified",
          "selfie_pending",
          "verified",
          "failed",
        ],
        default: "pending",
      },

      // ==========================================================
      // DOCUMENT VERIFICATION
      //
      // Each document is verified independently.
      //
      // User may have:
      //
      // Driving Licence only
      // Passport only
      // OR both
      // ==========================================================

      documents: {
        // ========================================================
        // DRIVING LICENCE
        // ========================================================

        license: {
          uploaded: {
            type: Boolean,
            default: false,
          },

          verified: {
            type: Boolean,
            default: false,
          },

          confidence: {
            type: Number,
            default: 0,
          },

          verifiedAt: {
            type: Date,
            default: null,
          },
        },

        // ========================================================
        // PASSPORT
        // ========================================================

        passport: {
          uploaded: {
            type: Boolean,
            default: false,
          },

          verified: {
            type: Boolean,
            default: false,
          },

          confidence: {
            type: Number,
            default: 0,
          },

          verifiedAt: {
            type: Date,
            default: null,
          },
        },
      },

      // ==========================================================
      // ONE SELFIE VERIFICATION
      //
      // IMPORTANT:
      //
      // Only ONE selfie is required.
      //
      // The user can hold:
      //
      // Driving Licence
      // OR
      // Passport
      //
      // If both documents are verified, the user chooses which
      // verified document they want to hold.
      // ==========================================================

      selfie: {
        // ========================================================
        // ACTUAL SELFIE IMAGE
        //
        // The actual captured selfie is stored as a base64
        // data URL, similar to licenseImage/passportImage.
        //
        // This allows the TSX to restore the selfie after refresh.
        // ========================================================

        selfieImage: {
          type: String,
          default: "",
        },

        // ========================================================
        // SELFIE UPLOADED/CAPTURED
        // ========================================================

        uploaded: {
          type: Boolean,
          default: false,
        },

        // ========================================================
        // FINAL SELFIE VERIFICATION RESULT
        // ========================================================

        verified: {
          type: Boolean,
          default: false,
        },

        // ========================================================
        // WHICH DOCUMENT WAS HELD?
        //
        // license
        // passport
        // ========================================================

        documentType: {
          type: String,
          enum: ["license", "passport", null],
          default: null,
        },

        // ========================================================
        // FACE DETECTION
        // ========================================================

        faceDetected: {
          type: Boolean,
          default: false,
        },

        // ========================================================
        // DOCUMENT DETECTION
        // ========================================================

        documentDetected: {
          type: Boolean,
          default: false,
        },

        // ========================================================
        // DOCUMENT IS ACTUALLY BEING HELD
        // ========================================================

        documentHeld: {
          type: Boolean,
          default: false,
        },

        // ========================================================
        // DOCUMENT TYPE MATCH
        //
        // Selected = license
        // Selfie contains licence
        //
        // true
        //
        // Selected = license
        // Selfie contains passport
        //
        // false
        // ========================================================

        documentTypeMatches: {
          type: Boolean,
          default: false,
        },

        // ========================================================
        // DOCUMENT DATA MATCH
        //
        // Compares the document visible in the selfie against
        // the original uploaded and verified document.
        // ========================================================

        documentDataMatches: {
          type: Boolean,
          default: false,
        },

        // ========================================================
        // FACE VISUAL CONSISTENCY
        //
        // Compares the person's face with the photo on the
        // original identity document.
        // ========================================================

        faceVisuallyConsistent: {
          type: Boolean,
          default: false,
        },

        // ========================================================
        // IMAGE QUALITY
        // ========================================================

        imageQualityGood: {
          type: Boolean,
          default: false,
        },

        // ========================================================
        // AI CONFIDENCE
        // ========================================================

        confidence: {
          type: Number,
          default: 0,
        },

        // ========================================================
        // OCR DATA EXTRACTED FROM DOCUMENT IN SELFIE
        //
        // This represents what AI could read from the physical
        // document visible inside the selfie.
        // ========================================================

        extractedDocumentData: {
          documentType: {
            type: String,
            default: "",
          },

          fullName: {
            type: String,
            default: "",
          },

          firstName: {
            type: String,
            default: "",
          },

          lastName: {
            type: String,
            default: "",
          },

          documentNumber: {
            type: String,
            default: "",
          },

          dateOfBirth: {
            type: String,
            default: "",
          },

          issueDate: {
            type: String,
            default: "",
          },

          expiryDate: {
            type: String,
            default: "",
          },

          nationality: {
            type: String,
            default: "",
          },

          issuingCountry: {
            type: String,
            default: "",
          },

          issuingProvince: {
            type: String,
            default: "",
          },

          address: {
            type: String,
            default: "",
          },

          sex: {
            type: String,
            default: "",
          },

          placeOfBirth: {
            type: String,
            default: "",
          },

          class: {
            type: String,
            default: "",
          },

          restrictions: {
            type: String,
            default: "",
          },

          raw: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
          },
        },

        // ========================================================
        // DOCUMENT COMPARISON RESULTS
        //
        // Original uploaded document
        //             VS
        // Document visible in selfie
        // ========================================================

        comparison: {
          // ------------------------------------------------------
          // DOCUMENT NUMBER
          // ------------------------------------------------------

          documentNumberMatch: {
            type: Boolean,
            default: false,
          },

          // ------------------------------------------------------
          // NAME
          // ------------------------------------------------------

          nameMatch: {
            type: Boolean,
            default: false,
          },

          // ------------------------------------------------------
          // DATE OF BIRTH
          // ------------------------------------------------------

          dateOfBirthMatch: {
            type: Boolean,
            default: false,
          },

          // ------------------------------------------------------
          // EXPIRY DATE
          // ------------------------------------------------------

          expiryDateMatch: {
            type: Boolean,
            default: false,
          },

          // ------------------------------------------------------
          // DOCUMENT TYPE
          // ------------------------------------------------------

          documentTypeMatch: {
            type: Boolean,
            default: false,
          },

          // ------------------------------------------------------
          // ISSUING COUNTRY
          // ------------------------------------------------------

          issuingCountryMatch: {
            type: Boolean,
            default: false,
          },

          // ------------------------------------------------------
          // NATIONALITY
          // ------------------------------------------------------

          nationalityMatch: {
            type: Boolean,
            default: false,
          },

          // ------------------------------------------------------
          // FACE
          // ------------------------------------------------------

          faceMatch: {
            type: Boolean,
            default: false,
          },
        },

        // ========================================================
        // SELFIE VERIFICATION DATE
        // ========================================================

        verifiedAt: {
          type: Date,
          default: null,
        },
      },

      // ==========================================================
      // FAILURE INFORMATION
      // ==========================================================

      failureReason: {
        type: String,
        default: "",
      },

      // ==========================================================
      // FINAL VERIFICATION DATE
      // ==========================================================

      verifiedAt: {
        type: Date,
        default: null,
      },
    },
  },

  // ============================================================
  // TIMESTAMPS
  // ============================================================

  {
    timestamps: true,
  }
);

// ============================================================
// MODEL
// ============================================================

export default mongoose.model(
  "TransactionParty",
  partySchema
);




































// import mongoose from "mongoose";

// const partySchema = new mongoose.Schema(
//   {
//     // ============================================================
//     // TRANSACTION
//     // ============================================================

//     transactionId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Transaction",
//       required: true
//     },

//     // ============================================================
//     // USER
//     // ============================================================

//     userId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "TransactionUser",
//       required: true
//     },

//     // ============================================================
//     // PARTY INFORMATION
//     // ============================================================

//     name: {
//       type: String,
//       required: true
//     },

//     email: {
//       type: String,
//       required: true
//     },

//     phone: {
//       type: String
//     },

//     role: {
//       type: String,
//       enum: [
//         "Buyer",
//         "Seller",
//         "Agent",
//         "Lawyer"
//       ],
//       default: "Buyer"
//     },

//     // ============================================================
//     // IDENTITY DOCUMENT IMAGES
//     // ============================================================

//     licenseImage: {
//       type: String,
//       default: ""
//     },

//     passportImage: {
//       type: String,
//       default: ""
//     },

//     // ============================================================
//     // OCR / EXTRACTED IDENTITY DATA
//     // ============================================================

//     identityData: {

//       // ==========================================================
//       // PASSPORT
//       // ==========================================================

//       passport: {

//         documentType: {
//           type: String,
//           default: ""
//         },

//         fullName: {
//           type: String,
//           default: ""
//         },

//         firstName: {
//           type: String,
//           default: ""
//         },

//         lastName: {
//           type: String,
//           default: ""
//         },

//         documentNumber: {
//           type: String,
//           default: ""
//         },

//         dateOfBirth: {
//           type: String,
//           default: ""
//         },

//         issueDate: {
//           type: String,
//           default: ""
//         },

//         expiryDate: {
//           type: String,
//           default: ""
//         },

//         nationality: {
//           type: String,
//           default: ""
//         },

//         issuingCountry: {
//           type: String,
//           default: ""
//         },

//         address: {
//           type: String,
//           default: ""
//         },

//         sex: {
//           type: String,
//           default: ""
//         },

//         placeOfBirth: {
//           type: String,
//           default: ""
//         },

//         raw: {
//           type: mongoose.Schema.Types.Mixed,
//           default: {}
//         }
//       },

//       // ==========================================================
//       // DRIVING LICENCE
//       // ==========================================================

//       license: {

//         documentType: {
//           type: String,
//           default: ""
//         },

//         fullName: {
//           type: String,
//           default: ""
//         },

//         firstName: {
//           type: String,
//           default: ""
//         },

//         lastName: {
//           type: String,
//           default: ""
//         },

//         documentNumber: {
//           type: String,
//           default: ""
//         },

//         dateOfBirth: {
//           type: String,
//           default: ""
//         },

//         issueDate: {
//           type: String,
//           default: ""
//         },

//         expiryDate: {
//           type: String,
//           default: ""
//         },

//         nationality: {
//           type: String,
//           default: ""
//         },

//         issuingCountry: {
//           type: String,
//           default: ""
//         },

//         issuingProvince: {
//           type: String,
//           default: ""
//         },

//         address: {
//           type: String,
//           default: ""
//         },

//         sex: {
//           type: String,
//           default: ""
//         },

//         class: {
//           type: String,
//           default: ""
//         },

//         restrictions: {
//           type: String,
//           default: ""
//         },

//         raw: {
//           type: mongoose.Schema.Types.Mixed,
//           default: {}
//         }
//       }
//     },

//     // ============================================================
//     // IDENTITY VERIFICATION
//     // ============================================================

//     identityVerification: {

//       // ==========================================================
//       // OVERALL STATUS
//       // ==========================================================

//       status: {
//         type: String,

//         enum: [
//           "pending",
//           "document_verified",
//           "selfie_pending",
//           "verified",
//           "failed"
//         ],

//         default: "pending"
//       },

//       // ==========================================================
//       // DOCUMENT VERIFICATION
//       // ==========================================================

//       documents: {

//         // ========================================================
//         // DRIVING LICENCE
//         // ========================================================

//         license: {

//           uploaded: {
//             type: Boolean,
//             default: false
//           },

//           verified: {
//             type: Boolean,
//             default: false
//           },

//           confidence: {
//             type: Number,
//             default: 0
//           },

//           verifiedAt: {
//             type: Date,
//             default: null
//           }
//         },

//         // ========================================================
//         // PASSPORT
//         // ========================================================

//         passport: {

//           uploaded: {
//             type: Boolean,
//             default: false
//           },

//           verified: {
//             type: Boolean,
//             default: false
//           },

//           confidence: {
//             type: Number,
//             default: 0
//           },

//           verifiedAt: {
//             type: Date,
//             default: null
//           }
//         }
//       },

//       // ==========================================================
//       // SELFIE VERIFICATION
//       //
//       // We keep a separate selfie verification result for each
//       // document because you may require the person to hold each
//       // uploaded document separately.
//       // ==========================================================

//       selfies: {

//         // ========================================================
//         // SELFIE WITH DRIVING LICENCE
//         // ========================================================

//         license: {

//           uploaded: {
//             type: Boolean,
//             default: false
//           },

//           verified: {
//             type: Boolean,
//             default: false
//           },

//           faceDetected: {
//             type: Boolean,
//             default: false
//           },

//           documentDetected: {
//             type: Boolean,
//             default: false
//           },

//           documentHeld: {
//             type: Boolean,
//             default: false
//           },

//           documentTypeMatches: {
//             type: Boolean,
//             default: false
//           },

//           faceVisuallyConsistent: {
//             type: Boolean,
//             default: false
//           },

//           imageQualityGood: {
//             type: Boolean,
//             default: false
//           },

//           confidence: {
//             type: Number,
//             default: 0
//           },

//           verifiedAt: {
//             type: Date,
//             default: null
//           }
//         },

//         // ========================================================
//         // SELFIE WITH PASSPORT
//         // ========================================================

//         passport: {

//           uploaded: {
//             type: Boolean,
//             default: false
//           },

//           verified: {
//             type: Boolean,
//             default: false
//           },

//           faceDetected: {
//             type: Boolean,
//             default: false
//           },

//           documentDetected: {
//             type: Boolean,
//             default: false
//           },

//           documentHeld: {
//             type: Boolean,
//             default: false
//           },

//           documentTypeMatches: {
//             type: Boolean,
//             default: false
//           },

//           faceVisuallyConsistent: {
//             type: Boolean,
//             default: false
//           },

//           imageQualityGood: {
//             type: Boolean,
//             default: false
//           },

//           confidence: {
//             type: Number,
//             default: 0
//           },

//           verifiedAt: {
//             type: Date,
//             default: null
//           }
//         }
//       },

//       // ==========================================================
//       // FAILURE INFORMATION
//       // ==========================================================

//       failureReason: {
//         type: String,
//         default: ""
//       },

//       // ==========================================================
//       // FINAL VERIFICATION DATE
//       // ==========================================================

//       verifiedAt: {
//         type: Date,
//         default: null
//       }
//     }
//   },

//   // ============================================================
//   // TIMESTAMPS
//   // ============================================================

//   {
//     timestamps: true
//   }
// );

// export default mongoose.model(
//   "TransactionParty",
//   partySchema
// );

































// import mongoose from "mongoose";

// const partySchema = new mongoose.Schema(
//   {
//     transactionId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Transaction",
//       required: true
//     },

//     userId: {   // ✅ ADD THIS
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "TransactionUser",
//       required: true
//     },

//     name: {
//       type: String,
//       required: true
//     },

//     email: {
//       type: String,
//       required: true
//     },

//     phone: String,

//     role: {
//       type: String,
//       enum: ["Buyer", "Seller", "Agent", "Lawyer"],
//       default: "Buyer"
//     },

//     // ✅ NEW: STORE IMAGES AS BASE64
//     licenseImage: {
//       type: String, // base64 string
//       default: ""
//     },

//     passportImage: {
//       type: String, // base64 string
//       default: ""
//     },
//     identityData: {
//       passport: {
//         documentType: String,
//         fullName: String,
//         firstName: String,
//         lastName: String,
//         documentNumber: String,
//         dateOfBirth: String,
//         issueDate: String,
//         expiryDate: String,
//         nationality: String,
//         issuingCountry: String,
//         address: String,
//         sex: String,
//         placeOfBirth: String,
//         raw: mongoose.Schema.Types.Mixed
//       },

//       license: {
//         documentType: String,
//         fullName: String,
//         firstName: String,
//         lastName: String,
//         documentNumber: String,
//         dateOfBirth: String,
//         issueDate: String,
//         expiryDate: String,
//         nationality: String,
//         issuingCountry: String,
//         issuingProvince: String,
//         address: String,
//         sex: String,
//         class: String,
//         restrictions: String,
//         raw: mongoose.Schema.Types.Mixed
//       }
//     }

//   },
//   { timestamps: true }
// );

// export default mongoose.model("TransactionParty", partySchema);