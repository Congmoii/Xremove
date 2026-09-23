import { unzipSync, zipSync } from "fflate";

const INVISIBLE = new Set([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);
const SHAPING_SCRIPT = /[\p{Script=Arabic}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Thai}\p{Script=Khmer}]/u;
const EMOJI = /\p{Extended_Pictographic}/u;
const MAX_TEXT_BYTES = 20 * 1024 * 1024;
const MAX_DOCX_BYTES = 25 * 1024 * 1024;
const MAX_DOCX_EXPANDED = 80 * 1024 * 1024;
const MAX_DOCX_ENTRIES = 2000;

export interface LocalCleanStats {
  input_length: number;
  output_length: number;
  removed_count: number;
  replaced_count: number;
  removed: Record<string, number>;
  replaced: Record<string, number>;
}

export interface LocalCleanResult {
  blob: Blob;
  filename: string;
  report: {
    kind: "text" | "container";
    stats: LocalCleanStats;
    metadata_removed_count: number;
    actions: string[];
    changed: boolean;
  };
}

function outputName(original: string): string {
  const dot = original.lastIndexOf(".");
  return dot <= 0 ? `${original}_xremove` : `${original.slice(0, dot)}_xremove${original.slice(dot)}`;
}

function preservesJoiner(chars: string[], index: number): boolean {
  const previous = chars[index - 1] ?? "";
  const next = chars[index + 1] ?? "";
  // ZWJ/ZWNJ can be part of an emoji or a script's shaping rules.
  return (EMOJI.test(previous) && EMOJI.test(next)) ||
    (SHAPING_SCRIPT.test(previous) && SHAPING_SCRIPT.test(next));
}

export function cleanInvisibleText(input: string): { text: string; stats: LocalCleanStats } {
  const chars = Array.from(input);
  const removed: Record<string, number> = {};
  const kept: string[] = [];
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index];
    const code = char.codePointAt(0)!;
    if (INVISIBLE.has(code) &&
      !((code === 0x200c || code === 0x200d) && preservesJoiner(chars, index))) {
      const label = `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
      removed[label] = (removed[label] ?? 0) + 1;
    } else {
      kept.push(char);
    }
  }
  const text = kept.join("");
  return {
    text,
    stats: {
      input_length: chars.length,
      output_length: Array.from(text).length,
      removed_count: Object.values(removed).reduce((sum, count) => sum + count, 0),
      replaced_count: 0,
      removed,
      replaced: {},
    },
  };
}

function assertTextFile(file: File): void {
  if (!/\.(txt|md|markdown)$/i.test(file.name)) {
    throw new Error("Only UTF-8 TXT and Markdown files are supported in the standalone HTML");
  }
  if (!file.size || file.size > MAX_TEXT_BYTES) throw new Error("Text file is empty or exceeds 20 MB");
}

export async function cleanLocalTextFile(file: File): Promise<LocalCleanResult> {
  assertTextFile(file);
  const input = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
    .decode(await file.arrayBuffer());
  const { text, stats } = cleanInvisibleText(input);
  return {
    blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
    filename: outputName(file.name),
    report: {
      kind: "text", stats, metadata_removed_count: 0,
      actions: ["Created a new UTF-8 text file; plain text has no embedded file properties"],
      changed: text !== input,
    },
  };
}

const HIDDEN_XML_ENTITY = /&#(?:x([0-9a-f]+)|([0-9]+));/gi;
function cleanDocxTextRuns(xml: string): { xml: string; removed: number } {
  let removed = 0;
  const updated = xml.replace(/(<(?:w|a):t\b[^>]*>)([\s\S]*?)(<\/(?:w|a):t>)/g,
    (_match, start: string, body: string, end: string) => {
      const withHiddenDecoded = body.replace(HIDDEN_XML_ENTITY, (entity, hex: string | undefined, decimal: string | undefined) => {
        const code = hex ? Number.parseInt(hex, 16) : Number.parseInt(decimal!, 10);
        return INVISIBLE.has(code) ? String.fromCodePoint(code) : entity;
      });
      const cleaned = cleanInvisibleText(withHiddenDecoded);
      removed += cleaned.stats.removed_count;
      return start + cleaned.text + end;
    });
  return { xml: updated, removed };
}

function removePropertyReferences(xml: string): string {
  return xml
    .replace(/<Override\b[^>]*\bPartName\s*=\s*["']\/docProps\/[^"']+["'][^>]*\/\s*>/gi, "")
    .replace(/<Relationship\b[^>]*\bTarget\s*=\s*["']\/?docProps\/[^"']+["'][^>]*\/\s*>/gi, "");
}

export async function cleanLocalDocx(file: File): Promise<LocalCleanResult> {
  if (!/\.docx$/i.test(file.name) || !file.size || file.size > MAX_DOCX_BYTES) {
    throw new Error("DOCX file is empty or exceeds 25 MB");
  }
  const input = new Uint8Array(await file.arrayBuffer());
  if (input[0] !== 0x50 || input[1] !== 0x4b) throw new Error("Invalid DOCX ZIP package");
  let entriesCount = 0;
  let expandedBytes = 0;
  const entries = unzipSync(input, {
    filter(info) {
      entriesCount++;
      expandedBytes += info.originalSize;
      if (entriesCount > MAX_DOCX_ENTRIES || expandedBytes > MAX_DOCX_EXPANDED ||
        !Number.isSafeInteger(info.originalSize) || info.name.includes("\\") ||
        info.name.startsWith("/") || info.name.split("/").includes("..")) {
        throw new Error("DOCX package exceeds safe limits or has invalid member names");
      }
      return true;
    },
  });
  if (!entries["[Content_Types].xml"] || !entries["word/document.xml"] ||
    !entries["_rels/.rels"]) throw new Error("Invalid DOCX package");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const encoder = new TextEncoder();
  const output: Record<string, Uint8Array> = Object.create(null);
  let metadataRemoved = 0;
  let hiddenRemoved = 0;
  for (const [name, data] of Object.entries(entries)) {
    if (name.startsWith("docProps/")) {
      metadataRemoved++;
      continue;
    }
    if (name === "[Content_Types].xml" || name.endsWith(".rels")) {
      output[name] = encoder.encode(removePropertyReferences(decoder.decode(data)));
    } else if (name.startsWith("word/") && name.endsWith(".xml")) {
      const cleaned = cleanDocxTextRuns(decoder.decode(data));
      hiddenRemoved += cleaned.removed;
      output[name] = encoder.encode(cleaned.xml);
    } else {
      output[name] = data;
    }
  }
  const cleaned = zipSync(output, { level: 6, mtime: new Date("1980-01-01T00:00:00Z") });
  const stats: LocalCleanStats = {
    input_length: 0, output_length: 0, removed_count: hiddenRemoved,
    replaced_count: 0, removed: { "invisible DOCX text characters": hiddenRemoved }, replaced: {},
  };
  return {
    blob: new Blob([new Uint8Array(cleaned)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    filename: outputName(file.name),
    report: {
      kind: "container", stats, metadata_removed_count: metadataRemoved,
      actions: ["Removed standard DOCX property parts", "Rebuilt DOCX without original ZIP timestamps or comments"],
      changed: metadataRemoved > 0 || hiddenRemoved > 0,
    },
  };
}
