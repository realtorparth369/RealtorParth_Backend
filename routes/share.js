import express from "express";
import { nanoid } from "nanoid";
import SharedReport from "../models/SharedReport.js";

const router = express.Router();

router.post("/create-share", async (req, res) => {

    try {

        const { reportUrl } = req.body;

        if (!reportUrl) {
            return res.status(400).json({
                error: "Missing report URL",
            });
        }

        const shortId =
            nanoid(6);

        const expiresAt =
            new Date(
                Date.now() +
                7 * 24 * 60 * 60 * 1000
            );

        await SharedReport.create({
            shortId,
            reportUrl,
            expiresAt,
        });

        res.json({
            shortUrl:
                `https://realtorparth.ca/r/${shortId}`,
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Failed to create share link",
        });
    }
});



router.get("/:id", async (req, res) => {

    try {

        const report =
            await SharedReport.findOne({
                shortId: req.params.id,
            });

        if (!report) {

            return res.status(404).json({
                error:
                    "Link expired or not found",
            });
        }

        res.json({
            reportUrl:
                report.reportUrl,
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error:
                "Something went wrong",
        });
    }
});


export default router;