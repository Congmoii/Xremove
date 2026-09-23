export type BackgroundFill =
  | { kind: "transparent" }
  | { kind: "color"; color: string }
  | { kind: "image"; image: ImageBitmap };

type Stroke = { indices: number[]; before: number[]; after: number[] };

/** Keeps the original image immutable; only alpha-mask pixels are edited. */
export class MaskEditor {
  readonly width: number;
  readonly height: number;
  readonly mask: Uint8ClampedArray;
  private undoStack: Stroke[] = [];
  private redoStack: Stroke[] = [];
  private current = new Map<number, number>();

  constructor(width: number, height: number, initialMask: Uint8ClampedArray) {
    if (initialMask.length !== width * height) throw new Error("Mask dimensions mismatch");
    this.width = width;
    this.height = height;
    this.mask = new Uint8ClampedArray(initialMask);
  }

  startStroke() { this.current.clear(); }

  paint(x: number, y: number, radius: number, mode: "erase" | "restore") {
    const target = mode === "restore" ? 255 : 0;
    const left = Math.max(0, Math.floor(x - radius));
    const right = Math.min(this.width - 1, Math.ceil(x + radius));
    const top = Math.max(0, Math.floor(y - radius));
    const bottom = Math.min(this.height - 1, Math.ceil(y + radius));
    for (let py = top; py <= bottom; py++) {
      for (let px = left; px <= right; px++) {
        const distance = Math.hypot(px - x, py - y);
        if (distance > radius) continue;
        const index = py * this.width + px;
        if (!this.current.has(index)) this.current.set(index, this.mask[index]);
        const strength = Math.min(1, Math.max(0, (radius - distance) / Math.max(1, radius * 0.25)));
        this.mask[index] = Math.round(this.mask[index] + (target - this.mask[index]) * strength);
      }
    }
  }

  finishStroke() {
    if (this.current.size === 0) return;
    const indices = [...this.current.keys()];
    const before = indices.map((index) => this.current.get(index)!);
    const after = indices.map((index) => this.mask[index]);
    this.undoStack.push({ indices, before, after });
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.redoStack = [];
    this.current.clear();
  }

  undo(): boolean {
    const stroke = this.undoStack.pop();
    if (!stroke) return false;
    stroke.indices.forEach((index, i) => { this.mask[index] = stroke.before[i]; });
    this.redoStack.push(stroke);
    return true;
  }

  redo(): boolean {
    const stroke = this.redoStack.pop();
    if (!stroke) return false;
    stroke.indices.forEach((index, i) => { this.mask[index] = stroke.after[i]; });
    this.undoStack.push(stroke);
    return true;
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
}

export function composeImage(
  original: CanvasImageSource,
  width: number,
  height: number,
  mask: Uint8ClampedArray,
  background: BackgroundFill,
): HTMLCanvasElement {
  if (mask.length !== width * height) throw new Error("Mask dimensions mismatch");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(original, 0, 0, width, height);

  const alphaCanvas = document.createElement("canvas");
  alphaCanvas.width = width;
  alphaCanvas.height = height;
  const alphaCtx = alphaCanvas.getContext("2d");
  if (!alphaCtx) throw new Error("Canvas unavailable");
  const pixels = alphaCtx.createImageData(width, height);
  for (let i = 0; i < mask.length; i++) {
    pixels.data[i * 4] = 255;
    pixels.data[i * 4 + 1] = 255;
    pixels.data[i * 4 + 2] = 255;
    pixels.data[i * 4 + 3] = mask[i];
  }
  alphaCtx.putImageData(pixels, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(alphaCanvas, 0, 0);
  ctx.globalCompositeOperation = "destination-over";
  if (background.kind === "color") {
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, width, height);
  } else if (background.kind === "image") {
    ctx.drawImage(background.image, 0, 0, width, height);
  }
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size === 0 || blob.type !== type) reject(new Error("Image export failed"));
      else resolve(blob);
    }, type, 0.92);
  });
}

export function outputImageName(original: string, format: "png" | "jpeg"): string {
  const stem = original.replace(/\.[^./\\]+$/, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  return `${stem || "image"}_cutout.${format === "png" ? "png" : "jpg"}`;
}
