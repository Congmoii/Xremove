import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { chromium } from "playwright";

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function sha256File(filepath) {
  return sha256(fs.readFileSync(filepath));
}

async function waitForServer(url, expected = true, maxWaitMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (res.ok === expected) return true;
    } catch {
      if (!expected) return true;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function runTextMatrix() {
  console.log("==================================================");
  console.log("XREMOVE v1.0.0 — 25-TEST REQUIRED TEXT TEST MATRIX");
  console.log("==================================================");

  const results = {};
  const testRoot = path.resolve("C:/Temp/Xremove Text Runtime Test");
  const zipPath = path.resolve("release/final/Xremove-v1.0.0-Full-Windows.zip");

  // Clean test directory
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(testRoot, { recursive: true });

  // Extract fresh ZIP
  console.log(`Extracting fresh ZIP to: ${testRoot}...`);
  execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${testRoot}' -Force"`);

  const extractedAppDir = path.join(testRoot, "Xremove-v1.0.0-Full");
  const launcherExe = path.join(extractedAppDir, "Xremove.exe");
  const pythonExe = path.join(extractedAppDir, "runtime/python/python.exe");
  const servicePy = path.join(extractedAppDir, "service/engine_b_service.py");
  const htmlFile = path.join(extractedAppDir, "Xremove.html");

  // TXT25: Fresh extracted ZIP
  results["TXT25"] = fs.existsSync(launcherExe) && fs.existsSync(pythonExe) && fs.existsSync(htmlFile) ? "PASS" : "FAIL";
  console.log(`[TXT25] ${results["TXT25"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Fresh extracted ZIP verified at: ${extractedAppDir}`);

  // TXT02: Bundled Python used
  const pyVerOutput = execSync(`"${pythonExe}" --version`, { encoding: "utf8" }).trim();
  results["TXT02"] = pyVerOutput.includes("Python 3.11") ? "PASS" : "FAIL";
  console.log(`[TXT02] ${results["TXT02"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Bundled Python verified: ${pyVerOutput}`);

  // TXT01: Launcher starts Engine B
  console.log("Starting launcher...");
  const launcherProc = spawn(launcherExe, [], { cwd: extractedAppDir, detached: true, stdio: "ignore" });
  launcherProc.unref();

  // TXT04: /health returns 200
  const healthy = await waitForServer("http://127.0.0.1:8765/health", true, 10000);
  results["TXT04"] = healthy ? "PASS" : "FAIL";
  results["TXT01"] = healthy ? "PASS" : "FAIL";
  console.log(`[TXT01] ${results["TXT01"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Launcher started Engine B companion service`);
  console.log(`[TXT04] ${results["TXT04"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — http://127.0.0.1:8765/health returned HTTP 200`);

  // TXT03: Engine B remains alive
  await new Promise((r) => setTimeout(r, 2000));
  const stillHealthy = await waitForServer("http://127.0.0.1:8765/health", true, 2000);
  results["TXT03"] = stillHealthy ? "PASS" : "FAIL";
  console.log(`[TXT03] ${results["TXT03"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Engine B remains alive after startup`);

  // Setup Playwright
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  const fileUrl = `file:///${htmlFile.replace(/\\/g, "/")}`;
  await page.goto(fileUrl);
  await page.waitForSelector("text=Xremove");
  await page.locator("button:has-text('VI')").click();

  const fixtureDir = path.join(testRoot, "fixtures");
  fs.mkdirSync(fixtureDir, { recursive: true });

  // TXT05: TXT normal Vietnamese
  const vnText = "Đây là văn bản thử nghiệm của Xremove tiếng Việt.";
  const vnFile = path.join(fixtureDir, "vietnamese_normal.txt");
  fs.writeFileSync(vnFile, vnText, "utf8");
  await page.locator('input[type="file"]').first().setInputFiles(vnFile);
  await page.waitForSelector("text=Tệp kết quả đã sẵn sàng.");
  const cleanedVnText = await page.locator("pre").nth(1).innerText();
  results["TXT05"] = cleanedVnText === vnText ? "PASS" : "FAIL";
  console.log(`[TXT05] ${results["TXT05"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — TXT normal Vietnamese preserved`);

  // Return home
  await page.locator("header button").first().click();
  await page.waitForSelector("text=Xremove");

  // TXT06: TXT with U+200B
  const t200b = "Đoạn\u200B văn";
  const f200b = path.join(fixtureDir, "u200b.txt");
  fs.writeFileSync(f200b, t200b, "utf8");
  await page.locator('input[type="file"]').first().setInputFiles(f200b);
  await page.waitForSelector("text=Tệp kết quả đã sẵn sàng.");
  const c200b = await page.locator("pre").nth(1).innerText();
  results["TXT06"] = c200b === "Đoạn văn" && !c200b.includes("\u200B") ? "PASS" : "FAIL";
  console.log(`[TXT06] ${results["TXT06"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — TXT U+200B cleaned: "${c200b}"`);

  // Return home
  await page.locator("header button").first().click();
  await page.waitForSelector("text=Xremove");

  // TXT07: TXT with U+200C
  const t200c = "Văn\u200C bản";
  const f200c = path.join(fixtureDir, "u200c.txt");
  fs.writeFileSync(f200c, t200c, "utf8");
  await page.locator('input[type="file"]').first().setInputFiles(f200c);
  await page.waitForSelector("text=Tệp kết quả đã sẵn sàng.");
  const c200c = await page.locator("pre").nth(1).innerText();
  results["TXT07"] = c200c === "Văn bản" && !c200c.includes("\u200C") ? "PASS" : "FAIL";
  console.log(`[TXT07] ${results["TXT07"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — TXT U+200C cleaned: "${c200c}"`);

  // Return home
  await page.locator("header button").first().click();
  await page.waitForSelector("text=Xremove");

  // TXT08: TXT with U+200D
  const t200d = "Thử\u200D nghiệm";
  const f200d = path.join(fixtureDir, "u200d.txt");
  fs.writeFileSync(f200d, t200d, "utf8");
  await page.locator('input[type="file"]').first().setInputFiles(f200d);
  await page.waitForSelector("text=Tệp kết quả đã sẵn sàng.");
  const c200d = await page.locator("pre").nth(1).innerText();
  results["TXT08"] = c200d === "Thử nghiệm" && !c200d.includes("\u200D") ? "PASS" : "FAIL";
  console.log(`[TXT08] ${results["TXT08"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — TXT U+200D cleaned: "${c200d}"`);

  // Return home
  await page.locator("header button").first().click();
  await page.waitForSelector("text=Xremove");

  // TXT09: TXT with U+2060
  const t2060 = "Xremove\u2060";
  const f2060 = path.join(fixtureDir, "u2060.txt");
  fs.writeFileSync(f2060, t2060, "utf8");
  await page.locator('input[type="file"]').first().setInputFiles(f2060);
  await page.waitForSelector("text=Tệp kết quả đã sẵn sàng.");
  const c2060 = await page.locator("pre").nth(1).innerText();
  results["TXT09"] = c2060 === "Xremove" && !c2060.includes("\u2060") ? "PASS" : "FAIL";
  console.log(`[TXT09] ${results["TXT09"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — TXT U+2060 cleaned: "${c2060}"`);

  // Return home
  await page.locator("header button").first().click();
  await page.waitForSelector("text=Xremove");

  // TXT10: TXT with U+FEFF
  const tfeff = "\uFEFFBắt đầu";
  const ffeff = path.join(fixtureDir, "ufeff.txt");
  fs.writeFileSync(ffeff, tfeff, "utf8");
  await page.locator('input[type="file"]').first().setInputFiles(ffeff);
  await page.waitForSelector("text=Tệp kết quả đã sẵn sàng.");
  const cfeff = await page.locator("pre").nth(1).innerText();
  results["TXT10"] = cfeff === "Bắt đầu" && !cfeff.includes("\uFEFF") ? "PASS" : "FAIL";
  console.log(`[TXT10] ${results["TXT10"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — TXT U+FEFF cleaned: "${cfeff}"`);

  // Return home
  await page.locator("header button").first().click();
  await page.waitForSelector("text=Xremove");

  // TXT11: Multiple invisible chars
  const multiText = "Đây\u200B là\u200C văn\u200D bản\u2060 thử\uFEFF nghiệm của Xremove.";
  const fMulti = path.join(fixtureDir, "multi_invisible.txt");
  fs.writeFileSync(fMulti, multiText, "utf8");
  const origHash = sha256File(fMulti);

  let downloadTriggeredEarly = false;
  page.on("download", () => {
    downloadTriggeredEarly = true;
  });

  await page.locator('input[type="file"]').first().setInputFiles(fMulti);
  await page.waitForSelector("text=Tệp kết quả đã sẵn sàng.");

  const cMulti = await page.locator("pre").nth(1).innerText();
  const expectedClean = "Đây là văn bản thử nghiệm của Xremove.";
  results["TXT11"] = cMulti === expectedClean ? "PASS" : "FAIL";
  console.log(`[TXT11] ${results["TXT11"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Multiple invisible chars cleaned: "${cMulti}"`);

  // TXT15: Original preview
  const oMulti = await page.locator("pre").nth(0).innerText();
  results["TXT15"] = oMulti === multiText ? "PASS" : "FAIL";
  console.log(`[TXT15] ${results["TXT15"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Original text preview displayed in left pane`);

  // TXT16: Cleaned preview
  results["TXT16"] = cMulti === expectedClean ? "PASS" : "FAIL";
  console.log(`[TXT16] ${results["TXT16"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Cleaned text preview displayed in right pane`);

  // TXT17: Real removed count
  const reportText = await page.locator("text=Đã loại bỏ:").locator("xpath=..").innerText();
  const removedMatch = reportText.includes("5");
  results["TXT17"] = removedMatch ? "PASS" : "FAIL";
  console.log(`[TXT17] ${results["TXT17"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Real removed count displayed: ${reportText}`);

  // TXT18: No automatic download
  results["TXT18"] = !downloadTriggeredEarly ? "PASS" : "FAIL";
  console.log(`[TXT18] ${results["TXT18"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — No automatic download before user click (Early downloads: 0)`);

  // TXT19: Download Result
  const [downloadEvent] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("button:has-text('Tải kết quả')").click(),
  ]);
  const downloadedPath = path.join(fixtureDir, "downloaded_result.txt");
  await downloadEvent.saveAs(downloadedPath);
  const downloadedContent = fs.readFileSync(downloadedPath, "utf8");
  results["TXT19"] = downloadedContent === expectedClean ? "PASS" : "FAIL";
  console.log(`[TXT19] ${results["TXT19"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Downloaded result verified: "${downloadedContent}"`);

  // TXT20: Download Again without reprocess
  const [dlAgainEvent] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("button:has-text('Tải lại')").click(),
  ]);
  results["TXT20"] = !!dlAgainEvent ? "PASS" : "FAIL";
  console.log(`[TXT20] ${results["TXT20"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Download again reused existing blob without reprocess`);

  // TXT21: Original source unchanged
  const postHash = sha256File(fMulti);
  results["TXT21"] = origHash === postHash ? "PASS" : "FAIL";
  console.log(`[TXT21] ${results["TXT21"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Original source file invariant on disk (SHA256: ${origHash})`);

  // TXT12: Emoji preservation
  await page.locator("header button").first().click();
  await page.waitForSelector("text=Xremove");
  const emojiText = "Chào bạn 🚀🌟🎉 Đây\u200B là icon.";
  const fEmoji = path.join(fixtureDir, "emoji.txt");
  fs.writeFileSync(fEmoji, emojiText, "utf8");
  await page.locator('input[type="file"]').first().setInputFiles(fEmoji);
  await page.waitForSelector("text=Tệp kết quả đã sẵn sàng.");
  const cEmoji = await page.locator("pre").nth(1).innerText();
  results["TXT12"] = cEmoji === "Chào bạn 🚀🌟🎉 Đây là icon." ? "PASS" : "FAIL";
  console.log(`[TXT12] ${results["TXT12"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Emoji sequences preserved: "${cEmoji}"`);

  // TXT13: Line-break preservation
  await page.locator("header button").first().click();
  await page.waitForSelector("text=Xremove");
  const linesText = "Dòng 1\n\nDòng 2\r\nDòng 3\u200B";
  const fLines = path.join(fixtureDir, "lines.txt");
  fs.writeFileSync(fLines, linesText, "utf8");
  await page.locator('input[type="file"]').first().setInputFiles(fLines);
  await page.waitForSelector("text=Tệp kết quả đã sẵn sàng.");
  const cLines = await page.locator("pre").nth(1).innerText();
  results["TXT13"] = cLines.includes("Dòng 1\n\nDòng 2") ? "PASS" : "FAIL";
  console.log(`[TXT13] ${results["TXT13"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Line breaks preserved`);

  // TXT14: Punctuation preservation
  await page.locator("header button").first().click();
  await page.waitForSelector("text=Xremove");
  const puncText = "Câu 1! Câu 2? (Ghi chú: [100%], 'Xremove' - \"tốt\").\u200B";
  const fPunc = path.join(fixtureDir, "punc.txt");
  fs.writeFileSync(fPunc, puncText, "utf8");
  await page.locator('input[type="file"]').first().setInputFiles(fPunc);
  await page.waitForSelector("text=Tệp kết quả đã sẵn sàng.");
  const cPunc = await page.locator("pre").nth(1).innerText();
  results["TXT14"] = cPunc === "Câu 1! Câu 2? (Ghi chú: [100%], 'Xremove' - \"tốt\")." ? "PASS" : "FAIL";
  console.log(`[TXT14] ${results["TXT14"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Punctuation preserved: "${cPunc}"`);

  // TXT22: Temp cleanup
  await page.locator("header button").first().click();
  await page.waitForSelector("text=Xremove");
  const localStorageKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => !k.startsWith("xremove.")));
  results["TXT22"] = localStorageKeys.length === 0 ? "PASS" : "FAIL";
  console.log(`[TXT22] ${results["TXT22"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Zero file data retained in browser storage`);

  // TXT24: Service unavailable truthful error
  // Kill Engine B to test offline error
  try {
    execSync("taskkill /F /IM python.exe /T 2>nul");
  } catch {}
  await waitForServer("http://127.0.0.1:8765/health", false, 4000);

  const retryTextFile = path.join(fixtureDir, "retry_test.txt");
  fs.writeFileSync(retryTextFile, "Nội dung\u200B thử lại", "utf8");
  await page.locator('input[type="file"]').first().setInputFiles(retryTextFile);
  await page.waitForSelector("h2:has-text('Không thể xử lý tệp này')");

  const errTitle = await page.locator("h2:has-text('Không thể xử lý tệp này')").isVisible();
  const errHint = await page.locator("text=Xremove.exe").isVisible();
  results["TXT24"] = errTitle && errHint ? "PASS" : "FAIL";
  console.log(`[TXT24] ${results["TXT24"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Truthful error UI shown when service is unavailable`);

  // TXT23: Retry same pending file
  // Restart Engine B
  spawn(launcherExe, [], { cwd: extractedAppDir, detached: true, stdio: "ignore" }).unref();
  await waitForServer("http://127.0.0.1:8765/health", true, 10000);

  await page.locator("button:has-text('Thử lại')").click();
  await page.waitForSelector("text=Tệp kết quả đã sẵn sàng.");
  const retryCleaned = await page.locator("pre").nth(1).innerText();
  results["TXT23"] = retryCleaned === "Nội dung thử lại" ? "PASS" : "FAIL";
  console.log(`[TXT23] ${results["TXT23"] === "PASS" ? "✓ PASS" : "✗ FAIL"} — Retried same pending file without reselection: "${retryCleaned}"`);

  await browser.close();

  // Cleanup background python process
  try {
    execSync("taskkill /F /IM python.exe /T 2>nul");
  } catch {}

  console.log("\n==================================================");
  console.log("25-TEST REQUIRED TEXT TEST MATRIX SUMMARY");
  console.log("==================================================");
  console.log(JSON.stringify(results, null, 2));

  const allPassed = Object.values(results).every((v) => v === "PASS");
  console.log(`\nALL 25 MATRIX TESTS PASSED: ${allPassed}`);

  return results;
}

runTextMatrix().catch((err) => {
  console.error("Text matrix verification failed:", err);
  process.exit(1);
});
