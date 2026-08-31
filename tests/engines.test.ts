import test from "node:test";
import assert from "node:assert/strict";
import {
  EngineUnavailableError,
  UnsupportedFileError,
  LegacyDocError,
  processFile,
} from "../src/lib/engines.ts";
import type { Classification } from "../src/lib/classify.ts";

test("EngineUnavailableError is an Error instance", () => {
  const err = new EngineUnavailableError("Service down");
  assert.ok(err instanceof Error);
  assert.equal(err.message, "Service down");
});

test("UnsupportedFileError is an Error instance", () => {
  const err = new UnsupportedFileError("unknown");
  assert.ok(err instanceof Error);
  assert.equal(err.message, "unknown");
});

test("LegacyDocError is an Error instance", () => {
  const err = new LegacyDocError("Legacy .doc is unsupported");
  assert.ok(err instanceof Error);
  assert.equal(err.message, "Legacy .doc is unsupported");
});

test("processFile throws UnsupportedFileError for unknown kind", async () => {
  const file = new File([new Uint8Array([0, 1, 2])], "data.bin");
  const cls: Classification = { kind: "unknown", mime: "", ext: "bin" };
  await assert.rejects(
    async () => {
      await processFile(file, cls);
    },
    (err: unknown) => {
      return err instanceof UnsupportedFileError;
    },
  );
});

test("processFile throws LegacyDocError for legacy_doc kind", async () => {
  const file = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], "old.doc");
  const cls: Classification = { kind: "legacy_doc", mime: "application/msword", ext: "doc" };
  await assert.rejects(
    async () => {
      await processFile(file, cls);
    },
    (err: unknown) => {
      return err instanceof LegacyDocError;
    },
  );
});
