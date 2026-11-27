import mongoose from "mongoose";

const fintracSchema = new mongoose.Schema(
  {
    // ============================================================
    // LINK TO PARTY
    // ============================================================

    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransactionParty",
      required: true,
      unique: true,
      index: true,
    },

    // ============================================================
    // LINK TO TRANSACTION
    // ============================================================

    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      index: true,
    },

    // ============================================================
    // PROPERTY
    // ============================================================

    propertyStreetNum: {
      type: String,
      default: "",
    },

    propertyStreet: {
      type: String,
      default: "",
    },

    propertyCity: {
      type: String,
      default: "",
    },

    propertyPostalCode: {
      type: String,
      default: "",
    },

    representativeName: {
      type: String,
      default: "",
    },

    brokerName: {
      type: String,
      default: "",
    },

    dateVerified: {
      type: String,
      default: "",
    },

    // ============================================================
    // PERSONAL
    // ============================================================

    fullName: {
      type: String,
      default: "",
    },

    address: {
      type: String,
      default: "",
    },

    dob: {
      type: String,
      default: "",
    },

    occupation: {
      type: String,
      default: "",
    },

    // ============================================================
    // ID
    // ============================================================

    idTypeDriver: {
      type: Boolean,
      default: false,
    },

    idTypePassport: {
      type: Boolean,
      default: false,
    },

    idTypeOther: {
      type: Boolean,
      default: false,
    },

    idOtherExplain: {
      type: String,
      default: "",
    },

    confrm_invdul_nm_bdt: {
      type: Boolean,
      default: false,
    },

    confrm_invdul_nm_addr: {
      type: Boolean,
      default: false,
    },

    confrm_invdul_nm_financial: {
      type: Boolean,
      default: false,
    },

    documentNumber: {
      type: String,
      default: "",
    },

    issuingJurisdiction: {
      type: String,
      default: "",
    },

    country: {
      type: String,
      default: "",
    },

    expiryDate: {
      type: String,
      default: "",
    },

    // ============================================================
    // CREDIT
    // ============================================================

    creditBureauName: {
      type: String,
      default: "",
    },

    creditFileReferenceNumber: {
      type: String,
      default: "",
    },

    dobSourceName: {
      type: String,
      default: "",
    },

    dobAccountNumber: {
      type: String,
      default: "",
    },

    addressSourceName: {
      type: String,
      default: "",
    },

    addressAccountNumber: {
      type: String,
      default: "",
    },

    financialSourceName: {
      type: String,
      default: "",
    },

    financialAccountType: {
      type: String,
      default: "",
    },

    financialAccountNumber: {
      type: String,
      default: "",
    },

    // ============================================================
    // THIRD PARTY
    // ============================================================

    thirdPartyConducted: {
      type: String,
      enum: ["yes", "no", ""],
      default: "",
    },

    thirdPartyReason: {
      type: String,
      default: "",
    },

    thirdPartyName: {
      type: String,
      default: "",
    },

    thirdPartyAddress: {
      type: String,
      default: "",
    },

    thirdPartyPhone: {
      type: String,
      default: "",
    },

    thirdPartyDOB: {
      type: String,
      default: "",
    },

    thirdPartyOccupation: {
      type: String,
      default: "",
    },

    thirdPartyRegistration: {
      type: String,
      default: "",
    },

    thirdPartyRelationship: {
      type: String,
      default: "",
    },

    // ============================================================
    // CLIENT FINTRAC QUESTIONNAIRE
    // ============================================================

    clientPoliticallyExposed: {
      type: String,
      enum: ["yes", "no", ""],
      default: "",
    },

    clientFamilyGovernment: {
      type: String,
      enum: ["yes", "no", ""],
      default: "",
    },

    clientThirdParty: {
      type: String,
      enum: ["yes", "no", ""],
      default: "",
    },

    // ============================================================
    // DILISENSE AML SCREENING / REPORT
    //
    // AML SCREENING IS REQUIRED WHEN ANY ONE OF THE CLIENT
    // FINTRAC QUESTIONS IS "yes".
    //
    // Example:
    //
    // clientPoliticallyExposed = "yes"
    // clientFamilyGovernment = "no"
    // clientThirdParty = "no"
    //
    // Result:
    //
    // AML REQUIRED = true
    //
    // The DiliSense AML screening result is stored here.
    // ============================================================

    dilisenseReport: {
      // ----------------------------------------------------------
      // WHETHER THE PDF REPORT WAS GENERATED
      // ----------------------------------------------------------

      generated: {
        type: Boolean,
        default: false,
      },

      // ----------------------------------------------------------
      // AML / REPORT STATUS
      //
      // not_required
      // pending
      // screened
      // generated
      // failed
      // ----------------------------------------------------------

      status: {
        type: String,
        enum: [
          "not_required",
          "pending",
          "screened",
          "generated",
          "failed",
        ],
        default: "not_required",
      },

      // ----------------------------------------------------------
      // WHICH FINTRAC QUESTIONS TRIGGERED AML SCREENING
      //
      // Example:
      //
      // [
      //   "politicallyExposed"
      // ]
      //
      // or:
      //
      // [
      //   "politicallyExposed",
      //   "familyPoliticallyExposed"
      // ]
      // ----------------------------------------------------------

      triggeredBy: {
        type: [String],
        default: [],
      },

      // ----------------------------------------------------------
      // NAME SENT TO DILISENSE
      // ----------------------------------------------------------

      searchedName: {
        type: String,
        default: "",
      },

      // ----------------------------------------------------------
      // DOB SENT TO DILISENSE
      // ----------------------------------------------------------

      searchedDob: {
        type: String,
        default: "",
      },

      // ----------------------------------------------------------
      // GENDER SENT TO DILISENSE
      // ----------------------------------------------------------

      searchedGender: {
        type: String,
        default: "",
      },

      // ----------------------------------------------------------
      // IDENTITY SOURCE
      //
      // Example:
      //
      // passport
      // license
      //
      // This tells the admin which verified identity was used
      // for AML screening.
      // ----------------------------------------------------------

      identitySource: {
        type: String,
        default: "",
      },

      // ----------------------------------------------------------
      // NUMBER OF AML MATCHES / HITS
      //
      // Example:
      //
      // 0 = no records returned
      // 3 = three records returned
      // ----------------------------------------------------------

      totalHits: {
        type: Number,
        default: 0,
      },

      // ----------------------------------------------------------
      // DILISENSE SCREENING TIMESTAMP
      // ----------------------------------------------------------

      screeningTimestamp: {
        type: Date,
        default: null,
      },

      // ----------------------------------------------------------
      // AML SCREENING RESULTS
      //
      // Stores the records returned by DiliSense.
      //
      // This is intentionally flexible because the exact structure
      // of individual records can vary depending on the screening
      // source.
      // ----------------------------------------------------------

      screeningResult: {
        type: [mongoose.Schema.Types.Mixed],
        default: [],
      },

      // ----------------------------------------------------------
      // WHEN THE PDF REPORT WAS GENERATED
      // ----------------------------------------------------------

      generatedAt: {
        type: Date,
        default: null,
      },

      // ----------------------------------------------------------
      // ERROR MESSAGE
      // ----------------------------------------------------------

      error: {
        type: String,
        default: "",
      },

      // ----------------------------------------------------------
      // GENERATED AML PDF
      //
      // DiliSense returns the report as Base64.
      //
      // Backend converts:
      //
      // Base64 -> Buffer
      //
      // MongoDB stores:
      //
      // Buffer
      // ----------------------------------------------------------

      pdf: {
        type: Buffer,
        default: null,
      },
    },

    // ============================================================
    // PROPERTY TYPE
    // ============================================================

    propertyTypeResidential: {
      type: Boolean,
      default: false,
    },

    propertyTypeIncome: {
      type: Boolean,
      default: false,
    },

    propertyTypeCommercial: {
      type: Boolean,
      default: false,
    },

    propertyTypeLand: {
      type: Boolean,
      default: false,
    },

    otherPropertyType: {
      type: String,
      default: "",
    },

    // ============================================================
    // RISK
    // ============================================================

    businessDescription: {
      type: String,
      default: "",
    },

    monitoringMeasures: {
      type: String,
      default: "",
    },

    enhancedMeasures: {
      type: String,
      default: "",
    },

    // ============================================================
    // RISK QUESTIONS
    // ============================================================

    q1: {
      type: String,
      default: "",
    },

    q2: {
      type: String,
      default: "",
    },

    q3: {
      type: String,
      default: "",
    },

    q4: {
      type: String,
      default: "",
    },

    q5: {
      type: String,
      default: "",
    },

    q6: {
      type: String,
      default: "",
    },

    q7: {
      type: String,
      default: "",
    },

    q8: {
      type: String,
      default: "",
    },

    q9: {
      type: String,
      default: "",
    },

    q10: {
      type: String,
      default: "",
    },

    q11: {
      type: String,
      default: "",
    },

    q12: {
      type: String,
      default: "",
    },

    q13: {
      type: String,
      default: "",
    },

    q14: {
      type: String,
      default: "",
    },

    q15: {
      type: String,
      default: "",
    },

    q16: {
      type: String,
      default: "",
    },

    q17: {
      type: String,
      default: "",
    },

    // ============================================================
    // RISK SCORE
    // ============================================================

    totalRiskScore: {
      type: Number,
      default: 0,
    },

    riskLevel: {
      type: String,
      default: "",
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
  "Fintrac",
  fintracSchema
);
































