# Upstream Version Pinning and Provenance

Xremove strictly pins all third-party algorithm implementations to ensure reproducible results, algorithmic integrity, and security auditability.

| Upstream Project | Repository | Pinned Reference | License | Integration Route |
| :--- | :--- | :--- | :--- | :--- |
| **gemini-watermark-remover** | `GargantuaX/gemini-watermark-remover` | Commit `bef0303a437902286a18ab4d1586629f198b90b7` | MIT | `package.json` direct GitHub dependency (Engine A) |
| **watermarks-remover** | `guillaumemeyer/watermarks-remover` | Commit `3f84d3e3964368b82172112b09ef3e7c02b25749` | MIT | Bootstrapped upstream service scripts (Engine B) |
| **U2NetP ONNX model** | `edgetools/u2netp` | SHA-256 `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`; 4,574,861 bytes | Publisher declares Apache-2.0; exact binary provenance requires independent review | Fetched on build; embedded in generated HTML, excluded from Git |
| **ONNX Runtime Web** | `microsoft/onnxruntime` | npm `1.27.0` | MIT | Browser CPU/WASM inference |
| **fflate** | `101arrowz/fflate` | npm `0.8.2` | MIT | Browser ZIP export |

## Upstream Pinning Policy

1. **Deterministic Hashes**: Dependencies must not float to `latest` or untracked branch heads.
2. **Manual Review Required**: Any update to upstream commits must undergo a full test matrix audit covering Image, TXT, DOCX, and Launcher behavior before merging.
