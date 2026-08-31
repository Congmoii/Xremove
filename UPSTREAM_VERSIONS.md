# Upstream Version Pinning and Provenance

Xremove strictly pins all third-party algorithm implementations to ensure reproducible results, algorithmic integrity, and security auditability.

| Upstream Project | Repository | Pinned Reference | License | Integration Route |
| :--- | :--- | :--- | :--- | :--- |
| **gemini-watermark-remover** | `GargantuaX/gemini-watermark-remover` | Commit `bef0303a437902286a18ab4d1586629f198b90b7` | MIT | `package.json` direct GitHub dependency (Engine A) |
| **watermarks-remover** | `guillaumemeyer/watermarks-remover` | Commit `3f84d3e3964368b82172112b09ef3e7c02b25749` | MIT | Bootstrapped upstream service scripts (Engine B) |

## Upstream Pinning Policy

1. **Deterministic Hashes**: Dependencies must not float to `latest` or untracked branch heads.
2. **Manual Review Required**: Any update to upstream commits must undergo a full test matrix audit covering Image, TXT, DOCX, and Launcher behavior before merging.
