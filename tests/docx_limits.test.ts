import assert from "node:assert/strict";
import { test } from "node:test";
import { zipSync } from "fflate";
import { validateDocxPackage } from "../src/lib/docxPreview.ts";

test("DOCX preview rejects a highly compressed oversized XML member", async () => {
  const encoder = new TextEncoder();
  const zip = zipSync({
    "[Content_Types].xml": encoder.encode("<Types/>"),
    "word/document.xml": encoder.encode("<w:document><w:body>" + "A".repeat(11 * 1024 * 1024) + "</w:body></w:document>"),
  }, { level: 6 });
  const result = await validateDocxPackage(new Uint8Array(zip).buffer);
  assert.equal(result.valid, false);
});
