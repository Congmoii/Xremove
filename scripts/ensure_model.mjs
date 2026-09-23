import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const destination = path.resolve("models/u2netp.onnx");
const expectedSize = 4_574_861;
const expectedHash = "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8";
const source = "https://huggingface.co/edgetools/u2netp/resolve/main/u2netp.onnx";

function matches(bytes) {
  return bytes.length === expectedSize &&
    crypto.createHash("sha256").update(bytes).digest("hex") === expectedHash;
}

if (fs.existsSync(destination)) {
  if (!matches(fs.readFileSync(destination))) {
    throw new Error(`Existing model failed SHA-256 verification: ${destination}`);
  }
  console.log("Pinned U2NetP model verified locally.");
} else {
  const response = await fetch(source, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > expectedSize) throw new Error("Model download exceeds pinned size");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!matches(bytes)) throw new Error("Downloaded model failed pinned size/SHA-256 verification");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.part-${process.pid}`;
  try {
    fs.writeFileSync(temporary, bytes, { flag: "wx" });
    fs.renameSync(temporary, destination);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  console.log(`Downloaded verified U2NetP model from ${source}`);
}
