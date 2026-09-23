import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { zipSync } from "fflate";

// GitHub Release candidate: HTML + notices only. Windows runtime and FFmpeg
// are deliberately excluded until their redistribution obligations are met.
const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
const prefix = `Xremove-v${version}`;
const output = path.resolve("release/github");
const htmlPath = path.join(output, `${prefix}.html`);
const zipPath = path.join(output, `${prefix}-HTML-only.zip`);

for (const file of [htmlPath, zipPath]) {
  if (fs.existsSync(file)) throw new Error(`Refusing to overwrite existing candidate: ${file}`);
}

execFileSync(process.execPath, ["scripts/ensure_model.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], { stdio: "inherit" });

const builtHtml = fs.readFileSync("dist/index.html");
if (!builtHtml.includes(Buffer.from(`Xremove HTML ${version}`))) {
  throw new Error("Built HTML does not contain the expected standalone version");
}
const notices = [
  "README.md", "LICENSE", "THIRD_PARTY_LICENSES.md",
  "licenses/Apache-2.0.txt", "licenses/ONNX-Runtime-MIT.txt", "licenses/fflate-MIT.txt",
  "licenses/React-MIT.txt", "licenses/Tailwind-MIT.txt",
];
// The .html asset is distributed separately from the ZIP, so carry notices there too.
const legalNotice = ["LICENSE", "THIRD_PARTY_LICENSES.md", ...notices.filter((name) => name.startsWith("licenses/"))]
  .map((name) => `===== ${name} =====\n${fs.readFileSync(name, "utf8")}`)
  .join("\n");
if (legalNotice.includes("-->")) throw new Error("License text cannot be embedded in an HTML comment");
const html = Buffer.concat([builtHtml, Buffer.from(`\n<!-- Xremove distribution notices\n${legalNotice}\n-->\n`)]);
const archive = Object.create(null);
archive[`${prefix}.html`] = new Uint8Array(html);
for (const name of notices) archive[name] = new Uint8Array(fs.readFileSync(name));
const zip = zipSync(archive, { level: 6, mtime: new Date("1980-01-01T00:00:00Z") });

fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(htmlPath, html, { flag: "wx" });
fs.writeFileSync(zipPath, zip, { flag: "wx" });
for (const file of [htmlPath, zipPath]) {
  const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  fs.writeFileSync(`${file}.sha256.txt`, `${hash}  ${path.basename(file)}\n`, { flag: "wx" });
  console.log(`${path.basename(file)}: ${fs.statSync(file).size} bytes, SHA-256 ${hash}`);
}
console.log("HTML-only candidate built. Review model-weight rights before public release.");
