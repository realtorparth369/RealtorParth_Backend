import express from "express";
import SharedReport from "../models/SharedReport.js";

const router = express.Router();

router.get("/:id", async (req, res) => {

    try {

        const report =
            await SharedReport.findOne({
                shortId: req.params.id,
            });

        if (!report) {

            return res
                .status(404)
                .send("Link expired or not found");
        }

        res.redirect(report.reportUrl);

    } catch (err) {

        console.error(err);

        res
            .status(500)
            .send("Something went wrong");
    }
});

export default router;