import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { unzipSync } from "fflate";
import { chromium } from "playwright";

const root = process.cwd();
const appRoot = process.env.XREMOVE_PACKAGE_ROOT || root;
const output = path.resolve("output/playwright");
fs.mkdirSync(output, { recursive: true });
const port = await new Promise((resolve) => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const origin = `http://127.0.0.1:${port}`;
const bundled = path.join(appRoot, "runtime", "python", "python.exe");
const python = process.platform === "win32" && fs.existsSync(bundled) ? bundled : "python3";
const service = spawn(python, [path.join(appRoot, "service", "engine_b_service.py")], {
  cwd: appRoot,
  env: { ...process.env, XREMOVE_PORT: String(port), XREMOVE_UI_PATH: path.join(appRoot, appRoot === root ? "dist/index.html" : "Xremove.html") },
  stdio: "ignore",
  windowsHide: true,
});
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
const errors = [];
const externalRequests = [];
context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
context.on("request", (request) => {
  const url = new URL(request.url());
  if ((url.protocol === "http:" || url.protocol === "https:") && url.origin !== origin) {
    externalRequests.push(url.href);
  }
});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      ready = (await fetch(`${origin}/api/health`)).ok;
      if (ready) break;
    } catch { /* starting */ }
    await delay(50);
  }
  assert.ok(ready, "service started");

  // A service job survives losing the UI and the next tab resumes its ID.
  let submissions = 0;
  context.on("request", (request) => {
    if (request.method() === "POST" && request.url() === `${origin}/api/jobs`) submissions++;
  });
  const first = await context.newPage();
  await first.goto(origin, { waitUntil: "domcontentloaded" });
  const text = "Tiếng Việt: ấ é 👩‍💻 می‌روم\n";
  const created = first.waitForResponse((response) => response.url() === `${origin}/api/jobs` && response.status() === 202);
  await first.locator('input[type="file"]').first().setInputFiles({
    name: "resume.txt", mimeType: "text/plain", buffer: Buffer.from(text),
  });
  await created;
  await first.close();
  const resumed = await context.newPage();
  await resumed.goto(origin, { waitUntil: "domcontentloaded" });
  const downloadButton = resumed.getByRole("button", { name: "Tải kết quả" });
  await downloadButton.waitFor({ timeout: 30_000 });
  const [textDownload] = await Promise.all([resumed.waitForEvent("download"), downloadButton.click()]);
  assert.equal(fs.readFileSync(await textDownload.path(), "utf8"), text);
  assert.equal(submissions, 1, "reconnect did not resubmit");
  await resumed.screenshot({ path: path.join(output, "service-job-resumed.png"), fullPage: true });
  await resumed.close();

  const cleanPage = await context.newPage();
  await cleanPage.goto(origin, { waitUntil: "domcontentloaded" });
  const sampleText = fs.readFileSync(path.resolve("samples/van-ban-thu-ky-tu-an.txt"));
  await cleanPage.locator('input[type="file"]').first().setInputFiles({
    name: "van-ban-thu-ky-tu-an.txt", mimeType: "text/plain", buffer: sampleText,
  });
  await cleanPage.getByRole("button", { name: "Tải kết quả" }).waitFor({ timeout: 30_000 });
  assert.match(await cleanPage.getByText("Đã loại bỏ:").locator("..").innerText(), /5/);
  const [sampleDownload] = await Promise.all([
    cleanPage.waitForEvent("download"), cleanPage.getByRole("button", { name: "Tải kết quả" }).click(),
  ]);
  assert.equal(/[\u200B\u200C\u200D\u2060\uFEFF]/u.test(fs.readFileSync(await sampleDownload.path(), "utf8")), false);
  await cleanPage.close();

  const metadataPage = await context.newPage();
  await metadataPage.goto(origin, { waitUntil: "domcontentloaded" });
  await metadataPage.getByRole("button", { name: "Xóa metadata tệp" }).click();
  const sourceJpeg = fs.readFileSync(path.resolve("tests/fixtures/sample.jpg"));
  const marker = Buffer.from("Exif\0\0AI-test-author=Example", "ascii");
  const app1 = Buffer.alloc(marker.length + 4);
  app1[0] = 0xff; app1[1] = 0xe1;
  app1.writeUInt16BE(marker.length + 2, 2);
  marker.copy(app1, 4);
  const taggedJpeg = Buffer.concat([sourceJpeg.subarray(0, 2), app1, sourceJpeg.subarray(2)]);
  await metadataPage.locator('input[type="file"]').first().setInputFiles({
    name: "tagged.jpg", mimeType: "image/jpeg", buffer: taggedJpeg,
  });
  await metadataPage.getByText("Đã xử lý metadata tệp").waitFor({ timeout: 30_000 });
  const [metadataDownload] = await Promise.all([
    metadataPage.waitForEvent("download"), metadataPage.getByRole("button", { name: "Tải kết quả" }).click(),
  ]);
  assert.equal(fs.readFileSync(await metadataDownload.path()).includes(marker), false);
  await metadataPage.close();

  // Batch includes duplicate names and one malformed image; only successes reach ZIP.
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Tách nền ảnh" }).click();
  const jpeg = fs.readFileSync(path.resolve("tests/fixtures/sample.jpg"));
  await page.locator('input[type="file"]').first().setInputFiles([
    { name: "sample.jpg", mimeType: "image/jpeg", buffer: jpeg },
    { name: "sample.jpg", mimeType: "image/jpeg", buffer: jpeg },
    { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("invalid") },
  ]);
  await page.getByText("Hàng đợi · 2/3").waitFor({ timeout: 120_000 });
  assert.equal(await page.getByText("Lỗi", { exact: true }).count(), 1);
  const canvas = page.locator("canvas");
  const centerAlpha = () => canvas.evaluate((element) => {
    const context = element.getContext("2d");
    return context.getImageData(Math.floor(element.width / 2), Math.floor(element.height / 2), 1, 1).data[3];
  });
  const before = await centerAlpha();
  const [plainDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Tải ảnh", exact: true }).click(),
  ]);
  const plain = fs.readFileSync(await plainDownload.path());
  await page.getByRole("button", { name: "Khôi phục" }).click();
  await canvas.click();
  await page.waitForTimeout(200);
  const edited = await centerAlpha();
  assert.ok(edited > before, `restore brush changed alpha: ${before} -> ${edited}`);
  await page.getByRole("button", { name: "Hoàn tác" }).click();
  assert.equal(await centerAlpha(), before);
  await page.getByRole("button", { name: "Làm lại" }).click();
  assert.equal(await centerAlpha(), edited);
  const [editedDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Tải ảnh", exact: true }).click(),
  ]);
  const png = fs.readFileSync(await editedDownload.path());
  assert.ok(!plain.equals(png), "export includes actual mask edits");
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 100);
  assert.equal(png.readUInt32BE(20), 100);
  const [zipDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Tải ZIP kết quả" }).click(),
  ]);
  const entries = unzipSync(fs.readFileSync(await zipDownload.path()));
  assert.deepEqual(Object.keys(entries).sort(), ["sample_cutout.png", "sample_cutout_2.png"].sort());
  await page.locator("select").first().selectOption("white");
  assert.equal(await centerAlpha(), 255, "solid background removes transparency");
  await page.locator("select").nth(1).selectOption("jpeg");
  const [jpegDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Tải ảnh", exact: true }).click(),
  ]);
  assert.equal(jpegDownload.suggestedFilename(), "sample_cutout.jpg");
  const jpg = fs.readFileSync(await jpegDownload.path());
  assert.equal(jpg[0], 0xff);
  assert.equal(jpg[1], 0xd8);
  await page.screenshot({ path: path.join(output, "batch-editor.png"), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(scrollWidth <= 375, `mobile viewport overflow: ${scrollWidth}px`);
  await page.screenshot({ path: path.join(output, "batch-editor-mobile.png"), fullPage: true });
  assert.deepEqual(errors, [], "no browser runtime errors");
  assert.deepEqual(externalRequests, [], "no external network requests");
  console.log("PASS: reconnect, five hidden characters cleaned, JPEG metadata removed, batch errors, duplicate ZIP names, mask edit/undo/redo, PNG/JPEG export, mobile layout");
} finally {
  await context.close();
  await browser.close();
  service.kill();
}
