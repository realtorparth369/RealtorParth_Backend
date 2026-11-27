import sharp from "sharp";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===============================
// ENV
// ===============================

dotenv.config();

// ===============================
// GEMINI
// ===============================

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Current image generation model
const MODEL =
  process.env.GEMINI_IMAGE_MODEL ||
  "gemini-nano-banana-2.1";

// ===============================
// GEMINI IMAGE GENERATOR
// ===============================

async function generateGeminiImage(topic) {
  const prompt = `
Create a professional Canadian real estate marketing image.

Topic:
${topic}

Requirements:

- Ultra-realistic professional real estate photography
- Luxury Canadian real estate aesthetic
- Calgary, Alberta style residential architecture
- Modern and premium appearance
- Bright natural lighting
- Clean professional composition
- High-end realtor advertising quality
- Suitable for social media
- Attractive and visually engaging
- Realistic materials, textures and architectural details
- Professional photography
- No humans
- No animals
- No people
- No text
- No logos
- No watermark
- Do not include signs or readable writing
- Focus entirely on the property/architecture
- Photorealistic result
`;

  try {
    console.log(
      `🎨 Generating Gemini image using ${MODEL}...`
    );

    const response =
      await ai.models.generateContent({
        model: MODEL,

        contents: prompt,

        config: {
          responseModalities: ["IMAGE"],

          responseFormat: {
            image: {
              aspectRatio: "4:5",
              imageSize: "2K",
            },
          },
        },
      });

    const candidate =
      response?.candidates?.[0];

    if (!candidate) {
      throw new Error(
        "Gemini returned no candidates"
      );
    }

    const parts =
      candidate?.content?.parts || [];

    for (const part of parts) {
      // Skip thought content if returned
      if (part?.thought) {
        continue;
      }

      if (
        part?.inlineData &&
        part.inlineData.data
      ) {
        console.log(
          "✅ Gemini image generated successfully"
        );

        return Buffer.from(
          part.inlineData.data,
          "base64"
        );
      }
    }

    throw new Error(
      "Gemini returned no image data"
    );
  } catch (err) {
    console.error(
      "❌ GEMINI IMAGE ERROR:"
    );

    console.error(
      err?.response?.data ||
        err?.message ||
        err
    );

    throw err;
  }
}

// ===============================
// IMAGE GENERATOR
// ===============================

