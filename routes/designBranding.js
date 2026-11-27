import express from "express";
import multer from "multer";
import sharp from "sharp";

import DesignBranding from "../models/DesignBranding.js";

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
});

// ===============================
// MULTER
// ===============================

// const storage =
//     multer.diskStorage({

//         destination:
//             "uploads_branding/",

//         filename:
//             (req, file, cb) => {

//                 cb(
//                     null,
//                     Date.now() +
//                     "-" +
//                     file.originalname
//                 );
//             },
//     });

// const upload =
//     multer({
//         storage,
//     });


// ===============================
// CREATE / UPDATE
// ===============================

router.post(
    "/save",
    upload.fields([
        {
            name: "agentImage",
            maxCount: 1,
        },
        {
            name: "brokerageLogo",
            maxCount: 1,
        },
        {
            name: "goldenBrokerageLogo",
            maxCount: 1,
        },
    ]),

    // upload.fields([
    //     {
    //         name: "agentImage",
    //         maxCount: 1,
    //     },
    //     {
    //         name: "brokerageLogo",
    //         maxCount: 1,
    //     },
    // ]),
    async (req, res) => {

        try {

            const {
                adminEmail,
                agentName,
                phone,
            } = req.body;

            let updateData = {
                agentName,
                phone,
            };

            // ======================
            // AGENT IMAGE
            // ======================

            if (
                req.files?.agentImage?.[0]
            ) {

                // const compressed =
                //     await sharp(
                //         req.files.agentImage[0].buffer
                //     )
                //         .resize({
                //             width: 500,
                //             withoutEnlargement: true,
                //         })
                //         .jpeg({
                //             quality: 70,
                //         })
                //         .toBuffer();

                // updateData.agentImage =
                //     `data:image/jpeg;base64,${compressed.toString("base64")}`;
                const compressed =await sharp(
                        req.files.agentImage[0].buffer
                    )
                        .resize({
                            width: 500,
                            withoutEnlargement: true,
                        })
                        .webp({quality: 80,})
                        .toBuffer();
                updateData.agentImage = `data:image/webp;base64,${compressed.toString("base64")}`;
            }

            // ======================
            // BROKERAGE LOGO
            // ======================

            if (
                req.files?.brokerageLogo?.[0]
            ) {

                const compressed =
                    await sharp(
                        req.files.brokerageLogo[0].buffer
                    )
                        .resize({
                            width: 500,
                            withoutEnlargement: true,
                        })
                        .png()
                        .toBuffer();

                updateData.brokerageLogo =
                    `data:image/png;base64,${compressed.toString("base64")}`;
            }

            // ======================
            // GOLDEN BROKERAGE LOGO
            // ======================

            if (req.files?.goldenBrokerageLogo?.[0]) {
                const compressed = await sharp(
                    req.files.goldenBrokerageLogo[0].buffer
                )
                    .resize({
                        width: 500,
                        withoutEnlargement: true,
                    })
                    .png()
                    .toBuffer();
                updateData.goldenBrokerageLogo =
                    `data:image/png;base64,${compressed.toString("base64")}`;
            }

            const branding =
                await DesignBranding.findOneAndUpdate(
                    { adminEmail },
                    updateData,
                    {
                        upsert: true,
                        new: true,
                    }
                );

            res.json({
                success: true,
                branding,
            });

        } catch (err) {

            console.error(err);

            res.status(500).json({
                success: false,
                message: err.message,
            });
        }
    }
);


router.get(
    "/:adminEmail",
    async (req, res) => {

        try {

            const branding =
                await DesignBranding.findOne({
                    adminEmail:
                        req.params.adminEmail,
                });

            res.json({
                success: true,
                branding,
            });

        } catch (err) {

            res.status(500).json({
                success: false,
            });
        }
    }
);


router.delete(
    "/:adminEmail",
    async (req, res) => {

        try {

            await DesignBranding.findOneAndDelete({
                adminEmail:
                    req.params.adminEmail,
            });

            res.json({
                success: true,
                message:
                    "Branding deleted",
            });

        } catch (err) {

            res.status(500).json({
                success: false,
            });
        }
    }
);

export default router;