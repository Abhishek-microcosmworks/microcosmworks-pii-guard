import { describe, it, expect } from 'vitest';
import { PIIGuard } from '../src/PIIGuard.js';
import { BuiltInProvider } from '../src/detection/BuiltInProvider.js';
import { DEFAULT_PATTERNS } from '../src/patterns.js';
import { DEFAULT_POOLS } from '../src/pools/index.js';
import { InMemoryAdapter } from '../src/storage/InMemoryAdapter.js';
import { InMemoryCache } from '../src/cache/InMemoryCache.js';
import { PIIType } from '../src/types.js';
import type { ResolvedConfig } from '../src/types.js';

function createTestConfig(): ResolvedConfig {
  return {
    storage: new InMemoryAdapter(),
    cache: new InMemoryCache(),
    patterns: DEFAULT_PATTERNS,
    pools: DEFAULT_POOLS,
    salt: 'test-robust-restore-salt',
    cacheTtlSeconds: 3600,
    contextWindowSize: 50,
    documentTypes: ['general'],
    detectionProvider: new BuiltInProvider(DEFAULT_PATTERNS, ['general']),
    typeOverrides: {},
  };
}

describe('Restore (exact match)', () => {
  it('should restore verbatim synthetics', async () => {
    const config = createTestConfig();
    const guard = new PIIGuard(config);
    const scopeId = 'exact-match';

    const original = 'My SSN is 123-45-6789';
    const redacted = await guard.redact(original, { scopeId });
    const restored = await guard.restore(redacted.text, { scopeId });

    expect(restored.text).toBe(original);
    expect(restored.resolved).toBeGreaterThanOrEqual(1);
    expect(restored.unresolved).toHaveLength(0);
  });

  it('should restore multiple verbatim synthetics', async () => {
    const config = createTestConfig();
    const guard = new PIIGuard(config);
    const scopeId = 'multi-match';

    const original = 'Call 555-123-4567, SSN: 123-45-6789, Email: john@acme.com';
    const redacted = await guard.redact(original, { scopeId });
    const restored = await guard.restore(redacted.text, { scopeId });

    expect(restored.text).toBe(original);
  });

  it('should handle text with no synthetics to restore', async () => {
    const config = createTestConfig();
    const guard = new PIIGuard(config);

    const restored = await guard.restore('plain text', { scopeId: 'empty_scope' });

    expect(restored.text).toBe('plain text');
    expect(restored.resolved).toBe(0);
    expect(restored.unresolved).toHaveLength(0);
  });

  it('should track unresolved synthetics when value is not found in text', async () => {
    const config = createTestConfig();
    const guard = new PIIGuard(config);
    const scopeId = 'unresolved';

    const original = 'SSN is 123-45-6789';
    const redacted = await guard.redact(original, { scopeId });
    const syntheticSSN = redacted.entities.find(e => e.type === PIIType.SSN)?.synthetic;
    expect(syntheticSSN).toBeDefined();

    // Simulate: LLM completely drops the synthetic value
    const textWithoutSynthetic = 'The SSN was removed for security reasons.';

    const restored = await guard.restore(textWithoutSynthetic, { scopeId });
    expect(restored.unresolved.length).toBeGreaterThan(0);
    expect(restored.unresolved).toContain(syntheticSSN);
  });
});
