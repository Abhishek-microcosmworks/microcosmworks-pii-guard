import { describe, it, expect, afterEach } from 'vitest';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { inferFormat, isWritableFormat, extractText } from '../src/file/index.js';
import { PIIGuard } from '../src/PIIGuard.js';
import { BuiltInProvider } from '../src/detection/BuiltInProvider.js';
import { DEFAULT_PATTERNS } from '../src/patterns.js';
import { DEFAULT_POOLS } from '../src/pools/index.js';
import { InMemoryAdapter } from '../src/storage/InMemoryAdapter.js';
import { InMemoryCache } from '../src/cache/InMemoryCache.js';
import type { ResolvedConfig } from '../src/types.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');

function createTestConfig(): ResolvedConfig {
  return {
    storage: new InMemoryAdapter(),
    cache: new InMemoryCache(),
    patterns: DEFAULT_PATTERNS,
    pools: DEFAULT_POOLS,
    salt: 'test-file-salt',
    cacheTtlSeconds: 3600,
    contextWindowSize: 50,
    documentTypes: ['general'],
    detectionProvider: new BuiltInProvider(DEFAULT_PATTERNS, ['general']),
    typeOverrides: {},
  };
}

// ── inferFormat ────────────────────────────────────────────────────

describe('inferFormat', () => {
  it('should map common extensions', () => {
    expect(inferFormat('readme.txt')).toBe('txt');
    expect(inferFormat('doc.md')).toBe('md');
    expect(inferFormat('data.csv')).toBe('csv');
    expect(inferFormat('app.log')).toBe('log');
    expect(inferFormat('config.json')).toBe('json');
    expect(inferFormat('report.pdf')).toBe('pdf');
    expect(inferFormat('letter.docx')).toBe('docx');
    expect(inferFormat('page.html')).toBe('html');
    expect(inferFormat('page.htm')).toBe('html');
    expect(inferFormat('feed.xml')).toBe('xml');
  });

  it('should be case-insensitive', () => {
    expect(inferFormat('FILE.TXT')).toBe('txt');
    expect(inferFormat('DOC.PDF')).toBe('pdf');
    expect(inferFormat('page.HTML')).toBe('html');
  });

  it('should throw for unsupported extensions', () => {
    expect(() => inferFormat('image.png')).toThrow('Unsupported file extension');
    expect(() => inferFormat('archive.zip')).toThrow('Unsupported file extension');
  });
});

// ── isWritableFormat ──────────────────────────────────────────────

describe('isWritableFormat', () => {
  it('should return true for text-based formats', () => {
    expect(isWritableFormat('txt')).toBe(true);
    expect(isWritableFormat('md')).toBe(true);
    expect(isWritableFormat('csv')).toBe(true);
    expect(isWritableFormat('log')).toBe(true);
    expect(isWritableFormat('json')).toBe(true);
    expect(isWritableFormat('html')).toBe(true);
    expect(isWritableFormat('xml')).toBe(true);
  });

  it('should return false for binary formats', () => {
    expect(isWritableFormat('pdf')).toBe(false);
    expect(isWritableFormat('docx')).toBe(false);
  });
});

// ── extractText ───────────────────────────────────────────────────

describe('extractText', () => {
  describe('plain text files', () => {
    it('should extract text from a .txt file', async () => {
      const result = await extractText(join(FIXTURES, 'sample.txt'));

      expect(result.format).toBe('txt');
      expect(result.source).toContain('sample.txt');
      expect(result.text).toContain('John Smith');
      expect(result.text).toContain('john.smith@hospital.org');
      expect(result.text).toContain('123-45-6789');
      expect(result.charCount).toBeGreaterThan(0);
      expect(result.charCount).toBe(result.text.length);
    });

    it('should extract text from a Buffer with format specified', async () => {
      const buf = Buffer.from('Hello world, email: test@example.com');
      const result = await extractText(buf, { format: 'txt' });

      expect(result.format).toBe('txt');
      expect(result.source).toBe('<buffer>');
      expect(result.text).toContain('test@example.com');
    });

    it('should throw when Buffer is given without format', async () => {
      const buf = Buffer.from('some content');
      await expect(extractText(buf)).rejects.toThrow('format');
    });
  });

  describe('HTML files', () => {
    it('should strip tags and extract text content', async () => {
      const result = await extractText(join(FIXTURES, 'sample.html'));

      expect(result.format).toBe('html');
      expect(result.text).toContain('support@example.com');
      expect(result.text).toContain('555-987-6543');
      expect(result.text).toContain('987-65-4321');
      // Tags should be stripped
      expect(result.text).not.toContain('<p>');
      expect(result.text).not.toContain('<div>');
      expect(result.text).not.toContain('<h1>');
    });

    it('should remove script and style blocks', async () => {
      const result = await extractText(join(FIXTURES, 'sample.html'));

      // The SSN inside <script> should NOT appear
      expect(result.text).not.toContain('000-00-0000');
      expect(result.text).not.toContain('console.log');
      expect(result.text).not.toContain('font-family');
    });

    it('should decode HTML entities', async () => {
      const result = await extractText(join(FIXTURES, 'sample.html'));

      // &amp; should become &
      expect(result.text).toContain('Billing & invoices');
    });
  });

  describe('CSV files', () => {
    it('should read CSV as plain text', async () => {
      const result = await extractText(join(FIXTURES, 'sample.csv'));

      expect(result.format).toBe('csv');
      expect(result.text).toContain('john@acme.com');
      expect(result.text).toContain('jane@hospital.org');
      expect(result.text).toContain('555-111-2222');
    });
  });
});

