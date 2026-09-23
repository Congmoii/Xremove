#!/usr/bin/env python3
"""Loopback-only Xremove UI and bounded, cancellable companion jobs."""
from __future__ import annotations

import hmac
import http.server
import json
import os
import queue
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("XREMOVE_PORT", "8765"))
ORIGIN = f"http://127.0.0.1:{PORT}"
UI_FILE = Path(os.environ.get("XREMOVE_UI_PATH", str(ROOT / "Xremove.html")))
WORKER = Path(__file__).with_name("job_worker.py")
SESSION = secrets.token_urlsafe(32)
SERVICE_ID = "xremove-local-jobs"
VERSION = "1.1.1"
MAX_UPLOAD = 100 * 1024 * 1024
MAX_RESULT = 200 * 1024 * 1024
MAX_QUEUED = 8
JOB_TTL = 60 * 60
WORKER_TIMEOUT = 15 * 60
JOB_BASE = Path(tempfile.gettempdir()) / "Xremove-jobs"
JOB_BASE.mkdir(mode=0o700, exist_ok=True)
RUN_DIR = Path(tempfile.mkdtemp(prefix="run-", dir=JOB_BASE))
jobs: dict[str, dict] = {}
jobs_lock = threading.RLock()
pending: queue.Queue[str] = queue.Queue()


def discard(job: dict):
    for file in (job["input"], job["output"], job["report"], Path(job["output"]).with_suffix(".part")):
        try:
            Path(file).unlink(missing_ok=True)
        except OSError:
            pass


def cleanup_stale():
    cutoff = time.time() - 24 * 60 * 60
    for path in JOB_BASE.iterdir():
        if path == RUN_DIR or not path.name.startswith("run-") or path.is_symlink() or not path.is_dir():
            continue
        try:
            if path.stat().st_mtime < cutoff:
                shutil.rmtree(path)
        except OSError:
            pass


def janitor():
    while True:
        time.sleep(60)
        with jobs_lock:
            expired = [key for key, job in jobs.items() if time.time() - job["created"] > JOB_TTL]
            for key in expired:
                job = jobs.pop(key)
                process = job.get("process")
                if process and process.poll() is None:
                    process.terminate()
                discard(job)