export async function generateImage(topic) {
  const fileName =
    `social-${Date.now()}.jpg`;

  const outputDir =
    "/home/dhruvit/.openclaw/workspace/skills/blog_manager/images";

  // ===============================
  // CREATE OUTPUT DIRECTORY
  // ===============================

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, {
      recursive: true,
    });
  }

  const outputPath =
    path.join(
      outputDir,
      fileName
    );

  // ===============================
  // GENERATE AI IMAGE
  // ===============================

  const aiImageBuffer =
    await generateGeminiImage(topic);

  // =====================================================
  // FOOTER BACKGROUND
  // =====================================================

  const footerBgSvg = `
<svg width="1080" height="1350">

    <rect
        x="0"
        y="1160"
        width="280"
        height="190"
        fill="#ffffff"
    />

    <rect
        x="280"
        y="1160"
        width="800"
        height="190"
        fill="#4b2b2b"
    />

</svg>
`;

  // =====================================================
  // FOOTER TEXT
  // =====================================================

  const footerTextSvg = `
<svg width="1080" height="1350">

<style>

.name {
    fill:#fff;
    font:800 38px Arial,Helvetica,sans-serif;
}

.role {
    fill:#fff;
    font:400 30px Arial,Helvetica,sans-serif;
}

.phone {
    fill:#fff;
    font:500 38px Arial,Helvetica,sans-serif;
}

</style>

<text
    x="315"
    y="1220"
    class="name"
>
    PARTH BRAHMBHATT
</text>

<text
    x="450"
    y="1275"
    class="role"
>
    REALTOR
</text>

<text
    x="340"
    y="1330"
    class="phone"
>
    (403) 439-1555
</text>

</svg>
`;

  // =====================================================
  // AGENT
  // =====================================================

  const agentPath =
    path.join(
      __dirname,
      "assets",
      "realtorparths_pdf",
      "agent12.png"
    );

  const agentBuffer =
    await sharp(agentPath)
      .trim()
      .resize({
        height: 400,
        fit: "inside",
      })
      .png()
      .toBuffer();

  // =====================================================
  // BROKERAGE LOGO
  // =====================================================

  const logoPath =
    path.join(
      __dirname,
      "assets",
      "realtorparths_pdf",
      "diamond_realty.jpeg"
    );

  const logoBuffer =
    await sharp(logoPath)
      .resize({
        width: 280,
        height: 190,
        fit: "fill",
      })
      .png()
      .toBuffer();

  // =====================================================
  // FINAL IMAGE
  // =====================================================

  const buffer =
    await sharp(aiImageBuffer)

      // Keep existing RealtorParth social-post size
      .resize(1080, 1350, {
        fit: "cover",
      })

      .composite([
        // ===============================
        // FOOTER BACKGROUND
        // ===============================

        {
          input:
            Buffer.from(
              footerBgSvg
            ),

          top: 0,
          left: 0,
        },

        // ===============================
        // FOOTER TEXT
        // ===============================

        {
          input:
            Buffer.from(
              footerTextSvg
            ),

          top: 0,
          left: 0,
        },

        // ===============================
        // BROKERAGE LOGO
        // ===============================

        {
          input: logoBuffer,

          top: 1160,
          left: 0,
        },

        // ===============================
        // AGENT
        // ===============================

        {
          input: agentBuffer,

          top: 960,
          left: 740,
        },
      ])

      .jpeg({
        quality: 95,
        mozjpeg: true,
      })

      .toBuffer();

  // ===============================
  // SAVE
  // ===============================

  await fs.promises.writeFile(
    outputPath,
    buffer
  );

  console.log(
    `✅ Social image saved: ${outputPath}`
  );

  return {
    imageURL:
      `https://realtorparth.ca/social-images/${fileName}`,

    outputPath,
  };
}






































// import sharp from "sharp";
// import fs from "fs";
// import path from "path";
// import dotenv from "dotenv";
// import axios from "axios";
// import { GoogleGenAI } from "@google/genai";
// import { fileURLToPath } from "url";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // ===============================
// // ENV
// // ===============================
// dotenv.config();
// // ===============================
// // GEMINI
// // ===============================
// const ai = new GoogleGenAI({
//   apiKey: process.env.GEMINI_API_KEY
// });
// const MODEL = "gemini-2.5-flash";


// async function generateGeminiImage(topic) {
//   const prompt = `
// Professional Canadian real estate marketing image.

// Topic:
// ${topic}

// Requirements:
// - Ultra realistic
// - Luxury real estate photography
// - Calgary Alberta style homes
// - Bright natural lighting
// - Social media quality
// - Modern architecture
// - Professional realtor advertisement
// - No any human, animal
// - No text
// - No watermark
// - High quality
// `;
//   try {
//     const response =
//       await ai.models.generateContent({
//         model:
//           "gemini-2.5-flash-image",
//         contents: prompt
//       });

//     const candidate = response?.candidates?.[0];
//     if (!candidate) {
//       throw new Error(
//         "No candidates returned"
//       );
//     }
//     const parts = candidate?.content?.parts || [];
//     for (const part of parts) {
//       if (
//         part.inlineData &&
//         part.inlineData.data
//       ) {
//         return Buffer.from(
//           part.inlineData.data,
//           "base64"
//         );
//       }
//     }
//     throw new Error(
//       "Gemini returned no image data"
//     );
//   } catch (err) {
//     console.error("❌ GEMINI IMAGE ERROR:");
//     console.error(
//       err?.response?.data ||
//       err?.message ||
//       err
//     );
//     throw err;
//   }
// }

// // ===============================
// // IMAGE GENERATOR
// // ===============================
// export async function generateImage(topic) {
//   const fileName = `social-${Date.now()}.jpg`;
//   const outputDir = "/home/dhruvit/.openclaw/workspace/skills/blog_manager/images";
//   if (!fs.existsSync(outputDir)) {
//     fs.mkdirSync(outputDir, {
//       recursive: true
//     });
//   }
//   const outputPath = path.join(outputDir, fileName);
//   const aiImageBuffer = await generateGeminiImage(topic);
//   // ===============================
//   // SVG OVERLAY
//   // ===============================
//   // =====================================================
//   // FOOTER BACKGROUND
//   // =====================================================

