#!/usr/bin/env python3
"""Xremove Engine B thin adapter.

Delegates all cleaning directly to the vendored upstream repository:
https://github.com/guillaumemeyer/watermarks-remover (commit 3f84d3e3964368b82172112b09ef3e7c02b25749).

This adapter only handles HTTP, CORS, Base64 decoding/encoding, and error reporting.
It contains NO local cleaning or format-detection logic.
"""

from __future__ import annotations

import base64
import http.server
import json
import os
import socketserver
import sys
from pathlib import Path

# Setup logs directory
LOGS_DIR = Path(__file__).resolve().parent.parent / "logs"
try:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
except Exception:
    pass
ENGINE_B_LOG = LOGS_DIR / "engine-b.log"

def _log(msg: str):
    try:
        sys.stderr.write(msg + "\n")
        sys.stderr.flush()
    except Exception:
        pass
    try:
        with open(ENGINE_B_LOG, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except Exception:
        pass

# Prepend bundled tools/ffmpeg to PATH if present
TOOLS_FFMPEG_DIR = Path(__file__).resolve().parent.parent / "tools" / "ffmpeg"
if TOOLS_FFMPEG_DIR.is_dir():
    os.environ["PATH"] = str(TOOLS_FFMPEG_DIR) + os.pathsep + os.environ.get("PATH", "")

# Add vendored upstream service/scripts to Python path
UPSTREAM_SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "vendor" / "watermarks-remover" / "service" / "scripts"
if str(UPSTREAM_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(UPSTREAM_SCRIPTS_DIR))

# Import the real vendored upstream pipeline
from server import _clean_payload, capabilities, VERSION as UPSTREAM_VERSION

PORT = 8765

class EngineBHandler(http.server.BaseHTTPRequestHandler):
    def _set_headers(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_GET(self):
        if self.path == "/health":
            self._set_headers(200)
            self.wfile.write(json.dumps({
                "status": "ok",
                "ok": True,
                "service": "Engine B (watermarks-remover)",
                "upstream_version": UPSTREAM_VERSION,
                "pinned_commit": "3f84d3e3964368b82172112b09ef3e7c02b25749"
            }).encode("utf-8"))
        elif self.path == "/capabilities":
            self._set_headers(200)
            self.wfile.write(json.dumps(capabilities()).encode("utf-8"))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"ok": False, "error": "Not found"}).encode("utf-8"))

    def do_POST(self):
        if self.path == "/clean":
            content_length = int(self.headers.get("Content-Length", 0))
            body_bytes = self.rfile.read(content_length)
            try:
                payload = json.loads(body_bytes.decode("utf-8"))
                # Support both Xremove ({data, filename, mime}) and upstream ({file, name, options}) conventions
                raw_b64 = payload.get("data") or payload.get("file") or ""
                filename = payload.get("filename") or payload.get("name") or "document.txt"
                mime = payload.get("mime", "text/plain")
                options = payload.get("options") or {}

                raw_bytes = base64.b64decode(raw_b64)

                # Delegate directly to vendored upstream pipeline
                upstream_result = _clean_payload(raw_bytes, filename, options)

                cleaned_b64 = upstream_result.get("cleaned", "")

                self._set_headers(200)
                self.wfile.write(json.dumps({
                    "ok": True,
                    "data": cleaned_b64,
                    "cleaned": cleaned_b64,
                    "filename": filename,
                    "mime": mime,
                    "report": upstream_result.get("report", {})
                }).encode("utf-8"))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode("utf-8"))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"ok": False, "error": "Not found"}).encode("utf-8"))

    def log_message(self, format, *args):
        _log("%s - - [%s] %s" % (self.address_string(), self.log_date_time_string(), format % args))

def run():
    _log(f"Starting Engine B upstream adapter on http://127.0.0.1:{PORT}")
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), EngineBHandler) as httpd:
        _log(f"Engine B upstream adapter running on http://127.0.0.1:{PORT}")
        httpd.serve_forever()

if __name__ == "__main__":
    run()
