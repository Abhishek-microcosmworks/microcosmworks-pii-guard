import { describe, it, expect } from 'vitest';
import { MappingManager } from '../src/MappingManager.js';
import { SyntheticGenerator } from '../src/SyntheticGenerator.js';
import { InMemoryAdapter } from '../src/storage/InMemoryAdapter.js';
import { InMemoryCache } from '../src/cache/InMemoryCache.js';
import { DEFAULT_POOLS } from '../src/pools/index.js';
import { PIIType } from '../src/types.js';
import type { PIIEntity } from '../src/types.js';

function makeEntity(overrides: Partial<PIIEntity> = {}): PIIEntity {
  return {
    type: PIIType.NAME,
    value: 'John Smith',
    synthetic: '',
    startIndex: 0,
    endIndex: 10,
    confidence: 0.9,
    context: { genderHint: 'male' },
    ...overrides,
  };
}

describe('MappingManager', () => {
  const salt = 'test-salt-for-mapping';
  const generator = new SyntheticGenerator(DEFAULT_POOLS, salt);

  it('should create a new mapping and return synthetic', async () => {
    const storage = new InMemoryAdapter();
    const cache = new InMemoryCache();
    const manager = new MappingManager(storage, cache, salt);

    const entity = makeEntity();
    const synthetic = await manager.getOrCreate('scope1', entity, generator);

    expect(synthetic).toBeTruthy();
    expect(synthetic).not.toBe('John Smith');
  });

  it('should return same synthetic for same entity and scope', async () => {
    const storage = new InMemoryAdapter();
    const cache = new InMemoryCache();
    const manager = new MappingManager(storage, cache, salt);

    const entity = makeEntity();
    const synthetic1 = await manager.getOrCreate('scope1', entity, generator);
    const synthetic2 = await manager.getOrCreate('scope1', entity, generator);

    expect(synthetic1).toBe(synthetic2);
  });

  it('should return different synthetic for different scopes', async () => {
    const storage = new InMemoryAdapter();
    const cache = new InMemoryCache();
    const manager = new MappingManager(storage, cache, salt);

    const entity = makeEntity();
    const synthetic1 = await manager.getOrCreate('scope1', entity, generator);
    const synthetic2 = await manager.getOrCreate('scope2', entity, generator);

    expect(synthetic1).not.toBe(synthetic2);
  });

  it('should resolve original from synthetic', async () => {
    const storage = new InMemoryAdapter();
    const cache = new InMemoryCache();
    const manager = new MappingManager(storage, cache, salt);

    const entity = makeEntity();
    const synthetic = await manager.getOrCreate('scope1', entity, generator);
    const original = await manager.resolveOriginal('scope1', synthetic);

    expect(original).toBe('John Smith');
  });

  it('should return null for unknown synthetic', async () => {
    const storage = new InMemoryAdapter();
    const cache = new InMemoryCache();
    const manager = new MappingManager(storage, cache, salt);

    const original = await manager.resolveOriginal('scope1', 'Unknown Fake Name');
    expect(original).toBeNull();
  });

  it('should load all mappings for a scope', async () => {
    const storage = new InMemoryAdapter();
    const cache = new InMemoryCache();
    const manager = new MappingManager(storage, cache, salt);

    const entity1 = makeEntity({ value: 'John Smith' });
    const entity2 = makeEntity({
      type: PIIType.EMAIL,
      value: 'john@acme.com',
      context: { subtype: 'corporate' },
    });

    await manager.getOrCreate('scope1', entity1, generator);
    await manager.getOrCreate('scope1', entity2, generator);

    const mappings = await manager.loadScope('scope1');
    expect(mappings.size).toBe(2);

    // Each mapping should have synthetic -> original
    for (const [synthetic, original] of mappings) {
      expect(synthetic).toBeTruthy();
      expect(['John Smith', 'john@acme.com']).toContain(original);
    }
  });

  it('should work without cache', async () => {
    const storage = new InMemoryAdapter();
    const manager = new MappingManager(storage, null, salt);

    const entity = makeEntity();
    const synthetic = await manager.getOrCreate('scope1', entity, generator);

    expect(synthetic).toBeTruthy();

    const original = await manager.resolveOriginal('scope1', synthetic);
    expect(original).toBe('John Smith');
  });

  it('should use cache for faster lookups', async () => {
    const storage = new InMemoryAdapter();
    const cache = new InMemoryCache();
    const manager = new MappingManager(storage, cache, salt);

    const entity = makeEntity();
    const synthetic1 = await manager.getOrCreate('scope1', entity, generator);

    // Second call should hit cache
    const synthetic2 = await manager.getOrCreate('scope1', entity, generator);
    expect(synthetic1).toBe(synthetic2);
  });

  it('should encrypt and decrypt original values correctly', async () => {
    const storage = new InMemoryAdapter();
    const manager = new MappingManager(storage, null, salt);

    // Create mappings for various PII types
    const entities = [
      makeEntity({ value: 'Jane Doe', context: { genderHint: 'female' } }),
      makeEntity({ type: PIIType.SSN, value: '123-45-6789' }),
      makeEntity({ type: PIIType.EMAIL, value: 'test@example.com', context: { subtype: 'corporate' } }),
    ];

    for (const entity of entities) {
      await manager.getOrCreate('scope1', entity, generator);
    }

    const mappings = await manager.loadScope('scope1');
    const originals = [...mappings.values()].sort();
    const expected = ['123-45-6789', 'Jane Doe', 'test@example.com'].sort();

    expect(originals).toEqual(expected);
  });
});