// import mongoose from "mongoose";

// const fintracSchema = new mongoose.Schema({

//   // 🔥 LINK TO PARTY (MOST IMPORTANT)
//   partyId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "TransactionParty",
//     required: true,
//     unique: true // ✅ one FINTRAC per party
//   },

//   // (optional but useful)
//   transactionId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Transaction"
//   },

//   // ================= PROPERTY =================
//   propertyStreetNum: String,
//   propertyStreet: String,
//   propertyCity: String,
//   propertyPostalCode: String,

//   representativeName: String,
//   brokerName: String,
//   dateVerified: String,

//   // ================= PERSONAL =================
//   fullName: String,
//   address: String,
//   dob: String,
//   occupation: String,

//   // ================= ID =================
//   idTypeDriver: Boolean,
//   idTypePassport: Boolean,
//   idTypeOther: Boolean,
//   idOtherExplain: String,

//   confrm_invdul_nm_bdt: Boolean,
//   confrm_invdul_nm_addr: Boolean,
//   confrm_invdul_nm_financial: Boolean,

//   documentNumber: String,
//   issuingJurisdiction: String,
//   country: String,
//   expiryDate: String,

//   // ================= CREDIT =================
//   creditBureauName: String,
//   creditFileReferenceNumber: String,

//   dobSourceName: String,
//   dobAccountNumber: String,

