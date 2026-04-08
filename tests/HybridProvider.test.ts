import { describe, it, expect, vi } from 'vitest';
import { HybridProvider } from '../src/detection/HybridProvider.js';
import { PIIType } from '../src/types.js';
import type { DetectionProvider, DetectedEntity, DetectionOptions } from '../src/detection/DetectionProvider.js';

/** Helper to create a mock detection provider */
function createMockProvider(
  name: string,
  entities: DetectedEntity[]
): DetectionProvider {
  return {
    name,
    detect: vi.fn().mockResolvedValue(entities),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

describe('HybridProvider', () => {
  it('should have the correct name', () => {
    const provider = new HybridProvider([
      createMockProvider('a', []),
    ], 'union');

    expect(provider.name).toBe('hybrid');
  });

  it('should throw if no sub-providers are given', () => {
    expect(() => new HybridProvider([], 'union')).toThrow(
      'pii-guard: HybridProvider requires at least one sub-provider'
    );
  });

  describe('union strategy', () => {
    it('should merge non-overlapping entities from multiple providers', async () => {
      const providerA = createMockProvider('regex', [
        { type: PIIType.SSN, value: '123-45-6789', startIndex: 20, endIndex: 31, confidence: 0.95 },
      ]);
      const providerB = createMockProvider('ml', [
        { type: PIIType.NAME, value: 'John Doe', startIndex: 0, endIndex: 8, confidence: 0.90 },
      ]);

      const hybrid = new HybridProvider([providerA, providerB], 'union');
      const entities = await hybrid.detect('John Doe has SSN 123-45-6789');

      expect(entities).toHaveLength(2);
      // Should be sorted by startIndex
      expect(entities[0].type).toBe(PIIType.NAME);
      expect(entities[0].startIndex).toBe(0);
      expect(entities[1].type).toBe(PIIType.SSN);
      expect(entities[1].startIndex).toBe(20);
    });

    it('should deduplicate overlapping entities keeping highest confidence', async () => {
      const providerA = createMockProvider('regex', [
        { type: PIIType.NAME, value: 'John Doe', startIndex: 0, endIndex: 8, confidence: 0.70 },
      ]);
      const providerB = createMockProvider('ml', [
        { type: PIIType.NAME, value: 'John Doe', startIndex: 0, endIndex: 8, confidence: 0.95 },
      ]);

      const hybrid = new HybridProvider([providerA, providerB], 'union');
      const entities = await hybrid.detect('John Doe is here');

      expect(entities).toHaveLength(1);
      expect(entities[0].confidence).toBe(0.95);
    });

    it('should handle partially overlapping spans by keeping higher confidence', async () => {
      const providerA = createMockProvider('regex', [
        // Regex detected "John" as a name
        { type: PIIType.NAME, value: 'John', startIndex: 0, endIndex: 4, confidence: 0.60 },
      ]);
      const providerB = createMockProvider('ml', [
        // ML detected "John Doe" as a name (broader span)
        { type: PIIType.NAME, value: 'John Doe', startIndex: 0, endIndex: 8, confidence: 0.92 },
      ]);

      const hybrid = new HybridProvider([providerA, providerB], 'union');
      const entities = await hybrid.detect('John Doe is here');

      expect(entities).toHaveLength(1);
      expect(entities[0].value).toBe('John Doe');
      expect(entities[0].confidence).toBe(0.92);
    });

    it('should keep both entities for non-overlapping spans from same provider', async () => {
      const provider = createMockProvider('regex', [
        { type: PIIType.EMAIL, value: 'john@example.com', startIndex: 0, endIndex: 16, confidence: 0.95 },
        { type: PIIType.PHONE, value: '555-123-4567', startIndex: 21, endIndex: 33, confidence: 0.85 },
      ]);

      const hybrid = new HybridProvider([provider], 'union');
      const entities = await hybrid.detect('john@example.com and 555-123-4567');

      expect(entities).toHaveLength(2);
    });
  });

  describe('highest-confidence strategy', () => {
    it('should keep only highest-confidence entity for overlapping spans', async () => {
      const providerA = createMockProvider('regex', [
        { type: PIIType.NAME, value: 'John', startIndex: 0, endIndex: 4, confidence: 0.50 },
      ]);
      const providerB = createMockProvider('ml', [
        { type: PIIType.NAME, value: 'John Doe', startIndex: 0, endIndex: 8, confidence: 0.95 },
      ]);

      const hybrid = new HybridProvider([providerA, providerB], 'highest-confidence');
      const entities = await hybrid.detect('John Doe is here');

      expect(entities).toHaveLength(1);
      expect(entities[0].confidence).toBe(0.95);
      expect(entities[0].value).toBe('John Doe');
    });

    it('should merge non-overlapping entities normally', async () => {
      const providerA = createMockProvider('regex', [
        { type: PIIType.SSN, value: '123-45-6789', startIndex: 0, endIndex: 11, confidence: 0.95 },
      ]);
      const providerB = createMockProvider('ml', [
        { type: PIIType.NAME, value: 'John Doe', startIndex: 20, endIndex: 28, confidence: 0.90 },
      ]);

      const hybrid = new HybridProvider([providerA, providerB], 'highest-confidence');
      const entities = await hybrid.detect('123-45-6789 belongs to John Doe');

      expect(entities).toHaveLength(2);
    });
  });

  describe('parallel execution', () => {
    it('should run all providers in parallel', async () => {
      let resolveA: () => void;
      let resolveB: () => void;

      const providerA: DetectionProvider = {
        name: 'slow-a',
        detect: vi.fn().mockImplementation(() =>
          new Promise<DetectedEntity[]>(resolve => {
            resolveA = () => resolve([
              { type: PIIType.NAME, value: 'John', startIndex: 0, endIndex: 4, confidence: 0.8 },
            ]);
          })
        ),
      };
      const providerB: DetectionProvider = {
        name: 'slow-b',
        detect: vi.fn().mockImplementation(() =>
          new Promise<DetectedEntity[]>(resolve => {
            resolveB = () => resolve([
              { type: PIIType.EMAIL, value: 'john@test.com', startIndex: 10, endIndex: 23, confidence: 0.9 },
            ]);
          })
        ),
      };

      const hybrid = new HybridProvider([providerA, providerB], 'union');
      const detectPromise = hybrid.detect('John text john@test.com');

      // Both providers should have been called
      expect(providerA.detect).toHaveBeenCalledTimes(1);
      expect(providerB.detect).toHaveBeenCalledTimes(1);

      // Resolve both
      resolveA!();
      resolveB!();

      const entities = await detectPromise;
      expect(entities).toHaveLength(2);
    });
  });

  describe('options forwarding', () => {
    it('should forward detection options to all sub-providers', async () => {
      const providerA = createMockProvider('a', []);
      const providerB = createMockProvider('b', []);

      const hybrid = new HybridProvider([providerA, providerB], 'union');
      const options: DetectionOptions = { languageCode: 'es', minConfidence: 0.9 };

      await hybrid.detect('test text', options);

      expect(providerA.detect).toHaveBeenCalledWith('test text', options);
      expect(providerB.detect).toHaveBeenCalledWith('test text', options);
    });
  });

  describe('shutdown', () => {
    it('should call shutdown on all sub-providers', async () => {
      const providerA = createMockProvider('a', []);
      const providerB = createMockProvider('b', []);

      const hybrid = new HybridProvider([providerA, providerB], 'union');
      await hybrid.shutdown();

      expect(providerA.shutdown).toHaveBeenCalledTimes(1);
      expect(providerB.shutdown).toHaveBeenCalledTimes(1);
    });

    it('should handle providers without shutdown method', async () => {
      const providerWithout: DetectionProvider = {
        name: 'no-shutdown',
        detect: vi.fn().mockResolvedValue([]),
        // No shutdown method
      };

      const hybrid = new HybridProvider([providerWithout], 'union');
      await expect(hybrid.shutdown()).resolves.not.toThrow();
    });
  });

  describe('empty results', () => {
    it('should return empty array when all providers find nothing', async () => {
      const providerA = createMockProvider('a', []);
      const providerB = createMockProvider('b', []);

      const hybrid = new HybridProvider([providerA, providerB], 'union');
      const entities = await hybrid.detect('Nothing here');

      expect(entities).toHaveLength(0);
    });
  });

  describe('provider metadata preservation', () => {
    it('should preserve provider metadata through deduplication', async () => {
      const providerA = createMockProvider('regex', [
        {
          type: PIIType.NAME,
          value: 'John Doe',
          startIndex: 0,
          endIndex: 8,
          confidence: 0.95,
          providerMetadata: { source: 'regex', patternId: 'name-1' },
        },
      ]);

      const hybrid = new HybridProvider([providerA], 'union');
      const entities = await hybrid.detect('John Doe');

      expect(entities[0].providerMetadata).toEqual({
        source: 'regex',
        patternId: 'name-1',
      });
    });
  });
});