//   const footerBgSvg = `
// <svg width="1080" height="1350">
//     <rect x="0" y="1160" width="280" height="190" fill="#ffffff"/>
//     <rect x="280" y="1160" width="800" height="190" fill="#4b2b2b"/>
// </svg>
// `;

//   // =====================================================
//   // FOOTER TEXT
//   // =====================================================

//   const footerTextSvg = `
// <svg width="1080" height="1350">
// <style>
// .name{fill:#fff;font:800 38px Arial,Helvetica,sans-serif;}
// .role{fill:#fff;font:400 30px Arial,Helvetica,sans-serif;}
// .phone{fill:#fff;font:500 38px Arial,Helvetica,sans-serif;}
// </style>

// <text x="315" y="1220" class="name">PARTH BRAHMBHATT</text>
// <text x="450" y="1275" class="role">REALTOR</text>
// <text x="340" y="1330" class="phone">(403) 439-1555</text>

// </svg>
// `;

//   // =====================================================
//   // AGENT
//   // =====================================================

//   const agentPath = path.join(
//     __dirname,
//     "assets/realtorparths_pdf",
//     "agent12.png"
//   );

//   const agentBuffer =
//     await sharp(agentPath)
//       .trim()
//       .resize({
//         height: 400,
//         fit: "inside"
//       })
//       .png()
//       .toBuffer();

//   // =====================================================
//   // LOGO
//   // =====================================================

//   const logoPath = path.join(
//     __dirname,
//     "assets/realtorparths_pdf",
//     "diamond_realty.jpeg"
//   );

//   const logoBuffer =
//     await sharp(logoPath)
//       .resize({
//         width: 280,
//         height: 190,
//         fit: "fill"
//       })
//       .png()
//       .toBuffer();

//   // =====================================================
//   // FINAL IMAGE
//   // =====================================================

//   const buffer =
//     await sharp(aiImageBuffer)
//       .resize(1080, 1350, {
//         fit: "cover"
//       })
//       .composite([

//         // Footer Background
//         {
//           input: Buffer.from(footerBgSvg),
//           top: 0,
//           left: 0
//         },

//         // Footer Text
//         {
//           input: Buffer.from(footerTextSvg),
//           top: 0,
//           left: 0
//         },

//         // Logo
//         {
//           input: logoBuffer,
//           top: 1160,
//           left: 0
//         },

//         // Agent
//         {
//           input: agentBuffer,
//           top: 960,
//           left: 740
//         }

//       ])
//       .jpeg({
//         quality: 95,
//         mozjpeg: true
//       })
//       .toBuffer();
//   // ===============================
//   // SAVE
//   // ===============================
//   await fs.promises.writeFile(
//     outputPath,
//     buffer
//   );
//   return {
//     imageURL: `https://realtorparth.ca/social-images/${fileName}`,
//     outputPath,
//   };
// }






































// import sharp from "sharp";
// import fs from "fs";
// import path from "path";
// import dotenv from "dotenv";
// import axios from "axios";
// import { GoogleGenAI } from "@google/genai";
// import { fileURLToPath } from "url";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // ===============================
// // ENV
// // ===============================
// dotenv.config();
// // ===============================
// // GEMINI
// // ===============================
// const ai = new GoogleGenAI({
//   apiKey: process.env.GEMINI_API_KEY
// });
// const MODEL = "gemini-2.5-flash";


// async function generateGeminiImage(topic) {
//   const prompt = `
// Professional Canadian real estate marketing image.

// Topic:
// ${topic}

// Requirements:
// - Ultra realistic
// - Luxury real estate photography
// - Calgary Alberta style homes
// - Bright natural lighting
// - Social media quality
// - Modern architecture
// - Professional realtor advertisement
// - No any human, animal
// - No text
// - No watermark
// - High quality
// `;
//   try {
//     const response =
//       await ai.models.generateContent({
//         model:
//           "gemini-2.5-flash-image",
//         contents: prompt
//       });