//   addressSourceName: String,
//   addressAccountNumber: String,

//   financialSourceName: String,
//   financialAccountType: String,
//   financialAccountNumber: String,

//   // ================= THIRD PARTY =================
//   thirdPartyConducted: String,
//   thirdPartyReason: String,

//   thirdPartyName: String,
//   thirdPartyAddress: String,
//   thirdPartyPhone: String,
//   thirdPartyDOB: String,
//   thirdPartyOccupation: String,
//   thirdPartyRegistration: String,
//   thirdPartyRelationship: String,


//   // ================= CLIENT FINTRAC =================
//   clientPoliticallyExposed: {
//     type: String,
//     enum: ["yes", "no"],
//     default: ""
//   },

//   clientFamilyGovernment: {
//     type: String,
//     enum: ["yes", "no"],
//     default: ""
//   },

//   clientThirdParty: {
//     type: String,
//     enum: ["yes", "no"],
//     default: ""
//   },


//   // ================= PROPERTY TYPE =================
//   propertyTypeResidential: Boolean,
//   propertyTypeIncome: Boolean,
//   propertyTypeCommercial: Boolean,
//   propertyTypeLand: Boolean,

//   otherPropertyType: String,

//   // ================= RISK =================
//   businessDescription: String,
//   monitoringMeasures: String,
//   enhancedMeasures: String,

//   // ================= QUESTIONS =================
//   q1: String,
//   q2: String,
//   q3: String,
//   q4: String,
//   q5: String,
//   q6: String,
//   q7: String,
//   q8: String,
//   q9: String,
//   q10: String,
//   q11: String,
//   q12: String,
//   q13: String,
//   q14: String,
//   q15: String,
//   q16: String,
//   q17: String,

//   totalRiskScore: Number,
//   riskLevel: String

// }, { timestamps: true });

// export default mongoose.model("Fintrac", fintracSchema);