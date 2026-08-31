import fs from "node:fs";
import { execSync } from "node:child_process";

fs.mkdirSync("tests/fixtures", { recursive: true });
const pyCmd = process.platform === "win32" && fs.existsSync("runtime/python/python.exe")
  ? "runtime\\python\\python.exe"
  : "python3";

try {
  execSync(`${pyCmd} scripts/make_docx.py`, { stdio: "inherit" });
} catch {
  execSync("python scripts/make_docx.py", { stdio: "inherit" });
}
