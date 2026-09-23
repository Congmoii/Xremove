#!/usr/bin/env python3
"""One upstream cleaning operation in a killable child process."""
import base64
import json
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
ffmpeg = root / "tools" / "ffmpeg"
if ffmpeg.is_dir():
    os.environ["PATH"] = str(ffmpeg) + os.pathsep + os.environ.get("PATH", "")
sys.path.insert(0, str(root / "vendor" / "watermarks-remover" / "service" / "scripts"))
from server import _clean_payload  # noqa: E402


def main():
    input_path, output_path, report_path = map(Path, sys.argv[1:4])
    filename = sys.argv[4]
    operation = sys.argv[5] if len(sys.argv) > 5 else "clean"
    if operation not in ("clean", "metadata"):
        raise ValueError("Unsupported operation")
    if operation == "metadata" and Path(filename).suffix.lower() not in (
        ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff",
        ".mp4", ".mov", ".webm", ".mkv", ".pdf", ".docx",
    ):
        raise ValueError("Metadata cleaning does not support this file type")
    options = {"strip_all_metadata": True, "also_layer_a_text": False} if operation == "metadata" else {}
    result = _clean_payload(input_path.read_bytes(), filename, options)
    output = base64.b64decode(result.get("cleaned", ""), validate=True)
    if not output:
        raise ValueError("Empty output")
    temporary = output_path.with_suffix(".part")
    temporary.write_bytes(output)
    os.replace(temporary, output_path)
    report = result.get("report", {})
    report["operation"] = operation
    report_path.write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
