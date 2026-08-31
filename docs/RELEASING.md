# Releasing Xremove

This guide outlines the standard procedure for building, verifying, and publishing an official Xremove release.

---

## 1. Clean Pre-Flight Verification

Ensure your working directory is clean and all tests pass:

```bash
# 1. Ensure frozen dependencies
pnpm install --frozen-lockfile

# 2. Type check
pnpm run typecheck

# 3. Unit tests
pnpm test

# 4. Production bundle build
pnpm run build
```

---

## 2. Build the Full Windows Distribution Package

Generate the all-in-one distribution bundle:

```bash
node scripts/create_release.mjs
```

This script:
1. Builds the singlefile `Xremove.html`.
2. Compiles `launcher/XremoveLauncher.cs` into native `Xremove.exe`.
3. Stages the bundled Python runtime and vendor dependencies.
4. Packages everything into `release/final/Xremove-v1.0.0-Full-Windows.zip`.
5. Computes the SHA256 checksum.

---

## 3. Real-World E2E Verification

Before publishing any release:
1. Extract `release/final/Xremove-v1.0.0-Full-Windows.zip` into a clean test location.
2. Run `Xremove.exe` directly.
3. Verify that:
   - `/health` responds with HTTP 200.
   - Images, TXT files, and DOCX files process accurately.
   - Cleaned output opens in Microsoft Word without repair warnings.
   - Loose execution outside the folder produces the expected bilingual guidance.

---

## 4. Tagging and Publishing to GitHub

```bash
# 1. Create a signed Git release tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# 2. Attach the generated ZIP and SHA256 to the GitHub Release
```
