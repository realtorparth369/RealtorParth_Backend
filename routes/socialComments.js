import express from "express";
import axios from "axios";

const router = express.Router();

/* =========================================================
   HELPERS
========================================================= */

const getPlatform = (value) => {
    return String(value || "")
        .trim()
        .toLowerCase();
};

const getPostId = (value) => {
    return String(value || "").trim();
};

const getCommentId = (value) => {
    return String(value || "").trim();
};

/**
 * Detect errors where the Instagram media/post is not available.
 *
 * We don't want an unavailable Instagram post to make the
 * entire comments request fail with HTTP 500.
 */
const isInstagramPostUnavailableError = (err) => {
    const status = err?.response?.status;

    const responseData =
        err?.response?.data;

    const responseText =
        typeof responseData === "string"
            ? responseData
            : JSON.stringify(responseData || "");

    const errorMessage =
        String(
            err?.message || ""
        ).toLowerCase();

    const combinedText = (
        responseText +
        " " +
        errorMessage
    ).toLowerCase();

    /**
     * Common Meta / Instagram errors for
     * unavailable or invalid media.
     */
    const unavailablePatterns = [
        "not found",
        "does not exist",
        "doesn't exist",
        "unsupported get request",
        "unsupported request",
        "media not found",
        "post not found",
        "instagram post not found",
        "instagram media not found",
        "requested resource",
        "object with id",
        "cannot load media",
        "media does not exist",
        "media doesn't exist",
        "invalid media",
    ];

    const matchesPattern =
        unavailablePatterns.some(
            (pattern) =>
                combinedText.includes(
                    pattern
                )
        );

    /**
     * A direct 404 is also considered
     * unavailable.
     */
    if (status === 404) {
        return true;
    }

    return matchesPattern;
};

/**
 * Log an Axios error in a useful way.
 */
const logAxiosError = (
    title,
    err
) => {
    console.error("");
    console.error(
        "========================================"
    );
    console.error(title);
    console.error(
        "========================================"
    );

    console.error(
        "STATUS:",
        err?.response?.status
    );

    console.error(
        "RESPONSE DATA:",
        err?.response?.data
    );

    console.error(
        "RESPONSE HEADERS:",
        err?.response?.headers
    );

    console.error(
        "ERROR MESSAGE:",
        err?.message
    );

    console.error(
        "REQUEST URL:",
        err?.config?.url
    );

    console.error(
        "REQUEST METHOD:",
        err?.config?.method
    );

    console.error(
        "REQUEST DATA:",
        err?.config?.data
    );

    console.error(
        "========================================"
    );
    console.error("");
};


/* =========================================================
   LIST COMMENTS
========================================================= */

router.post(
    "/list",
    async (req, res) => {
        const platform =
            getPlatform(
                req.body?.platform
            );

        const postId =
            getPostId(
                req.body?.postId
            );

        try {
            console.log("");
            console.log(
                "========================================"
            );
            console.log(
                "COMMENT REQUEST"
            );
            console.log(
                "========================================"
            );
            console.log(
                "Platform:",
                platform
            );
            console.log(
                "Post ID:",
                postId
            );
            console.log(
                "========================================"
            );

            /* -----------------------------------------
               VALIDATION
            ----------------------------------------- */

            if (!platform) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Platform is required.",
                });
            }

            if (!postId) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Post ID is required.",
                });
            }

            if (
                ![
                    "facebook",
                    "instagram",
                    "linkedin",
                ].includes(platform)
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Unsupported platform.",
                });
            }

            /* -----------------------------------------
               MAKE PAYLOAD
            ----------------------------------------- */

            const payload = {
                action: "list_comments",
                platform,
                postId,
            };

            console.log(
                "SENDING TO MAKE:"
            );

            console.log(
                JSON.stringify(
                    payload,
                    null,
                    2
                )
            );

            /* -----------------------------------------
               CALL MAKE
            ----------------------------------------- */

            const response =
                await axios.post(
                    process.env
                        .MAKE_COMMENTS_WEBHOOK,
                    payload,
                    {
                        timeout: 30000,
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                    }
                );

            console.log(
                "MAKE RESPONSE STATUS:",
                response.status
            );

            console.log(
                "MAKE RESPONSE DATA:",
                response.data
            );

            /**
             * Return Make response exactly as before.
             */
            return res.json(
                response.data
            );

        } catch (err) {
            console.error("================================");
            console.error("MAKE COMMENTS ERROR");
            console.error("Platform:", req.body.platform);
            console.error("PostId:", req.body.postId);
            console.error("Status:", err.response?.status);
            console.error("Data:", JSON.stringify(err.response?.data, null, 2));
            console.error("Message:", err.message);
            console.error("================================");

            res.status(500).json({
                success: false,
                message: "Failed to load comments.",
                debug: err.response?.data || err.message,
            });
        }
    }
);


