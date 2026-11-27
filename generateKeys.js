import { generateKeyPairSync } from "crypto";
import fs from "fs";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: {
    type: "pkcs1",
    format: "pem",
  },
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
});

fs.writeFileSync("private.key", privateKey);
fs.writeFileSync("public.pem", publicKey);

console.log("✅ Keys generated successfully!");