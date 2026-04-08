/**
 * Full pipeline tests against real database backends:
 *   - PostgreSQL  (Docker: postgres:15 on localhost:5432)
 *   - MySQL       (Docker: mysql:8.0  on localhost:3306)
 *   - MongoDB     (Docker: mongo:7    on localhost:27017)
 *
 * Each backend exercises the same comprehensive test matrix:
 *   1.  Single PII redact → restore round-trip
 *   2.  Multi-PII redact → restore round-trip
 *   3.  Determinism (same scope + same PII = identical synthetic)
 *   4.  Scope isolation (different scopes = different synthetics)
 *   5.  Complex paragraph with 4+ PII types
 *   6.  Medical-domain PII (MRN, DOB, SSN)
 *   7.  Financial-domain PII (credit card, account number)
 *   8.  Detect-only (no replacement)
 *   9.  Embedding consistency (redact vs redactForEmbedding)
 *  10.  Cross-instance persistence (two PIIGuard instances, same adapter)
 *  11.  Repeated PII in same text gets identical synthetic
 *  12.  Text with no PII passes through unchanged
 *  13.  Synthetic SSN uses invalid 900+ area range
 *  14.  Synthetic phone uses 555 prefix
 *  15.  Synthetic credit card has XXXX-XXXX-XXXX-XXXX format
 *  16.  healthCheck() reports healthy
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { PIIGuard } from '../src/PIIGuard.js';
import { BuiltInProvider } from '../src/detection/BuiltInProvider.js';
import { DEFAULT_PATTERNS } from '../src/patterns.js';
import { DEFAULT_POOLS } from '../src/pools/index.js';
import { KnexAdapter } from '../src/storage/KnexAdapter.js';
import { MongooseAdapter } from '../src/storage/MongooseAdapter.js';
import { InMemoryCache } from '../src/cache/InMemoryCache.js';
import type { ResolvedConfig, StorageAdapter } from '../src/types.js';

// ---------------------------------------------------------------------------
// Connection URLs (match running Docker containers)
// ---------------------------------------------------------------------------
const PG_URL = 'postgresql://postgres:postgres@localhost:5432/pii_guard';
const MYSQL_URL = 'mysql://root:root@123@localhost:3306/pii_guard';
const MONGO_URL = 'mongodb://localhost:27017/pii_guard_backend_test';

const FIXED_SALT = 'db-backend-test-salt-fixed';

// ---------------------------------------------------------------------------
// Helper: build ResolvedConfig with a given storage adapter
// ---------------------------------------------------------------------------
function makeConfig(
  storage: StorageAdapter,
  docTypes: string[] = ['general'],
): ResolvedConfig {
  return {
    storage,
    cache: new InMemoryCache(),
    patterns: DEFAULT_PATTERNS,
    pools: DEFAULT_POOLS,
    salt: FIXED_SALT,
    cacheTtlSeconds: 3600,
    contextWindowSize: 50,
    documentTypes: docTypes,
    detectionProvider: new BuiltInProvider(DEFAULT_PATTERNS, docTypes),
    typeOverrides: {},
  };
}

function log(label: string, value: string) {
  console.log(`    ${label.padEnd(12)} │ ${value}`);
}

// ---------------------------------------------------------------------------
// Shared test matrix — runs identically for each backend
// ---------------------------------------------------------------------------
function defineBackendTests(
  backendName: string,
  createAdapter: () => StorageAdapter,
) {
  describe(`${backendName}: Full Pipeline`, () => {
    // Each test gets its own adapter so table/collection auto-creation is exercised
    // and tests don't interfere with each other.
    const adapters: StorageAdapter[] = [];

    function freshGuard(docTypes?: string[]) {
      const adapter = createAdapter();
      adapters.push(adapter);
      return new PIIGuard(makeConfig(adapter, docTypes));
    }

    // Use a unique scope prefix per backend to avoid cross-backend collisions
    // (Mongo + PG share nothing, but the MySQL and PG KnexAdapters could
    // theoretically share the same table if pointed at the same DB.)
    const S = backendName.slice(0, 3).toLowerCase(); // "pos", "mys", "mon"

    afterAll(async () => {
      for (const a of adapters) {
        try { await a.disconnect(); } catch { /* ignore */ }
      }
    });

    // ------------------------------------------------------------------
    // 1. Single PII redact → restore
    // ------------------------------------------------------------------
    it('1. single PII redact → restore', async () => {
      const guard = freshGuard();
      const input = 'Email john@acme.com for info';
      const scope = `${S}_single_${Date.now()}`;

      const redacted = await guard.redact(input, { scopeId: scope });
      const restored = await guard.restore(redacted.text, { scopeId: scope });

      log('ORIGINAL', input);
      log('REDACTED', redacted.text);
      log('RESTORED', restored.text);

      expect(redacted.text).not.toContain('john@acme.com');
      expect(redacted.text).toContain('@');
      expect(restored.text).toBe(input);
      expect(restored.resolved).toBeGreaterThanOrEqual(1);
    });

    // ------------------------------------------------------------------
    // 2. Multi-PII redact → restore
    // ------------------------------------------------------------------
    it('2. multi-PII redact → restore', async () => {
      const guard = freshGuard();
      const input = 'Call 555-123-4567, SSN: 123-45-6789, email test@corp.com';
      const scope = `${S}_multi_${Date.now()}`;

      const redacted = await guard.redact(input, { scopeId: scope });
      const restored = await guard.restore(redacted.text, { scopeId: scope });

      log('ORIGINAL', input);
      log('REDACTED', redacted.text);
      log('RESTORED', restored.text);

      expect(redacted.text).not.toContain('555-123-4567');
      expect(redacted.text).not.toContain('123-45-6789');
      expect(redacted.text).not.toContain('test@corp.com');
      expect(restored.text).toBe(input);
    });

    // ------------------------------------------------------------------
    // 3. Determinism
    // ------------------------------------------------------------------
    it('3. determinism — same scope + same PII = same synthetic', async () => {
      const guard = freshGuard();
      const input = 'SSN: 111-22-3333';
      const scope = `${S}_determ_${Date.now()}`;

      const r1 = await guard.redact(input, { scopeId: scope });
      const r2 = await guard.redact(input, { scopeId: scope });

      log('RUN-1', r1.text);
      log('RUN-2', r2.text);

      expect(r1.text).toBe(r2.text);
    });

    // ------------------------------------------------------------------
    // 4. Scope isolation
    // ------------------------------------------------------------------
    it('4. scope isolation — different scopes = different synthetics', async () => {
      const guard = freshGuard();
      const input = 'SSN: 444-55-6666';
      const ts = Date.now();

      const r1 = await guard.redact(input, { scopeId: `${S}_alice_${ts}` });
      const r2 = await guard.redact(input, { scopeId: `${S}_bob_${ts}` });

      log('SCOPE-A', r1.text);
      log('SCOPE-B', r2.text);

      expect(r1.text).not.toBe(r2.text);
      expect(r1.text).toMatch(/\d{3}-\d{2}-\d{4}/);
      expect(r2.text).toMatch(/\d{3}-\d{2}-\d{4}/);
    });

    // ------------------------------------------------------------------
    // 5. Complex paragraph with 4+ entity types
    // ------------------------------------------------------------------
    it('5. complex paragraph round-trip (4+ PII types)', async () => {
      const guard = freshGuard();
      const scope = `${S}_para_${Date.now()}`;
      const input =
        'Send invoice to billing@acme.com. ' +
        'Phone: 555-867-5309. ' +
        'SSN: 321-54-9876. ' +
        'Card: 4111-1111-1111-1111.';

      const redacted = await guard.redact(input, { scopeId: scope });
      const restored = await guard.restore(redacted.text, { scopeId: scope });

      log('ORIGINAL', input);
      log('REDACTED', redacted.text);
      log('RESTORED', restored.text);

      expect(redacted.text).not.toContain('billing@acme.com');
      expect(redacted.text).not.toContain('555-867-5309');
      expect(redacted.text).not.toContain('321-54-9876');
      expect(redacted.text).not.toContain('4111-1111-1111-1111');
      expect(redacted.entities.length).toBeGreaterThanOrEqual(4);
      expect(restored.text).toBe(input);
    });

    // ------------------------------------------------------------------
    // 6. Medical-domain PII
    // ------------------------------------------------------------------
    it('6. medical domain — MRN + DOB + SSN', async () => {
      const guard = freshGuard(['medical']);
      const scope = `${S}_med_${Date.now()}`;
      const input = 'Patient MRN: 00123456. DOB: 07/22/1985. SSN: 234-56-7890';

      const redacted = await guard.redact(input, { scopeId: scope });
      const restored = await guard.restore(redacted.text, { scopeId: scope });

      log('ORIGINAL', input);
      log('REDACTED', redacted.text);
      log('RESTORED', restored.text);

      expect(redacted.text).not.toContain('00123456');
      expect(redacted.text).not.toContain('07/22/1985');
      expect(redacted.text).not.toContain('234-56-7890');
      expect(restored.text).toBe(input);
    });

    // ------------------------------------------------------------------
    // 7. Financial-domain PII
    // ------------------------------------------------------------------
    it('7. financial domain — credit card + account number', async () => {
      const guard = freshGuard(['financial']);
      const scope = `${S}_fin_${Date.now()}`;
      const input = 'Card 4000-1234-5678-9012, Account: 98765432101234';

      const redacted = await guard.redact(input, { scopeId: scope });
      const restored = await guard.restore(redacted.text, { scopeId: scope });

      log('ORIGINAL', input);
      log('REDACTED', redacted.text);
      log('RESTORED', restored.text);

      expect(redacted.text).not.toContain('4000-1234-5678-9012');
      expect(redacted.text).not.toContain('98765432101234');
      expect(restored.text).toBe(input);
    });

    // ------------------------------------------------------------------
    // 8. Detect-only (no replacement)
    // ------------------------------------------------------------------
    it('8. detect-only — no replacement, no storage writes', async () => {
      const guard = freshGuard();
      const input = 'Email john@acme.com, SSN 123-45-6789, call 555-111-2222';

      const entities = await guard.detect(input);

      console.log('    Detected:');
      for (const e of entities) {
        console.log(`      ${e.type.padEnd(14)} │ "${e.value}" conf=${e.confidence}`);
      }

      expect(entities.length).toBeGreaterThanOrEqual(3);
      for (const e of entities) {
        expect(e.synthetic).toBe('');
      }
    });

    // ------------------------------------------------------------------
    // 9. Embedding consistency
    // ------------------------------------------------------------------
    it('9. embedding consistency — redact vs redactForEmbedding', async () => {
      const guard = freshGuard();
      const scope = `${S}_embed_${Date.now()}`;
      const input = 'SSN 456-78-9012, email hello@world.io';

      const redacted = await guard.redact(input, { scopeId: scope });
      const embedded = await guard.redactForEmbedding(input, { scopeId: scope });

      log('REDACT', redacted.text);
      log('EMBED', embedded.text);

      expect(redacted.text).toBe(embedded.text);
    });

    // ------------------------------------------------------------------
    // 10. Cross-instance persistence
    // ------------------------------------------------------------------
    it('10. cross-instance persistence — two PIIGuard instances share adapter', async () => {
      const adapter = createAdapter();
      adapters.push(adapter);
      const scope = `${S}_persist_${Date.now()}`;
      const input = 'Phone: 555-444-3333';

      // Instance 1: redact
      const guard1 = new PIIGuard(makeConfig(adapter));
      const redacted = await guard1.redact(input, { scopeId: scope });

      // Instance 2: restore (same adapter, new PIIGuard)
      const guard2 = new PIIGuard(makeConfig(adapter));
      const restored = await guard2.restore(redacted.text, { scopeId: scope });

      log('ORIGINAL', input);
      log('REDACTED', redacted.text);
      log('RESTORED', restored.text);

      expect(restored.text).toBe(input);
    });

    // ------------------------------------------------------------------
    // 11. Repeated PII gets identical synthetic
    // ------------------------------------------------------------------
    it('11. repeated PII in same text gets same synthetic', async () => {
      const guard = freshGuard();
      const scope = `${S}_repeat_${Date.now()}`;
      const input = 'Email admin@co.com then CC admin@co.com';

      const result = await guard.redact(input, { scopeId: scope });

      log('INPUT', input);
      log('OUTPUT', result.text);

      const parts = result.text.split(' then CC ');
      const first = parts[0].replace('Email ', '');
      const second = parts[1];
      expect(first).toBe(second);
    });

    // ------------------------------------------------------------------
    // 12. No PII — passthrough
    // ------------------------------------------------------------------
    it('12. text with no PII passes through unchanged', async () => {
      const guard = freshGuard();
      const scope = `${S}_nopii_${Date.now()}`;
      const input = 'The quick brown fox jumps over the lazy dog.';

      const redacted = await guard.redact(input, { scopeId: scope });
      const restored = await guard.restore(redacted.text, { scopeId: scope });

      expect(redacted.text).toBe(input);
      expect(restored.text).toBe(input);
      expect(redacted.entities).toHaveLength(0);
    });

    // ------------------------------------------------------------------
    // 13. Synthetic SSN uses 900+ area
    // ------------------------------------------------------------------
    it('13. synthetic SSN uses invalid 900+ area range', async () => {
      const guard = freshGuard();
      const scope = `${S}_ssn900_${Date.now()}`;

      const result = await guard.redact('SSN 123-45-6789', { scopeId: scope });
      const ssn = result.entities.find(e => e.type === 'SSN')!;
      const area = parseInt(ssn.synthetic.split('-')[0], 10);

      log('REAL', '123-45-6789');
      log('SYNTHETIC', ssn.synthetic);

      expect(area).toBeGreaterThanOrEqual(900);
      expect(area).toBeLessThanOrEqual(999);
    });

    // ------------------------------------------------------------------
    // 14. Synthetic phone uses 555 prefix
    // ------------------------------------------------------------------
    it('14. synthetic phone uses 555 prefix', async () => {
      const guard = freshGuard();
      const scope = `${S}_phone555_${Date.now()}`;

      const result = await guard.redact('Phone: 555-123-4567', { scopeId: scope });
      const phone = result.entities.find(e => e.type === 'PHONE')!;

      log('REAL', '555-123-4567');
      log('SYNTHETIC', phone.synthetic);

      expect(phone.synthetic).toMatch(/^555-\d{3}-\d{4}$/);
    });

    // ------------------------------------------------------------------
    // 15. Synthetic credit card format
    // ------------------------------------------------------------------
    it('15. synthetic credit card has XXXX-XXXX-XXXX-XXXX format', async () => {
      const guard = freshGuard();
      const scope = `${S}_cc_${Date.now()}`;

      const result = await guard.redact('Card: 4111-1111-1111-1111', { scopeId: scope });
      const cc = result.entities.find(e => e.type === 'CREDIT_CARD')!;

      log('REAL', '4111-1111-1111-1111');
      log('SYNTHETIC', cc.synthetic);

      expect(cc.synthetic).toMatch(/^\d{4}-\d{4}-\d{4}-\d{4}$/);
    });

    // ------------------------------------------------------------------
    // 16. healthCheck()
    // ------------------------------------------------------------------
    it('16. healthCheck reports database=true', async () => {
      const guard = freshGuard();
      const health = await guard.healthCheck();

      expect(health.database).toBe(true);
      expect(health.cache).toBe(true);
    });
  });
}

// ---------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------
defineBackendTests('PostgreSQL', () => new KnexAdapter(PG_URL));

// ---------------------------------------------------------------------------
// MySQL
// ---------------------------------------------------------------------------
defineBackendTests('MySQL', () => new KnexAdapter(MYSQL_URL));

// ---------------------------------------------------------------------------
// MongoDB
// ---------------------------------------------------------------------------
defineBackendTests('MongoDB', () => new MongooseAdapter(MONGO_URL));
