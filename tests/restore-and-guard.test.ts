import { describe, it, expect } from 'vitest';
import { PIIGuard } from '../src/PIIGuard.js';
import { BuiltInProvider } from '../src/detection/BuiltInProvider.js';
import { DEFAULT_PATTERNS } from '../src/patterns.js';
import { DEFAULT_POOLS } from '../src/pools/index.js';
import { InMemoryAdapter } from '../src/storage/InMemoryAdapter.js';
import { InMemoryCache } from '../src/cache/InMemoryCache.js';
import type { ResolvedConfig, TypeOverrideConfig } from '../src/types.js';
import { PIIType } from '../src/types.js';
import type { DetectionProvider, DetectedEntity } from '../src/detection/DetectionProvider.js';

function createTestConfig(
  overrides: {
    typeOverrides?: Record<string, TypeOverrideConfig>;
    detectionProvider?: DetectionProvider;
  } = {},
): ResolvedConfig {
  return {
    storage: new InMemoryAdapter(),
    cache: new InMemoryCache(),
    patterns: DEFAULT_PATTERNS,
    pools: DEFAULT_POOLS,
    salt: 'test-restore-guard-salt',
    cacheTtlSeconds: 3600,
    contextWindowSize: 50,
    documentTypes: ['general'],
    detectionProvider:
      overrides.detectionProvider ??
      new BuiltInProvider(DEFAULT_PATTERNS, ['general']),
    typeOverrides: overrides.typeOverrides ?? {},
  };
}

/**
 * Creates a mock detection provider that returns whatever entities the callback
 * produces for a given text. This lets us precisely control Phase 3 detection.
 */
function mockDetectionProvider(
  detectFn: (text: string) => DetectedEntity[],
): DetectionProvider {
  return {
    name: 'mock-for-guard',
    async detect(text: string) {
      return detectFn(text);
    },
  };
}

