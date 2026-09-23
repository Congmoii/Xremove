import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { cleanInvisibleText, cleanLocalDocx, cleanLocalTextFile } from "../src/lib/localTextClean.ts";
import { extractDocxPreviewText, validateDocxPackage } from "../src/lib/docxPreview.ts";

test("standalone text cleanup removes five hidden marks but retains emoji and Arabic joiners", async () => {
  const sample = readFileSync("samples/van-ban-thu-ky-tu-an.txt");
  const file = new File([sample], "van-ban-thu-ky-tu-an.txt", { type: "text/plain" });
  const result = await cleanLocalTextFile(file);
  assert.equal(result.report.stats.removed_count, 5);
  assert.equal(result.report.metadata_removed_count, 0);
  const output = await result.blob.text();
  assert.equal(/[\u200B\u200C\u200D\u2060\uFEFF]/u.test(output), false);
  assert.ok(output.includes("dấu tiếng Việt"));
  const meaningful = "Chào 👩‍💻 và می‌روم";
  assert.equal(cleanInvisibleText(meaningful).text, meaningful);
});

test("standalone DOCX cleanup removes property parts and hidden text while preserving a valid document", async () => {
  const bytes = readFileSync("tests/fixtures/real_vietnamese_test.docx");
  const original = await extractDocxPreviewText(new Uint8Array(bytes));
  const file = new File([bytes], "document.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const result = await cleanLocalDocx(file);
  assert.equal(result.report.metadata_removed_count, 2);
  assert.ok(result.report.stats.removed_count > 0);
  const output = new Uint8Array(await result.blob.arrayBuffer());
  assert.equal((await validateDocxPackage(output)).valid, true);
  const members = unzipSync(output);
  assert.equal(Object.keys(members).some((name) => name.startsWith("docProps/")), false);
  assert.equal(new TextDecoder().decode(members["_rels/.rels"]).includes("docProps/"), false);
  assert.equal(await extractDocxPreviewText(output), original.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/gu, ""));
});