//     const candidate = response?.candidates?.[0];
//     if (!candidate) {
//       throw new Error(
//         "No candidates returned"
//       );
//     }
//     const parts = candidate?.content?.parts || [];
//     for (const part of parts) {
//       if (
//         part.inlineData &&
//         part.inlineData.data
//       ) {
//         return Buffer.from(
//           part.inlineData.data,
//           "base64"
//         );
//       }
//     }
//     throw new Error(
//       "Gemini returned no image data"
//     );
//   } catch (err) {
//     console.error("❌ GEMINI IMAGE ERROR:");
//     console.error(
//       err?.response?.data ||
//       err?.message ||
//       err
//     );
//     throw err;
//   }
// }

// // ===============================
// // IMAGE GENERATOR
// // ===============================
// export async function generateImage(topic) {
//   const fileName = `social-${Date.now()}.jpg`;
//   const outputDir = "/home/dhruvit/.openclaw/workspace/skills/blog_manager/images";
//   if (!fs.existsSync(outputDir)) {
//     fs.mkdirSync(outputDir, {
//       recursive: true
//     });
//   }
//   const outputPath = path.join(outputDir, fileName);
// const aiImageBuffer = await generateGeminiImage(topic);
//   // ===============================
//   // SVG OVERLAY
//   // ===============================
//  // =====================================================
// // FOOTER BACKGROUND
// // =====================================================

// const footerBgSvg = `
// <svg width="1080" height="1350">
//     <rect x="0" y="1160" width="280" height="190" fill="#ffffff"/>
//     <rect x="280" y="1160" width="800" height="190" fill="#4b2b2b"/>
// </svg>
// `;

// // =====================================================
// // FOOTER TEXT
// // =====================================================

// const footerTextSvg = `
// <svg width="1080" height="1350">
// <style>
// .name{fill:#fff;font:800 38px Arial,Helvetica,sans-serif;}
// .role{fill:#fff;font:400 30px Arial,Helvetica,sans-serif;}
// .phone{fill:#fff;font:500 38px Arial,Helvetica,sans-serif;}
// </style>

// <text x="315" y="1220" class="name">PARTH BRAHMBHATT</text>
// <text x="450" y="1275" class="role">REALTOR</text>
// <text x="340" y="1330" class="phone">(403) 439-1555</text>

// </svg>
// `;

// // =====================================================
// // AGENT
// // =====================================================

// const agentPath = path.join(
//     __dirname,
//     "assets/realtorparths_pdf",
//     "agent12.png"
// );

// const agentBuffer =
//     await sharp(agentPath)
//         .trim()
//         .resize({
//             height: 400,
//             fit: "inside"
//         })
//         .png()
//         .toBuffer();

// // =====================================================
// // LOGO
// // =====================================================

// const logoPath = path.join(
//     __dirname,
//     "assets/realtorparths_pdf",
//     "diamond_realty.jpeg"
// );

// const logoBuffer =
//     await sharp(logoPath)
//         .resize({
//             width: 280,
//             height: 190,
//             fit: "fill"
//         })
//         .png()
//         .toBuffer();

// // =====================================================
// // FINAL IMAGE
// // =====================================================

// const buffer =
//     await sharp(aiImageBuffer)
//         .resize(1080, 1350, {
//             fit: "cover"
//         })
//         .composite([

//             // Footer Background
//             {
//                 input: Buffer.from(footerBgSvg),
//                 top: 0,
//                 left: 0
//             },

//             // Footer Text
//             {
//                 input: Buffer.from(footerTextSvg),
//                 top: 0,
//                 left: 0
//             },

//             // Logo
//             {
//                 input: logoBuffer,
//                 top: 1160,
//                 left: 0
//             },

//             // Agent
//             {
//                 input: agentBuffer,
//                 top: 960,
//                 left: 740
//             }

//         ])
//         .jpeg({
//             quality: 95,
//             mozjpeg: true
//         })
//         .toBuffer();
//   // ===============================
//   // SAVE
//   // ===============================
//   await fs.promises.writeFile(
//     outputPath,
//     buffer
//   );
//   return {
//     imageURL: `https://realtorparth.ca/social-images/${fileName}`,
//     outputPath,
//   };
// }