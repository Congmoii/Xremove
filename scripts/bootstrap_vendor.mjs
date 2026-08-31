import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const VENDOR_DIR = path.resolve("vendor/watermarks-remover");
const PINNED_COMMIT = "3f84d3e3964368b82172112b09ef3e7c02b25749";
const REPO_URL = "https://github.com/guillaumemeyer/watermarks-remover.git";

console.log("==================================================");
console.log("XREMOVE VENDOR BOOTSTRAPPER");
console.log("==================================================");

if (fs.existsSync(VENDOR_DIR) && fs.existsSync(path.join(VENDOR_DIR, "service/scripts/server.py"))) {
  console.log(`✓ Vendor directory already present: ${VENDOR_DIR}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(VENDOR_DIR), { recursive: true });

console.log(`Cloning upstream repository from ${REPO_URL}...`);
try {
  execSync(`git clone ${REPO_URL} "${VENDOR_DIR}"`, { stdio: "inherit" });
  console.log(`Checking out pinned commit: ${PINNED_COMMIT}...`);
  execSync(`git -C "${VENDOR_DIR}" checkout ${PINNED_COMMIT}`, { stdio: "inherit" });
  console.log("✓ Upstream vendor bootstrapped successfully at pinned commit.");
} catch (err) {
  console.error("✗ Failed to clone or checkout upstream repository:", err.message);
  process.exit(1);
}
