import express from "express";
import bcrypt from "bcrypt";
import TransactionUser from "../models/TransactionUser.js";

const router = express.Router();


// REGISTER
router.post("/register", async (req, res) => {

  try {

    const { name, email, password } = req.body;

    const existingUser = await TransactionUser.findOne({ email });

    if (existingUser) {
      return res.json({
        success: false,
        message: "User already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new TransactionUser({
      name,
      email,
      password: hashedPassword
    });

    await newUser.save();

    res.json({
      success: true,
      message: "User registered successfully"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});


// LOGIN


// LOGIN
// router.post("/login", async (req, res) => {

//   try {

//     const { email, password } = req.body;

//     // FIND USER
//     const user = await TransactionUser.findOne({ email });

//     if (!user) {
//       return res.json({
//         success: false,
//         message: "User not found"
//       });
//     }

//     // CHECK PASSWORD
//     const isMatch = await bcrypt.compare(password, user.password);

//     if (!isMatch) {
//       return res.json({
//         success: false,
//         message: "Invalid password"
//       });
//     }

//     // ✅ SUPER ADMIN EMAIL
//     const SUPER_ADMIN_EMAIL = "hello@realtorparth.ca";

//     // CHECK SUPER ADMIN
//     const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;

//     // RESPONSE
//     res.json({
//       success: true,
//       user: {
//         id: user._id,
//         name: user.name,
//         email: user.email,
//         isSuperAdmin
//       }
//     });

//   } catch (error) {

//     console.error(error);

//     res.status(500).json({
//       success: false,
//       message: "Server error"
//     });

//   }

// });


router.post("/login", async (req, res) => {

  try {

    const { email, password } = req.body;

    const user = await TransactionUser.findOne({ email });

    if (!user) {
      return res.json({
        success: false,
        message: "User not found"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.json({
        success: false,
        message: "Invalid password"
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }

});



// ✅ Check Super Admin Access
router.get(
  "/check-super-admin/:email",
  async (req, res) => {

    try {

      const { email } = req.params;

      const user =
        await TransactionUser.findOne({
          email: email.toLowerCase(),
        });

      // ❌ USER NOT FOUND
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // ❌ ACCOUNT DISABLED
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: "Account disabled",
        });
      }

      // ✅ RESPONSE
      return res.status(200).json({
        success: true,
        isSuperAdmin:
          user.isSuperAdmin,
        role: user.role,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
        },
      });

    } catch (error) {

      console.log(
        "Check Super Admin Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Server error",
      });

    }
  }
);


export default router;
// db.transactionusers.insertOne({name:"New Admin",email:"admin@admin.com",password:"admin789",isSuperAdmin:true,role:"superadmin",isActive:true,createdAt:new Date()})