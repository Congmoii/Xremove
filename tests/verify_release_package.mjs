import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { unzipSync } from "fflate";

const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
const prefix = `Xremove-v${version}`;
const htmlPath = path.resolve(`release/github/${prefix}.html`);
const zipPath = path.resolve(`release/github/${prefix}-HTML-only.zip`);
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

for (const file of [htmlPath, zipPath]) {
  const expected = fs.readFileSync(`${file}.sha256.txt`, "utf8").trim().split(/\s+/)[0];
  assert.equal(digest(fs.readFileSync(file)), expected, `${path.basename(file)} checksum`);
}

const entries = unzipSync(fs.readFileSync(zipPath));
const expectedEntries = [
  `${prefix}.html`, "README.md", "LICENSE", "THIRD_PARTY_LICENSES.md",
  "licenses/Apache-2.0.txt", "licenses/ONNX-Runtime-MIT.txt", "licenses/fflate-MIT.txt",
  "licenses/React-MIT.txt", "licenses/Tailwind-MIT.txt",
];
assert.deepEqual(Object.keys(entries).sort(), expectedEntries.sort());
assert.equal(digest(entries[`${prefix}.html`]), digest(fs.readFileSync(htmlPath)));
assert.match(fs.readFileSync(htmlPath, "utf8"), /Xremove distribution notices/);
assert.match(fs.readFileSync(htmlPath, "utf8"), /Copyright \(c\) Meta Platforms/);
assert.equal(Object.keys(entries).some((name) => /ffmpeg|\.exe$|runtime\/python|service\//i.test(name)), false);

execFileSync(process.execPath, ["tests/verify_standalone_text_e2e.mjs", htmlPath], { stdio: "inherit" });
console.log(`PASS: HTML-only candidate checksums, exact archive contents and file:// workflow (${prefix})`);
