import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function sha256File(filepath) {
  return sha256(fs.readFileSync(filepath));
}

function copyDirRecursive(src, dest, filterFn = null) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (filterFn && !filterFn(entry.name, path.join(src, entry.name))) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, filterFn);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function buildRelease() {
  console.log("==================================================");
  console.log("BUILDING XREMOVE v1.0.0 ALL-IN-ONE FULL RELEASE");
  console.log("==================================================");

  // 0. Ensure upstream vendor is bootstrapped
  const vendorServerScript = path.resolve("vendor/watermarks-remover/service/scripts/server.py");
  if (!fs.existsSync(vendorServerScript)) {
    console.log("Bootstrapping upstream vendor dependency...");
    execSync("node scripts/bootstrap_vendor.mjs", { stdio: "inherit" });
  }

  // 1. Build Vite single HTML
  console.log("\n[1/7] Running Vite build with singlefile plugin...");
  execSync("pnpm run build", { stdio: "inherit" });

  const builtHtmlPath = path.resolve("dist/index.html");
  if (!fs.existsSync(builtHtmlPath)) {
    throw new Error("dist/index.html was not generated!");
  }
  const htmlContent = fs.readFileSync(builtHtmlPath);
  const htmlHash = sha256(htmlContent);
  console.log(`✓ Built single HTML (${htmlContent.length} bytes, SHA256: ${htmlHash})`);

  // 2. Prepare release directories
  console.log("\n[2/7] Preparing release directories...");
  fs.mkdirSync("release/single-html", { recursive: true });
  fs.mkdirSync("release/final", { recursive: true });

  const singleHtmlDest = path.resolve("release/single-html/Xremove.html");
  const finalHtmlDest = path.resolve("release/final/Xremove.html");

  fs.writeFileSync(singleHtmlDest, htmlContent);
  fs.writeFileSync(finalHtmlDest, htmlContent);
  fs.writeFileSync("release/final/Xremove.html.sha256.txt", `${htmlHash}  Xremove.html\n`);

  // 3. Create full portable package staging
  console.log("\n[3/7] Staging Full distribution...");
  const fullStagingRoot = path.resolve("release/pack_staging/Xremove-v1.0.0-Full");
  if (fs.existsSync("release/pack_staging")) {
    fs.rmSync("release/pack_staging", { recursive: true, force: true });
  }
  fs.mkdirSync(fullStagingRoot, { recursive: true });

  // Compile native Xremove.exe launcher if on Windows
  const launcherCs = path.resolve("launcher/XremoveLauncher.cs");
  const launcherExeStaged = path.join(fullStagingRoot, "Xremove.exe");
  const cscPath = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";

  if (process.platform === "win32" && fs.existsSync(cscPath) && fs.existsSync(launcherCs)) {
    console.log("Compiling native Xremove.exe launcher...");
    execSync(`"${cscPath}" /target:winexe /out:"${launcherExeStaged}" /reference:System.Windows.Forms.dll,System.dll,System.Drawing.dll "${launcherCs}"`, { stdio: "inherit" });
  } else if (fs.existsSync("Xremove.exe")) {
    fs.copyFileSync("Xremove.exe", launcherExeStaged);
  }

  // Copy Xremove.html
  fs.writeFileSync(path.join(fullStagingRoot, "Xremove.html"), htmlContent);

  // Copy service directory
  console.log("\n[4/7] Copying service adapter...");
  copyDirRecursive("service", path.join(fullStagingRoot, "service"));

  // Copy upstream vendor libraries
  console.log("\n[5/7] Copying upstream vendor libraries...");
  if (fs.existsSync("vendor/watermarks-remover")) {
    copyDirRecursive(
      "vendor/watermarks-remover",
      path.join(fullStagingRoot, "vendor", "watermarks-remover"),
      (name) => name !== ".git" && name !== ".github" && name !== "tests" && name !== "benchmarks"
    );
  }

  // Copy bundled Python runtime if present locally
  console.log("\n[6/7] Staging runtime dependencies...");
  if (fs.existsSync("runtime/python")) {
    copyDirRecursive("runtime/python", path.join(fullStagingRoot, "runtime", "python"));
  }
  if (fs.existsSync("tools/ffmpeg")) {
    copyDirRecursive("tools/ffmpeg", path.join(fullStagingRoot, "tools", "ffmpeg"));
  }

  // Create empty logs folder
  fs.mkdirSync(path.join(fullStagingRoot, "logs"), { recursive: true });

  // 4. Compress to release/final/Xremove-v1.0.0-Full-Windows.zip
  const zipDest = path.resolve("release/final/Xremove-v1.0.0-Full-Windows.zip");
  console.log("\n[7/7] Compressing to release/final/Xremove-v1.0.0-Full-Windows.zip...");

  if (process.platform === "win32") {
    execSync(`powershell -Command "Compress-Archive -Path '${fullStagingRoot}' -DestinationPath '${zipDest}' -Force"`, { stdio: "inherit" });
  } else {
    execSync(`cd "${path.dirname(fullStagingRoot)}" && zip -r "${zipDest}" "${path.basename(fullStagingRoot)}"`, { stdio: "inherit" });
  }

  const zipHash = sha256File(zipDest);
  fs.writeFileSync("release/final/Xremove-v1.0.0-Full-Windows.zip.sha256.txt", `${zipHash}  Xremove-v1.0.0-Full-Windows.zip\n`);

  // Clean staging
  fs.rmSync("release/pack_staging", { recursive: true, force: true });

  console.log("\n==================================================");
  console.log("FULL RELEASE BUILD COMPLETED SUCCESSFULLY");
  console.log("==================================================");
  console.log("Final ZIP:", zipDest);
  console.log("ZIP SHA256:", zipHash);
  console.log("Final HTML:", finalHtmlDest);
  console.log("HTML SHA256:", htmlHash);

  return {
    zipDest,
    zipHash,
    finalHtmlDest,
    htmlHash,
  };
}

buildRelease().catch((err) => {
  console.error("Full release build failed:", err);
  process.exit(1);
});
