/**
 * Client-side OOXML (DOCX) text extractor and structure validator.
 * 
 * Extracts readable paragraph and table text from word/document.xml
 * for clean UI preview without converting or corrupting the underlying
 * OOXML binary ZIP package.
 */

// Helper to decompress a raw deflate stream in the browser or Node.js
const MAX_XML_BYTES = 10 * 1024 * 1024;
const PREVIEW_ENTRIES = new Set(["[Content_Types].xml", "word/document.xml", "word/_rels/document.xml.rels"]);

async function inflateRaw(compressedData: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== "undefined") {
    try {
      const ds = new DecompressionStream("deflate-raw");
      const writer = ds.writable.getWriter();
      // DOM BufferSource expects an ArrayBuffer-backed view, not ArrayBufferLike.
      writer.write(new Uint8Array(compressedData));
      writer.close();
      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      let totalLen = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalLen += value.length;
        if (totalLen > MAX_XML_BYTES) {
          await reader.cancel();
          throw new Error("DOCX XML entry exceeds preview limit");
        }
        chunks.push(value);
      }
      const res = new Uint8Array(totalLen);
      let pos = 0;
      for (const c of chunks) {
        res.set(c, pos);
        pos += c.length;
      }
      return res;
    } catch {
      // Fallback below
    }
  }
  throw new Error("DecompressionStream is not supported in this environment");
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Parses a ZIP archive from memory and returns the entries map.
 */
export async function parseZipEntries(buffer: ArrayBuffer | Uint8Array): Promise<Map<string, Uint8Array>> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();

  let offset = 0;
  const len = bytes.length;
  let headers = 0;

  while (offset < len - 4) {
    // Look for Local File Header signature: PK\x03\x04 (0x04034b50)
    if (view.getUint32(offset, true) === 0x04034b50) {
      if (offset + 30 > len || ++headers > 10_000) throw new Error("Invalid or excessive ZIP headers");
      const compMethod = view.getUint16(offset + 8, true);
      const compSize = view.getUint32(offset + 18, true);
      const uncompSize = view.getUint32(offset + 22, true);
      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);
      if (offset + 30 + nameLen + extraLen > len) throw new Error("Truncated ZIP header");
      const nameBytes = bytes.subarray(offset + 30, offset + 30 + nameLen);
      const name = decoder.decode(nameBytes);
      const dataStart = offset + 30 + nameLen + extraLen;
      if (dataStart + compSize > len) throw new Error("Truncated ZIP member");
      if (PREVIEW_ENTRIES.has(name)) {
        if (uncompSize > MAX_XML_BYTES || compSize > MAX_XML_BYTES) {
          throw new Error("DOCX XML entry exceeds preview limit");
        }
        const rawData = bytes.subarray(dataStart, dataStart + compSize);
        if (compMethod === 0) {
          // Stored (no compression)
          if (rawData.length > MAX_XML_BYTES) throw new Error("DOCX XML entry exceeds preview limit");
          entries.set(name, rawData);
        } else if (compMethod === 8) {
          // Deflated
          try {
            const decompressed = await inflateRaw(rawData);
            entries.set(name, decompressed);
          } catch {
            // Keep compressed or skip corrupt member
          }
        }
      }
      offset = dataStart + compSize;
    } else {
      offset++;
    }
  }

  return entries;
}

/**
 * Checks if a byte buffer has the signature of an OOXML DOCX document.
 */
export async function isDocxBytes(buffer: ArrayBuffer | Uint8Array): Promise<boolean> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 30) return false;

  // Must start with PK\x03\x04
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    return false;
  }

  // Check if it contains word/ or [Content_Types].xml in raw bytes or parsed ZIP
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const sample = decoder.decode(bytes.subarray(0, Math.min(bytes.length, 2048)));
  if (sample.includes("[Content_Types].xml") || sample.includes("word/")) {
    return true;
  }

  try {
    const entries = await parseZipEntries(bytes);
    return entries.has("[Content_Types].xml") && (entries.has("word/document.xml") || entries.has("word/_rels/document.xml.rels"));
  } catch {
    return false;
  }
}

/**
 * Checks if a byte buffer is a legacy binary .doc file (OLE CFBF).
 */
export function isLegacyDocBytes(buffer: ArrayBuffer | Uint8Array): boolean {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 8) return false;
  // OLE Compound File header: D0 CF 11 E0 A1 B1 1A E1
  return (
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  );
}

/**
 * Validates that a cleaned DOCX package is structurally sound.
 */
export async function validateDocxPackage(buffer: ArrayBuffer | Uint8Array): Promise<{ valid: boolean; error?: string }> {
  try {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length === 0) return { valid: false, error: "Empty package" };

    const entries = await parseZipEntries(bytes);
    if (!entries.has("[Content_Types].xml")) {
      return { valid: false, error: "Missing [Content_Types].xml" };
    }
    if (!entries.has("word/document.xml")) {
      return { valid: false, error: "Missing word/document.xml" };
    }

    const docXmlBytes = entries.get("word/document.xml")!;
    const decoder = new TextDecoder();
    const docXml = decoder.decode(docXmlBytes);

    if (!docXml.includes("<w:document") || !docXml.includes("<w:body>")) {
      return { valid: false, error: "Invalid word/document.xml XML structure" };
    }

    return { valid: true };
  } catch (err: unknown) {
    return { valid: false, error: err instanceof Error ? err.message : "Invalid ZIP structure" };
  }
}

/**
 * Extracts clean, human-readable text from DOCX OOXML word/document.xml.
 */
export async function extractDocxPreviewText(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  const entries = await parseZipEntries(buffer);
  const docBytes = entries.get("word/document.xml");
  if (!docBytes) {
    return "(Không thể đọc nội dung tài liệu Word)";
  }

  const decoder = new TextDecoder();
  const xml = decoder.decode(docBytes);

  return parseWordXmlToText(xml);
}

function parseWordXmlToText(xml: string): string {
  const lines: string[] = [];

  // Match paragraphs <w:p> and table rows <w:tr>
  const blockRegex = /<w:(p|tr)\b[^>]*>([\s\S]*?)<\/w:\1>/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(xml)) !== null) {
    const isRow = blockMatch[1] === "tr";
    const blockContent = blockMatch[2];

    if (isRow) {
      // Table row: extract each cell <w:tc>
      const cellRegex = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
      const cellTexts: string[] = [];
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(blockContent)) !== null) {
        const textInCell = extractTextFromFragment(cellMatch[1]).trim();
        cellTexts.push(textInCell);
      }
      if (cellTexts.length > 0) {
        lines.push(cellTexts.join("  │  "));
      }
    } else {
      // Regular paragraph
      const pText = extractTextFromFragment(blockContent);
      lines.push(pText);
    }
  }

  // Clean redundant multi-newlines
  const joined = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return joined.length > 0 ? joined : "(Tài liệu không có văn bản hiển thị)";
}

function extractTextFromFragment(fragment: string): string {
  let out = "";
  // Tokenize text runs <w:t>, tabs <w:tab/>, and line breaks <w:br/>
  const tokenRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\s*\/?>|<w:br\s*\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(fragment)) !== null) {
    if (match[1] !== undefined) {
      // Unescape XML entities
      const unescaped = match[1]
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
      out += unescaped;
    } else if (match[0].includes("tab")) {
      out += "\t";
    } else if (match[0].includes("br")) {
      out += "\n";
    }
  }

  return out;
}
