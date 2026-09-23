import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("bundled U2NetP bytes match the pinned model", () => {
  const model = readFileSync("models/u2netp.onnx");
  assert.equal(model.length, 4_574_861);
  assert.equal(crypto.createHash("sha256").update(model).digest("hex"),
    "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8");
});
