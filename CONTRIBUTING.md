# Contributing to Xremove

Thank you for your interest in contributing to Xremove! We welcome issues, bug fixes, enhancements, and documentation improvements.

---

## Development Prerequisites

- **Node.js**: v20.x or v22.x LTS
- **Package Manager**: `pnpm` (v12.1.0 or compatible)
- **Python**: 3.10+ (for local Engine B service development and tests)
- **Git**: 2.30+

---

## Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/<your-username>/Xremove.git
   cd Xremove
   ```

2. **Install frontend dependencies (frozen lockfile):**
   ```bash
   pnpm install --frozen-lockfile
   ```

3. **Bootstrap the pinned Engine B upstream dependency:**
   ```bash
   pnpm run bootstrap:vendor
   ```

4. **Run the local development server:**
   ```bash
   pnpm run dev
   ```

---

## Code Quality and Verification Standards

Before submitting a Pull Request, verify that all checks pass cleanly:

```bash
# 1. Type check
pnpm run typecheck

# 2. Run unit tests
pnpm test

# 3. Production bundle build
pnpm run build
```

---

## Privacy and Contribution Guidelines

1. **Strict Privacy**: Never commit private, proprietary, or personal documents into test fixtures or examples. Use generic synthetic text and test documents only.
2. **Deterministic Upstream Pins**: Do not upgrade or float third-party algorithm commits without formal testing and approval.
3. **No Hidden Telemetry**: All features must remain local-first. Do not introduce remote telemetry, tracking, or mandatory external cloud services.
4. **Pull Requests**:
   - Provide a clear description of what changed and why.
   - Reference any related issues.
   - Ensure all automated checks pass.
