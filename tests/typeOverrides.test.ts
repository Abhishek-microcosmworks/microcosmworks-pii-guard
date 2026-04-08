import { describe, it, expect } from 'vitest';
import { PIIGuard } from '../src/PIIGuard.js';
import { BuiltInProvider } from '../src/detection/BuiltInProvider.js';
import { DEFAULT_PATTERNS } from '../src/patterns.js';
import { DEFAULT_POOLS } from '../src/pools/index.js';
import { InMemoryAdapter } from '../src/storage/InMemoryAdapter.js';
import { InMemoryCache } from '../src/cache/InMemoryCache.js';
import { resolveConfig } from '../src/config.js';
import type { ResolvedConfig, TypeOverrideConfig } from '../src/types.js';
import { PIIType } from '../src/types.js';

function createTestConfig(
  typeOverrides: Record<string, TypeOverrideConfig> = {},
  extraPatterns: typeof DEFAULT_PATTERNS = [],
): ResolvedConfig {
  const patterns = [...DEFAULT_PATTERNS, ...extraPatterns];
  return {
    storage: new InMemoryAdapter(),
    cache: new InMemoryCache(),
    patterns,
    pools: DEFAULT_POOLS,
    salt: 'test-override-salt',
    cacheTtlSeconds: 3600,
    contextWindowSize: 50,
    documentTypes: ['general'],
    detectionProvider: new BuiltInProvider(patterns, ['general']),
    typeOverrides,
  };
}

