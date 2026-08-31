import test from "node:test";
import assert from "node:assert/strict";
import { classifyFile } from "../src/lib/classify.ts";

test("sniffs PNG magic bytes as image", async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const file = new File([bytes], "test.bin", { type: "" });
  const result = await classifyFile(file);
  assert.equal(result.kind, "image");
});

test("sniffs JPEG magic bytes as image", async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const file = new File([bytes], "photo.dat", { type: "" });
  const result = await classifyFile(file);
  assert.equal(result.kind, "image");
});

test("sniffs WEBP magic bytes as image", async () => {
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x00, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, // WEBP
  ]);
  const file = new File([bytes], "image.unknown", { type: "" });
  const result = await classifyFile(file);
  assert.equal(result.kind, "image");
});

test("sniffs MP4/MOV ftyp magic bytes as video", async () => {
  const bytes = new Uint8Array([
    0x00, 0x00, 0x00, 0x20,
    0x66, 0x74, 0x79, 0x70, // ftyp
    0x69, 0x73, 0x6f, 0x6d,
  ]);
  const file = new File([bytes], "clip.dat", { type: "" });
  const result = await classifyFile(file);
  assert.equal(result.kind, "video");
});

test("sniffs PDF magic bytes as document", async () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
  const file = new File([bytes], "document.bin", { type: "" });
  const result = await classifyFile(file);
  assert.equal(result.kind, "document");
});

test("classifies UTF-8 text file as text", async () => {
  const content = "Hello world! This is a plain text document.\nNo binary data here.";
  const file = new File([content], "notes.txt", { type: "text/plain" });
  const result = await classifyFile(file);
  assert.equal(result.kind, "text");
});

test("classifies legacy .doc as legacy_doc", async () => {
  const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const file = new File([bytes], "document.doc", { type: "application/msword" });
  const result = await classifyFile(file);
  assert.equal(result.kind, "legacy_doc");
});

test("guarantees unknown binary with NUL bytes is NEVER classified as text", async () => {
  const bytes = new Uint8Array([0x01, 0x02, 0x00, 0x04, 0x05, 0xaa, 0xbb, 0xcc]);
  const file = new File([bytes], "unknown.bin", { type: "" });
  const result = await classifyFile(file);
  assert.equal(result.kind, "unknown");
});
