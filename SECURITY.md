# Security Policy

## Supported Versions

Only the latest stable release of Xremove is supported for security updates.

| Version | Supported          |
| :---    | :---               |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

---

## Security Architecture Scope

The security surface of Xremove includes:
1. **Native Windows Launcher (`launcher/XremoveLauncher.cs`)**: Validates application root integrity, restricts companion service binding to loopback (`127.0.0.1`), and manages process lifecycles.
2. **Local Engine B Companion Service (`service/engine_b_service.py`)**: Binds exclusively to loopback (`127.0.0.1:8765`), accepts local Base64 payloads, and prevents arbitrary code execution.
3. **Frontend Document & File Classifiers (`src/lib/classify.ts`, `src/lib/docxPreview.ts`)**: Safely parses OOXML ZIP structures in client memory without executing untrusted macros or external payloads.

---

## Reporting a Vulnerability

If you discover a potential security vulnerability in Xremove, please do **not** open a public issue.

Instead, report it privately through **[GitHub Security Advisories](https://github.com/topics/security-advisories)** on the repository (click **Security** > **Advisories** > **Report a vulnerability**).

If private advisories are not yet configured on your fork, please contact the maintainers via the designated security reporting channel before publishing details.

Please include in your report:
- Type of issue (e.g., buffer handling, local loopback bypass, XXE/XML parsing vulnerability)
- Full reproduction steps and proof-of-concept (using non-sensitive synthetic test files)
- Impact assessment
