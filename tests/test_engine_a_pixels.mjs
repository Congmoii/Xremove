import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:8090";

function sha256File(filepath) {
  const data = fs.readFileSync(filepath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function runPixelTest() {
  const imgPath = path.resolve("tests/fixtures/gemini-1024-large-margin.png");
  const imgShaBefore = sha256File(imgPath);
  const imgBase64 = fs.readFileSync(imgPath).toString("base64");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(BASE_URL);

  const result = await page.evaluate(async (b64) => {
    const { removeWatermarkFromImage } = await import("/src/lib/engines.ts");

    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const file = new File([bytes], "gemini-1024-large-margin.png", { type: "image/png" });
    const url = URL.createObjectURL(file);

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    const origCanvas = document.createElement("canvas");
    origCanvas.width = img.width;
    origCanvas.height = img.height;
    const origCtx = origCanvas.getContext("2d", { willReadFrequently: true });
    origCtx.drawImage(img, 0, 0);
    const origImageData = origCtx.getImageData(0, 0, img.width, img.height);

    const sdkRes = await removeWatermarkFromImage(img);
    const outCanvas = sdkRes.canvas;
    const meta = sdkRes.meta || outCanvas.__watermarkMeta || null;

    const outCtx = outCanvas.getContext("2d", { willReadFrequently: true });
    const outImageData = outCtx.getImageData(0, 0, img.width, img.height);

    // Calculate pixel changes inside vs outside watermark region
    const width = img.width;
    const height = img.height;

    const pos = meta?.position || {};
    const wmX = pos.x ?? 0;
    const wmY = pos.y ?? 0;
    const wmW = pos.width ?? (pos.size ?? 96);
    const wmH = pos.height ?? (pos.size ?? 96);

    let changedInside = 0;
    let changedOutside = 0;
    let totalInside = 0;
    let totalOutside = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const isInside = x >= wmX && x < wmX + wmW && y >= wmY && y < wmY + wmH;

        if (isInside) {
          totalInside++;
        } else {
          totalOutside++;
        }

        const diff =
          origImageData.data[i] !== outImageData.data[i] ||
          origImageData.data[i + 1] !== outImageData.data[i + 1] ||
          origImageData.data[i + 2] !== outImageData.data[i + 2] ||
          origImageData.data[i + 3] !== outImageData.data[i + 3];

        if (diff) {
          if (isInside) {
            changedInside++;
          } else {
            changedOutside++;
          }
        }
      }
    }

    // Export output blob and base64
    let outBlob;
    if ("convertToBlob" in outCanvas) {
      outBlob = await outCanvas.convertToBlob({ type: "image/png" });
    } else {
      outBlob = await new Promise((res) => outCanvas.toBlob(res, "image/png"));
    }

    const outBuf = await outBlob.arrayBuffer();
    const bytesOut = new Uint8Array(outBuf);
    let binaryOut = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytesOut.length; i += chunk) {
      binaryOut += String.fromCharCode(...bytesOut.subarray(i, i + chunk));
    }
    const outB64 = btoa(binaryOut);

    URL.revokeObjectURL(url);

    return {
      meta,
      width,
      height,
      pos: { x: wmX, y: wmY, width: wmW, height: wmH },
      changedInside,
      changedOutside,
      totalInside,
      totalOutside,
      outB64,
    };
  }, imgBase64);

  await browser.close();

  const outBuffer = Buffer.from(result.outB64, "base64");
  const outputSha256 = crypto.createHash("sha256").update(outBuffer).digest("hex");
  const imgShaAfter = sha256File(imgPath);

  console.log("=== ENGINE A REAL WATERMARK REMOVAL RESULT ===");
  console.log("Input SHA256:", imgShaBefore);
  console.log("Output SHA256:", outputSha256);
  console.log("Original File Post-test SHA256 (Unchanged):", imgShaAfter === imgShaBefore);
  console.log("Meta applied:", result.meta?.applied);
  console.log("Meta skipReason:", result.meta?.skipReason);
  console.log("Meta position:", JSON.stringify(result.meta?.position));
  console.log("Meta config:", JSON.stringify(result.meta?.config));
  console.log("Meta decisionTier:", result.meta?.decisionTier);
  console.log(`Pixels Changed Inside Region (${result.pos.x},${result.pos.y} ${result.pos.width}x${result.pos.height}):`, result.changedInside, "/", result.totalInside);
  console.log("Pixels Changed Outside Region:", result.changedOutside, "/", result.totalOutside);

  return {
    imgShaBefore,
    outputSha256,
    meta: result.meta,
    changedInside: result.changedInside,
    changedOutside: result.changedOutside,
  };
}

runPixelTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
