import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

async function main() {
  console.log("==================================================");
  console.log("VERIFYING XREMOVE UI/UX REFINEMENT");
  console.log("==================================================");

  const report = {};
  const htmlPath = path.resolve("release/final/Xremove.html");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  const fileUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;

  // 1. Desktop Viewport (1440x900)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(fileUrl);
  await page.waitForSelector("text=Xremove");

  // Verify Start Screen & Dropzone
  const dropzoneWidth = await page.locator(".border-dashed").first().evaluate((el) => el.clientWidth);
  console.log(`Dropzone width on 1440px desktop: ${dropzoneWidth}px (Contained with max-width)`);

  // Switch to VI
  await page.locator("button:has-text('VI')").click();

  // Test Image Mode Preview & Checkerboard Clipping
  const pngPath = path.resolve("tests/fixtures/gemini-1024-large-margin.png");
  await page.locator('input[type="file"]').first().setInputFiles(pngPath);
  await page.waitForSelector("text=Tệp kết quả đã sẵn sàng.");

  const previewBox = page.locator("img").locator("xpath=../..");
  const previewBoxWidth = await previewBox.evaluate((el) => el.clientWidth);
  const previewBoxStyle = await previewBox.evaluate((el) => el.getAttribute("style") || "");
  const hasChecker = previewBoxStyle.includes("linear-gradient");
  console.log(`Image Preview Box width: ${previewBoxWidth}px, has checkerboard inside frame: ${hasChecker}`);
  report["CHECKERBOARD_CLIPPED_TO_PREVIEW"] = hasChecker && previewBoxWidth <= 800 ? "PASS" : "FAIL";

  const imgToggleVisible = (await page.getByRole("button", { name: "Gốc", exact: true }).isVisible()) &&
                           (await page.getByRole("button", { name: "Kết quả", exact: true }).isVisible());
  const dlBtn = page.locator("button:has-text('Tải kết quả')");
  const copyImgBtn = page.locator("button:has-text('Sao chép ảnh')");
  const addBtn = page.locator("button:has-text('Thêm tệp khác')");

  report["IMAGE_MODE_REFINED"] = imgToggleVisible && (await dlBtn.isVisible()) && (await copyImgBtn.isVisible()) && (await addBtn.isVisible()) ? "PASS" : "FAIL";

  // Check button heights
  const dlBtnHeight = await dlBtn.evaluate((el) => el.clientHeight);
  const copyBtnHeight = await copyImgBtn.evaluate((el) => el.clientHeight);
  console.log(`Button heights: Primary = ${dlBtnHeight}px, Secondary = ${copyBtnHeight}px (Compact & balanced)`);
  report["BUTTON_LAYOUT_REBALANCED"] = dlBtnHeight <= 44 && copyBtnHeight <= 44 ? "PASS" : "FAIL";

  // Test Text Mode Layout
  await page.locator("header button").first().click(); // Return Home
  await page.waitForSelector("text=Xremove");

  const txtPath = path.resolve("tests/fixtures/test_text.txt");
  // Let's start engine B for text processing
  const { spawn } = await import("node:child_process");
  const pyExe = path.resolve("runtime/python/python.exe");
  const servicePy = path.resolve("service/engine_b_service.py");
  const engineProc = spawn(pyExe, [servicePy], { stdio: "ignore" });

  // Wait for health
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch("http://127.0.0.1:8765/health");
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }

  await page.locator('input[type="file"]').first().setInputFiles(txtPath);
  await page.waitForSelector("text=Tệp kết quả đã sẵn sàng.");

  const textPreElements = await page.locator("pre").count();
  const originalCol = await page.locator("span:has-text('VĂN BẢN GỐC')").isVisible();
  const cleanedCol = await page.locator("span:has-text('ĐÃ LÀM SẠCH')").isVisible();
  const textFrameStyle = await page.locator("pre").first().locator("xpath=../../..").evaluate((el) => el.getAttribute("style") || "");
  const textHasChecker = textFrameStyle.includes("linear-gradient");

  console.log(`Text comparison columns: ${textPreElements}, Original visible: ${originalCol}, Cleaned visible: ${cleanedCol}, Text has checker: ${textHasChecker}`);
  report["TEXT_MODE_REFINED"] = textPreElements === 2 && originalCol && cleanedCol && !textHasChecker ? "PASS" : "FAIL";

  // Test Responsive Resizing (Mobile 375x667)
  console.log("\nTesting Responsive Resizing at 375x667...");
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(300);

  const bodyOverflow = await page.evaluate(() => document.body.scrollWidth <= window.innerWidth);
  const actionStackValid = (await page.locator("button:has-text('Tải kết quả')").isVisible()) &&
                           (await page.locator("button:has-text('Thêm tệp khác')").isVisible());
  console.log(`Mobile fit: no horizontal overflow = ${bodyOverflow}, actions accessible = ${actionStackValid}`);
  report["RESPONSIVE_RESIZE"] = bodyOverflow && actionStackValid ? "PASS" : "FAIL";

  // Test Error State
  try {
    engineProc.kill();
  } catch {}

  await page.setViewportSize({ width: 1200, height: 800 });
  await page.locator("header button").first().click();
  await page.waitForSelector("text=Xremove");

  // Drop text file when engine is offline
  await page.locator('input[type="file"]').first().setInputFiles(txtPath);
  await page.waitForSelector("h2:has-text('Không thể xử lý tệp này')");

  const errTitle = await page.locator("h2:has-text('Không thể xử lý tệp này')").isVisible();
  const errHint = await page.locator("p:has-text('start.bat')").isVisible();
  const retryBtn = await page.locator("button:has-text('Thử lại')").isVisible();
  const addMoreBtn = await page.locator("button:has-text('Thêm tệp khác')").isVisible();

  console.log(`Error state: Title = ${errTitle}, Hint = ${errHint}, Retry = ${retryBtn}, AddMore = ${addMoreBtn}`);
  report["ERROR_STATE_IMPROVED"] = errTitle && errHint && retryBtn && addMoreBtn ? "PASS" : "FAIL";

  await browser.close();

  console.log("\n==================================================");
  console.log("UI/UX REFINEMENT REPORT");
  console.log("==================================================");
  console.log(JSON.stringify(report, null, 2));

  return report;
}

main().catch((err) => {
  console.error("UI refinement verification failed:", err);
  process.exit(1);
});
