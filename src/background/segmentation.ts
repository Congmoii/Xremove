import * as ort from "onnxruntime-web/wasm";
import modelUrl from "../../models/u2netp.onnx?url";
import wasmUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url";

export const MODEL_SHA256 = "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8";
export const MODEL_SIZE = 4_574_861;
export const MAX_IMAGE_PIXELS = 16_000_000;
export const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
const SIZE = 320;

export class ImageInputError extends Error {}
export class ModelLoadError extends Error {}

let sessionPromise: Promise<ort.InferenceSession> | undefined;

async function bytesFromEmbeddedUrl(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok) throw new ModelLoadError(`Asset unavailable (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

async function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const [model, wasm] = await Promise.all([
        bytesFromEmbeddedUrl(modelUrl),
        bytesFromEmbeddedUrl(wasmUrl),
      ]);
      if (model.byteLength !== MODEL_SIZE) throw new ModelLoadError("Model size mismatch");
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", model)))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      if (hash !== MODEL_SHA256) throw new ModelLoadError("Model checksum mismatch");
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmBinary = wasm;
      return ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
    })().catch((error) => {
      sessionPromise = undefined;
      throw error instanceof ModelLoadError ? error : new ModelLoadError(String(error));
    });
  }
  return sessionPromise;
}

function tensorFromCanvas(canvas: HTMLCanvasElement): ort.Tensor {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new ImageInputError("Canvas unavailable");
  const rgba = ctx.getImageData(0, 0, SIZE, SIZE).data;
  let max = 1;
  for (let i = 0; i < rgba.length; i += 4) {
    max = Math.max(max, rgba[i], rgba[i + 1], rgba[i + 2]);
  }
  const values = new Float32Array(3 * SIZE * SIZE);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  for (let i = 0; i < SIZE * SIZE; i++) {
    for (let channel = 0; channel < 3; channel++) {
      values[channel * SIZE * SIZE + i] = (rgba[i * 4 + channel] / max - mean[channel]) / std[channel];
    }
  }
  return new ort.Tensor("float32", values, [1, 3, SIZE, SIZE]);
}

/** The returned mask has one alpha byte per pixel at the original resolution. */
export async function segmentImage(file: File, signal?: AbortSignal, onProcessing?: () => void): Promise<{ width: number; height: number; mask: Uint8ClampedArray }> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    throw new ImageInputError("Unsupported image or file exceeds 40 MB");
  }
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = signature.length >= 8 && signature[0] === 0x89 && signature[1] === 0x50 &&
    signature[2] === 0x4e && signature[3] === 0x47 && signature[4] === 0x0d &&
    signature[5] === 0x0a && signature[6] === 0x1a && signature[7] === 0x0a;
  const jpeg = signature.length >= 3 && signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
  const webp = signature.length >= 12 && String.fromCharCode(...signature.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...signature.slice(8, 12)) === "WEBP";
  if (!(file.type === "image/png" && png || file.type === "image/jpeg" && jpeg ||
    file.type === "image/webp" && webp)) throw new ImageInputError("Image signature does not match its type");
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageInputError("Image could not be decoded");
  }
  try {
    const { width, height } = bitmap;
    if (width < 1 || height < 1 || width * height > MAX_IMAGE_PIXELS) {
      throw new ImageInputError("Image exceeds the 16 megapixel limit");
    }
    const inputCanvas = document.createElement("canvas");
    inputCanvas.width = SIZE;
    inputCanvas.height = SIZE;
    inputCanvas.getContext("2d")?.drawImage(bitmap, 0, 0, SIZE, SIZE);
    const tensor = tensorFromCanvas(inputCanvas);
    const session = await getSession();
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    onProcessing?.();
    const output = await session.run({ [session.inputNames[0]]: tensor });
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const raw = output[session.outputNames[0]].data as Float32Array;
    if (raw.length < SIZE * SIZE) throw new ModelLoadError("Invalid model output");
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const value = raw[i];
      if (!Number.isFinite(value)) throw new ModelLoadError("Non-finite model output");
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    if (max <= min) throw new ModelLoadError("Flat model output");
    const small = document.createElement("canvas");
    small.width = SIZE;
    small.height = SIZE;
    const smallCtx = small.getContext("2d");
    if (!smallCtx) throw new ImageInputError("Canvas unavailable");
    const pixels = smallCtx.createImageData(SIZE, SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) {
      const alpha = Math.round((raw[i] - min) / (max - min) * 255);
      pixels.data.set([alpha, alpha, alpha, 255], i * 4);
    }
    smallCtx.putImageData(pixels, 0, 0);
    const large = document.createElement("canvas");
    large.width = width;
    large.height = height;
    const largeCtx = large.getContext("2d", { willReadFrequently: true });
    if (!largeCtx) throw new ImageInputError("Canvas unavailable");
    largeCtx.imageSmoothingEnabled = true;
    largeCtx.imageSmoothingQuality = "high";
    largeCtx.drawImage(small, 0, 0, width, height);
    const data = largeCtx.getImageData(0, 0, width, height).data;
    const mask = new Uint8ClampedArray(width * height);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4];
    return { width, height, mask };
  } finally {
    bitmap.close();
  }
}
