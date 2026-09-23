import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const root = process.cwd();
const output = path.join(root, "output", "playwright");
const fixture = process.argv[2] || path.join(root, "tests", "fixtures", "sample.jpg");
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
page.on("pageerror", (error) => console.error("PAGE ERROR", error));
try {
  await page.goto(`file:///${path.join(root, "dist", "index.html").replace(/\\/g, "/")}`);
  await page.getByRole("button", { name: "Tách nền ảnh" }).click();
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await page.getByText("Hoàn tất", { exact: true }).waitFor({ timeout: 120_000 });
  const info = await page.locator("canvas").evaluate((canvas) => {
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minAlpha = 255;
    let maxAlpha = 0;
    for (let i = 3; i < data.length; i += 4) {
      minAlpha = Math.min(minAlpha, data[i]);
      maxAlpha = Math.max(maxAlpha, data[i]);
    }
    return { width: canvas.width, height: canvas.height, minAlpha, maxAlpha };
  });
  console.log("RESULT", info);
  await page.screenshot({ path: path.join(output, "background-workspace.png"), fullPage: true });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Tải ảnh", exact: true }).click(),
  ]);
  await download.saveAs(path.join(output, download.suggestedFilename()));
  console.log("DOWNLOAD", download.suggestedFilename());
} finally {
  await browser.close();
}
