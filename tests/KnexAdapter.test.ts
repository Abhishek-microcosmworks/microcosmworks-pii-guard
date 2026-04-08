import { describe, it, expect, afterEach } from 'vitest';
import { KnexAdapter } from '../src/storage/KnexAdapter.js';

describe('KnexAdapter (SQLite in-memory)', () => {
  let adapter: KnexAdapter;

  afterEach(async () => {
    if (adapter) await adapter.disconnect();
  });

  it('should auto-create table and round-trip via create + findByHash', async () => {
    adapter = new KnexAdapter(':memory:');
    await adapter.create('scope1', 'EMAIL', 'hash1', 'fake@example.com', 'encrypted1', '{"role":"test"}');
    const found = await adapter.findByHash('scope1', 'hash1');
    expect(found).toEqual({ synthetic: 'fake@example.com', entityType: 'EMAIL' });
  });

  it('should return null for non-existent hash', async () => {
    adapter = new KnexAdapter(':memory:');
    const found = await adapter.findByHash('scope1', 'nonexistent');
    expect(found).toBeNull();
  });

  it('should findBySynthetic for reverse lookup', async () => {
    adapter = new KnexAdapter(':memory:');
    await adapter.create('scope1', 'NAME', 'hash1', 'Sarah Chen', 'encrypted1');
    const found = await adapter.findBySynthetic('scope1', 'Sarah Chen');
    expect(found).toEqual({
      entityHash: 'hash1',
      entityType: 'NAME',
      encryptedOriginal: 'encrypted1',
    });
  });

  it('should return null for non-existent synthetic', async () => {
    adapter = new KnexAdapter(':memory:');
    const found = await adapter.findBySynthetic('scope1', 'Unknown');
    expect(found).toBeNull();
  });

  it('should findAllForScope', async () => {
    adapter = new KnexAdapter(':memory:');
    await adapter.create('scope1', 'NAME', 'hash1', 'Sarah Chen', 'enc1');
    await adapter.create('scope1', 'EMAIL', 'hash2', 'sarah@example.com', 'enc2');
    await adapter.create('scope2', 'NAME', 'hash3', 'David Park', 'enc3');

    const results = await adapter.findAllForScope('scope1');
    expect(results).toHaveLength(2);
    expect(results.map((r: any) => r.synthetic).sort()).toEqual(['Sarah Chen', 'sarah@example.com']);
  });

  it('should enforce unique constraint on (scope_id, entity_hash)', async () => {
    adapter = new KnexAdapter(':memory:');
    await adapter.create('scope1', 'NAME', 'hash1', 'Sarah Chen', 'enc1');
    await expect(
      adapter.create('scope1', 'NAME', 'hash1', 'David Park', 'enc2'),
    ).rejects.toThrow();
  });

  it('should allow same entity_hash in different scopes', async () => {
    adapter = new KnexAdapter(':memory:');
    await adapter.create('scope1', 'NAME', 'hash1', 'Sarah Chen', 'enc1');
    await adapter.create('scope2', 'NAME', 'hash1', 'David Park', 'enc2');

    const found1 = await adapter.findByHash('scope1', 'hash1');
    const found2 = await adapter.findByHash('scope2', 'hash1');
    expect(found1!.synthetic).toBe('Sarah Chen');
    expect(found2!.synthetic).toBe('David Park');
  });

  it('should disconnect cleanly', async () => {
    adapter = new KnexAdapter(':memory:');
    await adapter.create('scope1', 'NAME', 'hash1', 'Sarah Chen', 'enc1');
    await adapter.disconnect();
    // After disconnect, operations should fail
    await expect(adapter.findByHash('scope1', 'hash1')).rejects.toThrow();
  });
});
