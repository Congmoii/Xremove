import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const VENDOR_DIR = path.resolve("vendor/watermarks-remover");
const PINNED_COMMIT = "3f84d3e3964368b82172112b09ef3e7c02b25749";
const REPO_URL = "https://github.com/guillaumemeyer/watermarks-remover.git";

console.log("==================================================");
console.log("XREMOVE VENDOR BOOTSTRAPPER");
console.log("==================================================");

if (fs.existsSync(VENDOR_DIR)) {
  const actual = execFileSync("git", ["-C", VENDOR_DIR, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (actual !== PINNED_COMMIT || !fs.existsSync(path.join(VENDOR_DIR, "service/scripts/server.py"))) {
    throw new Error(`Vendor checkout does not match pinned commit ${PINNED_COMMIT}: ${VENDOR_DIR}`);
  }
  console.log(`✓ Verified pinned vendor checkout: ${actual}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(VENDOR_DIR), { recursive: true });

console.log(`Cloning upstream repository from ${REPO_URL}...`);
try {
  execFileSync("git", ["clone", REPO_URL, VENDOR_DIR], { stdio: "inherit" });
  console.log(`Checking out pinned commit: ${PINNED_COMMIT}...`);
  execFileSync("git", ["-C", VENDOR_DIR, "checkout", "--detach", PINNED_COMMIT], { stdio: "inherit" });
  console.log("✓ Upstream vendor bootstrapped successfully at pinned commit.");
} catch (err) {
  console.error("✗ Failed to clone or checkout upstream repository:", err.message);
  process.exit(1);
}
