// Centralized file classifier.
// Decides a file's kind from extension + MIME + magic bytes.
// Guarantee: an unknown binary or document file is NEVER classified as plain text.

import { isLegacyDocBytes } from "./docxPreview";

export type FileKind = "image" | "video" | "text" | "document" | "legacy_doc" | "unknown";

export interface Classification {
  kind: FileKind;
  mime: string;
  ext: string;
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

// Detect a concrete binary format from the leading bytes.
function sniffBinary(bytes: Uint8Array, ext: string): FileKind | null {
  // Images
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image"; // PNG
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image"; // JPEG
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image"; // GIF
  if (startsWith(bytes, [0x42, 0x4d])) return "image"; // BMP
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image"; // WEBP (RIFF....WEBP)
  }

  // Videos
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return "video"; // MP4/MOV (ftyp)
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video"; // WEBM/MKV
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x41, 0x56, 0x49, 0x20], 8)
  ) {
    return "video"; // AVI
  }

  // Documents
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "document"; // PDF (%PDF)

  // Legacy Word .doc (OLE)
  if (isLegacyDocBytes(bytes) || ext === "doc") {
    return "legacy_doc";
  }

  // ZIP-based OOXML containers (.docx, .xlsx, .pptx)
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) {
    if (ext === "docx" || ext === "xlsx" || ext === "pptx" || ext === "odt") {
      return "document";
    }
    // Generic zip container is unknown unless specific extension matches
    return "unknown";
  }

  return null;
}

// Returns true only when the bytes look like real text (valid-ish UTF-8, no NULs).
function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;
  let suspicious = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x00) return false; // NUL byte => binary, never text
    // Allow tab/newline/carriage-return; flag other C0 control chars.
    if (b < 0x09 || (b > 0x0d && b < 0x20)) suspicious++;
  }
  return suspicious / bytes.length < 0.1;
}

export async function classifyFile(file: File): Promise<Classification> {
  const ext = extOf(file.name);
  const mime = file.type || "";

  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());

  // 1) Trust concrete magic bytes above everything else.
  const sniffed = sniffBinary(head, ext);
  if (sniffed) {
    if (sniffed === "document" && ext === "docx") {
      return { kind: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext };
    }
    if (sniffed === "document" && ext === "pdf") {
      return { kind: "document", mime: "application/pdf", ext };
    }
    return { kind: sniffed, mime, ext };
  }

  // 2) Check legacy doc
  if (ext === "doc" || isLegacyDocBytes(head)) {
    return { kind: "legacy_doc", mime: "application/msword", ext: "doc" };
  }

  // 3) Fall back to MIME when the browser provides one.
  if (mime.startsWith("image/")) return { kind: "image", mime, ext };
  if (mime.startsWith("video/")) return { kind: "video", mime, ext };
  if (mime === "application/pdf") return { kind: "document", mime, ext };
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return { kind: "document", mime, ext };
  }
  if (mime.startsWith("text/")) return { kind: "text", mime, ext };

  // 4) Known document extensions
  if (ext === "docx") {
    return { kind: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext };
  }
  if (ext === "pdf") {
    return { kind: "document", mime: "application/pdf", ext };
  }

  // 5) Known text-ish extensions, but only if the content actually looks textual.
  const textExts = ["txt", "md", "markdown", "csv", "json", "xml", "log", "rtf"];
  if (textExts.includes(ext) && looksLikeText(head)) {
    return { kind: "text", mime: "text/plain", ext };
  }

  // 6) No signature, no helpful MIME. Only call it text if it really reads as text.
  if (looksLikeText(head)) return { kind: "text", mime: "text/plain", ext };

  // 7) Otherwise it is unknown binary — never text.
  return { kind: "unknown", mime, ext };
}
