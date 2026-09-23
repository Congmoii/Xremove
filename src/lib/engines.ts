// Processing engines + router.
// Engine A: GargantuaX browser SDK (real algorithm, images only).
// Engine B: local service at http://127.0.0.1:8765 for everything else.
// The router picks an engine from the classification; engine choice is never exposed in the UI.

import { removeWatermarkFromImage } from "gemini-watermark-remover/browser";
export { removeWatermarkFromImage };
import type { Classification } from "./classify";
import { cleanLocalDocx, cleanLocalTextFile } from "./localTextClean.ts";

const PENDING_KEY = "xremove.pendingJob";
const SERVICE_ID = "xremove-local-jobs";
const SERVICE_VERSION = "1.1.1";
export type ProcessingOperation = "clean" | "metadata";

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
async function processWithEngineA(file: File, signal?: AbortSignal): Promise<ProcessResult> {
  signal?.throwIfAborted();
  const img = await loadImage(file);
  const { canvas } = await removeWatermarkFromImage(img);
  signal?.throwIfAborted();
  const type = file.type && file.type.startsWith("image/") ? file.type : "image/png";
  const blob = await canvasToBlob(canvas, type);
  return { blob, filename: outputName(file.name) };
}

export interface PendingServiceJob { id: string; filename: string; mime: string; operation?: ProcessingOperation }

export function pendingServiceJob(): PendingServiceJob | null {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
    return value && /^[0-9a-f]{32}$/.test(value.id) && typeof value.filename === "string" &&
      typeof value.mime === "string" && (value.operation === undefined || value.operation === "clean" || value.operation === "metadata") ? value : null;
  } catch {
    return null;
  }
}

function rememberJob(job: PendingServiceJob | null) {
  try {
    if (job) localStorage.setItem(PENDING_KEY, JSON.stringify(job));
    else localStorage.removeItem(PENDING_KEY);
  } catch { /* private browsing may deny storage */ }
}

async function serviceToken(): Promise<string> {
  if (typeof location === "undefined" || location.protocol !== "http:" || location.hostname !== "127.0.0.1") {
    throw new EngineUnavailableError("Open Xremove.exe to use local document and video jobs");
  }
  try {
    const health = await fetch("/api/health", { signal: AbortSignal.timeout(3000) });
    const identity = await health.json();
    if (!health.ok || identity.service !== SERVICE_ID || identity.version !== SERVICE_VERSION) {
      throw new EngineUnavailableError("A different or outdated local service is running");
    }
    const response = await fetch("/api/session", { signal: AbortSignal.timeout(3000) });
    const session = await response.json();
    if (!response.ok || session.service !== SERVICE_ID || session.version !== SERVICE_VERSION ||
      typeof session.token !== "string") throw new EngineUnavailableError("Invalid service session");
    return session.token;
  } catch (error) {
    if (error instanceof EngineUnavailableError) throw error;
    throw new EngineUnavailableError("Local service is unavailable");
  }
}

async function jobRequest(path: string, token: string, init: RequestInit = {}) {
  return fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
}

async function awaitServiceJob(job: PendingServiceJob, token: string, signal?: AbortSignal): Promise<ProcessResult> {
  let disconnected = 0;
  const cancel = () => {
    void jobRequest(`/api/jobs/${job.id}`, token, { method: "DELETE" }).catch(() => undefined);
    rememberJob(null);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      signal?.throwIfAborted();
      let response: Response;
      try {
        response = await jobRequest(`/api/jobs/${job.id}`, token, { signal: AbortSignal.timeout(5000) });
      } catch {
        // The job keeps running in the service while the UI is disconnected.
        if (++disconnected >= 20) throw new EngineUnavailableError("Connection lost; reconnect to check the job");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      disconnected = 0;
      if (response.status === 401) {
        rememberJob(null);
        throw new EngineUnavailableError("Service session changed; the previous job cannot be resumed");
      }
      if (response.status === 404) {
        rememberJob(null);
        throw new EngineUnavailableError("Job no longer exists (service restarted or result expired)");
      }
      if (!response.ok) throw new EngineUnavailableError(`Service status error ${response.status}`);
      const state = await response.json();
      if (state.status === "done") {
        const result = await jobRequest(`/api/jobs/${job.id}/result`, token, { signal: AbortSignal.timeout(30000) });
        if (!result.ok) throw new EngineUnavailableError(`Result unavailable (${result.status})`);
        const blob = await result.blob();
        if (!blob.size) throw new Error("Invalid output");
        rememberJob(null);
        return { blob, filename: outputName(job.filename), report: state.report };
      }
      if (state.status === "error" || state.status === "cancelled") {
        rememberJob(null);
        throw new Error(state.error || `Job ${state.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

export async function resumeServiceJob(signal?: AbortSignal): Promise<{ result: ProcessResult; job: PendingServiceJob } | null> {
  const job = pendingServiceJob();
  if (!job) return null;
  const token = await serviceToken();
  return { result: await awaitServiceJob(job, token, signal), job };
}

// Binary upload; the service owns the job independently of the browser tab.
async function processWithEngineB(file: File, operation: ProcessingOperation, signal?: AbortSignal): Promise<ProcessResult> {
  if (file.size === 0 || file.size > 100 * 1024 * 1024) throw new UnsupportedFileError("File exceeds 100 MB or is empty");
  const token = await serviceToken();
  signal?.throwIfAborted();
  const response = await jobRequest("/api/jobs", token, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
      "X-File-Type": file.type || "application/octet-stream",
      "X-Operation": operation,
    },
    body: file,
    signal,
  });
  if (!response.ok) throw new EngineUnavailableError(`Service rejected upload (${response.status})`);
  const data = await response.json();
  if (!/^[0-9a-f]{32}$/.test(data.id)) throw new EngineUnavailableError("Invalid job ID");
  const job = { id: data.id, filename: file.name, mime: file.type || "application/octet-stream", operation };
  rememberJob(job);
  return awaitServiceJob(job, token, signal);
}

// Router — maps classification to an engine. No UI exposure.
export async function processFile(
  file: File,
  cls: Classification,
  signal?: AbortSignal,
  operation: ProcessingOperation = "clean",
): Promise<ProcessResult> {
  signal?.throwIfAborted();
  if (operation === "clean" && cls.kind === "text") {
    const result = await cleanLocalTextFile(file);
    signal?.throwIfAborted();
    return result;
  }
  if (operation === "clean" && cls.kind === "document" && cls.ext === "docx") {
    const result = await cleanLocalDocx(file);
    signal?.throwIfAborted();
    return result;
  }
  if (operation === "metadata") {
    if (cls.kind === "image" || cls.kind === "video" || cls.kind === "document") {
      return processWithEngineB(file, operation, signal);
    }
    throw new UnsupportedFileError("Metadata-only mode supports images, video, PDF and DOCX");
  }
  switch (cls.kind) {
    case "image":
      return processWithEngineA(file, signal);
    case "video":
    case "text":
    case "document":
      return processWithEngineB(file, operation, signal);
    case "legacy_doc":
      throw new LegacyDocError("Legacy .doc files are not currently supported. Please save the document as .docx.");
    default:
      throw new UnsupportedFileError(cls.kind);
  }
}
