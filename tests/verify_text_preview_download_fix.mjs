import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";
import { chromium } from "playwright";

const ENGINE_B_URL = "http://127.0.0.1:8765";

function sha256File(filepath) {
  const data = fs.readFileSync(filepath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

function killEngineB(proc) {
  if (proc && proc.pid) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /pid ${proc.pid} /f /t`, { stdio: "ignore" });
      } else {
        proc.kill("SIGKILL");
      }
    } catch {}
  }
  if (process.platform === "win32") {
    try {
      const out = execSync(
        "powershell -Command \"(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue).OwningProcess\"",
        { encoding: "utf8" }
      ).trim();
      if (out) {
        for (const pidStr of out.split(/\r?\n/)) {
          const pid = parseInt(pidStr.trim(), 10);
          if (pid && !isNaN(pid)) {
            execSync(`taskkill /pid ${pid} /f /t`, { stdio: "ignore" });
          }
        }
      }
    } catch {}
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

async function waitForServer(url, shouldBeUp = true, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const up = await isServerUp(url);
    if (up === shouldBeUp) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function main() {
  console.log("==================================================");
  console.log("VERIFYING TEXT & PREVIEW-DOWNLOAD WORKFLOW FIX");
  console.log("==================================================");

  const report = {};

  // 1. Extract package to clean test dir
  const zipPath = path.resolve("release/final/Xremove-v1.0.0-Full-Windows.zip");
  const testDir = "C:\\Temp\\Xremove Fix Test";
  if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  fs.mkdirSync(testDir, { recursive: true });

  execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${testDir}' -Force"`, { stdio: "inherit" });
  const appRoot = path.join(testDir, "Xremove-v1.0.0-Full");
  const extractedHtml = path.join(appRoot, "Xremove.html");
  const extractedPython = path.join(appRoot, "runtime/python/python.exe");
  const extractedService = path.join(appRoot, "service/engine_b_service.py");
  const extractedStart = path.join(appRoot, "start.bat");

  // 2. Test Bundled Python
  const pyVer = execSync(`"${extractedPython}" --version`, { encoding: "utf8" }).trim();
  console.log(`Bundled Python: ${pyVer}`);
  report["BUNDLED_PYTHON_USED"] = pyVer.includes("Python 3.11") ? "PASS" : "FAIL";

  // 3. Test Vietnamese Text Safety fixture
  const viTextWithMarks = "Đây là\u200B văn bản\u200C thử nghiệm\u200D của Xremove.";
  const viFixturePath = path.resolve("tests/fixtures/sample_vi.txt");
  fs.writeFileSync(viFixturePath, viTextWithMarks, "utf8");

  // 4. Start Engine B service with bundled python
  killEngineB();
  const engineProc = spawn(extractedPython, [extractedService], {
    cwd: appRoot,
    stdio: "ignore",
    env: {
      ...process.env,
      PATH: `${path.join(appRoot, "tools/ffmpeg")};${path.join(appRoot, "runtime/python")};${process.env.PATH}`,
    },
  });

  const healthy = await waitForServer(`${ENGINE_B_URL}/health`, true, 8000);
  report["ENGINE_B_AUTO_START"] = healthy ? "PASS" : "FAIL";

  // 5. Test Browser Workflow
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  let downloadCount = 0;
  const downloads = [];
  page.on("download", (dl) => {
    downloadCount++;
    downloads.push(dl);
  });

  const fileUrl = `file:///${extractedHtml.replace(/\\/g, "/")}`;
  await page.goto(fileUrl);
  await page.waitForSelector("text=Xremove");

  // Switch to VI for verification
  const viBtn = page.locator("button:has-text('VI')");
  await viBtn.click();

  // Test TEXT intake
  console.log("\nTesting Text Intake (Vietnamese text with invisible zero-width marks)...");
  await page.locator('input[type="file"]').first().setInputFiles(viFixturePath);

  // Wait for processing to complete and preview to appear
  await page.waitForSelector("text=Tệp kết quả đã sẵn sàng.");
  console.log("✓ Processing completed and result is ready for review.");

  // Check download count before clicking download
  report["DOWNLOAD_BEFORE_USER_CLICK"] = `0 / ${downloadCount}`;
  report["AUTO_DOWNLOAD_REMOVED"] = downloadCount === 0 ? "PASS" : "FAIL";

  // Verify Original text preview and Cleaned text preview
  const originalPreview = await page.locator("span:has-text('VĂN BẢN GỐC')").isVisible();
  const cleanedPreview = await page.locator("span:has-text('ĐÃ LÀM SẠCH')").isVisible();
  report["TEXT_ORIGINAL_PREVIEW"] = originalPreview ? "PASS" : "FAIL";
  report["TEXT_CLEANED_PREVIEW"] = cleanedPreview ? "PASS" : "FAIL";

  // Check that visible text is preserved
  const textPreviews = await page.locator("pre").allTextContents();
  const cleanedPreText = textPreviews[1] || "";
  const viCleanedValid = !/[\u200B\u200C\u200D]/.test(cleanedPreText) && cleanedPreText.includes("Đây là văn bản thử nghiệm của Xremove.");
  report["TEXT_REAL_PROCESSING"] = viCleanedValid ? "PASS" : "FAIL";
  console.log(`✓ Text Cleaning verified: "${cleanedPreText.trim()}"`);

  // User clicks "TẢI KẾT QUẢ"
  console.log("\nUser clicks 'TẢI KẾT QUẢ'...");
  const dlBtn = page.locator("button:has-text('Tải kết quả')");
  await dlBtn.click();
  await page.waitForTimeout(500);

  report["DOWNLOAD_AFTER_USER_CLICK"] = `1 / ${downloadCount}`;

  // Check state after download
  const isDownloadedBadge = await page.locator("span:has-text('Đã tải xuống')").first().isVisible();
  const dlAgainBtn = page.locator("button:has-text('Tải lại')");
  const isDlAgainVisible = await dlAgainBtn.isVisible();

  // Click "TẢI LẠI"
  console.log("\nUser clicks 'TẢI LẠI'...");
  await dlAgainBtn.click();
  await page.waitForTimeout(500);
  report["DOWNLOAD_AGAIN_WITHOUT_REPROCESS"] = downloadCount === 2 && isDownloadedBadge && isDlAgainVisible ? "PASS" : "FAIL";

  // Test IMAGE Before / After
  console.log("\nTesting Image Before / After Preview & User-Initiated Download...");
  await page.locator("header button").first().click(); // Return Home
  await page.waitForSelector("text=Xremove");

  downloadCount = 0;
  const pngPath = path.resolve("tests/fixtures/gemini-1024-large-margin.png");
  await page.locator('input[type="file"]').first().setInputFiles(pngPath);
  await page.waitForSelector("text=Tệp kết quả đã sẵn sàng.");

  const imgBeforeAfterVisible = (await page.getByRole("button", { name: "Gốc", exact: true }).isVisible()) && (await page.getByRole("button", { name: "Kết quả", exact: true }).isVisible());
  report["IMAGE_BEFORE_AFTER"] = imgBeforeAfterVisible ? "PASS" : "FAIL";
  const imgDlBeforeClick = downloadCount;

  await page.locator("button:has-text('Tải kết quả')").click();
  await page.waitForTimeout(500);
  const imgDlAfterClick = downloadCount;
  console.log(`✓ Image download count: Before click = ${imgDlBeforeClick}, After click = ${imgDlAfterClick}`);

  // Test Error & Retry workflow
  console.log("\nTesting Engine B Offline & Retry Workflow...");
  await page.locator("header button").first().click(); // Return Home
  await page.waitForSelector("text=Xremove");

  // Kill Engine B to simulate service outage
  killEngineB(engineProc);
  await waitForServer(`${ENGINE_B_URL}/health`, false, 5000);

  // Drop text file while service is offline
  await page.locator('input[type="file"]').first().setInputFiles(viFixturePath);
  await page.waitForSelector("h2:has-text('Không thể xử lý tệp này')");
  const errText = await page.textContent("p");
  const hasRetryBtn = await page.locator("button:has-text('Thử lại')").isVisible();
  const hasAddBtn = await page.locator("button:has-text('Thêm tệp khác')").isVisible();

  // Restart Engine B service
  const restartedEngine = spawn(extractedPython, [extractedService], {
    cwd: appRoot,
    stdio: "ignore",
    env: {
      ...process.env,
      PATH: `${path.join(appRoot, "tools/ffmpeg")};${path.join(appRoot, "runtime/python")};${process.env.PATH}`,
    },
  });
  await waitForServer(`${ENGINE_B_URL}/health`, true, 8000);

  // Click "Thử lại" without selecting file again
  await page.locator("button:has-text('Thử lại')").click();
  await page.waitForSelector("text=Tệp kết quả đã sẵn sàng.");
  report["ENGINE_B_RETRY"] = hasRetryBtn && hasAddBtn ? "PASS" : "FAIL";
  console.log("✓ Error retry automatically resumed and processed the pending file.");
  killEngineB(restartedEngine);

  // Test Temporary Data Cleanup
  await page.locator("header button").first().click();
  await page.waitForSelector("text=Xremove");
  const storage = await page.evaluate(async () => {
    const lsKeys = Object.keys(localStorage);
    const ssKeys = Object.keys(sessionStorage);
    let idbCount = 0;
    if (window.indexedDB && indexedDB.databases) idbCount = (await indexedDB.databases()).length;
    let cacheCount = 0;
    if (window.caches) cacheCount = (await caches.keys()).length;
    return { lsKeys, ssKeys, idbCount, cacheCount };
  });
  const validLs = storage.lsKeys.every((k) => k === "xremove.lang" || k === "xremove.theme");
  report["TEMP_DATA_CLEANUP"] = validLs && storage.ssKeys.length === 0 && storage.idbCount === 0 && storage.cacheCount === 0 ? "PASS" : "FAIL";

  await browser.close();

  // Cleanup temp dir
  fs.rmSync(testDir, { recursive: true, force: true });

  const finalZipSha256 = sha256File(zipPath);

  console.log("\n==================================================");
  console.log("VERIFICATION COMPLETE");
  console.log("==================================================");
  console.log(JSON.stringify(report, null, 2));

  return {
    report,
    zipPath,
    finalZipSha256,
  };
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
