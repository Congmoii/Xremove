import { useEffect, useRef, useState } from "react";
import { zipSync } from "fflate";
import { canvasBlob, composeImage, MaskEditor, outputImageName, type BackgroundFill } from "./mask";
import { ImageInputError, MAX_IMAGE_BYTES, ModelLoadError, segmentImage } from "./segmentation";

type Lang = "vi" | "en";
type Status = "queued" | "loading" | "running" | "stopping" | "done" | "cancelled" | "error";
type Item = {
  id: string;
  file: File;
  previewUrl: string;
  status: Status;
  error?: string;
  previewError?: boolean;
  width?: number;
  height?: number;
};

const copy = {
  vi: {
    title: "Tách nền ảnh", add: "Thêm ảnh", queue: "Hàng đợi", pause: "Dừng sau ảnh hiện tại", resume: "Tiếp tục hàng đợi",
    original: "Ảnh gốc", result: "Kết quả", empty: "Chọn ảnh đã xử lý để chỉnh sửa", erase: "Xóa", restore: "Khôi phục",
    undo: "Hoàn tác", redo: "Làm lại", size: "Cỡ cọ", zoom: "Thu phóng", background: "Nền", transparent: "Trong suốt",
    white: "Trắng", color: "Màu", image: "Ảnh khác", format: "Định dạng", download: "Tải ảnh", downloadAll: "Tải ZIP kết quả",
    queued: "Chờ xử lý", loading: "Đang tải mô hình", running: "Đang tách nền", stopping: "Đang dừng sau bước hiện tại",
    done: "Hoàn tất", cancelled: "Đã hủy", error: "Lỗi", retry: "Thử lại", cancel: "Hủy", remove: "Bỏ khỏi danh sách",
    limit: "Tối đa 20 ảnh, 40 MB và 16 MP mỗi ảnh. Xử lý cục bộ; giữ cửa sổ mở đến khi hoàn tất.",
    badFile: "Chỉ nhận PNG, JPEG và WebP hợp lệ dưới 40 MB.", badModel: "Không tải được mô hình tách nền ngoại tuyến.",
    memory: "Không đủ bộ nhớ để xử lý ảnh này. Hãy đóng bớt tab hoặc dùng ảnh nhỏ hơn.",
    failed: "Không xử lý được ảnh này.", zipInfo: "ZIP chỉ gồm ảnh hoàn tất; ảnh lỗi hoặc đã hủy được bỏ qua.",
    missingBackground: "Chọn ảnh nền trước khi xuất.", zipTooLarge: "Tổng ảnh xuất vượt 250 MB. Hãy tải từng ảnh.",
  },
  en: {
    title: "Remove image background", add: "Add images", queue: "Queue", pause: "Stop after current image", resume: "Resume queue",
    original: "Original", result: "Result", empty: "Select a finished image to edit", erase: "Erase", restore: "Restore",
    undo: "Undo", redo: "Redo", size: "Brush size", zoom: "Zoom", background: "Background", transparent: "Transparent",
    white: "White", color: "Color", image: "Another image", format: "Format", download: "Download image", downloadAll: "Download results ZIP",
    queued: "Queued", loading: "Loading model", running: "Removing background", stopping: "Stopping after current step",
    done: "Finished", cancelled: "Cancelled", error: "Error", retry: "Retry", cancel: "Cancel", remove: "Remove from list",
    limit: "Up to 20 images, 40 MB and 16 MP each. Processed locally; keep this window open until finished.",
    badFile: "Use a valid PNG, JPEG or WebP under 40 MB.", badModel: "Could not load the offline background model.",
    memory: "Not enough memory for this image. Close other tabs or use a smaller image.",
    failed: "Could not process this image.", zipInfo: "The ZIP contains finished images only; failed and cancelled images are excluded.",
    missingBackground: "Choose a background image before exporting.", zipTooLarge: "Exports exceed 250 MB. Download images separately.",
  },
};

