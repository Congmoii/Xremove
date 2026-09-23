import { type CSSProperties, useEffect, useRef, useState } from "react"

import brandMark from "@/imports/image.png"
import { BackgroundWorkspace } from "@/background/BackgroundWorkspace"
import { classifyFile, type Classification, type FileKind } from "@/lib/classify"
import {
  extractDocxPreviewText,
  isDocxBytes,
  validateDocxPackage,
} from "@/lib/docxPreview"
import {
  processFile,
  pendingServiceJob,
  resumeServiceJob,
  EngineUnavailableError,
  UnsupportedFileError,
  LegacyDocError,
  type ProcessReport,
} from "@/lib/engines"

type Lang = "en" | "vi"
type BA = "before" | "after"
type MediaType = "image" | "video" | "text" | "document"

/* --------------------------------------------------------------- i18n */

const T = {
  en: {
    localOnly: "Local · Offline",
    preview: "Preview",
    home: "Return to home",
    start: "Choose file",
    startDrop: "or drag a file or text here; paste text with Ctrl+V",
    startHint: "IMAGES · VIDEOS · TEXT & DOCS",
    tabImage: "Images",
    tabVideo: "Videos",
    tabText: "Text & Docs",
    beta: "BETA",
    // Dynamic processing copy per file type
    cleaning: "Processing your file locally…",
    cleaningImage: "Processing image…",
    cleaningVideo: "Processing video…",
    cleaningText: "Cleaning text…",
    cleaningDoc: "Cleaning Word document…",
    // Completion
    cleanDone: "Processing complete",
    resultReady: "Cleaned result is ready.",
    downloaded: "Downloaded",
    downloadAgain: "Download again",
    // Errors
    errTitle: "Could not process this file",
    errService: "Local processing service is not ready.",
    errServiceHint: "TXT, Markdown and DOCX work in this HTML. PDF and video need the companion service.",
    errVideo: "The required local video processing component is not available.",
    errUnsupported: "This file type is not supported here. Use TXT, Markdown or DOCX for document cleanup.",
    errInvalidOutput: "Processing returned an invalid or empty file.",
    errProcessing: "Processing failed. Please retry or check the local service log.",
    errLegacyDoc: "Legacy .doc files are not currently supported. Please save the document as .docx.",
    errRetry: "Add another file",
    errRetryBtn: "Retry",
    errAddBtn: "Add another file",
    // Actions
    actDownload: "Download result",
    opClean: "Clean file: text & metadata",
    opBackground: "Remove background",
    opMetadata: "Remove file metadata",
    metadataHint: "Removes supported embedded file metadata locally. It cannot prove a file was not made with AI.",
    metadataDone: "File metadata processed",
    opHint: "Choose the action before selecting files.",
    actCopy: "Copy image",
    actCopyText: "Copy text",
    actAdd: "Add another file",
    copied: "Image copied to clipboard",
    copiedText: "Text copied to clipboard",
    copyFail: "Could not copy this",
    // Preview labels per type
    imgBefore: "Before",
    imgAfter: "After",
    txtBefore: "Original text",
    txtAfter: "Cleaned text",
    docBefore: "Original document",
    docAfter: "Cleaned document",
    vidBefore: "Original",
    vidAfter: "Result",
    charsCount: "chars",
    // Cleaning report
    repDocProcessed: "Word document processed",
    repDetected: "Invisible characters detected:",
    repRemoved: "Removed:",
    repMetadataRemoved: "Document properties removed:",
    repVisible: "Visible content:",
    repUnchanged: "Unchanged",
    repStructurePreserved: "Document structure: Preserved",
    repUpdated: "Updated",
    // Empty / no-file preview
    noFile: "No file selected",
    noFileHint: "Drop or select an image, video, or text file to preview it here.",
    // Hero
    heroTitle: "Xremove HTML 1.1.2 — Local tools",
    heroSub:
      "Remove image backgrounds and clean TXT, Markdown or DOCX locally in this HTML. Drop a document to automatically remove supported invisible characters and DOCX properties. PDF and video require a separate service.",
    // Compact intro strip
    introStrip:
      "Choose an action, then select files for local processing.",
    introBadge: "LOCAL PROCESSING",
    // How it works
    howTitle: "How Xremove works",
    steps: [
      {
        tag: "Step 1",
        title: "Choose or drop a file",
        desc: "Select a compatible image, video, or text/document file from your device, or drag it directly into Xremove.",
      },
      {
        tag: "Step 2",
        title: "Automatic local processing",
        desc: "Xremove detects the file type and automatically routes it to the appropriate local processing method. No manual engine selection is required.",
      },
      {
        tag: "Step 3",
        title: "Review and download the result",
        desc: "When processing finishes, Xremove creates a new cleaned file ready for download. The original file remains unchanged.",
      },
    ],
    // What Xremove processes
    kindsTitle: "What Xremove processes",
    kinds: [
      {
        title: "Images",
        desc: "Processes supported image watermark workflows client-side with visual comparison preview.",
        formats: "PNG · JPG · JPEG · WEBP",
        beta: false,
      },
      {
        title: "Videos",
        desc: "Processes supported video cleaning workflows locally when companion service is running.",
        formats: "MP4 · WEBM · MOV",
        beta: true,
      },
      {
        title: "Text & documents",
        desc: "Cleans invisible Unicode zero-width characters and metadata while preserving visible text and document structure.",
        formats: "TXT · MD · PDF · DOCX",
        beta: false,
      },
    ],
    // Privacy
    privacy:
      "Files are processed locally on your machine. No cloud uploads. Temporary memory is cleared after download.",
  },
  vi: {
    localOnly: "Cục bộ · Ngoại tuyến",
    preview: "Xem trước",
    home: "Về trang chính",
    start: "Chọn tệp",
    startDrop: "hoặc kéo tệp/văn bản vào đây; dán văn bản bằng Ctrl+V",
    startHint: "ẢNH · VIDEO · VĂN BẢN & TÀI LIỆU",
    tabImage: "Ảnh",
    tabVideo: "Video",
    tabText: "Văn bản & Tài liệu",
    beta: "BETA",
    cleaning: "Đang xử lý tệp trên máy…",
    cleaningImage: "Đang xử lý hình ảnh…",
    cleaningVideo: "Đang xử lý video…",
    cleaningText: "Đang làm sạch văn bản…",
    cleaningDoc: "Đang làm sạch tài liệu Word…",
    cleanDone: "Xử lý hoàn tất",
    resultReady: "Tệp kết quả đã sẵn sàng.",
    downloaded: "Đã tải xuống",
    downloadAgain: "Tải lại",
    errTitle: "Không thể xử lý tệp này",
    errService: "Dịch vụ xử lý cục bộ chưa sẵn sàng.",
    errServiceHint: "TXT, Markdown và DOCX chạy ngay trong HTML này. PDF và video cần dịch vụ đồng hành.",
    errVideo: "Thành phần xử lý video cục bộ cần thiết chưa sẵn sàng.",
    errUnsupported: "Loại tệp này chưa được hỗ trợ tại đây. Hãy dùng TXT, Markdown hoặc DOCX để làm sạch tài liệu.",
    errInvalidOutput: "Kết quả xử lý bị trống hoặc không hợp lệ.",
    errProcessing: "Xử lý thất bại. Hãy thử lại hoặc kiểm tra nhật ký dịch vụ cục bộ.",
    errLegacyDoc: "Định dạng .doc cũ hiện chưa được hỗ trợ. Vui lòng lưu tài liệu dưới dạng .docx.",
    errRetry: "Thêm tệp khác",
    errRetryBtn: "Thử lại",
    errAddBtn: "Thêm tệp khác",
    actDownload: "Tải kết quả",
    opClean: "Làm sạch tệp: văn bản & metadata",
    opBackground: "Tách nền ảnh",
    opMetadata: "Xóa metadata tệp",
    metadataHint: "Xóa metadata nhúng được hỗ trợ ngay trên máy. Không thể chứng minh tệp không được tạo bằng AI.",
    metadataDone: "Đã xử lý metadata tệp",
    opHint: "Chọn thao tác trước khi chọn tệp.",
    actCopy: "Sao chép ảnh",
    actCopyText: "Sao chép văn bản",
    actAdd: "Thêm tệp khác",
    copied: "Đã sao chép ảnh vào clipboard",
    copiedText: "Đã sao chép văn bản vào clipboard",
    copyFail: "Không sao chép được nội dung này",
    imgBefore: "Gốc",
    imgAfter: "Kết quả",
    txtBefore: "Văn bản gốc",
    txtAfter: "Đã làm sạch",
    docBefore: "Tài liệu gốc",
    docAfter: "Tài liệu đã làm sạch",
    vidBefore: "Video gốc",
    vidAfter: "Kết quả",
    charsCount: "ký tự",
    repDocProcessed: "Đã xử lý tài liệu Word",
    repDetected: "Đã phát hiện ký tự ẩn:",
    repRemoved: "Đã loại bỏ:",
    repMetadataRemoved: "Thuộc tính tài liệu đã xóa:",
    repVisible: "Nội dung hiển thị:",
    repUnchanged: "Không thay đổi",
    repStructurePreserved: "Cấu trúc tài liệu: Được giữ nguyên",
    repUpdated: "Đã cập nhật",
    noFile: "Chưa chọn tệp",
    noFileHint: "Kéo hoặc chọn hình ảnh, video hoặc văn bản để xem tại đây.",
    heroTitle: "Xremove HTML 1.1.2 — Công cụ cục bộ",
    heroSub:
      "Tách nền ảnh và làm sạch TXT, Markdown, DOCX ngay trong HTML này. Kéo tài liệu vào để tự xóa ký tự ẩn và thuộc tính DOCX được hỗ trợ. PDF và video cần dịch vụ riêng.",
    introStrip:
      "Chọn thao tác, sau đó chọn tệp để xử lý trên máy.",
    introBadge: "XỬ LÝ CỤC BỘ",
    howTitle: "Cách Xremove hoạt động",
    steps: [
      {
        tag: "BƯỚC 1",
        title: "Chọn hoặc kéo tệp vào",
        desc: "Chọn hình ảnh, video hoặc tệp văn bản/tài liệu tương thích từ máy, hoặc kéo trực tiếp vào Xremove.",
      },
      {
        tag: "BƯỚC 2",
        title: "Tự động xử lý cục bộ",
        desc: "Xremove nhận diện loại tệp và tự động chuyển đến phương thức xử lý cục bộ phù hợp. Người dùng không cần tự chọn engine.",
      },
      {
        tag: "BƯỚC 3",
        title: "Kiểm tra và tải kết quả",
        desc: "Khi xử lý hoàn tất, Xremove tạo một tệp kết quả mới sẵn sàng để tải xuống. Tệp gốc vẫn được giữ nguyên.",
      },
    ],
    kindsTitle: "Xremove xử lý những gì",
    kinds: [
      {
        title: "Hình ảnh",
        desc: "Xử lý các quy trình watermark hình ảnh trực tiếp trong trình duyệt và cho phép so sánh trước/sau.",
        formats: "PNG · JPG · JPEG · WEBP",
        beta: false,
      },
      {
        title: "Video",
        desc: "Xử lý làm sạch video trên máy khi dịch vụ đồng hành cục bộ đã sẵn sàng.",
        formats: "MP4 · WEBM · MOV",
        beta: true,
      },
      {
        title: "Văn bản & tài liệu",
        desc: "Làm sạch ký tự Unicode ẩn (zero-width) và metadata tệp, đồng thời giữ nguyên nội dung hiển thị và cấu trúc tài liệu.",
        formats: "TXT · MD · PDF · DOCX",
        beta: false,
      },
    ],
    privacy:
      "Tệp được xử lý cục bộ trên máy và không tải lên đám mây. Dữ liệu xử lý tạm thời được giải phóng sau khi tải.",
  },
} as const