def run_jobs():
    while True:
        job_id = pending.get()
        with jobs_lock:
            job = jobs.get(job_id)
            if not job or job["status"] != "queued":
                pending.task_done()
                continue
            job["status"] = "running"
            command = [sys.executable, str(WORKER), str(job["input"]), str(job["output"]), str(job["report"]), job["filename"], job["operation"]]
            try:
                process = subprocess.Popen(
                    command, cwd=ROOT, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
                )
                job["process"] = process
            except OSError:
                job["status"] = "error"
                job["error"] = "Could not start local worker"
                discard(job)
                pending.task_done()
                continue
        try:
            process.wait(timeout=WORKER_TIMEOUT)
        except subprocess.TimeoutExpired:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            with jobs_lock:
                job["error"] = "Processing time limit exceeded"
        with jobs_lock:
            if job["status"] == "cancelling":
                job["status"] = "cancelled"
                discard(job)
            elif process.returncode == 0 and Path(job["output"]).is_file() and 0 < Path(job["output"]).stat().st_size <= MAX_RESULT:
                try:
                    job["report_data"] = json.loads(Path(job["report"]).read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    job["report_data"] = {}
                job["status"] = "done"
                Path(job["input"]).unlink(missing_ok=True)
            else:
                job["status"] = "error"
                job["error"] = job.get("error") or "Local processing failed or returned invalid output"
                discard(job)
            job["process"] = None
        pending.task_done()


def public_job(job: dict) -> dict:
    return {
        "id": job["id"], "status": job["status"], "filename": job["filename"],
        "created": job["created"], "error": job.get("error"), "report": job.get("report_data")
    }


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "Xremove/1.1"
    protocol_version = "HTTP/1.1"

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def log_message(self, fmt, *args):
        pass  # Never log paths, tokens, filenames or uploaded content.

    def respond(self, status: int, data: bytes, content_type: str = "application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def json(self, status: int, value: dict):
        self.respond(status, json.dumps(value, ensure_ascii=False).encode("utf-8"))

    def respond_file(self, file: Path, content_type: str):
        with file.open("rb") as source:
            size = file.stat().st_size
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(size))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            while chunk := source.read(1024 * 1024):
                self.wfile.write(chunk)

    def guard(self, mutation=False) -> bool:
        if self.headers.get("Host") != f"127.0.0.1:{PORT}":
            self.json(403, {"error": "Invalid host"})
            return False
        origin = self.headers.get("Origin")
        if origin is not None and origin != ORIGIN:
            self.json(403, {"error": "Invalid origin"})
            return False
        if mutation and origin != ORIGIN:
            self.json(403, {"error": "Same-origin request required"})
            return False
        return True

    def authorized(self) -> bool:
        if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + SESSION):
            self.json(401, {"error": "Session required"})
            return False
        return True

    def do_OPTIONS(self):
        self.close_connection = True
        self.json(403, {"error": "Cross-origin requests are disabled"})

    def do_GET(self):
        if not self.guard():
            return
        path = urlsplit(self.path).path
        if path in ("/", "/Xremove.html"):
            if UI_FILE.is_file():
                try:
                    self.respond_file(UI_FILE, "text/html; charset=utf-8")
                except (OSError, BrokenPipeError, ConnectionResetError):
                    self.close_connection = True
            else:
                self.json(404, {"error": "UI is missing"})
        elif path in ("/api/health", "/health"):
            self.json(200, {"ok": True, "service": SERVICE_ID, "version": VERSION})
        elif path == "/api/session":
            self.json(200, {"token": SESSION, "service": SERVICE_ID, "version": VERSION})
        elif re.fullmatch(r"/api/jobs/[0-9a-f]{32}", path):
            if not self.authorized():
                return
            with jobs_lock:
                job = jobs.get(path.rsplit("/", 1)[1])
                data = public_job(job) if job else None
            self.json(200, data) if data else self.json(404, {"error": "Job not found"})
        elif re.fullmatch(r"/api/jobs/[0-9a-f]{32}/result", path):
            if not self.authorized():
                return
            key = path.split("/")[3]
            with jobs_lock:
                job = jobs.get(key)
                if not job:
                    self.json(404, {"error": "Job not found"})
                    return
                if job["status"] != "done":
                    self.json(409, {"error": "Result is not ready"})
                    return
                result_path = Path(job["output"])
                mime = job["mime"]
            try:
                self.respond_file(result_path, mime)
            except (OSError, BrokenPipeError, ConnectionResetError):
                self.close_connection = True
        else:
            self.json(404, {"error": "Not found"})

    def do_POST(self):
        # Rejecting an upload without consuming its body must close this connection.
        self.close_connection = True
        if not self.guard(mutation=True):
            return
        if urlsplit(self.path).path != "/api/jobs":
            self.json(404, {"error": "Not found"})
            return
        if not self.authorized():
            return
        if self.headers.get("Content-Type") != "application/octet-stream":
            self.json(415, {"error": "Binary upload required"})
            return
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self.json(411, {"error": "Content-Length required"})
            return
        if not 0 < length <= MAX_UPLOAD:
            self.json(413, {"error": "File is empty or exceeds 100 MB"})
            return
        filename = unquote(self.headers.get("X-File-Name", ""))
        if not filename or len(filename) > 255 or any(ch in filename for ch in "/\\\0\r\n"):
            self.json(400, {"error": "Invalid filename"})
            return
        mime = self.headers.get("X-File-Type", "application/octet-stream")
        if len(mime) > 100 or not re.fullmatch(r"[\w.+-]+/[\w.+-]+", mime):
            self.json(400, {"error": "Invalid media type"})
            return
        operation = self.headers.get("X-Operation", "clean")
        if operation not in ("clean", "metadata"):
            self.json(400, {"error": "Invalid operation"})
            return
        with jobs_lock:
            count = sum(job["status"] in ("queued", "running", "cancelling") for job in jobs.values())
            if count >= MAX_QUEUED + 1:
                self.json(429, {"error": "Job queue is full"})
                return
            key = secrets.token_hex(16)
            base = RUN_DIR / key
            job = {
                "id": key, "status": "queued", "filename": filename, "mime": mime, "operation": operation,
                "created": time.time(), "input": base.with_suffix(".in"),
                "output": base.with_suffix(".out"), "report": base.with_suffix(".json")
            }
            jobs[key] = job
        try:
            remaining = length
            with open(job["input"], "xb") as file:
                while remaining:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ConnectionError("Incomplete upload")
                    file.write(chunk)
                    remaining -= len(chunk)
        except (OSError, ConnectionError):
            with jobs_lock:
                jobs.pop(key, None)
            discard(job)
            self.json(400, {"error": "Incomplete upload"})
            return
        pending.put(key)
        self.json(202, public_job(job))

    def do_DELETE(self):
        if not self.guard(mutation=True) or not self.authorized():
            return
        path = urlsplit(self.path).path
        if not re.fullmatch(r"/api/jobs/[0-9a-f]{32}", path):
            self.json(404, {"error": "Not found"})
            return
        with jobs_lock:
            job = jobs.get(path.rsplit("/", 1)[1])
            if not job:
                self.json(404, {"error": "Job not found"})
                return
            if job["status"] == "queued":
                job["status"] = "cancelled"
                discard(job)
            elif job["status"] in ("running", "cancelling"):
                job["status"] = "cancelling"
                process = job.get("process")
                if process and process.poll() is None:
                    process.terminate()
            data = public_job(job)
        self.json(200, data)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    slots = threading.BoundedSemaphore(16)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


def run():
    cleanup_stale()
    threading.Thread(target=run_jobs, daemon=True, name="xremove-worker").start()
    threading.Thread(target=janitor, daemon=True, name="xremove-janitor").start()
    with Server(("127.0.0.1", PORT), Handler) as server:
        print(f"Xremove {VERSION} serving {ORIGIN}", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    run()