describe('restoreAndGuard', () => {
  // ── Test 1: Basic restore + guard ──────────────────────────────────
  it('should restore known synthetics and redact new PII', async () => {
    const storage = new InMemoryAdapter();
    const cache = new InMemoryCache();

    // Phase A: Redact original input using builtin provider
    const builtinProvider = new BuiltInProvider(DEFAULT_PATTERNS, ['general']);
    const redactConfig: ResolvedConfig = {
      storage, cache, patterns: DEFAULT_PATTERNS, pools: DEFAULT_POOLS,
      salt: 'test-salt', cacheTtlSeconds: 3600, contextWindowSize: 50,
      documentTypes: ['general'], detectionProvider: builtinProvider,
      typeOverrides: {},
    };
    const redactGuard = new PIIGuard(redactConfig);

    const redacted = await redactGuard.redact(
      'My SSN is 123-45-6789',
      { scopeId: 'scope1' },
    );
    expect(redacted.text).not.toContain('123-45-6789');
    const syntheticSSN = redacted.entities.find(e => e.type === PIIType.SSN)!.synthetic;

    // Phase B: Simulate LLM response — uses the synthetic SSN + introduces new email
    const llmResponse = `Got your SSN ${syntheticSSN}. I'll email john.doe@example.com`;

    // Phase C: restoreAndGuard with a mock provider that detects new PII in restored text
    const guardProvider = mockDetectionProvider((text) => {
      const entities: DetectedEntity[] = [];
      const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
      if (emailMatch) {
        entities.push({
          type: PIIType.EMAIL,
          value: emailMatch[0],
          startIndex: emailMatch.index!,
          endIndex: emailMatch.index! + emailMatch[0].length,
          confidence: 0.95,
        });
      }
      return entities;
    });

    const guardConfig: ResolvedConfig = {
      storage, cache, patterns: DEFAULT_PATTERNS, pools: DEFAULT_POOLS,
      salt: 'test-salt', cacheTtlSeconds: 3600, contextWindowSize: 50,
      documentTypes: ['general'], detectionProvider: guardProvider,
      typeOverrides: {},
    };
    const guardInstance = new PIIGuard(guardConfig);

    const result = await guardInstance.restoreAndGuard(llmResponse, { scopeId: 'scope1' });

    // Original SSN should be restored
    expect(result.text).toContain('123-45-6789');
    expect(result.restored).toHaveLength(1);
    expect(result.restored[0].original).toBe('123-45-6789');

    // New email should be redacted
    expect(result.text).not.toContain('john.doe@example.com');
    expect(result.guarded).toHaveLength(1);
    expect(result.guarded[0].type).toBe(PIIType.EMAIL);
  });

  // ── Test 2: No re-redaction of restored originals ──────────────────
  it('should NOT re-redact restored originals', async () => {
    const storage = new InMemoryAdapter();
    const cache = new InMemoryCache();

    const builtinProvider = new BuiltInProvider(DEFAULT_PATTERNS, ['general']);
    const config: ResolvedConfig = {
      storage, cache, patterns: DEFAULT_PATTERNS, pools: DEFAULT_POOLS,
      salt: 'test-salt', cacheTtlSeconds: 3600, contextWindowSize: 50,
      documentTypes: ['general'], detectionProvider: builtinProvider,
      typeOverrides: {},
    };
    const redactGuard = new PIIGuard(config);

    const redacted = await redactGuard.redact('SSN: 123-45-6789', { scopeId: 'scope1' });
    const syntheticSSN = redacted.entities.find(e => e.type === PIIType.SSN)!.synthetic;

    // Mock provider that detects SSN-like patterns (would catch the restored original)
    const guardProvider = mockDetectionProvider((text) => {
      const entities: DetectedEntity[] = [];
      const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
      let match;
      while ((match = ssnRegex.exec(text)) !== null) {
        entities.push({
          type: PIIType.SSN,
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence: 0.95,
        });
      }
      return entities;
    });

    const guardConfig: ResolvedConfig = {
      storage, cache, patterns: DEFAULT_PATTERNS, pools: DEFAULT_POOLS,
      salt: 'test-salt', cacheTtlSeconds: 3600, contextWindowSize: 50,
      documentTypes: ['general'], detectionProvider: guardProvider,
      typeOverrides: {},
    };
    const guardInstance = new PIIGuard(guardConfig);

    const result = await guardInstance.restoreAndGuard(
      `Your SSN is ${syntheticSSN}`,
      { scopeId: 'scope1' },
    );

    // The restored SSN should stay in the text, NOT be re-redacted
    expect(result.text).toContain('123-45-6789');
    expect(result.guarded).toHaveLength(0);
  });

  // ── Test 3: Multiple new PII entities ──────────────────────────────
  it('should redact multiple new PII entities from LLM response', async () => {
    const storage = new InMemoryAdapter();
    const cache = new InMemoryCache();

    const builtinProvider = new BuiltInProvider(DEFAULT_PATTERNS, ['general']);
    const config: ResolvedConfig = {
      storage, cache, patterns: DEFAULT_PATTERNS, pools: DEFAULT_POOLS,
      salt: 'test-salt', cacheTtlSeconds: 3600, contextWindowSize: 50,
      documentTypes: ['general'], detectionProvider: builtinProvider,
      typeOverrides: {},
    };
    const redactGuard = new PIIGuard(config);

    const redacted = await redactGuard.redact('SSN: 123-45-6789', { scopeId: 'scope1' });
    const syntheticSSN = redacted.entities.find(e => e.type === PIIType.SSN)!.synthetic;

    // LLM adds 3 new PII values
    const llmResponse = `SSN ${syntheticSSN}. Contact alice@test.com, bob@test.com, or call 555-999-0000`;

    const guardProvider = mockDetectionProvider((text) => {
      const entities: DetectedEntity[] = [];
      const emailRegex = /[\w.+-]+@[\w.-]+\.\w+/g;
      let match;
      while ((match = emailRegex.exec(text)) !== null) {
        entities.push({
          type: PIIType.EMAIL,
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence: 0.9,
        });
      }
      const phoneRegex = /\b\d{3}-\d{3}-\d{4}\b/g;
      while ((match = phoneRegex.exec(text)) !== null) {
        entities.push({
          type: PIIType.PHONE,
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence: 0.9,
        });
      }
      return entities;
    });

    const guardConfig: ResolvedConfig = {
      storage, cache, patterns: DEFAULT_PATTERNS, pools: DEFAULT_POOLS,
      salt: 'test-salt', cacheTtlSeconds: 3600, contextWindowSize: 50,
      documentTypes: ['general'], detectionProvider: guardProvider,
      typeOverrides: {},
    };
    const guardInstance = new PIIGuard(guardConfig);

    const result = await guardInstance.restoreAndGuard(llmResponse, { scopeId: 'scope1' });

    expect(result.text).not.toContain('alice@test.com');
    expect(result.text).not.toContain('bob@test.com');
    expect(result.text).not.toContain('555-999-0000');
    expect(result.guarded).toHaveLength(3);
  });

  // ── Test 4: No new PII — guarded is empty ──────────────────────────
  it('should return empty guarded array when LLM response has no new PII', async () => {
    const storage = new InMemoryAdapter();
    const cache = new InMemoryCache();

    const builtinProvider = new BuiltInProvider(DEFAULT_PATTERNS, ['general']);
    const config: ResolvedConfig = {
      storage, cache, patterns: DEFAULT_PATTERNS, pools: DEFAULT_POOLS,
      salt: 'test-salt', cacheTtlSeconds: 3600, contextWindowSize: 50,
      documentTypes: ['general'], detectionProvider: builtinProvider,
      typeOverrides: {},
    };
    const redactGuard = new PIIGuard(config);

    const redacted = await redactGuard.redact('SSN: 123-45-6789', { scopeId: 'scope1' });
    const syntheticSSN = redacted.entities.find(e => e.type === PIIType.SSN)!.synthetic;

    // LLM only uses the synthetic, no new PII
    const llmResponse = `I see your SSN is ${syntheticSSN}. Everything looks fine.`;

    // Mock provider that finds nothing new
    const guardProvider = mockDetectionProvider(() => []);
    const guardConfig: ResolvedConfig = {
      storage, cache, patterns: DEFAULT_PATTERNS, pools: DEFAULT_POOLS,
      salt: 'test-salt', cacheTtlSeconds: 3600, contextWindowSize: 50,
      documentTypes: ['general'], detectionProvider: guardProvider,
      typeOverrides: {},
    };
    const guardInstance = new PIIGuard(guardConfig);

    const result = await guardInstance.restoreAndGuard(llmResponse, { scopeId: 'scope1' });

    expect(result.text).toContain('123-45-6789');
    expect(result.guarded).toHaveLength(0);
    expect(result.restored).toHaveLength(1);
    expect(result.unresolved).toHaveLength(0);
  });

  // ── Test 5: All new PII (no synthetics in LLM response) ───────────
  it('should guard all-new PII when LLM ignores synthetics entirely', async () => {
    const storage = new InMemoryAdapter();
    const cache = new InMemoryCache();

    const builtinProvider = new BuiltInProvider(DEFAULT_PATTERNS, ['general']);
    const config: ResolvedConfig = {
      storage, cache, patterns: DEFAULT_PATTERNS, pools: DEFAULT_POOLS,
      salt: 'test-salt', cacheTtlSeconds: 3600, contextWindowSize: 50,
      documentTypes: ['general'], detectionProvider: builtinProvider,
      typeOverrides: {},
    };
    const redactGuard = new PIIGuard(config);

    // Redact to populate storage, but LLM will completely ignore synthetics
    await redactGuard.redact('SSN: 123-45-6789', { scopeId: 'scope1' });

    // LLM ignores the synthetic and introduces all-new PII
    const llmResponse = 'Please contact jane@example.com for assistance';

    const guardProvider = mockDetectionProvider((text) => {
      const entities: DetectedEntity[] = [];
      const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
      if (emailMatch) {
        entities.push({
          type: PIIType.EMAIL,
          value: emailMatch[0],
          startIndex: emailMatch.index!,
          endIndex: emailMatch.index! + emailMatch[0].length,
          confidence: 0.95,
        });
      }
      return entities;
    });

    const guardConfig: ResolvedConfig = {
      storage, cache, patterns: DEFAULT_PATTERNS, pools: DEFAULT_POOLS,
      salt: 'test-salt', cacheTtlSeconds: 3600, contextWindowSize: 50,
      documentTypes: ['general'], detectionProvider: guardProvider,
      typeOverrides: {},
    };
    const guardInstance = new PIIGuard(guardConfig);

    const result = await guardInstance.restoreAndGuard(llmResponse, { scopeId: 'scope1' });

    expect(result.text).not.toContain('jane@example.com');
    expect(result.guarded).toHaveLength(1);
    expect(result.restored).toHaveLength(0);
  });

  // ── Test 6: Unresolved tracking ────────────────────────────────────
  it('should track synthetics that the LLM dropped in unresolved[]', async () => {
    const storage = new InMemoryAdapter();
    const cache = new InMemoryCache();

    const builtinProvider = new BuiltInProvider(DEFAULT_PATTERNS, ['general']);
    const config: ResolvedConfig = {
      storage, cache, patterns: DEFAULT_PATTERNS, pools: DEFAULT_POOLS,
      salt: 'test-salt', cacheTtlSeconds: 3600, contextWindowSize: 50,
      documentTypes: ['general'], detectionProvider: builtinProvider,
      typeOverrides: {},
    };
    const redactGuard = new PIIGuard(config);

    const redacted = await redactGuard.redact(
      'SSN: 123-45-6789, email: john@acme.com',
      { scopeId: 'scope1' },
    );
    const syntheticSSN = redacted.entities.find(e => e.type === PIIType.SSN)!.synthetic;
    const syntheticEmail = redacted.entities.find(e => e.type === PIIType.EMAIL)!.synthetic;

    // LLM uses only the SSN synthetic, drops the email synthetic entirely
    const llmResponse = `Your SSN is ${syntheticSSN}. Thanks!`;

    const guardProvider = mockDetectionProvider(() => []);
    const guardConfig: ResolvedConfig = {
      storage, cache, patterns: DEFAULT_PATTERNS, pools: DEFAULT_POOLS,
      salt: 'test-salt', cacheTtlSeconds: 3600, contextWindowSize: 50,
      documentTypes: ['general'], detectionProvider: guardProvider,
      typeOverrides: {},
    };
    const guardInstance = new PIIGuard(guardConfig);

    const result = await guardInstance.restoreAndGuard(llmResponse, { scopeId: 'scope1' });

    expect(result.text).toContain('123-45-6789');
    expect(result.restored).toHaveLength(1);
    // The email synthetic was not in the LLM response → unresolved
    expect(result.unresolved).toContain(syntheticEmail);
  });

  // ── Test 7: Duplicate originals ────────────────────────────────────
  it('should exclude all occurrences of a restored original from re-redaction', async () => {
    const storage = new InMemoryAdapter();
    const cache = new InMemoryCache();

    const builtinProvider = new BuiltInProvider(DEFAULT_PATTERNS, ['general']);
    const config: ResolvedConfig = {
      storage, cache, patterns: DEFAULT_PATTERNS, pools: DEFAULT_POOLS,
      salt: 'test-salt', cacheTtlSeconds: 3600, contextWindowSize: 50,
      documentTypes: ['general'], detectionProvider: builtinProvider,
      typeOverrides: {},
    };
    const redactGuard = new PIIGuard(config);

    const redacted = await redactGuard.redact('SSN: 123-45-6789', { scopeId: 'scope1' });
    const syntheticSSN = redacted.entities.find(e => e.type === PIIType.SSN)!.synthetic;

    // LLM uses the synthetic SSN twice
    const llmResponse = `SSN: ${syntheticSSN}. Confirmed: ${syntheticSSN}`;

    // After restore, the original "123-45-6789" appears twice
    // Mock provider detects all SSN-like patterns
    const guardProvider = mockDetectionProvider((text) => {
      const entities: DetectedEntity[] = [];
      const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
      let match;
      while ((match = ssnRegex.exec(text)) !== null) {
        entities.push({
          type: PIIType.SSN,
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence: 0.95,
        });
      }
      return entities;
    });

    const guardConfig: ResolvedConfig = {
      storage, cache, patterns: DEFAULT_PATTERNS, pools: DEFAULT_POOLS,
      salt: 'test-salt', cacheTtlSeconds: 3600, contextWindowSize: 50,
      documentTypes: ['general'], detectionProvider: guardProvider,
      typeOverrides: {},
    };
    const guardInstance = new PIIGuard(guardConfig);

    const result = await guardInstance.restoreAndGuard(llmResponse, { scopeId: 'scope1' });

    // Both occurrences of the restored SSN should remain, NOT be re-redacted
    const ssnCount = (result.text.match(/123-45-6789/g) || []).length;
    expect(ssnCount).toBe(2);
    expect(result.guarded).toHaveLength(0);
  });

  // ── Test 8: Type overrides (skip strategy) respected ───────────────
  it('should respect skip strategy for new PII types', async () => {
    const storage = new InMemoryAdapter();
    const cache = new InMemoryCache();

    const builtinProvider = new BuiltInProvider(DEFAULT_PATTERNS, ['general']);
    const redactConfig: ResolvedConfig = {
      storage, cache, patterns: DEFAULT_PATTERNS, pools: DEFAULT_POOLS,
      salt: 'test-salt', cacheTtlSeconds: 3600, contextWindowSize: 50,
      documentTypes: ['general'], detectionProvider: builtinProvider,
      typeOverrides: {},
    };
    const redactGuard = new PIIGuard(redactConfig);

    const redacted = await redactGuard.redact('SSN: 123-45-6789', { scopeId: 'scope1' });
    const syntheticSSN = redacted.entities.find(e => e.type === PIIType.SSN)!.synthetic;

    // LLM introduces a new phone and a new email
    const llmResponse = `SSN ${syntheticSSN}. Call 555-888-7777 or email new@test.com`;

    const guardProvider = mockDetectionProvider((text) => {
      const entities: DetectedEntity[] = [];
      const phoneRegex = /\b\d{3}-\d{3}-\d{4}\b/g;
      let match;
      while ((match = phoneRegex.exec(text)) !== null) {
        entities.push({
          type: PIIType.PHONE,
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence: 0.9,
        });
      }
      const emailRegex = /[\w.+-]+@[\w.-]+\.\w+/g;
      while ((match = emailRegex.exec(text)) !== null) {
        entities.push({
          type: PIIType.EMAIL,
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence: 0.9,
        });
      }
      return entities;
    });

    // PHONE has skip strategy — should pass through; EMAIL should be redacted
    const guardConfig: ResolvedConfig = {
      storage, cache, patterns: DEFAULT_PATTERNS, pools: DEFAULT_POOLS,
      salt: 'test-salt', cacheTtlSeconds: 3600, contextWindowSize: 50,
      documentTypes: ['general'], detectionProvider: guardProvider,
      typeOverrides: {
        [PIIType.PHONE]: { strategy: 'skip' },
      },
    };
    const guardInstance = new PIIGuard(guardConfig);

    const result = await guardInstance.restoreAndGuard(llmResponse, { scopeId: 'scope1' });

    // SSN restored
    expect(result.text).toContain('123-45-6789');
    // Phone passes through (skip)
    expect(result.text).toContain('555-888-7777');
    // Email is redacted
    expect(result.text).not.toContain('new@test.com');
  });
});
