// Processing engines + router.
// Engine A: GargantuaX browser SDK (real algorithm, images only).
// Engine B: local service at http://127.0.0.1:8765 for everything else.
// The router picks an engine from the classification; engine choice is never exposed in the UI.

import { removeWatermarkFromImage } from "gemini-watermark-remover/browser";
export { removeWatermarkFromImage };
import type { Classification } from "./classify";

const SERVICE_URL = "http://127.0.0.1:8765";

export interface ProcessReport {
  kind?: string;
  stats?: {
    input_length?: number;
    output_length?: number;
    removed?: Record<string, number>;
    replaced?: Record<string, number>;
    removed_count?: number;
    replaced_count?: number;
    nfkc_changed?: boolean;
  };
  changed?: boolean;
  actions?: string[];
  [key: string]: unknown;
}

export interface ProcessResult {
  blob: Blob;
  filename: string;
  report?: ProcessReport;
}

export class EngineUnavailableError extends Error {}
export class UnsupportedFileError extends Error {}
export class LegacyDocError extends Error {}

// Build "<original>_xremove.<ext>" without clobbering the source name.
function outputName(original: string): string {
  const dot = original.lastIndexOf(".");
  if (dot <= 0) return `${original}_xremove`;
  return `${original.slice(0, dot)}_xremove${original.slice(dot)}`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))),
      type,
    );
  });
}

// Engine A — real GargantuaX SDK. We do not reimplement the algorithm.
async function processWithEngineA(file: File): Promise<ProcessResult> {
  const img = await loadImage(file);
  const { canvas } = await removeWatermarkFromImage(img);
  const type = file.type && file.type.startsWith("image/") ? file.type : "image/png";
  const blob = await canvasToBlob(canvas, type);
  return { blob, filename: outputName(file.name) };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function serviceHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVICE_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Engine B — local service. Sends Base64, decodes the cleaned Base64 result.
async function processWithEngineB(file: File): Promise<ProcessResult> {
  if (!(await serviceHealthy())) {
    throw new EngineUnavailableError("Local service is unavailable");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const res = await fetch(`${SERVICE_URL}/clean`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mime: file.type,
      data: toBase64(bytes),
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new EngineUnavailableError(`Service error ${res.status}`);

  const payload = await res.json();
  const cleaned = fromBase64(payload.data || payload.cleaned);
  const outType = payload.mime || file.type || "application/octet-stream";
  const arr = new Uint8Array(cleaned);
  const blob = new Blob([arr], { type: outType });
  return { blob, filename: outputName(file.name), report: payload.report };
}

// Router — maps classification to an engine. No UI exposure.
export async function processFile(
  file: File,
  cls: Classification,
): Promise<ProcessResult> {
  switch (cls.kind) {
    case "image":
      return processWithEngineA(file);
    case "video":
    case "text":
    case "document":
      return processWithEngineB(file);
    case "legacy_doc":
      throw new LegacyDocError("Legacy .doc files are not currently supported. Please save the document as .docx.");
    default:
      throw new UnsupportedFileError(cls.kind);
  }
}