/* =========================================================
   REPLY COMMENT
========================================================= */

router.post(
    "/reply",
    async (req, res) => {
        const platform =
            getPlatform(
                req.body?.platform
            );

        const postId =
            getPostId(
                req.body?.postId
            );

        const commentId =
            getCommentId(
                req.body?.commentId
            );

        const message =
            String(
                req.body?.message || ""
            ).trim();

        try {
            console.log("");
            console.log(
                "========================================"
            );
            console.log(
                "COMMENT REPLY REQUEST"
            );
            console.log(
                "========================================"
            );

            console.log(
                "Platform:",
                platform
            );

            console.log(
                "Post ID:",
                postId
            );

            console.log(
                "Comment ID:",
                commentId
            );

            console.log(
                "Message:",
                message
            );

            console.log(
                "========================================"
            );

            /* -----------------------------------------
               VALIDATION
            ----------------------------------------- */

            if (!platform) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Platform is required.",
                });
            }

            if (!postId) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Post ID is required.",
                });
            }

            if (!commentId) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Comment ID is required.",
                });
            }

            if (!message) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Reply message is required.",
                });
            }

            /* -----------------------------------------
               MAKE PAYLOAD
            ----------------------------------------- */

            const payload = {
                action: "reply",
                platform,
                postId,
                commentId,
                message,
            };

            console.log(
                "SENDING REPLY TO MAKE:"
            );

            console.log(
                JSON.stringify(
                    payload,
                    null,
                    2
                )
            );

            /* -----------------------------------------
               CALL MAKE
            ----------------------------------------- */

            const response =
                await axios.post(
                    process.env
                        .MAKE_COMMENTS_WEBHOOK,
                    payload,
                    {
                        timeout: 30000,
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                    }
                );

            console.log(
                "MAKE REPLY STATUS:",
                response.status
            );

            console.log(
                "MAKE REPLY DATA:",
                response.data
            );

            return res.json(
                response.data
            );

        } catch (err) {

            logAxiosError(
                "MAKE COMMENT REPLY ERROR",
                err
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to reply.",
            });
        }
    }
);


/* =========================================================
   DELETE COMMENT
========================================================= */

/**
 * Your existing endpoint:
 *
 * POST /api/social-comments/delete
 *
 * Body:
 * {
 *   platform,
 *   commentId
 * }
 */

router.post(
    "/delete",
    async (req, res) => {
        const platform =
            getPlatform(
                req.body?.platform
            );

        const commentId =
            getCommentId(
                req.body?.commentId
            );

        try {
            console.log("");
            console.log(
                "========================================"
            );
            console.log(
                "DELETE COMMENT REQUEST"
            );
            console.log(
                "========================================"
            );

            console.log(
                "Platform:",
                platform
            );

            console.log(
                "Comment ID:",
                commentId
            );

            console.log(
                "========================================"
            );

            /* -----------------------------------------
               VALIDATION
            ----------------------------------------- */

            if (!platform) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Platform is required.",
                });
            }

            if (!commentId) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Comment ID is required.",
                });
            }

            /* -----------------------------------------
               MAKE PAYLOAD
            ----------------------------------------- */

            const payload = {
                action: "delete_comment",
                platform,
                commentId,
            };

            console.log(
                "SENDING DELETE TO MAKE:"
            );

            console.log(
                JSON.stringify(
                    payload,
                    null,
                    2
                )
            );

            /* -----------------------------------------
               CALL MAKE
            ----------------------------------------- */

            const response =
                await axios.post(
                    process.env
                        .MAKE_COMMENTS_WEBHOOK,
                    payload,
                    {
                        timeout: 30000,
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                    }
                );

            console.log(
                "MAKE DELETE STATUS:",
                response.status
            );

            console.log(
                "MAKE DELETE DATA:",
                response.data
            );

            return res.json(
                response.data
            );

        } catch (err) {

            logAxiosError(
                "MAKE COMMENT DELETE ERROR",
                err
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to delete comment.",
            });
        }
    }
);