function makeItem(file: File): Item {
  return { id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), status: "queued" };
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function BackgroundWorkspace({ initialFiles, lang, onClose }: { initialFiles: File[]; lang: Lang; onClose: () => void }) {
  const t = copy[lang];
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const runningRef = useRef(false);
  const disposedRef = useRef(false);
  const startedRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const editorsRef = useRef(new Map<string, MaskEditor>());
  const bitmapsRef = useRef(new Map<string, ImageBitmap>());
  const [revision, setRevision] = useState(0);
  const [tool, setTool] = useState<"erase" | "restore">("erase");
  const [brushSize, setBrushSize] = useState(26);
  const [zoom, setZoom] = useState(1);
  const [fillKind, setFillKind] = useState<"transparent" | "white" | "color" | "image">("transparent");
  const [fillColor, setFillColor] = useState("#ffffff");
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const backgroundBitmapRef = useRef<{ file: File; bitmap: ImageBitmap } | null>(null);
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [busyExport, setBusyExport] = useState(false);
  const [notice, setNotice] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);
  const pointerDownRef = useRef(false);

  const update = (change: (current: Item[]) => Item[]) => {
    itemsRef.current = change(itemsRef.current);
    setItems([...itemsRef.current]);
  };

  const setOne = (id: string, fields: Partial<Item>) => update((current) => current.map((item) => item.id === id ? { ...item, ...fields } : item));

  async function processNext() {
    if (runningRef.current || pausedRef.current || disposedRef.current) return;
    const next = itemsRef.current.find((item) => item.status === "queued");
    if (!next) return;
    runningRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setOne(next.id, { status: "loading" });
    try {
      const result = await segmentImage(next.file, controller.signal, () => setOne(next.id, { status: "running" }));
      if (disposedRef.current || controller.signal.aborted) return;
      editorsRef.current.set(next.id, new MaskEditor(result.width, result.height, result.mask));
      setOne(next.id, { status: "done", width: result.width, height: result.height, error: undefined });
      if (!selectedIdRef.current) {
        selectedIdRef.current = next.id;
        setSelectedId(next.id);
      }
    } catch (error) {
      if (!disposedRef.current) {
        if (controller.signal.aborted) setOne(next.id, { status: "cancelled" });
        else {
          const detail = error instanceof Error ? error.message : String(error);
          const memoryError = error instanceof RangeError || /out of memory|memory allocation|allocation failed|memory access/i.test(detail);
          setOne(next.id, {
            status: "error",
            error: memoryError ? t.memory : error instanceof ModelLoadError ? t.badModel :
              error instanceof ImageInputError ? t.badFile : t.failed,
          });
        }
      }
    } finally {
      runningRef.current = false;
      controllerRef.current = null;
      if (!disposedRef.current) queueMicrotask(() => processNext());
    }
  }

  function addFiles(files: File[]) {
    const room = Math.max(0, 20 - itemsRef.current.length);
    const accepted = files.slice(0, room).map(makeItem);
    if (accepted.length === 0) return;
    update((current) => [...current, ...accepted]);
    if (!selectedIdRef.current) {
      selectedIdRef.current = accepted[0].id;
      setSelectedId(accepted[0].id);
    }
    queueMicrotask(() => processNext());
  }

  useEffect(() => {
    disposedRef.current = false;
    const timer = window.setTimeout(() => {
      if (!startedRef.current) {
        startedRef.current = true;
        addFiles(initialFiles);
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      disposedRef.current = true;
      controllerRef.current?.abort();
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      bitmapsRef.current.forEach((bitmap) => bitmap.close());
      backgroundBitmapRef.current?.bitmap.close();
    };
  }, []);

  const selected = items.find((item) => item.id === selectedId);
  const editor = selectedId ? editorsRef.current.get(selectedId) : undefined;

  async function bitmapFor(item: Item) {
    let bitmap = bitmapsRef.current.get(item.id);
    if (!bitmap) {
      bitmap = await createImageBitmap(item.file);
      bitmapsRef.current.set(item.id, bitmap);
    }
    return bitmap;
  }

  async function fill(): Promise<BackgroundFill> {
    if (fillKind === "transparent") return { kind: "transparent" };
    if (fillKind === "white") return { kind: "color", color: "#ffffff" };
    if (fillKind === "color") return { kind: "color", color: fillColor };
    if (!backgroundFile) throw new Error(t.missingBackground);
    if (backgroundFile.size > MAX_IMAGE_BYTES || !["image/png", "image/jpeg", "image/webp"].includes(backgroundFile.type)) {
      throw new ImageInputError(t.badFile);
    }
    if (backgroundBitmapRef.current?.file !== backgroundFile) {
      backgroundBitmapRef.current?.bitmap.close();
      const bitmap = await createImageBitmap(backgroundFile);
      if (bitmap.width * bitmap.height > 16_000_000) {
        bitmap.close();
        throw new ImageInputError(t.badFile);
      }
      backgroundBitmapRef.current = { file: backgroundFile, bitmap };
    }
    return { kind: "image", image: backgroundBitmapRef.current.bitmap };
  }

  useEffect(() => {
    if (!selected || !editor || selected.status !== "done") return;
    let cancelled = false;
    (async () => {
      try {
        const [bitmap, background] = await Promise.all([bitmapFor(selected), fill()]);
        if (cancelled || !canvasRef.current) return;
        const rendered = composeImage(bitmap, editor.width, editor.height, editor.mask, background);
        const display = canvasRef.current;
        display.width = rendered.width;
        display.height = rendered.height;
        display.getContext("2d")?.drawImage(rendered, 0, 0);
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : t.failed);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, selected?.status, revision, fillKind, fillColor, backgroundFile, lang]);

  function paint(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointerDownRef.current || !editor) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * editor.width;
    const y = (event.clientY - rect.top) / rect.height * editor.height;
    editor.paint(x, y, brushSize * editor.width / rect.width, tool);
    setRevision((value) => value + 1);
  }

  async function exportItem(item: Item): Promise<Blob> {
    const targetEditor = editorsRef.current.get(item.id);
    if (!targetEditor) throw new Error(t.failed);
    const [bitmap, background] = await Promise.all([bitmapFor(item), fill()]);
    const actualBackground = format === "jpeg" && background.kind === "transparent"
      ? { kind: "color" as const, color: "#ffffff" }
      : background;
    const canvas = composeImage(bitmap, targetEditor.width, targetEditor.height, targetEditor.mask, actualBackground);
    return canvasBlob(canvas, format === "png" ? "image/png" : "image/jpeg");
  }

  async function download(item: Item) {
    setBusyExport(true);
    setNotice("");
    try {
      saveBlob(await exportItem(item), outputImageName(item.file.name, format));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.failed);
    } finally {
      setBusyExport(false);
    }
  }

  async function downloadZip() {
    setBusyExport(true);
    setNotice("");
    try {
      const entries: Record<string, Uint8Array> = {};
      const names = new Set<string>();
      let totalBytes = 0;
      for (const item of itemsRef.current.filter((entry) => entry.status === "done")) {
        let name = outputImageName(item.file.name, format);
        let suffix = 2;
        while (names.has(name.toLowerCase())) {
          const extension = format === "png" ? ".png" : ".jpg";
          name = outputImageName(item.file.name, format).replace(extension, `_${suffix++}${extension}`);
        }
        names.add(name.toLowerCase());
        entries[name] = new Uint8Array(await (await exportItem(item)).arrayBuffer());
        totalBytes += entries[name].byteLength;
        if (totalBytes > 250 * 1024 * 1024) throw new Error(t.zipTooLarge);
      }
      const zip = zipSync(entries, { level: 0 });
      saveBlob(new Blob([new Uint8Array(zip)], { type: "application/zip" }), "Xremove-cutouts.zip");
      setNotice(t.zipInfo);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.failed);
    } finally {
      setBusyExport(false);
    }
  }

  function cancel(item: Item) {
    if (item.status === "queued") setOne(item.id, { status: "cancelled" });
    else if (["loading", "running"].includes(item.status)) {
      controllerRef.current?.abort();
      setOne(item.id, { status: "stopping" });
    }
  }

  function retry(item: Item) {
    editorsRef.current.delete(item.id);
    setOne(item.id, { status: "queued", error: undefined });
    queueMicrotask(() => processNext());
  }

  function remove(item: Item) {
    if (["loading", "running", "stopping"].includes(item.status)) return;
    URL.revokeObjectURL(item.previewUrl);
    bitmapsRef.current.get(item.id)?.close();
    bitmapsRef.current.delete(item.id);
    editorsRef.current.delete(item.id);
    update((current) => current.filter((entry) => entry.id !== item.id));
    if (selectedIdRef.current === item.id) {
      const next = itemsRef.current[0]?.id ?? null;
      selectedIdRef.current = next;
      setSelectedId(next);
    }
  }

  const doneCount = items.filter((item) => item.status === "done").length;
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6"
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDrop={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); addFiles(Array.from(event.dataTransfer.files)); } }}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-900">{t.title}</h1><p className="mt-1 text-sm text-slate-600">{t.limit}</p></div>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-blue-600">{lang === "vi" ? "Về trang chính" : "Back to home"}</button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label={t.queue}>
          <div className="flex items-center justify-between gap-2"><h2 className="font-bold">{t.queue} · {doneCount}/{items.length}</h2><button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white focus-visible:ring-2">{t.add}</button></div>
          <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
          <button type="button" onClick={() => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); if (!pausedRef.current) processNext(); }} className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:ring-2">{paused ? t.resume : t.pause}</button>
          <ul className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto">
            {items.map((item) => <li key={item.id} className={`rounded-xl border p-2 ${selectedId === item.id ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
              <button type="button" onClick={() => { selectedIdRef.current = item.id; setSelectedId(item.id); setRevision((value) => value + 1); }} className="flex w-full items-center gap-2 text-left focus-visible:ring-2" aria-current={selectedId === item.id ? "true" : undefined}>
                {item.previewError
                  ? <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-700" aria-hidden="true">!</span>
                  : <img src={item.previewUrl} alt="" onError={() => setOne(item.id, { previewError: true })} className="h-12 w-12 shrink-0 rounded-md object-cover" />}
                <span className="min-w-0"><span className="block truncate text-xs font-semibold" title={item.file.name}>{item.file.name}</span><span className="text-xs text-slate-600">{t[item.status]}</span></span>
              </button>
              {item.error && <p role="alert" className="mt-1 text-xs text-red-700">{item.error}</p>}
              <div className="mt-1 flex gap-2 text-xs">
                {(["queued", "loading", "running"].includes(item.status)) && <button type="button" onClick={() => cancel(item)} className="text-red-700 underline">{t.cancel}</button>}
                {(["error", "cancelled"].includes(item.status)) && <button type="button" onClick={() => retry(item)} className="text-blue-700 underline">{t.retry}</button>}
                {(["done", "error", "cancelled"].includes(item.status)) && <button type="button" onClick={() => remove(item)} className="text-slate-600 underline">{t.remove}</button>}
              </div>
            </li>)}
          </ul>
        </aside>
        <section className="min-w-0 space-y-4">
          {selected?.status === "done" && editor ? <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-3"><h2 className="mb-2 text-sm font-bold">{t.original}</h2><div className="checker flex min-h-56 items-center justify-center overflow-auto rounded-lg"><img src={selected.previewUrl} alt={t.original} className="max-h-[60vh] w-full object-contain" /></div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3"><h2 className="mb-2 text-sm font-bold">{t.result}</h2><div className="checker max-h-[60vh] min-h-56 overflow-auto rounded-lg"><canvas ref={canvasRef} className="block h-auto touch-none" style={{ width: `${zoom * 100}%`, maxWidth: "none" }} onPointerDown={(event) => { pointerDownRef.current = true; editor.startStroke(); event.currentTarget.setPointerCapture(event.pointerId); paint(event); }} onPointerMove={paint} onPointerUp={(event) => { paint(event); pointerDownRef.current = false; editor.finishStroke(); setRevision((value) => value + 1); }} onPointerCancel={() => { pointerDownRef.current = false; editor.finishStroke(); }} aria-label={lang === "vi" ? "Chỉnh mask tách nền" : "Edit background mask"} /></div></div>
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div role="group" aria-label={lang === "vi" ? "Công cụ cọ" : "Brush tool"} className="flex rounded-lg border border-slate-300 p-1">
                {(["erase", "restore"] as const).map((value) => <button key={value} type="button" aria-pressed={tool === value} onClick={() => setTool(value)} className={`rounded-md px-3 py-2 text-sm ${tool === value ? "bg-blue-600 text-white" : "text-slate-700"}`}>{t[value]}</button>)}
              </div>
              <label className="text-sm">{t.size} <input type="range" min="4" max="100" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="align-middle" /> {brushSize}</label>
              <label className="text-sm">{t.zoom} <input type="range" min="1" max="4" step="0.25" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="align-middle" /> {zoom}×</label>
              <button type="button" disabled={!editor.canUndo} onClick={() => { editor.undo(); setRevision((value) => value + 1); }} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">{t.undo}</button>
              <button type="button" disabled={!editor.canRedo} onClick={() => { editor.redo(); setRevision((value) => value + 1); }} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">{t.redo}</button>
            </div>
          </> : <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-600">{t.empty}</div>}
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <label className="text-sm font-semibold">{t.background}<select value={fillKind} onChange={(event) => setFillKind(event.target.value as typeof fillKind)} className="ml-2 rounded-lg border border-slate-300 p-2"><option value="transparent">{t.transparent}</option><option value="white">{t.white}</option><option value="color">{t.color}</option><option value="image">{t.image}</option></select></label>
            {fillKind === "color" && <label className="text-sm">{t.color} <input aria-label={t.color} type="color" value={fillColor} onChange={(event) => setFillColor(event.target.value)} /></label>}
            {fillKind === "image" && <><button type="button" onClick={() => backgroundInputRef.current?.click()} className="rounded-lg border px-3 py-2 text-sm">{backgroundFile?.name || t.image}</button><input ref={backgroundInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => setBackgroundFile(event.target.files?.[0] ?? null)} /></>}
            <label className="text-sm font-semibold">{t.format}<select value={format} onChange={(event) => setFormat(event.target.value as typeof format)} className="ml-2 rounded-lg border border-slate-300 p-2"><option value="png">PNG</option><option value="jpeg">JPEG</option></select></label>
            <button type="button" disabled={!selected || selected.status !== "done" || busyExport} onClick={() => selected && download(selected)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{t.download}</button>
            <button type="button" disabled={doneCount === 0 || busyExport} onClick={downloadZip} className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 disabled:opacity-40">{t.downloadAll}</button>
          </div>
          {notice && <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">{notice}</p>}
        </section>
      </div>
    </main>
  );
}
