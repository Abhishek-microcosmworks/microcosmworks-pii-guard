import { describe, it, expect } from 'vitest';
import { PIIGuard } from '../src/PIIGuard.js';
import { BuiltInProvider } from '../src/detection/BuiltInProvider.js';
import { DEFAULT_PATTERNS } from '../src/patterns.js';
import { DEFAULT_POOLS } from '../src/pools/index.js';
import { InMemoryAdapter } from '../src/storage/InMemoryAdapter.js';
import { InMemoryCache } from '../src/cache/InMemoryCache.js';
import type { ResolvedConfig } from '../src/types.js';

function createTestConfig(): ResolvedConfig {
  return {
    storage: new InMemoryAdapter(),
    cache: new InMemoryCache(),
    patterns: DEFAULT_PATTERNS,
    pools: DEFAULT_POOLS,
    salt: 'test-guard-salt',
    cacheTtlSeconds: 3600,
    contextWindowSize: 50,
    documentTypes: ['general'],
    detectionProvider: new BuiltInProvider(DEFAULT_PATTERNS, ['general']),
    typeOverrides: {},
  };
}

describe('PIIGuard', () => {
  describe('redact', () => {
    it('should redact email addresses with synthetic values', async () => {
      const guard = new PIIGuard(createTestConfig());
      const result = await guard.redact('Email john@acme.com for details', { scopeId: 'user_1' });

      expect(result.text).not.toContain('john@acme.com');
      expect(result.text).toContain('@');
      expect(result.entities.length).toBeGreaterThanOrEqual(1);
      expect(result.mapping.size).toBeGreaterThanOrEqual(1);
    });

    it('should redact phone numbers', async () => {
      const guard = new PIIGuard(createTestConfig());
      const result = await guard.redact('Call 555-123-4567 today', { scopeId: 'user_1' });

      expect(result.text).not.toContain('555-123-4567');
    });

    it('should redact SSNs', async () => {
      const guard = new PIIGuard(createTestConfig());
      const result = await guard.redact('SSN is 123-45-6789', { scopeId: 'user_1' });

      expect(result.text).not.toContain('123-45-6789');
    });

    it('should produce deterministic results for same scope', async () => {
      const config = createTestConfig();
      const guard = new PIIGuard(config);

      const result1 = await guard.redact('Email john@acme.com', { scopeId: 'user_1' });
      const result2 = await guard.redact('Email john@acme.com', { scopeId: 'user_1' });

      expect(result1.text).toBe(result2.text);
    });

    it('should produce different results for different scopes', async () => {
      const config = createTestConfig();
      const guard = new PIIGuard(config);

      const result1 = await guard.redact('SSN 123-45-6789', { scopeId: 'user_1' });
      const result2 = await guard.redact('SSN 123-45-6789', { scopeId: 'user_2' });

      expect(result1.text).not.toBe(result2.text);
    });

    it('should handle text with no PII', async () => {
      const guard = new PIIGuard(createTestConfig());
      const result = await guard.redact('The weather is nice today', { scopeId: 'user_1' });

      expect(result.text).toBe('The weather is nice today');
      expect(result.entities).toHaveLength(0);
      expect(result.mapping.size).toBe(0);
    });

    it('should handle multiple PII entities in one text', async () => {
      const guard = new PIIGuard(createTestConfig());
      const result = await guard.redact(
        'Contact john@acme.com or call 555-123-4567. SSN: 123-45-6789',
        { scopeId: 'user_1' }
      );

      expect(result.text).not.toContain('john@acme.com');
      expect(result.text).not.toContain('123-45-6789');
      expect(result.entities.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('restore', () => {
    it('should restore redacted text to original', async () => {
      const config = createTestConfig();
      const guard = new PIIGuard(config);
      const scopeId = 'user_restore';

      const original = 'Email john@acme.com for info';
      const redacted = await guard.redact(original, { scopeId });
      const restored = await guard.restore(redacted.text, { scopeId });

      expect(restored.text).toBe(original);
      expect(restored.resolved).toBeGreaterThanOrEqual(1);
    });

    it('should restore multiple entities', async () => {
      const config = createTestConfig();
      const guard = new PIIGuard(config);
      const scopeId = 'user_multi_restore';

      const original = 'Call 555-123-4567, SSN: 123-45-6789';
      const redacted = await guard.redact(original, { scopeId });
      const restored = await guard.restore(redacted.text, { scopeId });

      expect(restored.text).toBe(original);
    });

    it('should handle text with no synthetics to restore', async () => {
      const config = createTestConfig();
      const guard = new PIIGuard(config);

      const restored = await guard.restore('plain text with no synthetics', {
        scopeId: 'empty_scope',
      });

      expect(restored.text).toBe('plain text with no synthetics');
      expect(restored.resolved).toBe(0);
    });
  });

  describe('detect', () => {
    it('should detect PII without replacing', async () => {
      const guard = new PIIGuard(createTestConfig());
      const entities = await guard.detect('Email john@acme.com and SSN 123-45-6789');

      expect(entities.length).toBeGreaterThanOrEqual(2);
      // Synthetic should be empty (not replaced)
      for (const entity of entities) {
        expect(entity.synthetic).toBe('');
      }
    });
  });

  describe('redactForEmbedding', () => {
    it('should produce same output as redact', async () => {
      const config = createTestConfig();
      const guard = new PIIGuard(config);

      const redacted = await guard.redact('SSN 123-45-6789', { scopeId: 'embed_test' });
      const embedded = await guard.redactForEmbedding('SSN 123-45-6789', { scopeId: 'embed_test' });

      expect(redacted.text).toBe(embedded.text);
    });
  });

  describe('with custom detection provider', () => {
    it('should use a custom detection provider', async () => {
      const config = createTestConfig();
      config.detectionProvider = {
        name: 'custom-test',
        async detect() {
          return [
            {
              type: 'NAME' as any,
              value: 'John Doe',
              startIndex: 0,
              endIndex: 8,
              confidence: 0.99,
            },
          ];
        },
      };

      const guard = new PIIGuard(config);
      const result = await guard.redact('John Doe is here', { scopeId: 'custom_test' });

      expect(result.text).not.toContain('John Doe');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].confidence).toBe(0.99);
    });
  });

  describe('shutdown', () => {
    it('should shutdown without errors', async () => {
      const guard = new PIIGuard(createTestConfig());
      await expect(guard.shutdown()).resolves.not.toThrow();
    });
  });
});
