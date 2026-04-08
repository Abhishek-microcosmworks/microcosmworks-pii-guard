import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { SupportedFileFormat, TextExtractionResult } from '../types.js';

const EXTENSION_MAP: Record<string, SupportedFileFormat> = {
  '.txt': 'txt',
  '.md': 'md',
  '.csv': 'csv',
  '.log': 'log',
  '.json': 'json',
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.html': 'html',
  '.htm': 'html',
  '.xml': 'xml',
};

const PLAIN_TEXT_FORMATS: Set<SupportedFileFormat> = new Set([
  'txt', 'md', 'csv', 'log', 'json',
]);

const WRITABLE_FORMATS: Set<SupportedFileFormat> = new Set([
  'txt', 'md', 'csv', 'log', 'json', 'html', 'xml',
]);

/** Map a file extension to a SupportedFileFormat */
export function inferFormat(filePath: string): SupportedFileFormat {
  const ext = extname(filePath).toLowerCase();
  const format = EXTENSION_MAP[ext];
  if (!format) {
    throw new Error(`Unsupported file extension "${ext}". Supported: ${Object.keys(EXTENSION_MAP).join(', ')}`);
  }
  return format;
}

/** Returns true for text-based formats that can be written back to disk */
export function isWritableFormat(format: SupportedFileFormat): boolean {
  return WRITABLE_FORMATS.has(format);
}

/** Write text content to a file */
export async function writeTextFile(
  path: string,
  content: string,
  encoding: BufferEncoding = 'utf-8',
): Promise<void> {
  await writeFile(path, content, { encoding });
}

/** Extract plain text from a file path or Buffer */
export async function extractText(
  input: string | Buffer,
  opts?: { format?: SupportedFileFormat; encoding?: BufferEncoding },
): Promise<TextExtractionResult> {
  const encoding = opts?.encoding ?? 'utf-8';

  if (Buffer.isBuffer(input)) {
    const format = opts?.format;
    if (!format) {
      throw new Error('A "format" option is required when input is a Buffer (no file extension to infer from).');
    }
    const text = await extractFromBuffer(input, format, encoding);
    return { text, format, source: '<buffer>', charCount: text.length };
  }

  // input is a file path
  const filePath = input;
  const format = opts?.format ?? inferFormat(filePath);
  const raw = await readFile(filePath);
  const text = await extractFromBuffer(raw, format, encoding);
  return { text, format, source: filePath, charCount: text.length };
}

async function extractFromBuffer(
  buf: Buffer,
  format: SupportedFileFormat,
  encoding: BufferEncoding,
): Promise<string> {
  if (PLAIN_TEXT_FORMATS.has(format)) {
    return buf.toString(encoding);
  }

  if (format === 'html' || format === 'xml') {
    return stripHtml(buf.toString(encoding));
  }

  if (format === 'pdf') {
    return extractPdf(buf);
  }

  if (format === 'docx') {
    return extractDocx(buf);
  }

  throw new Error(`Unsupported format: ${format}`);
}

// ── HTML / XML stripping ──────────────────────────────────────────

function stripHtml(html: string): string {
  let text = html;

  // Remove <script> and <style> blocks entirely
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Replace block-level elements with newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Collapse excessive whitespace but preserve paragraph breaks
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

// ── PDF extraction (lazy-loaded) ──────────────────────────────────

async function extractPdf(buf: Buffer): Promise<string> {
  let pdfParse: any;
  try {
    // @ts-ignore — optional peer dependency, loaded dynamically
    pdfParse = await import('pdf-parse');
  } catch {
    throw new Error(
      'pdf-parse is required for PDF extraction. Install it:\n  npm install pdf-parse',
    );
  }

  const parse = pdfParse.default ?? pdfParse;
  const result = await (parse as any)(buf);
  return result.text;
}

// ── DOCX extraction (lazy-loaded) ─────────────────────────────────

async function extractDocx(buf: Buffer): Promise<string> {
  let mammoth: any;
  try {
    // @ts-ignore — optional peer dependency, loaded dynamically
    mammoth = await import('mammoth');
  } catch {
    throw new Error(
      'mammoth is required for DOCX extraction. Install it:\n  npm install mammoth',
    );
  }

  const mod = (mammoth as any).default ?? mammoth;
  const result = await mod.extractRawText({ buffer: buf });
  return result.value;
}