// ── PIIGuard.redactFile ───────────────────────────────────────────

describe('PIIGuard.redactFile', () => {
  const tmpOutput = join(FIXTURES, '_test_output.txt');

  afterEach(async () => {
    try { await unlink(tmpOutput); } catch { /* ignore */ }
  });

  it('should redact PII from a .txt file', async () => {
    const guard = new PIIGuard(createTestConfig());
    const result = await guard.redactFile(join(FIXTURES, 'sample.txt'), {
      scopeId: 'file_test',
    });

    expect(result.format).toBe('txt');
    expect(result.source).toContain('sample.txt');
    expect(result.text).not.toContain('john.smith@hospital.org');
    expect(result.text).not.toContain('123-45-6789');
    expect(result.entities.length).toBeGreaterThanOrEqual(2);
  });

  it('should write output file when outputPath is set', async () => {
    const guard = new PIIGuard(createTestConfig());
    const result = await guard.redactFile(join(FIXTURES, 'sample.txt'), {
      scopeId: 'file_test_write',
      outputPath: tmpOutput,
    });

    expect(result.outputPath).toBe(tmpOutput);
    const written = await readFile(tmpOutput, 'utf-8');
    expect(written).toBe(result.text);
    expect(written).not.toContain('john.smith@hospital.org');
  });

  it('should reject outputPath for non-writable formats', async () => {
    const guard = new PIIGuard(createTestConfig());
    const buf = Buffer.from('test content with email test@example.com');

    await expect(
      guard.redactFile(buf, {
        scopeId: 'file_test_pdf',
        format: 'pdf',
        outputPath: tmpOutput,
      }),
    ).rejects.toThrow('Cannot write output for format "pdf"');
  });

  it('should accept Buffer input with format', async () => {
    const guard = new PIIGuard(createTestConfig());
    const buf = Buffer.from('Contact john@acme.com or SSN 123-45-6789');
    const result = await guard.redactFile(buf, {
      scopeId: 'buf_test',
      format: 'txt',
    });

    expect(result.source).toBe('<buffer>');
    expect(result.format).toBe('txt');
    expect(result.text).not.toContain('john@acme.com');
    expect(result.text).not.toContain('123-45-6789');
  });
});

// ── PIIGuard.detectFile ───────────────────────────────────────────

describe('PIIGuard.detectFile', () => {
  it('should detect PII in a .txt file', async () => {
    const guard = new PIIGuard(createTestConfig());
    const result = await guard.detectFile(join(FIXTURES, 'sample.txt'));

    expect(result.format).toBe('txt');
    expect(result.source).toContain('sample.txt');
    expect(result.entities.length).toBeGreaterThanOrEqual(2);
    expect(result.extractedText).toContain('John Smith');
  });

  it('should include extractedText in result', async () => {
    const guard = new PIIGuard(createTestConfig());
    const result = await guard.detectFile(join(FIXTURES, 'sample.txt'));

    expect(result.extractedText).toContain('john.smith@hospital.org');
    expect(result.extractedText).toContain('123-45-6789');
  });
});

// ── Round-trip ────────────────────────────────────────────────────

describe('Round-trip: redactFile → restore', () => {
  it('should restore the original text after redacting a file', async () => {
    const config = createTestConfig();
    const guard = new PIIGuard(config);
    const scopeId = 'roundtrip_file';

    // Read original text
    const originalText = await readFile(join(FIXTURES, 'sample.txt'), 'utf-8');

    // Redact the file
    const redacted = await guard.redactFile(join(FIXTURES, 'sample.txt'), { scopeId });

    // Restore from the redacted text
    const restored = await guard.restore(redacted.text, { scopeId });

    expect(restored.text).toBe(originalText);
  });
});
