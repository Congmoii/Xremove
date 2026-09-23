import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

async function main() {
  console.log("==================================================");
  console.log("VERIFYING XREMOVE LIGHT UI & ACCESSIBILITY");
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

  // 1. Verify Theme Toggle is completely removed
  const themeToggle = await page.locator("button[aria-label*='theme'], button[title*='theme'], button[title*='giao diện']").count();
  report["THEME_TOGGLE_REMOVED"] = themeToggle === 0 ? "PASS" : "FAIL";
  console.log(`[THEME_TOGGLE_REMOVED] ${report["THEME_TOGGLE_REMOVED"]} (Theme toggles found: ${themeToggle})`);

  // 2. Verify Light UI restored globally
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const bodyColor = await page.evaluate(() => getComputedStyle(document.body).color);
  const hasDarkClass = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  console.log(`Global Body: bg = ${bodyBg}, color = ${bodyColor}, hasDarkClass = ${hasDarkClass}`);
  report["LIGHT_UI_RESTORED"] = !hasDarkClass && bodyBg.includes("248") ? "PASS" : "FAIL";

  // 3. Verify Upload Area
  const dropzoneBg = await page.locator(".border-dashed").evaluate((el) => getComputedStyle(el).backgroundColor);
  const startBtnText = await page.locator("button:has-text('Chọn tệp'), button:has-text('Choose file')").isVisible();
  console.log(`Upload Dropzone: bg = ${dropzoneBg}, start button visible = ${startBtnText}`);
  report["UPLOAD_AREA_IMPROVED"] = dropzoneBg.includes("255") && startBtnText ? "PASS" : "FAIL";

  // 4. Verify Home Info Cards
  const stepCardsCount = await page.locator("section:has-text('Cách Xremove hoạt động'), section:has-text('How Xremove works')").locator(".shadow-xs").count();
  const cardTitleColor = await page.locator(".shadow-xs h3").first().evaluate((el) => getComputedStyle(el).color);
  console.log(`Home Step Cards count = ${stepCardsCount}, Title color = ${cardTitleColor}`);
  report["HOME_INFO_CARDS_READABLE"] = stepCardsCount >= 3 ? "PASS" : "FAIL";

  // 5. Test Image Result Screen
  const pngPath = path.resolve("tests/fixtures/gemini-1024-large-margin.png");
  await page.locator('input[type="file"]').first().setInputFiles(pngPath);
  await page.locator("button:has-text('Tải kết quả'), button:has-text('Download result')").waitFor();

  const dlBtn = page.locator("button:has-text('Tải kết quả'), button:has-text('Download result')");
  const copyBtn = page.locator("button:has-text('Sao chép ảnh'), button:has-text('Copy image')");
  const addBtn = page.locator("button:has-text('Thêm tệp khác'), button:has-text('Add another file')");

  const dlBg = await dlBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
  const dlColor = await dlBtn.evaluate((el) => getComputedStyle(el).color);
  const copyBg = await copyBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
  const copyBorder = await copyBtn.evaluate((el) => getComputedStyle(el).borderColor);

  console.log(`Image Result Buttons: Primary dl = ${dlBg} (text: ${dlColor}), Secondary copy = ${copyBg} (border: ${copyBorder})`);
  report["IMAGE_RESULT_SCREEN_IMPROVED"] = (await dlBtn.isVisible()) && (await copyBtn.isVisible()) && (await addBtn.isVisible()) ? "PASS" : "FAIL";
  report["BUTTON_READABILITY_IMPROVED"] = dlColor.includes("255") && copyBg.includes("255") ? "PASS" : "FAIL";

  // 6. Test Text Mode
  await page.locator("header button").first().click();
  await page.waitForSelector("text=Xremove");

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

  const txtPath = path.resolve("tests/fixtures/test_text.txt");
  await page.locator('input[type="file"]').first().setInputFiles(txtPath);
  await page.locator("button:has-text('Tải kết quả'), button:has-text('Download result')").waitFor();

  const prePanes = await page.locator("pre").count();
  const summaryBanner = (await page.locator("text=/Removed:|Đã loại bỏ:/").count()) > 0;
  console.log(`Text Mode: pre panes = ${prePanes}, summary banner = ${summaryBanner}`);
  report["TEXT_MODE_IMPROVED"] = prePanes === 2 && summaryBanner ? "PASS" : "FAIL";

  // 7. Test Error Screen
  try {
    engineProc.kill();
  } catch {}

  await page.locator("header button").first().click();
  await page.waitForSelector("text=Xremove");

  await page.locator('input[type="file"]').first().setInputFiles(txtPath);
  await page.waitForSelector("h2:has-text('Không thể xử lý tệp này'), h2:has-text('Could not process this file')");

  const errCardBg = await page.locator("h2").locator("xpath=../..").evaluate((el) => getComputedStyle(el).backgroundColor);
  const errHintText = await page.locator("text=Xremove.exe").isVisible();
  const retryBtn = await page.locator("button:has-text('Thử lại'), button:has-text('Retry')").isVisible();

  console.log(`Error Screen: card bg = ${errCardBg}, hint visible = ${errHintText}, retry visible = ${retryBtn}`);
  report["ERROR_SCREEN_IMPROVED"] = errCardBg.includes("255") && errHintText && retryBtn ? "PASS" : "FAIL";

  await browser.close();

  console.log("\n==================================================");
  console.log("LIGHT UI VERIFICATION REPORT");
  console.log("==================================================");
  console.log(JSON.stringify(report, null, 2));

  return report;
}

main().catch((err) => {
  console.error("Light UI verification failed:", err);
  process.exit(1);
});
