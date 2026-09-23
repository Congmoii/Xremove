import fs from "node:fs";
import path from "node:path";

// 1. Markdown with zero-width spaces
const mdContent = "# Xremove Test Document\n\nThis is a clean\u200B markdown\u200C test\u200D file with zero-width characters.\n";
fs.writeFileSync("tests/fixtures/sample.md", mdContent, "utf8");

// 2. Minimal valid PDF
const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 55 >>
stream
BT
/F1 12 Tf
72 712 Td
(Xremove Test Document) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000204 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
309
%%EOF
`;
fs.writeFileSync("tests/fixtures/sample.pdf", pdfContent, "utf8");

// 3. Minimal valid DOCX / ZIP container
// DOCX starts with PK zip signature
const zipHeader = Buffer.from([
  0x50, 0x4B, 0x03, 0x04, // Local file header signature
  0x0A, 0x00, 0x00, 0x00, // Version needed, flags
  0x00, 0x00, // Compression method (stored)
  0x21, 0xBC, 0x00, 0x00, // Mod time/date
  0x00, 0x00, 0x00, 0x00, // CRC-32
  0x00, 0x00, 0x00, 0x00, // Compressed size
  0x00, 0x00, 0x00, 0x00, // Uncompressed size
  0x08, 0x00, 0x00, 0x00, // File name length
  0x74, 0x65, 0x73, 0x74, 0x2E, 0x74, 0x78, 0x74, // "test.txt"
]);
fs.writeFileSync("tests/fixtures/sample.docx", zipHeader);

console.log("✓ Fixtures created: sample.md, sample.pdf, sample.docx");
