import express from "express";
import MarketData from "../models/MarketData.js";

const router = express.Router();

// // ✅ GET all market data
// router.get("/marketdata", async (req, res) => {
//   try {
//     const data = await MarketData.find().sort({ createdAt: -1 });
//     res.status(200).json(data);
//   } catch (error) {
//     console.error("❌ Error fetching market data:", error);
//     res.status(500).json({ message: "Server error while fetching data." });
//   }
// });




// ✅ GET all market data (no sorting)
router.get("/marketdata", async (req, res) => {
  try {
    const data = await MarketData.find()
      .sort({ createdAt: -1 }); // sort by latest first
    res.status(200).json(data);
  } catch (error) {
    console.error("❌ Error fetching market data:", error);
    res.status(500).json({ message: "Server error while fetching data." });
  }
});


// ✅ GET top 6 latest market data entries
router.get("/marketdata/topSix", async (req, res) => {
  try {
    const data = await MarketData.find()
      .sort({ createdAt: -1 }) // sort by latest first
      .limit(6); // only latest 6 records

    res.status(200).json(data);
  } catch (error) {
    console.error("❌ Error fetching market data:", error);
    res.status(500).json({ message: "Server error while fetching data." });
  }
});



// ✅ POST (Add one new record)
router.post("/marketdata", async (req, res) => {
  try {
    const record = new MarketData(req.body);
    await record.save();
    res.status(201).json({ message: "Market data added successfully!", record });
  } catch (error) {
    console.error("❌ Error adding market data:", error);
    res.status(500).json({ message: "Server error while adding data." });
  }
});

// ✅ PUT (Update one by ID)
router.put("/marketdata/:id", async (req, res) => {
  try {
    const updated = await MarketData.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!updated) return res.status(404).json({ message: "Record not found" });
    res.status(200).json({ message: "Market data updated!", record: updated });
  } catch (error) {
    console.error("❌ Error updating market data:", error);
    res.status(500).json({ message: "Server error while updating data." });
  }
});

// ✅ DELETE (Delete one by ID)
router.delete("/marketdata/:id", async (req, res) => {
  try {
    const deleted = await MarketData.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Record not found" });
    res.status(200).json({ message: "Market data deleted!" });
  } catch (error) {
    console.error("❌ Error deleting market data:", error);
    res.status(500).json({ message: "Server error while deleting data." });
  }
});

export default router;
