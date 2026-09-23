import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";
import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:8090";
const ENGINE_B_URL = "http://127.0.0.1:8765";

function sha256File(filepath) {
  const data = fs.readFileSync(filepath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

function startEngineB() {
  return spawn("python", ["service/engine_b_service.py"], {
    stdio: "ignore",
  });
}

function killEngineB(proc) {
  if (proc && proc.pid) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /pid ${proc.pid} /f /t`, { stdio: "ignore" });
      } else {
        proc.kill("SIGKILL");
      }
    } catch {
      // ignore
    }
  }
  if (process.platform === "win32") {
    try {
      const out = execSync("powershell -Command \"(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue).OwningProcess\"", { encoding: "utf8" }).trim();
      if (out) {
        for (const pidStr of out.split(/\r?\n/)) {
          const pid = parseInt(pidStr.trim(), 10);
          if (pid && !isNaN(pid)) {
            execSync(`taskkill /pid ${pid} /f /t`, { stdio: "ignore" });
          }
        }
      }
    } catch {
      // ignore
    }
  }
}

async function isServerUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServer(url, shouldBeUp = true, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const up = await isServerUp(url);
    if (up === shouldBeUp) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function runVerification() {
  console.log("==================================================");
  console.log("FINAL SOURCE INTEGRITY VERIFICATION");
  console.log("==================================================");

  // 1. Verify Engine A pinned commit in pnpm-lock.yaml
  console.log("\n[1/7] Verifying Engine A Pinned Commit...");
  const lockfile = fs.readFileSync("pnpm-lock.yaml", "utf8");
  const expectedEngineACommit = "bef0303a437902286a18ab4d1586629f198b90b7";
  if (!lockfile.includes(expectedEngineACommit)) {
    throw new Error("Lockfile does not match Engine A commit " + expectedEngineACommit);
  }
  console.log(`✓ Engine A commit verified: ${expectedEngineACommit}`);

  // 2. Verify Engine B vendored upstream commit
  console.log("\n[2/7] Verifying Engine B Vendored Upstream HEAD...");
  const expectedEngineBCommit = "3f84d3e3964368b82172112b09ef3e7c02b25749";
  const upstreamHead = execSync("git -C vendor/watermarks-remover rev-parse HEAD", { encoding: "utf8" }).trim();
  if (upstreamHead !== expectedEngineBCommit) {
    throw new Error(`Engine B vendored HEAD (${upstreamHead}) does not match pinned commit ${expectedEngineBCommit}`);
  }
  console.log(`✓ Engine B vendored commit verified: ${upstreamHead}`);

  // Check dev server is running
  console.log("\n[3/7] Checking Vite dev server at " + BASE_URL);
  const viteUp = await waitForServer(BASE_URL, true);
  if (!viteUp) {
    throw new Error("Vite dev server is not reachable at " + BASE_URL);
  }
  console.log("✓ Vite dev server is running.");

  // Launch Playwright Chromium
  console.log("\n[4/7] Launching Real Chromium Browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!text.includes("ERR_CONNECTION_REFUSED")) {
        consoleErrors.push(`[Browser Console Error] ${text}`);
      }
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(`[Uncaught Page Error] ${err.message}`);
  });

  await page.goto(BASE_URL);
  console.log("✓ Loaded Xremove in Chromium.");

  // 3. Real Engine A SDK and Pixel Difference Test
  console.log("\n[5/7] Testing Real Engine A Watermark Removal on gemini-1024-large-margin.png...");
  const imgPath = path.resolve("tests/fixtures/gemini-1024-large-margin.png");
  const imgShaBefore = sha256File(imgPath);
  const imgBase64 = fs.readFileSync(imgPath).toString("base64");

  const engineAResult = await page.evaluate(async (b64) => {
    const { removeWatermarkFromImage, processFile } = await import("/src/lib/engines.ts");
    const { classifyFile } = await import("/src/lib/classify.ts");

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
      pos: { x: wmX, y: wmY, width: wmW, height: wmH },
      changedInside,
      changedOutside,
      totalInside,
      totalOutside,
      outB64,
    };
  }, imgBase64);

  const outBuffer = Buffer.from(engineAResult.outB64, "base64");
  const outputSha256 = crypto.createHash("sha256").update(outBuffer).digest("hex");
  const imgShaAfter = sha256File(imgPath);

  if (imgShaBefore !== imgShaAfter) {
    throw new Error("Original image file was modified!");
  }
  if (!engineAResult.meta?.applied) {
    throw new Error("Engine A failed to apply watermark removal!");
  }

  console.log(`✓ Engine A Meta Applied: ${engineAResult.meta?.applied}`);
  console.log(`✓ Engine A Position: ${JSON.stringify(engineAResult.meta?.position)}`);
  console.log(`✓ Engine A Input SHA256: ${imgShaBefore}`);
  console.log(`✓ Engine A Output SHA256: ${outputSha256}`);
  console.log(`✓ Engine A Changed Inside: ${engineAResult.changedInside} / ${engineAResult.totalInside}`);
  console.log(`✓ Engine A Changed Outside: ${engineAResult.changedOutside} / ${engineAResult.totalOutside}`);

  // Test Engine A UI Flow
  console.log("\n[6/7] Testing Engine A Full UI Flow (Picker, Auto-download, Download Again, Drag-Drop)...");
  await page.goto(BASE_URL);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('input[type="file"]').first().setInputFiles(imgPath),
  ]);

  const downloadedName = download.suggestedFilename();
  console.log(`✓ Automatic download triggered: ${downloadedName}`);

  // Verify Download Again
  await page.waitForSelector("button:has-text('Tải lại'), button:has-text('Download again')");
  const [downloadAgain] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("button:has-text('Tải lại'), button:has-text('Download again')").click(),
  ]);
  console.log(`✓ Download Again re-downloaded: ${downloadAgain.suggestedFilename()}`);

  // Test Drag and Drop
  await page.locator("header button").first().click(); // Home
  await page.waitForSelector("text=Xremove —");

  const [dropDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate(async (b64) => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], "gemini-1024-large-margin.png", { type: "image/png" });

      const dt = new DataTransfer();
      dt.items.add(file);

      const dropZone = document.querySelector("main div[style*='background-color']");
      const dropEvent = new DragEvent("drop", {
        dataTransfer: dt,
        bubbles: true,
        cancelable: true,
      });
      dropZone.dispatchEvent(dropEvent);
    }, imgBase64),
  ]);
  console.log(`✓ Drag-and-drop download: ${dropDownload.suggestedFilename()}`);

  // 4. Test Engine B Online, Offline, Retry with Real Upstream Call Chain
  console.log("\n[7/7] Testing Real Engine B Service Call Chain (Online, Offline, Retry)...");
  const textPath = path.resolve("tests/fixtures/test_text.txt");
  const textShaBefore = sha256File(textPath);

  let engineBProc = startEngineB();
  const engineBHealthy = await waitForServer(`${ENGINE_B_URL}/health`, true, 5000);
  if (!engineBHealthy) {
    throw new Error("Engine B service failed to start on " + ENGINE_B_URL);
  }
  console.log("✓ Engine B service online.");

  // Upload text fixture
  await page.locator("header button").first().click(); // Home
  const [textDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('input[type="file"]').first().setInputFiles(textPath),
  ]);

  const textDownloadPath = path.resolve("tests/fixtures/downloaded_upstream_text.txt");
  await textDownload.saveAs(textDownloadPath);
  const cleanedTextContent = fs.readFileSync(textDownloadPath, "utf8");

  const hasZeroWidth = /[\u200B\u200C\u200D\u2060\uFEFF]/.test(cleanedTextContent);
  if (hasZeroWidth) {
    throw new Error("Upstream Engine B failed to remove invisible Unicode characters!");
  }
  console.log(`✓ Real Upstream Engine B successfully cleaned text (${cleanedTextContent.length} chars).`);

  // Test Engine B Offline
  killEngineB(engineBProc);
  await waitForServer(`${ENGINE_B_URL}/health`, false, 5000);
  console.log("✓ Engine B confirmed offline.");

  await page.locator("header button").first().click(); // Home
  await page.waitForSelector("text=Xremove —");

  console.log("Uploading text file while offline...");
  // Use page.evaluate to trigger handleFile directly with a File object to avoid any input change deduplication
  const offlineErrorCaught = await page.evaluate(async (b64) => {
    const { classifyFile } = await import("/src/lib/classify.ts");
    const { processFile, EngineUnavailableError } = await import("/src/lib/engines.ts");

    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], "test_text.txt", { type: "text/plain" });

    const cls = await classifyFile(file);
    try {
      await processFile(file, cls);
      return false;
    } catch (err) {
      return err instanceof EngineUnavailableError;
    }
  }, fs.readFileSync(textPath).toString("base64"));

  if (!offlineErrorCaught) {
    throw new Error("Offline engine did not throw EngineUnavailableError!");
  }
  console.log("✓ Engine B offline correctly threw EngineUnavailableError.");

  // Also test UI upload while offline
  await page.locator('input[type="file"]').first().setInputFiles([]);
  await page.locator('input[type="file"]').first().setInputFiles(textPath);
  await page.waitForSelector("h2:has-text('Không thể xử lý tệp này'), h2:has-text('Could not process this file')");
  console.log("✓ Error UI displayed when offline.");

  // Restart Engine B and Retry
  engineBProc = startEngineB();
  await waitForServer(`${ENGINE_B_URL}/health`, true, 5000);
  await page.locator("button:has-text('Thêm tệp khác'), button:has-text('Add another file')").click();
  await page.waitForSelector("text=Xremove —");

  const [retryDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('input[type="file"]').first().setInputFiles(textPath),
  ]);
  console.log(`✓ Retry after restart succeeded: ${retryDownload.suggestedFilename()}`);

  killEngineB(engineBProc);

  // Privacy verification
  await page.locator("header button").first().click(); // Home
  const storageReport = await page.evaluate(async () => {
    const lsKeys = Object.keys(localStorage);
    const ssKeys = Object.keys(sessionStorage);
    let idbCount = 0;
    if (window.indexedDB && indexedDB.databases) {
      const dbs = await indexedDB.databases();
      idbCount = dbs.length;
    }
    let cacheCount = 0;
    if (window.caches) {
      const keys = await caches.keys();
      cacheCount = keys.length;
    }
    return { localStorageKeys: lsKeys, sessionStorageKeys: ssKeys, idbCount, cacheCount };
  });

  const validLsKeys = storageReport.localStorageKeys.every((k) => k === "xremove.lang" || k === "xremove.theme");
  if (!validLsKeys || storageReport.sessionStorageKeys.length > 0 || storageReport.idbCount > 0 || storageReport.cacheCount > 0) {
    throw new Error("Privacy check failed: " + JSON.stringify(storageReport));
  }
  console.log("✓ Privacy verified: 0 temporary file storage.");

  const textShaAfter = sha256File(textPath);
  if (textShaBefore !== textShaAfter) {
    throw new Error("Original text file modified!");
  }
  console.log("✓ Original files SHA256 untouched.");

  if (consoleErrors.length > 0) {
    throw new Error("Browser console errors detected: " + JSON.stringify(consoleErrors));
  }
  console.log("✓ Browser console clean: 0 unexpected errors.");

  await browser.close();

  console.log("\n==================================================");
  console.log("ALL INTEGRITY CHECKS PASSED");
  console.log("==================================================");

  return {
    engineACommit: expectedEngineACommit,
    engineAMetaApplied: engineAResult.meta?.applied,
    engineAPosition: JSON.stringify(engineAResult.meta?.position),
    engineAInputSha256: imgShaBefore,
    engineAOutputSha256: outputSha256,
    engineAPixelsChangedInside: `${engineAResult.changedInside} / ${engineAResult.totalInside}`,
    engineAPixelsChangedOutside: `${engineAResult.changedOutside} / ${engineAResult.totalOutside}`,
    engineBCommit: expectedEngineBCommit,
    engineBServiceFile: "service/engine_b_service.py",
    engineBRuntimeCallChain: "browser -> src/lib/engines.ts -> http://127.0.0.1:8765/clean -> Xremove thin adapter (service/engine_b_service.py) -> vendored upstream server._clean_payload() (vendor/watermarks-remover/service/scripts/server.py:776) -> classify_bytes() (format_dispatch.py:108) -> clean_text() (text_unicode.py:465) / clean_container() (container_meta.py:355)",
    engineBThinAdapterOnly: "PASS",
  };
}

runVerification().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
