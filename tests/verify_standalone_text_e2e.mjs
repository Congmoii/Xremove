import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { unzipSync } from "fflate";
import { chromium } from "playwright";

const html = path.resolve(process.argv[2] || process.env.XREMOVE_HTML_PATH || "dist/index.html");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const errors = [];
const requests = [];
context.on("page", (page) => {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/^https?:/i.test(request.url())) requests.push(request.url());
  });
});

async function drop(page, filename, mimeType, buffer) {
  await page.evaluate(({ filename, mimeType, bytes }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], filename, { type: mimeType }));
    document.querySelector('[data-testid="file-dropzone"]').dispatchEvent(
      new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
    );
  }, { filename, mimeType, bytes: Array.from(buffer) });
}

try {
  const textPage = await context.newPage();
  await textPage.goto(pathToFileURL(html).href, { waitUntil: "domcontentloaded" });
  assert.equal(await textPage.getByRole("button", { name: "Xóa metadata tệp" }).count(), 0);
  const sample = fs.readFileSync(path.resolve("samples/van-ban-thu-ky-tu-an.txt"));
  await drop(textPage, "van-ban-thu-ky-tu-an.txt", "text/plain", sample);
  await textPage.getByRole("button", { name: "Tải kết quả" }).waitFor({ timeout: 30_000 });
  assert.match(await textPage.getByText("Đã loại bỏ:").locator("..").innerText(), /5/);
  const [textDownload] = await Promise.all([
    textPage.waitForEvent("download"),
    textPage.getByRole("button", { name: "Tải kết quả" }).click(),
  ]);
  const cleanedText = fs.readFileSync(await textDownload.path(), "utf8");
  assert.equal(/[\u200B\u200C\u200D\u2060\uFEFF]/u.test(cleanedText), false);
  assert.ok(cleanedText.includes("dấu tiếng Việt"));
  await textPage.close();

  const pastedPage = await context.newPage();
  await pastedPage.goto(pathToFileURL(html).href, { waitUntil: "domcontentloaded" });
  await pastedPage.evaluate((value) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", value);
    document.querySelector('[data-testid="file-dropzone"]').dispatchEvent(
      new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
    );
  }, sample.toString("utf8"));
  await pastedPage.getByRole("button", { name: "Tải kết quả" }).waitFor({ timeout: 30_000 });
  assert.match(await pastedPage.getByText("Đã loại bỏ:").locator("..").innerText(), /5/);
  await pastedPage.close();

  const clipboardPage = await context.newPage();
  await clipboardPage.goto(pathToFileURL(html).href, { waitUntil: "domcontentloaded" });
  await clipboardPage.evaluate((value) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", value);
    window.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData: transfer }));
  }, sample.toString("utf8"));
  await clipboardPage.getByRole("button", { name: "Tải kết quả" }).waitFor({ timeout: 30_000 });
  assert.match(await clipboardPage.getByText("Đã loại bỏ:").locator("..").innerText(), /5/);
  await clipboardPage.close();

  const docxPage = await context.newPage();
  await docxPage.goto(pathToFileURL(html).href, { waitUntil: "domcontentloaded" });
  const docx = fs.readFileSync(path.resolve("tests/fixtures/real_vietnamese_test.docx"));
  await drop(docxPage, "document.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx);
  await docxPage.getByRole("button", { name: "Tải kết quả" }).waitFor({ timeout: 30_000 });
  assert.match(await docxPage.getByText("Thuộc tính tài liệu đã xóa:").locator("..").innerText(), /2/);
  const [docxDownload] = await Promise.all([
    docxPage.waitForEvent("download"),
    docxPage.getByRole("button", { name: "Tải kết quả" }).click(),
  ]);
  const members = unzipSync(fs.readFileSync(await docxDownload.path()));
  assert.ok(members["word/document.xml"]);
  assert.equal(Object.keys(members).some((name) => name.startsWith("docProps/")), false);
  assert.equal(/[\u200B\u200C\u200D\u2060\uFEFF]/u.test(new TextDecoder().decode(members["word/document.xml"])), false);
  await docxPage.close();

  assert.deepEqual(errors, []);
  assert.deepEqual(requests, [], "standalone document cleaning makes no network requests");
  console.log("PASS: file:// drag-and-drop TXT file, raw text, paste and DOCX cleanup without EXE, service or network");
} finally {
  await context.close();
  await browser.close();
}
