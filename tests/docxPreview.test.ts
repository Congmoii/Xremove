import test from "node:test";
import assert from "node:assert/strict";
import { isLegacyDocBytes } from "../src/lib/docxPreview.ts";

test("isLegacyDocBytes correctly identifies OLE header", () => {
  const oleHeader = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
  assert.equal(isLegacyDocBytes(oleHeader), true);

  const nonOle = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  assert.equal(isLegacyDocBytes(nonOle), false);
});