/* =========================================================
   DELETE COMMENT COMPATIBILITY ROUTE
========================================================= */

/**
 * This supports the mobile request if it is using:
 *
 * DELETE /api/social-comments/:commentId
 *
 * Internally we convert it to the same Make payload.
 *
 * Example:
 *
 * DELETE /api/social-comments/122141698...
 *
 * Body:
 * {
 *   platform: "facebook"
 * }
 */

router.delete(
    "/:commentId",
    async (req, res) => {
        const platform =
            getPlatform(
                req.body?.platform ||
                req.query?.platform
            );

        const commentId =
            getCommentId(
                req.params?.commentId
            );

        try {
            console.log("");
            console.log(
                "========================================"
            );
            console.log(
                "DELETE COMMENT COMPATIBILITY REQUEST"
            );
            console.log(
                "========================================"
            );

            console.log(
                "Platform:",
                platform
            );

            console.log(
                "Comment ID:",
                commentId
            );

            console.log(
                "========================================"
            );

            if (!platform) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Platform is required.",
                });
            }

            if (!commentId) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Comment ID is required.",
                });
            }

            const payload = {
                action: "delete_comment",
                platform,
                commentId,
            };

            console.log(
                "SENDING DELETE TO MAKE:"
            );

            console.log(
                JSON.stringify(
                    payload,
                    null,
                    2
                )
            );

            const response =
                await axios.post(
                    process.env
                        .MAKE_COMMENTS_WEBHOOK,
                    payload,
                    {
                        timeout: 30000,
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                    }
                );

            console.log(
                "MAKE DELETE STATUS:",
                response.status
            );

            console.log(
                "MAKE DELETE DATA:",
                response.data
            );

            return res.json(
                response.data
            );

        } catch (err) {

            logAxiosError(
                "MAKE COMMENT DELETE COMPATIBILITY ERROR",
                err
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to delete comment.",
            });
        }
    }
);


/* =========================================================
   EXPORT
========================================================= */

export default router;





































// import express from "express";
// import axios from "axios";

// const router = express.Router();

// /* ===============================
// LIST COMMENTS
// =============================== */

// router.post(
//     "/list",
//     async (req, res) => {
//         try {
//             console.log("COMMENT REQUEST:", {
//                 platform: req.body.platform,
//                 postId: req.body.postId
//             });
//             const response =
//                 await axios.post(
//                     process.env.MAKE_COMMENTS_WEBHOOK,
//                     {
//                         action: "list_comments",
//                         platform: req.body.platform,
//                         postId: req.body.postId
//                     }
//                 );
//             res.json(response.data);
//         }
//         catch (err) {
//             console.error(err);
//             res.status(500).json({
//                 success: false,
//                 message: "Failed to load comments."
//             });
//         }
//     }
// );

// /* ===============================
// REPLY COMMENT
// =============================== */

// router.post(
//     "/reply",
//     async (req, res) => {
//         try {
//             const response =
//                 await axios.post(
//                     process.env.MAKE_COMMENTS_WEBHOOK,
//                     {
//                         action: "reply",
//                         platform: req.body.platform,
//                         postId: req.body.postId,
//                         commentId: req.body.commentId,
//                         message: req.body.message
//                     }
//                 );
//             res.json(response.data);
//         }
//         catch (err) {
//             console.error(err);
//             res.status(500).json({
//                 success: false,
//                 message: "Failed to reply."
//             });
//         }
//     }
// );

// /* ===============================
// DELETE COMMENT
// =============================== */

// router.post(
//     "/delete",
//     async (req, res) => {
//         try {
//             const response =
//                 await axios.post(
//                     process.env.MAKE_COMMENTS_WEBHOOK,
//                     {
//                         action: "delete_comment",
//                         platform: req.body.platform,
//                         commentId: req.body.commentId
//                     }
//                 );
//             res.json(response.data);
//         }
//         catch (err) {
//             console.error(err);
//             res.status(500).json({
//                 success: false,
//                 message: "Failed to delete comment."
//             });
//         }
//     }
// );
// export default router;