/* ------------------------------------------------------------------ icons */

function Icon({ path, size = 16, className = "" }: { path: string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {path.split("|").map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}

const ICONS = {
  image: "M3 5h18v14H3z|M3 15l5-5 4 4 3-3 6 6",
  text: "M4 5h16|M4 10h16|M4 15h11|M4 20h7",
  video: "M3 5h14v14H3z|M17 9l4-2v10l-4-2",
  plus: "M12 5v14|M5 12h14",
  download: "M12 4v10|M8 10l4 4 4-4|M5 19h14",
  copy: "M9 9h11v11H9z|M5 15H4V4h11v1",
  upload: "M12 3v12|M8 7l4-4 4 4|M4 17v4h16v-4",
  refresh: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  document: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8",
  check: "M20 6L9 17l-5-5",
  close: "M6 6l12 12|M18 6L6 18",
}

/* --------------------------------------------------------------- header */

function LanguageSwitch({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const opts: { id: Lang; label: string }[] = [
    { id: "vi", label: "VI" },
    { id: "en", label: "EN" },
  ]
  return (
    <div className="flex items-center rounded-full border border-slate-200 bg-slate-100 p-0.5 shadow-2xs">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => setLang(o.id)}
          className={`h-7 px-3 rounded-full text-[11px] font-bold tracking-wider transition-all ${
            lang === o.id
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Header({
  lang,
  setLang,
  onHome,
  t,
}: {
  lang: Lang
  setLang: (l: Lang) => void
  onHome: () => void
  t: (typeof T)[Lang]
}) {
  return (
    <header className="w-full shrink-0 border-b border-slate-200 bg-white sticky top-0 z-30 shadow-2xs">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <button
          type="button"
          onClick={onHome}
          title={t.home}
          aria-label={t.home}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <span
            className="brand-mark block h-8 w-12 shrink-0"
            style={{
              ["--brand-mark-src" as string]: `url(${brandMark})`,
              filter: "drop-shadow(0 0 1px #2563EB) drop-shadow(0 1px 2px rgba(37,99,235,0.2))",
            }}
            aria-hidden="true"
          />
          <span className="text-[16px] font-extrabold uppercase tracking-[0.12em] text-blue-700">
            Xremove
          </span>
        </button>

        <LanguageSwitch lang={lang} setLang={setLang} />
      </div>
      {/* Brand accent indicator line */}
      <div className="h-[2px] w-full bg-blue-600" />
    </header>
  )
}

/* --------------------------------------------------------------- media tabs */

function MediaTabs({
  value,
  onChange,
  t,
}: {
  value: MediaType
  onChange: (v: MediaType) => void
  t: (typeof T)[Lang]
}) {
  const tabs: { key: MediaType; icon: string; label: string; beta?: boolean }[] = [
    { key: "image", icon: ICONS.image, label: t.tabImage },
    { key: "video", icon: ICONS.video, label: t.tabVideo, beta: true },
    { key: "text", icon: ICONS.text, label: t.tabText },
  ]
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1 shadow-2xs">
      {tabs.map((tab) => {
        const active = value === tab.key || (tab.key === "text" && value === "document")
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-semibold transition-all ${
              active
                ? "bg-white text-blue-700 shadow-xs border border-slate-200/60"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
            }`}
          >
            <Icon path={tab.icon} size={14} />
            <span>{tab.label}</span>
            {tab.beta && (
              <span className="rounded-full bg-amber-100 border border-amber-200 px-1.5 py-0.2 text-[9px] font-extrabold uppercase tracking-wider text-amber-800">
                {t.beta}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* --------------------------------------------------------------- start screen */

const CHECKER_BG: CSSProperties = {
  backgroundColor: "#f8fafc",
  backgroundImage:
    "linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)",
  backgroundSize: "14px 14px",
  backgroundPosition: "0 0, 0 7px, 7px -7px, -7px 0",
}

function StartScreen({ onFiles, operation, setOperation, t }: { onFiles: (files: File[]) => void; operation: "clean" | "background" | "metadata"; setOperation: (value: "clean" | "background" | "metadata") => void; t: (typeof T)[Lang] }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const pick = (files: FileList | null) => {
    if (files?.length) onFiles(Array.from(files))
  }
  useEffect(() => {
    if (operation === "background") return
    const onPaste = (event: ClipboardEvent) => {
      if (event.clipboardData?.files.length) return
      const value = event.clipboardData?.getData("text/plain")
      if (value) {
        event.preventDefault()
        onFiles([new File([value], "van-ban.txt", { type: "text/plain" })])
      }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [onFiles, operation])
  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6">
      {/* Centered Hero */}
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700 shadow-2xs">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
          {t.introBadge}
        </span>
        <h1 className="mt-4 text-[32px] sm:text-[38px] font-extrabold leading-tight tracking-tight text-slate-900">
          {t.heroTitle}
        </h1>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-slate-600">
          {t.heroSub}
        </p>
      </div>

      <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-slate-700">{t.opHint}</p>
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={t.opHint}>
          {(["clean", "background"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={operation === value} onClick={() => setOperation(value)} className={`min-h-11 rounded-xl border px-4 py-3 text-sm font-bold focus-visible:ring-2 focus-visible:ring-blue-600 ${operation === value ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300 text-slate-700"}`}>
              {value === "clean" ? t.opClean : t.opBackground}
            </button>
          ))}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={operation === "background" ? "image/png,image/jpeg,image/webp" : location.protocol === "file:" ? "image/*,.txt,.md,.markdown,.docx" : "image/*,video/*,.txt,.md,.markdown,.pdf,.docx"}
        multiple={operation === "background"}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files)
          e.target.value = ""
        }}
      />

      {/* Contained Centered Dropzone Card — Bright, Clean, Inviting */}
      <div className="mx-auto mt-6 max-w-2xl">
        <div
          data-testid="file-dropzone"
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            if (e.dataTransfer.files.length) pick(e.dataTransfer.files)
            else if (operation !== "background") {
              const value = e.dataTransfer.getData("text/plain")
              if (value) onFiles([new File([value], "van-ban.txt", { type: "text/plain" })])
            }
          }}
          onClick={() => inputRef.current?.click()}
          className={`group relative flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
            drag
              ? "border-blue-500 bg-blue-50/50 scale-[1.01]"
              : "border-slate-300 bg-white hover:border-blue-500 hover:bg-blue-50/20 shadow-xs"
          }`}
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 group-hover:scale-105 transition-transform shadow-2xs">
            <Icon path={ICONS.upload} size={26} />
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              inputRef.current?.click()
            }}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-white shadow-sm hover:bg-blue-700 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 font-semibold text-sm"
          >
            <Icon path={ICONS.plus} size={17} />
            <span>{t.start}</span>
          </button>
          <p className="mt-3 text-[14px] font-medium text-slate-700">{t.startDrop}</p>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {t.startHint}
          </p>
        </div>
      </div>

      {/* Steps & Features — Bright White Cards with Crisp Text */}
      <section className="mx-auto max-w-4xl pt-12 pb-6">
        <h2 className="text-center text-[22px] font-bold tracking-tight text-slate-900">
          {t.howTitle}
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {t.steps.map((step) => (
            <div
              key={step.tag}
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
            >
              <span className="inline-flex rounded-md bg-blue-50 border border-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                {step.tag}
              </span>
              <h3 className="mt-3 text-[16px] font-bold tracking-tight text-slate-900">{step.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl pb-12 pt-2">
        <div className="grid gap-4 sm:grid-cols-3">
          {t.kinds.map((k, i) => (
            <div
              key={i}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
            >
              <div className="flex items-center gap-1.5">
                <h3 className="text-[15px] font-bold tracking-tight text-slate-900">{k.title}</h3>
                {k.beta && (
                  <span className="rounded-full bg-amber-100 border border-amber-200 px-1.5 py-0.2 text-[9px] font-bold uppercase text-amber-800">
                    {t.beta}
                  </span>
                )}
              </div>
              <p className="mt-2 flex-1 text-[13px] leading-relaxed text-slate-600">{k.desc}</p>
              <p className="mt-3 font-mono text-[11px] font-semibold text-slate-500">
                {k.formats}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

/* --------------------------------------------------------------- result viewer */

function ResultViewer({
  url,
  beforeUrl,
  filename,
  cleaning,
  mediaType,
  textBefore,
  textAfter,
  report,
  onMediaType,
  onClose,
  onAddMore,
  onToast,
  t,
}: {
  url: string
  beforeUrl: string | null
  filename: string
  cleaning: boolean
  mediaType: MediaType
  textBefore: string | null
  textAfter: string | null
  report: ProcessReport | null
  onMediaType: (v: MediaType) => void
  onClose: () => void
  onAddMore: () => void
  onToast: (msg: string) => void
  t: (typeof T)[Lang]
}) {
  const [ba, setBa] = useState<BA>("after")
  const [isDownloaded, setIsDownloaded] = useState(false)
  const showBefore = ba === "before"

  const isDocx = filename.toLowerCase().endsWith(".docx")
  const isPdf = filename.toLowerCase().endsWith(".pdf")
  const isTextual = mediaType === "text" || isDocx
  const isVideo = mediaType === "video"
  const isGenericDoc = mediaType === "document" && !isDocx

  // "before" shows the original; "after" shows the cleaned result.
  const shownUrl = showBefore && beforeUrl ? beforeUrl : url
  const shownText = showBefore ? textBefore : textAfter
  const hasBefore = isTextual ? textBefore != null : !!beforeUrl
  const hasValidVideo = isVideo && Boolean(shownUrl && shownUrl.startsWith("blob:"))
  const hasValidImage = mediaType === "image" && Boolean(shownUrl && shownUrl.startsWith("blob:"))

  const labels = isDocx
    ? { before: t.docBefore, after: t.docAfter }
    : isTextual
      ? { before: t.txtBefore, after: t.txtAfter }
      : isVideo
        ? { before: t.vidBefore, after: t.vidAfter }
        : { before: t.imgBefore, after: t.imgAfter }

  const processingLabel = isDocx
    ? t.cleaningDoc
    : mediaType === "text"
      ? t.cleaningText
      : isVideo
        ? t.cleaningVideo
        : mediaType === "image"
          ? t.cleaningImage
          : t.cleaning

  // Triggers user-requested download and records downloaded state.
  function handleDownload() {
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setIsDownloaded(true)
    onToast(t.downloaded)
  }

  async function copyImage() {
    try {
      const blob = await (await fetch(url)).blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      onToast(t.copied)
    } catch {
      onToast(t.copyFail)
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(textAfter ?? "")
      onToast(t.copiedText)
    } catch {
      onToast(t.copyFail)
    }
  }

  const removedCount = report?.stats?.removed_count ?? 0
  const detectedCount = (report?.stats?.removed_count ?? 0) + (report?.stats?.replaced_count ?? 0)

  return (
    <main className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto px-4 py-4 sm:px-6">
      <MediaTabs value={mediaType} onChange={onMediaType} t={t} />

      {/* Main Container with Contained Width */}
      <div className="flex w-full max-w-3xl flex-col gap-2.5">
        {/* Status bar — Clean, Bright, High-Contrast */}
        {!cleaning && (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-700">
                ✓
              </span>
              <span className="text-[13px] font-bold text-slate-900">
                {isDownloaded ? t.downloaded : t.cleanDone}
              </span>
              <span className="hidden sm:inline text-[13px] text-slate-600">
                — {isDownloaded ? t.downloaded : t.resultReady}
              </span>
            </div>
            <span className="shrink-0 truncate font-mono text-[11px] font-semibold text-slate-700 max-w-[200px]">
              {filename}
            </span>
          </div>
        )}

        {/* Media / Text Frame — Checkerboard is strictly clipped inside image frame */}
        <div
          style={isTextual || isGenericDoc ? undefined : CHECKER_BG}
          className={`relative flex min-h-[340px] sm:min-h-[420px] max-h-[60vh] w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 ${
            isTextual || isGenericDoc ? "bg-white" : isVideo ? "bg-slate-950" : "bg-white"
          } shadow-xs`}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3.5 top-3.5 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            aria-label="Close"
          >
            <Icon path={ICONS.close} size={15} />
          </button>

          {/* Text & DOCX View Mode: Document-style side-by-side or tabbed */}
          {isTextual ? (
            <div className="flex h-full w-full flex-col p-3 sm:p-4">
              {textBefore != null && textAfter != null ? (
                <div className="grid h-full w-full min-h-0 gap-3 md:grid-cols-2">
                  {/* Left: Original Text / Document */}
                  <div className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        {isDocx ? t.docBefore : t.txtBefore}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 font-medium">
                        {textBefore.length} {t.charsCount}
                      </span>
                    </div>
                    <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-left font-mono text-[12px] leading-relaxed text-slate-900 selection:bg-blue-100">
                      {textBefore}
                    </pre>
                  </div>

                  {/* Right: Cleaned Text / Document */}
                  <div className="flex h-full min-h-0 flex-col rounded-xl border-2 border-blue-200 bg-white p-3 shadow-2xs">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                        {isDocx ? t.docAfter : t.txtAfter}
                      </span>
                      <span className="font-mono text-[11px] font-bold text-blue-700">
                        {textAfter.length} {t.charsCount}
                      </span>
                    </div>
                    <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg border border-blue-100 bg-blue-50/30 p-3.5 text-left font-mono text-[12px] leading-relaxed text-slate-900 selection:bg-blue-100">
                      {textAfter}
                    </pre>
                  </div>
                </div>
              ) : (
                <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-left font-mono text-[12px] leading-relaxed text-slate-900">
                  {shownText ?? ""}
                </pre>
              )}
            </div>
          ) : isGenericDoc ? (
            /* Generic Document View Mode: PDF metadata & readiness card */
            <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 mb-3 shadow-2xs">
                <Icon path={ICONS.document} size={30} />
              </div>
              <h3 className="text-[16px] font-bold text-slate-900">{filename}</h3>
              <p className="mt-1 text-[13px] text-slate-600">
                {isDownloaded ? t.downloaded : t.resultReady}
              </p>
            </div>
          ) : hasValidVideo ? (
            /* Video View Mode — rendered ONLY when a valid video blob URL exists */
            <div className="relative flex max-h-full max-w-full items-center justify-center p-4">
              <video
                key={shownUrl}
                src={shownUrl}
                controls
                className="max-h-[50vh] max-w-full rounded-lg"
              />
            </div>
          ) : hasValidImage ? (
            /* Image View Mode — rendered ONLY when a valid image blob URL exists */
            <div className="relative flex max-h-full max-w-full items-center justify-center p-4">
              <img
                src={shownUrl}
                alt=""
                className="max-h-[50vh] max-w-full rounded-lg object-contain select-none shadow-2xs"
              />
            </div>
          ) : null}

          {/* Before / After Floating Pill — For Image & Video */}
          {!cleaning && hasBefore && !isTextual && !isGenericDoc && (
            <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-full border border-slate-300 bg-white/95 p-1 shadow-sm backdrop-blur-xs">
              {(["before", "after"] as BA[]).map((k) => {
                const active = ba === k
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setBa(k)}
                    className={`rounded-full px-4 py-1 text-[12px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      active
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    {k === "before" ? labels.before : labels.after}
                  </button>
                )
              })}
            </div>
          )}

          {/* Processing Loading Spinner Overlay */}
          {cleaning && (
            <div
              style={isTextual || isGenericDoc ? undefined : CHECKER_BG}
              className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 ${
                isTextual || isGenericDoc ? "bg-white" : isVideo ? "bg-slate-950" : "bg-white"
              }`}
            >
              <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-600" />
              <p className={`text-[14px] font-bold ${isVideo ? "text-white" : "text-slate-800"}`}>
                {processingLabel}
              </p>
            </div>
          )}
        </div>

        {/* Cleaning Report Summary for Text & DOCX */}
        {!cleaning && report?.operation === "metadata" && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <strong>{t.metadataDone}</strong>
            <span className="ml-2">{t.metadataHint}</span>
          </div>
        )}
        {!cleaning && isTextual && report?.operation !== "metadata" && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[12px] text-slate-700 shadow-2xs">
            {isDocx ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-900">{t.repDocProcessed}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-700">{t.repDetected}</span>
                  <span className="font-mono font-bold text-slate-900">{detectedCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-blue-700">{t.repRemoved}</span>
                  <span className="font-mono font-bold text-blue-700">{removedCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-blue-700">{t.repMetadataRemoved}</span>
                  <span className="font-mono font-bold text-blue-700">{typeof report?.metadata_removed_count === "number" ? report.metadata_removed_count : 0}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-green-700">{t.repStructurePreserved}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-700">{t.repDetected}</span>
                  <span className="font-mono font-bold text-slate-900">{detectedCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-blue-700">{t.repRemoved}</span>
                  <span className="font-mono font-bold text-blue-700">{removedCount}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-700">{t.repVisible}</span>
                  <span className="font-bold text-green-700">{t.repUnchanged}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Action Bar — Rebalanced, Clear Contrast, Easy to Scan */}
        {!cleaning && (
          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 mt-1">
            {/* Secondary actions (Left) */}
            <div className="flex items-center gap-2 order-2 sm:order-1">
              {mediaType === "image" && (
                <button
                  type="button"
                  onClick={copyImage}
                  className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-[12px] font-bold text-slate-800 shadow-2xs transition-colors hover:bg-slate-50 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <Icon path={ICONS.copy} size={15} />
                  <span>{t.actCopy}</span>
                </button>
              )}
              {isTextual && textAfter != null && (
                <button
                  type="button"
                  onClick={copyText}
                  className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-[12px] font-bold text-slate-800 shadow-2xs transition-colors hover:bg-slate-50 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <Icon path={ICONS.copy} size={15} />
                  <span>{t.actCopyText}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onAddMore}
                className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-[12px] font-bold text-slate-800 shadow-2xs transition-colors hover:bg-slate-50 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <Icon path={ICONS.plus} size={15} />
                <span>{t.actAdd}</span>
              </button>
            </div>

            {/* Primary download action (Right) */}
            <button
              type="button"
              onClick={handleDownload}
              className="flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-6 text-[13px] font-bold text-white shadow-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 order-1 sm:order-2 w-full sm:w-auto"
            >
              <Icon path={ICONS.download} size={16} />
              <span>{isDownloaded ? t.downloadAgain : t.actDownload}</span>
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

/* --------------------------------------------------------------- error view */

function ErrorView({
  message,
  canRetry,
  onRetry,
  onAddMore,
  t,
}: {
  message: string
  canRetry: boolean
  onRetry: () => void
  onAddMore: () => void
  t: (typeof T)[Lang]
}) {
  return (
    <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8 text-center">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 shadow-sm flex flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 border border-red-100 text-red-600 shadow-2xs">
          <Icon path="M12 8v5|M12 16h.01|M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" size={26} />
        </div>
        <div>
          <h2 className="text-[18px] font-extrabold text-slate-900">{t.errTitle}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-700">{message}</p>
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-600 font-medium">
            {t.errServiceHint}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2.5">
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-5 text-[12px] font-bold text-white shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Icon path={ICONS.refresh} size={14} />
              <span>{t.errRetryBtn}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onAddMore}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-5 text-[12px] font-bold text-slate-800 shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Icon path={ICONS.plus} size={14} />
            <span>{t.errAddBtn}</span>
          </button>
        </div>
      </div>
    </main>
  )
}

/* ------------------------------------------------------------------ app */

const TEXT_PREVIEW_LIMIT = 200_000

async function previewUtf8(blob: Blob): Promise<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true })
  const reader = blob.stream().getReader()
  let preview = ""
  let truncated = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value, { stream: true })
    if (preview.length < TEXT_PREVIEW_LIMIT) {
      const room = TEXT_PREVIEW_LIMIT - preview.length
      preview += text.slice(0, room)
      if (text.length > room) truncated = true
    } else if (text.length) truncated = true
  }
  const tail = decoder.decode()
  if (preview.length < TEXT_PREVIEW_LIMIT) {
    const room = TEXT_PREVIEW_LIMIT - preview.length
    preview += tail.slice(0, room)
    if (tail.length > room) truncated = true
  } else if (tail.length) truncated = true
  return truncated ? preview + "\n…" : preview
}

async function checkedOutput(blob: Blob, originalName: string, kind: MediaType): Promise<string | null> {
  if (blob.size === 0) throw new Error("Invalid output")
  const lower = originalName.toLowerCase()
  if (lower.endsWith(".docx")) {
    const bytes = await blob.arrayBuffer()
    if (!(await validateDocxPackage(bytes)).valid) throw new Error("Invalid output")
    return extractDocxPreviewText(bytes)
  }
  if (kind === "text") {
    return previewUtf8(blob)
  }
  const signature = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  if (lower.endsWith(".pdf")) {
    if (String.fromCharCode(...signature.slice(0, 5)) !== "%PDF-") throw new Error("Invalid output")
  } else if (kind === "video") {
    const ftyp = String.fromCharCode(...signature.slice(4, 8)) === "ftyp"
    const webm = signature[0] === 0x1a && signature[1] === 0x45 && signature[2] === 0xdf && signature[3] === 0xa3
    if (!(lower.endsWith(".webm") ? webm : ftyp)) throw new Error("Invalid output")
  } else if (kind === "image") {
    const decoded = await createImageBitmap(blob)
    const valid = decoded.width > 0 && decoded.height > 0
    decoded.close()
    if (!valid) throw new Error("Invalid output")
  }
  return null
}

export default function App() {
  const [operation, setOperation] = useState<"clean" | "background" | "metadata">("clean")
  const [backgroundFiles, setBackgroundFiles] = useState<File[] | null>(null)
  const [lang, setLang] = useState<Lang>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("xremove.lang") : null
    return saved === "en" || saved === "vi" ? saved : "vi"
  })
  const [mediaType, setMediaType] = useState<MediaType>("image")
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null)
  const [textBefore, setTextBefore] = useState<string | null>(null)
  const [textAfter, setTextAfter] = useState<string | null>(null)
  const [processReport, setProcessReport] = useState<ProcessReport | null>(null)
  const [cleaning, setCleaning] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const pendingFileRef = useRef<File | null>(null)
  const resultBlob = useRef<Blob | null>(null)
  const resultName = useRef<string>("xremove_clean.png")
  const addInputRef = useRef<HTMLInputElement | null>(null)
  const runIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const urlsRef = useRef<{ before: string | null; result: string | null }>({ before: null, result: null })
  const resumedRef = useRef(false)
  const t = T[lang]

  // Persist language choice.
  useEffect(() => {
    try {
      localStorage.setItem("xremove.lang", lang)
    } catch {
      /* ignore */
    }
  }, [lang])

  useEffect(() => {
    if (resumedRef.current || !pendingServiceJob()) return
    resumedRef.current = true
    const controller = new AbortController()
    abortRef.current = controller
    const runId = ++runIdRef.current
    const job = pendingServiceJob()!
    setOperation(job.operation === "metadata" ? "metadata" : "clean")
    const kind: MediaType = job.mime.startsWith("video/") ? "video" :
      job.mime.startsWith("text/") ? "text" : "document"
    setMediaType(kind)
    setResultUrl("pending")
    setCleaning(true)
    void resumeServiceJob(controller.signal).then(async (value) => {
      if (!value || controller.signal.aborted || runId !== runIdRef.current) return
      const res = value.result
      const cleanText = await checkedOutput(res.blob, job.filename, kind)
      if (controller.signal.aborted || runId !== runIdRef.current) return
      resultBlob.current = res.blob
      resultName.current = res.filename
      setProcessReport(res.report ?? null)
      const url = URL.createObjectURL(res.blob)
      urlsRef.current.result = url
      setResultUrl(url)
      setTextAfter(cleanText)
      setCleaning(false)
    }).catch((error) => {
      if (controller.signal.aborted || runId !== runIdRef.current) return
      setResultUrl(null)
      setCleaning(false)
      setErrorMsg(error instanceof Error && error.message === "Invalid output" ? T[lang].errInvalidOutput : T[lang].errService)
    })
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3000)
  }

  function revokeUrls() {
    if (urlsRef.current.result) URL.revokeObjectURL(urlsRef.current.result)
    if (urlsRef.current.before) URL.revokeObjectURL(urlsRef.current.before)
    urlsRef.current = { before: null, result: null }
  }

  // The whole pipeline: classify -> route -> process -> preview ready.
  // Note: Auto-download is removed. Download occurs when user clicks "Download result".
  async function handleFile(file: File) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const runId = ++runIdRef.current
    const isCurrent = () => runId === runIdRef.current && !controller.signal.aborted
    revokeUrls()
    setErrorMsg(null)
    setTextBefore(null)
    setTextAfter(null)
    setProcessReport(null)
    resultBlob.current = null
    pendingFileRef.current = file

    if (file.size === 0) {
      setResultUrl(null)
      setBeforeUrl(null)
      setErrorMsg(t.errUnsupported)
      return
    }

    let cls: Classification
    try {
      cls = await classifyFile(file)
      if (!isCurrent()) return
    } catch {
      if (!isCurrent()) return
      setResultUrl(null)
      setBeforeUrl(null)
      setErrorMsg(t.errUnsupported)
      return
    }

    if (cls.kind === "legacy_doc") {
      setResultUrl(null)
      setBeforeUrl(null)
      setErrorMsg(t.errLegacyDoc)
      return
    }

    if (cls.kind === "unknown") {
      setResultUrl(null)
      setBeforeUrl(null)
      setErrorMsg(t.errUnsupported)
      return
    }

    setMediaType(cls.kind === "document" ? "document" : cls.kind)

    const isDocxFile = file.name.toLowerCase().endsWith(".docx")

    // Original preview
    const before =
      cls.kind === "image" || cls.kind === "video" ? URL.createObjectURL(file) : null
    urlsRef.current.before = before
    setBeforeUrl(before)

    if (isDocxFile) {
      try {
        const fileBuf = await file.arrayBuffer()
        const valid = await isDocxBytes(fileBuf)
        if (!isCurrent()) return
        if (!valid) {
          revokeUrls()
          setErrorMsg(t.errUnsupported)
          return
        }
        const extracted = await extractDocxPreviewText(fileBuf)
        if (!isCurrent()) return
        setTextBefore(extracted)
      } catch {
        if (!isCurrent()) return
        setTextBefore(null)
      }
    } else if (cls.kind === "text") {
      try {
        const content = await file.slice(0, TEXT_PREVIEW_LIMIT).text()
        if (!isCurrent()) return
        setTextBefore(file.size > TEXT_PREVIEW_LIMIT ? content + "\n…" : content)
      } catch {
        if (!isCurrent()) return
        setTextBefore(null)
      }
    }

    setResultUrl(before ?? "pending")
    setCleaning(true)

    try {
      const res = await processFile(file, cls, controller.signal, operation === "metadata" ? "metadata" : "clean")
      if (!isCurrent()) return
      const cleanText = await checkedOutput(res.blob, file.name, cls.kind)
      if (!isCurrent()) return
      resultBlob.current = res.blob
      resultName.current = res.filename
      setProcessReport(res.report ?? null)
      const outUrl = URL.createObjectURL(res.blob)
      urlsRef.current.result = outUrl
      setResultUrl(outUrl)
      if (cleanText !== null) setTextAfter(cleanText)
      setCleaning(false)
    } catch (err) {
      if (!isCurrent()) return
      setCleaning(false)
      setResultUrl(null)
      revokeUrls()
      setBeforeUrl(null)
      setTextBefore(null)
      setTextAfter(null)
      setProcessReport(null)
      if (err instanceof LegacyDocError) {
        setErrorMsg(t.errLegacyDoc)
      } else if (err instanceof EngineUnavailableError) {
        setErrorMsg(cls.kind === "video" ? t.errVideo : t.errService)
      } else if (err instanceof UnsupportedFileError) {
        setErrorMsg(t.errUnsupported)
      } else if (err instanceof Error && err.message === "Invalid output") {
        setErrorMsg(t.errInvalidOutput)
      } else {
        setErrorMsg(t.errProcessing)
      }
    }
  }

  function closeViewer() {
    ++runIdRef.current
    abortRef.current?.abort()
    abortRef.current = null
    revokeUrls()
    setResultUrl(null)
    setBeforeUrl(null)
    setTextBefore(null)
    setTextAfter(null)
    setProcessReport(null)
    setCleaning(false)
    resultBlob.current = null
    pendingFileRef.current = null
    setMediaType("image")
  }

  // Return home and clear all previous file state.
  function reset() {
    setBackgroundFiles(null)
    closeViewer()
    setErrorMsg(null)
  }

  function handleFiles(files: File[]) {
    if (operation === "background") {
      setBackgroundFiles(files)
    } else if (files[0]) {
      handleFile(files[0])
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#f8fafc] text-slate-900">
      <Header
        lang={lang}
        setLang={setLang}
        onHome={reset}
        t={t}
      />

      {backgroundFiles ? (
        <BackgroundWorkspace initialFiles={backgroundFiles} lang={lang} onClose={reset} />
      ) : errorMsg ? (
        <ErrorView
          message={errorMsg}
          canRetry={pendingFileRef.current != null || pendingServiceJob() != null}
          onRetry={() => {
            if (pendingFileRef.current) handleFile(pendingFileRef.current)
            else if (pendingServiceJob()) window.location.reload()
          }}
          onAddMore={reset}
          t={t}
        />
      ) : resultUrl ? (
        <ResultViewer
          url={resultUrl}
          beforeUrl={beforeUrl}
          filename={resultName.current}
          cleaning={cleaning}
          mediaType={mediaType}
          textBefore={textBefore}
          textAfter={textAfter}
          report={processReport}
          onMediaType={setMediaType}
          onClose={closeViewer}
          onAddMore={() => addInputRef.current?.click()}
          onToast={showToast}
          t={t}
        />
      ) : (
        <StartScreen onFiles={handleFiles} operation={operation} setOperation={setOperation} t={t} />
      )}

      <input
        ref={addInputRef}
        type="file"
        accept={location.protocol === "file:" ? "image/*,.txt,.md,.markdown,.docx" : "image/*,video/*,.txt,.md,.markdown,.pdf,.docx"}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ""
        }}
      />

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-slate-900 px-4 py-2.5 text-[12px] font-bold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