describe('typeOverrides', () => {
  describe('enabled: false', () => {
    it('should suppress detection for disabled types', async () => {
      const config = createTestConfig({
        [PIIType.SSN]: { enabled: false },
      });
      const guard = new PIIGuard(config);

      const result = await guard.redact(
        'Email john@acme.com, SSN 123-45-6789',
        { scopeId: 'scope1' },
      );

      // SSN should remain in text, email should be redacted
      expect(result.text).toContain('123-45-6789');
      expect(result.text).not.toContain('john@acme.com');
      expect(result.entities.every(e => e.type !== PIIType.SSN)).toBe(true);
    });

    it('should exclude disabled types from detect() results', async () => {
      const config = createTestConfig({
        [PIIType.SSN]: { enabled: false },
      });
      const guard = new PIIGuard(config);

      const entities = await guard.detect('Email john@acme.com, SSN 123-45-6789');

      expect(entities.some(e => e.type === PIIType.EMAIL)).toBe(true);
      expect(entities.every(e => e.type !== PIIType.SSN)).toBe(true);
    });
  });

  describe('strategy: mask', () => {
    it('should replace with default mask label', async () => {
      const config = createTestConfig({
        [PIIType.EMAIL]: { strategy: 'mask' },
      });
      const guard = new PIIGuard(config);

      const result = await guard.redact('Email john@acme.com here', { scopeId: 'scope1' });

      expect(result.text).toContain('[EMAIL_REDACTED]');
      expect(result.text).not.toContain('john@acme.com');
    });

    it('should use custom maskLabel with {TYPE} placeholder', async () => {
      const config = createTestConfig({
        [PIIType.SSN]: { strategy: 'mask', maskLabel: '[SOCIAL SECURITY REMOVED]' },
      });
      const guard = new PIIGuard(config);

      const result = await guard.redact('SSN 123-45-6789', { scopeId: 'scope1' });

      expect(result.text).toContain('[SOCIAL SECURITY REMOVED]');
      expect(result.text).not.toContain('123-45-6789');
    });
  });

  describe('strategy: hash', () => {
    it('should produce deterministic hashes for same input+scope', async () => {
      const config = createTestConfig({
        [PIIType.EMAIL]: { strategy: 'hash' },
      });
      const guard = new PIIGuard(config);

      const result1 = await guard.redact('Email john@acme.com', { scopeId: 'scope1' });
      const result2 = await guard.redact('Email john@acme.com', { scopeId: 'scope1' });

      expect(result1.text).toBe(result2.text);
      expect(result1.text).toMatch(/\[HASH-[A-F0-9]{8}\]/);
    });

    it('should produce different hashes for different scopes', async () => {
      const config = createTestConfig({
        [PIIType.EMAIL]: { strategy: 'hash' },
      });
      const guard = new PIIGuard(config);

      const result1 = await guard.redact('Email john@acme.com', { scopeId: 'scope1' });
      const result2 = await guard.redact('Email john@acme.com', { scopeId: 'scope2' });

      expect(result1.text).not.toBe(result2.text);
    });
  });

  describe('strategy: skip', () => {
    it('should leave original value in text but still include entity in results', async () => {
      const config = createTestConfig({
        [PIIType.EMAIL]: { strategy: 'skip' },
      });
      const guard = new PIIGuard(config);

      const result = await guard.redact(
        'Email john@acme.com, SSN 123-45-6789',
        { scopeId: 'scope1' },
      );

      // Email stays in text (skipped), SSN is redacted
      expect(result.text).toContain('john@acme.com');
      expect(result.text).not.toContain('123-45-6789');
      // Email entity is still in results
      expect(result.entities.some(e => e.type === PIIType.EMAIL)).toBe(true);
    });
  });

  describe('custom function strategy', () => {
    it('should use custom function for replacement', async () => {
      const config = createTestConfig({
        [PIIType.CREDIT_CARD]: {
          strategy: (value: string) => {
            const last4 = value.replace(/\D/g, '').slice(-4);
            return `****-****-****-${last4}`;
          },
        },
      });
      const guard = new PIIGuard(config);

      const result = await guard.redact(
        'Card: 4111-1111-1111-1111',
        { scopeId: 'scope1' },
      );

      expect(result.text).toContain('****-****-****-1111');
    });
  });

  describe('confidence override', () => {
    it('should override entity confidence in redact results', async () => {
      const config = createTestConfig({
        [PIIType.SSN]: { confidence: 0.5 },
      });
      const guard = new PIIGuard(config);

      const result = await guard.redact('SSN 123-45-6789', { scopeId: 'scope1' });

      const ssnEntity = result.entities.find(e => e.type === PIIType.SSN);
      expect(ssnEntity).toBeDefined();
      expect(ssnEntity!.confidence).toBe(0.5);
    });

    it('should override entity confidence in detect results', async () => {
      const config = createTestConfig({
        [PIIType.SSN]: { confidence: 0.5 },
      });
      const guard = new PIIGuard(config);

      const entities = await guard.detect('SSN 123-45-6789');

      const ssnEntity = entities.find(e => e.type === PIIType.SSN);
      expect(ssnEntity).toBeDefined();
      expect(ssnEntity!.confidence).toBe(0.5);
    });
  });

  describe('patterns replacement', () => {
    it('should replace default patterns when patterns is set', async () => {
      // Replace SSN patterns with a pattern that matches a different format
      const resolved = await resolveConfig({
        salt: 'test-salt',
        typeOverrides: {
          [PIIType.SSN]: {
            patterns: [
              {
                type: PIIType.SSN,
                pattern: /SSN#\d{9}/g,
                confidence: 0.9,
              },
            ],
          },
        },
      });

      const guard = new PIIGuard(resolved);

      // Original SSN format should NOT be detected (patterns were replaced)
      const result1 = await guard.redact('SSN 123-45-6789', { scopeId: 'scope1' });
      expect(result1.text).toContain('123-45-6789');

      // New format SHOULD be detected
      const result2 = await guard.redact('SSN#123456789', { scopeId: 'scope1' });
      expect(result2.text).not.toContain('SSN#123456789');
    });
  });

  describe('addPatterns', () => {
    it('should add extra patterns without removing defaults', async () => {
      const resolved = await resolveConfig({
        salt: 'test-salt',
        typeOverrides: {
          [PIIType.EMAIL]: {
            addPatterns: [
              {
                type: PIIType.EMAIL,
                pattern: /[\w.+-]+\[at\][\w.-]+\.\w+/g,
                confidence: 0.9,
              },
            ],
          },
        },
      });

      const guard = new PIIGuard(resolved);

      // Standard email should still be detected
      const result1 = await guard.redact('Email john@acme.com', { scopeId: 'scope1' });
      expect(result1.text).not.toContain('john@acme.com');

      // New [at] format should also be detected
      const result2 = await guard.redact('Email john[at]acme.com', { scopeId: 'scope1' });
      expect(result2.text).not.toContain('john[at]acme.com');
    });
  });

  describe('empty typeOverrides', () => {
    it('should behave identically to no overrides', async () => {
      const configWithOverrides = createTestConfig({});
      const configWithout = createTestConfig();

      const guardWith = new PIIGuard(configWithOverrides);
      const guardWithout = new PIIGuard(configWithout);

      const text = 'Email john@acme.com, SSN 123-45-6789';

      const resultWith = await guardWith.redact(text, { scopeId: 'scope1' });
      const resultWithout = await guardWithout.redact(text, { scopeId: 'scope1' });

      expect(resultWith.entities.length).toBe(resultWithout.entities.length);
      // Both should redact the same types
      const typesA = resultWith.entities.map(e => e.type).sort();
      const typesB = resultWithout.entities.map(e => e.type).sort();
      expect(typesA).toEqual(typesB);
    });
  });

  describe('mixed strategies', () => {
    it('should apply different strategies per type in the same text', async () => {
      const config = createTestConfig({
        [PIIType.SSN]: { strategy: 'mask' },
        [PIIType.EMAIL]: { strategy: 'hash' },
        [PIIType.PHONE]: { strategy: 'skip' },
      });
      const guard = new PIIGuard(config);

      const result = await guard.redact(
        'Email john@acme.com, SSN 123-45-6789, Phone 555-123-4567',
        { scopeId: 'scope1' },
      );

      // SSN → masked
      expect(result.text).toContain('[SSN_REDACTED]');
      expect(result.text).not.toContain('123-45-6789');

      // EMAIL → hashed
      expect(result.text).toMatch(/\[HASH-[A-F0-9]{8}\]/);
      expect(result.text).not.toContain('john@acme.com');

      // PHONE → skipped (original stays)
      expect(result.text).toContain('555-123-4567');
    });
  });
});
