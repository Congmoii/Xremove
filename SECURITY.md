# Security Policy

## Supported version

Security fixes target the latest `1.1.x` source and HTML build. Older Windows packages are not maintained by the HTML-only release process.

## Scope

The standalone HTML processes supported files in the browser. It does not need the local Python service. A separate, legacy Windows service exists in the source tree and binds to loopback; it accepts binary uploads for supported jobs. Report vulnerabilities affecting either path.

Generated HTML embeds an ONNX model fetched during build. The source repository excludes the model and verifies its pinned SHA-256 when downloading it. This integrity check does not establish the right to redistribute the model; see [third-party notices](THIRD_PARTY_LICENSES.md).

## Reporting a vulnerability

Use the repository's **Security → Advisories → Report a vulnerability** option if private reporting is enabled. Do not include sensitive user documents; use synthetic reproductions. If private reporting is unavailable, contact the repository maintainer privately before opening a public issue with exploit details.
