import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

async function main() {
  console.log("==================================================");
  console.log("VERIFYING VIDEO PREVIEW VISIBILITY LOGIC");
  console.log("==================================================");

  const report = {};
  const htmlPath = path.resolve("release/final/Xremove.html");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  const fileUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(fileUrl);
  await page.waitForSelector("text=Xremove");

  // 1. Initial State: Zero video elements
  const initialVideoCount = await page.locator("video").count();
  console.log(`Initial state: <video> tags in DOM = ${initialVideoCount}`);
  report["DEFAULT_EMPTY_VIDEO_BOX_REMOVED"] = initialVideoCount === 0 ? "PASS" : "FAIL";

  // 2. Non-video file (PNG): Zero video elements
  const pngPath = path.resolve("tests/fixtures/gemini-1024-large-margin.png");
  await page.locator('input[type="file"]').first().setInputFiles(pngPath);
  await page.locator("button:has-text('Tải kết quả'), button:has-text('Download result')").waitFor();

  const imageVideoCount = await page.locator("video").count();
  const imageTagCount = await page.locator("img").count();
  console.log(`After PNG intake: <video> tags = ${imageVideoCount}, <img> tags = ${imageTagCount}`);
  const nonVideoImage = imageVideoCount === 0 && imageTagCount > 0;

  // Reset / Return home
  await page.locator("button:has-text('Thêm tệp khác'), button:has-text('Add another file')").click();
  await page.waitForSelector("text=Xremove");
  const postResetVideoCount = await page.locator("video").count();
  console.log(`After Reset: <video> tags = ${postResetVideoCount}`);
  report["RESET_HIDES_VIDEO_PREVIEW"] = postResetVideoCount === 0 ? "PASS" : "FAIL";

  // 3. Non-video file (TXT): Zero video elements
  const txtPath = path.resolve("tests/fixtures/test_text.txt");

  // Start engine B
  const { spawn } = await import("node:child_process");
  const pyExe = path.resolve("runtime/python/python.exe");
  const servicePy = path.resolve("service/engine_b_service.py");
  const engineProc = spawn(pyExe, [servicePy], { stdio: "ignore" });

  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch("http://127.0.0.1:8765/health");
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }

  await page.locator('input[type="file"]').first().setInputFiles(txtPath);
  await page.locator("button:has-text('Tải kết quả'), button:has-text('Download result')").waitFor();
  const textVideoCount = await page.locator("video").count();
  console.log(`After TXT intake: <video> tags = ${textVideoCount}`);
  const nonVideoTxt = textVideoCount === 0;

  report["NON_VIDEO_FILES_DO NOT_SHOW_VIDEO_PLAYER"] = nonVideoImage && nonVideoTxt ? "PASS" : "FAIL";

  // Reset
  await page.locator("button:has-text('Thêm tệp khác'), button:has-text('Add another file')").click();
  await page.waitForSelector("text=Xremove");

  // 4. Real video file (MP4): Video element rendered with blob URL
  const mp4Path = path.resolve("tests/fixtures/sample.mp4");
  await page.locator('input[type="file"]').first().setInputFiles(mp4Path);
  await page.locator("button:has-text('Tải kết quả'), button:has-text('Download result')").waitFor();

  const realVideoCount = await page.locator("video").count();
  const videoSrc = await page.locator("video").first().getAttribute("src");
  console.log(`After MP4 intake: <video> count = ${realVideoCount}, src = ${videoSrc}`);
  report["VIDEO_PREVIEW_ONLY_AFTER_REAL_VIDEO_INPUT"] = realVideoCount === 1 && videoSrc.startsWith("blob:") ? "PASS" : "FAIL";

  // Reset after video
  await page.locator("header button").first().click();
  await page.waitForSelector("text=Xremove");
  const finalVideoCount = await page.locator("video").count();
  console.log(`Final Reset after video: <video> count = ${finalVideoCount}`);
  report["RESET_HIDES_VIDEO_PREVIEW"] = finalVideoCount === 0 ? "PASS" : "FAIL";

  try {
    engineProc.kill();
  } catch {}

  await browser.close();

  console.log("\n==================================================");
  console.log("VIDEO PREVIEW VISIBILITY REPORT");
  console.log("==================================================");
  console.log(JSON.stringify(report, null, 2));

  return report;
}

main().catch((err) => {
  console.error("Video visibility verification failed:", err);
  process.exit(1);
});
