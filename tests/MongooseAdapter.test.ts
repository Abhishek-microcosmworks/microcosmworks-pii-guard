import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongooseAdapter } from '../src/storage/MongooseAdapter.js';

let mongoServer: any;
let mongoUri: string;

beforeAll(async () => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  mongoServer = await MongoMemoryServer.create();
  mongoUri = mongoServer.getUri();
});

afterAll(async () => {
  if (mongoServer) await mongoServer.stop();
});

describe('MongooseAdapter (mongodb-memory-server)', () => {
  let adapter: MongooseAdapter;

  afterAll(async () => {
    // adapters are cleaned up individually in tests
  });

  it('should create and findByHash round-trip', async () => {
    adapter = new MongooseAdapter(mongoUri);
    try {
      await adapter.create('scope1', 'EMAIL', 'hash1', 'fake@example.com', 'encrypted1', '{"role":"test"}');
      const found = await adapter.findByHash('scope1', 'hash1');
      expect(found).toMatchObject({ synthetic: 'fake@example.com', entityType: 'EMAIL' });
    } finally {
      await adapter.disconnect();
    }
  });

  it('should return null for non-existent hash', async () => {
    adapter = new MongooseAdapter(mongoUri);
    try {
      const found = await adapter.findByHash('scopeX', 'nonexistent');
      expect(found).toBeNull();
    } finally {
      await adapter.disconnect();
    }
  });

  it('should findBySynthetic for reverse lookup', async () => {
    adapter = new MongooseAdapter(mongoUri);
    try {
      await adapter.create('scope2', 'NAME', 'hash2', 'Sarah Chen', 'encrypted2');
      const found = await adapter.findBySynthetic('scope2', 'Sarah Chen');
      expect(found).toMatchObject({
        entityHash: 'hash2',
        entityType: 'NAME',
        encryptedOriginal: 'encrypted2',
      });
    } finally {
      await adapter.disconnect();
    }
  });

  it('should return null for non-existent synthetic', async () => {
    adapter = new MongooseAdapter(mongoUri);
    try {
      const found = await adapter.findBySynthetic('scopeY', 'Unknown');
      expect(found).toBeNull();
    } finally {
      await adapter.disconnect();
    }
  });

  it('should findAllForScope', async () => {
    adapter = new MongooseAdapter(mongoUri);
    try {
      await adapter.create('scope3', 'NAME', 'hash3a', 'David Park', 'enc3a');
      await adapter.create('scope3', 'EMAIL', 'hash3b', 'david@example.com', 'enc3b');
      await adapter.create('scope4', 'NAME', 'hash4', 'Other Person', 'enc4');

      const results = await adapter.findAllForScope('scope3');
      expect(results).toHaveLength(2);
      const synthetics = results.map((r: any) => r.synthetic).sort();
      expect(synthetics).toEqual(['David Park', 'david@example.com']);
    } finally {
      await adapter.disconnect();
    }
  });

  it('should enforce unique index on (scopeId, entityHash)', async () => {
    adapter = new MongooseAdapter(mongoUri);
    try {
      await adapter.create('scope5', 'NAME', 'hashDup', 'Sarah Chen', 'enc1');
      await expect(
        adapter.create('scope5', 'NAME', 'hashDup', 'David Park', 'enc2'),
      ).rejects.toThrow();
    } finally {
      await adapter.disconnect();
    }
  });

  it('should allow same entityHash in different scopes', async () => {
    adapter = new MongooseAdapter(mongoUri);
    try {
      await adapter.create('scope6', 'NAME', 'hashShared', 'Sarah Chen', 'enc1');
      await adapter.create('scope7', 'NAME', 'hashShared', 'David Park', 'enc2');

      const found1 = await adapter.findByHash('scope6', 'hashShared');
      const found2 = await adapter.findByHash('scope7', 'hashShared');
      expect(found1!.synthetic).toBe('Sarah Chen');
      expect(found2!.synthetic).toBe('David Park');
    } finally {
      await adapter.disconnect();
    }
  });

  it('should disconnect cleanly', async () => {
    adapter = new MongooseAdapter(mongoUri);
    await adapter.create('scope8', 'NAME', 'hash8', 'Test Name', 'enc8');
    await adapter.disconnect();
    // After disconnect, operations should fail
    await expect(adapter.findByHash('scope8', 'hash8')).rejects.toThrow();
  });
});
