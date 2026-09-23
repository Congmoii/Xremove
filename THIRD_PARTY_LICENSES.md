# Third-Party Licenses and Notices

Xremove incorporates and interfaces with open-source software packages. This document acknowledges upstream projects, their respective licenses, and their roles within Xremove.

---

## 1. gemini-watermark-remover (Engine A Client SDK)

- **Project URL:** https://github.com/GargantuaX/gemini-watermark-remover
- **Pinned Commit:** `bef0303a437902286a18ab4d1586629f198b90b7`
- **License:** MIT License
- **Purpose:** Provides client-side in-browser canvas cleaning for supported image watermark workflows.

### License Text (MIT):

```text
MIT License

Copyright (c) 2024 GargantuaX

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. watermarks-remover (Engine B Companion Pipeline)

- **Project URL:** https://github.com/guillaumemeyer/watermarks-remover
- **Pinned Commit:** `3f84d3e3964368b82172112b09ef3e7c02b25749`
- **License:** MIT License
- **Purpose:** Provides local Python service algorithms for text invisible Unicode removal, document/container cleaning (DOCX, PDF), and metadata inspection.

### License Text (MIT):

```text
MIT License

Copyright (c) 2024 Guillaume Meyer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 3. Frontend & Build Dependencies

- **React / React DOM** — MIT License (Meta Platforms, Inc.)
- **Tailwind CSS** — MIT License (Tailwind Labs, Inc.)
- **Vite** — MIT License (Yuxi Evan You & Vite contributors)
- **TypeScript** — Apache-2.0 License (Microsoft Corporation)

The HTML release candidate includes bundled runtime notices in `licenses/React-MIT.txt`, `licenses/Tailwind-MIT.txt`, `licenses/ONNX-Runtime-MIT.txt` and `licenses/fflate-MIT.txt`. React DOM shares the React MIT notice.

---

## 4. Offline background-removal components (HTML v1.1.2)

- **ONNX Runtime Web 1.27.0** — MIT License, Microsoft and contributors. Browser CPU/WASM inference. [Project license](https://github.com/microsoft/onnxruntime/blob/main/LICENSE).
- **fflate 0.8.2** — MIT License, Arjun Barrett. Local ZIP export. [Project license](https://github.com/101arrowz/fflate/blob/master/LICENSE).
- **U2NetP `u2netp.onnx`** — SHA-256 `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`, 4,574,861 bytes. Downloaded from [edgetools/u2netp](https://huggingface.co/edgetools/u2netp), whose model card declares Apache-2.0 and describes it as a byte-identical mirror of a rembg asset. The [U²-Net source project](https://github.com/xuebinqin/U-2-Net/blob/master/LICENSE) uses Apache-2.0. The complete Apache 2.0 text is included in `licenses/Apache-2.0.txt`.

Model citation: Qin, Xuebin et al., “U2-Net: Going Deeper with Nested U-Structure for Salient Object Detection,” *Pattern Recognition* 106 (2020), 107404.

**Provenance review before public distribution:** the mirror asserts the model's license, but the original checkpoint-to-ONNX conversion and permission for this exact redistributed binary have not been independently confirmed. A [rembg provenance question](https://github.com/danielgatis/rembg/issues/837) about a related U2Net asset illustrates the distinction between a source-code license and model-weight rights. Keep this local build under review until provenance is confirmed; do not infer commercial redistribution rights solely from the rembg MIT code license.

The source repository omits the ONNX binary. `scripts/ensure_model.mjs` retrieves the pinned bytes and verifies their size and SHA-256 before building. A generated HTML file embeds the model and therefore remains subject to the provenance review above.

## 5. FFmpeg in legacy Windows packages

Older Windows ZIPs used a gyan.dev FFmpeg full static build configured with `--enable-gpl --enable-version3`. Those ZIPs and FFmpeg executables are excluded from the Git repository and the new HTML-only release candidate. Do not republish the old ZIPs without reviewing applicable GPLv3 notices and corresponding-source obligations; see [FFmpeg's legal guidance](https://www.ffmpeg.org/legal.html).
