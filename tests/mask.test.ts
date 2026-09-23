import assert from "node:assert/strict";
import { test } from "node:test";
import { MaskEditor, outputImageName } from "../src/background/mask.ts";

test("mask strokes preserve source and undo/redo exported alpha", () => {
  const source = new Uint8ClampedArray(25).fill(255);
  const editor = new MaskEditor(5, 5, source);
  editor.startStroke();
  editor.paint(2, 2, 1, "erase");
  editor.finishStroke();
  assert.equal(source[12], 255, "source remains immutable");
  assert.equal(editor.mask[12], 0);
  assert.equal(editor.canUndo, true);
  assert.equal(editor.undo(), true);
  assert.equal(editor.mask[12], 255);
  assert.equal(editor.redo(), true);
  assert.equal(editor.mask[12], 0);
  editor.startStroke();
  editor.paint(2, 2, 1, "restore");
  editor.finishStroke();
  assert.equal(editor.mask[12], 255);
  assert.equal(editor.canRedo, false);
});

test("output filename sanitizes paths and matches the selected format", () => {
  assert.equal(outputImageName("photo.webp", "png"), "photo_cutout.png");
  assert.equal(outputImageName("a:b.jpg", "jpeg"), "a_b_cutout.jpg");
});
