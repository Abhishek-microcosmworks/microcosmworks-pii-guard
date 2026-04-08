import { describe, it, expect, afterAll } from 'vitest';
import { KnexAdapter } from '../src/storage/KnexAdapter.js';
import { MongooseAdapter } from '../src/storage/MongooseAdapter.js';

describe('PostgreSQL Integration', () => {
  const PG_URL = 'postgresql://postgres:postgres@localhost:5432/pii_guard';
  let adapter: KnexAdapter;

  afterAll(async () => {
    if (adapter) await adapter.disconnect();
  });

  it('should CRUD via KnexAdapter on real PostgreSQL', async () => {
    adapter = new KnexAdapter(PG_URL);

    const scope = `pg-test-${Date.now()}`;
    await adapter.create(scope, 'EMAIL', 'hash-pg', 'fake@test.com', 'enc-pg', '{"x":1}');

    const found = await adapter.findByHash(scope, 'hash-pg');
    expect(found).toEqual({ synthetic: 'fake@test.com', entityType: 'EMAIL' });

    const rev = await adapter.findBySynthetic(scope, 'fake@test.com');
    expect(rev).toEqual({ entityHash: 'hash-pg', entityType: 'EMAIL', encryptedOriginal: 'enc-pg' });

    const all = await adapter.findAllForScope(scope);
    expect(all).toHaveLength(1);
  });
});

describe('MySQL Integration', () => {
  const MYSQL_URL = 'mysql://root:root@123@localhost:3306/pii_guard';
  let adapter: KnexAdapter;

  afterAll(async () => {
    if (adapter) await adapter.disconnect();
  });

  it('should CRUD via KnexAdapter on real MySQL', async () => {
    adapter = new KnexAdapter(MYSQL_URL);

    const scope = `mysql-test-${Date.now()}`;
    await adapter.create(scope, 'NAME', 'hash-mysql', 'Sarah Chen', 'enc-mysql');

    const found = await adapter.findByHash(scope, 'hash-mysql');
    expect(found).toEqual({ synthetic: 'Sarah Chen', entityType: 'NAME' });

    const rev = await adapter.findBySynthetic(scope, 'Sarah Chen');
    expect(rev).toEqual({ entityHash: 'hash-mysql', entityType: 'NAME', encryptedOriginal: 'enc-mysql' });

    const all = await adapter.findAllForScope(scope);
    expect(all).toHaveLength(1);
  });
});

describe('MongoDB Integration', () => {
  const MONGO_URI = 'mongodb://localhost:27017/pii_guard_integration';
  let adapter: MongooseAdapter;

  afterAll(async () => {
    if (adapter) await adapter.disconnect();
  });

  it('should CRUD via MongooseAdapter on real MongoDB', async () => {
    adapter = new MongooseAdapter(MONGO_URI);

    const scope = `mongo-test-${Date.now()}`;
    await adapter.create(scope, 'PHONE', 'hash-mongo', '555-999-8888', 'enc-mongo');

    const found = await adapter.findByHash(scope, 'hash-mongo');
    expect(found).toMatchObject({ synthetic: '555-999-8888', entityType: 'PHONE' });

    const rev = await adapter.findBySynthetic(scope, '555-999-8888');
    expect(rev).toMatchObject({ entityHash: 'hash-mongo', entityType: 'PHONE', encryptedOriginal: 'enc-mongo' });

    const all = await adapter.findAllForScope(scope);
    expect(all).toHaveLength(1);
  });
});
