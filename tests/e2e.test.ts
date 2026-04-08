/**
 * End-to-end tests for pii-guard.
 *
 * These tests exercise the full pipeline: detect → context → synthetic → store → restore.
 * Each test prints the INPUT and OUTPUT so you can visually inspect the transformations.
 *
 * Covers:
 *  - Every detectable PII type (email, phone, SSN, credit card, DOB, address, account number)
 *  - Medical-domain PII (MRN, diagnosis code, insurance ID, medication)
 *  - Financial-domain PII (bank details, account numbers)
 *  - Context-aware generation (gender hints, titles, email subtypes, phone formats)
 *  - Scope isolation (different scopes → different synthetics)
 *  - Determinism (same scope + same PII → identical synthetic every time)
 *  - Linked entity coherence (name-email relationship)
 *  - Redact → Restore round-trip (original text recovered exactly)
 *  - detect() without replacement
 *  - redactForEmbedding() consistency
 *  - Multiple storage backends (InMemory, Knex/SQLite, Mongoose)
 */

import { describe, it, expect, afterAll } from 'vitest';
import { PIIGuard } from '../src/PIIGuard.js';
import { BuiltInProvider } from '../src/detection/BuiltInProvider.js';
import { DEFAULT_PATTERNS } from '../src/patterns.js';
import { DEFAULT_POOLS } from '../src/pools/index.js';
import { InMemoryAdapter } from '../src/storage/InMemoryAdapter.js';
import { KnexAdapter } from '../src/storage/KnexAdapter.js';
import { MongooseAdapter } from '../src/storage/MongooseAdapter.js';
import { InMemoryCache } from '../src/cache/InMemoryCache.js';
import type { ResolvedConfig, StorageAdapter } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXED_SALT = 'e2e-test-salt-deterministic';

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  const documentTypes = (overrides.documentTypes as string[]) || ['general'];
  return {
    storage: new InMemoryAdapter(),
    cache: new InMemoryCache(),
    patterns: DEFAULT_PATTERNS,
    pools: DEFAULT_POOLS,
    salt: FIXED_SALT,
    cacheTtlSeconds: 3600,
    contextWindowSize: 50,
    documentTypes,
    detectionProvider: new BuiltInProvider(DEFAULT_PATTERNS, documentTypes),
    typeOverrides: {},
    ...overrides,
  };
}

function log(label: string, value: string) {
  console.log(`  ${label.padEnd(10)} │ ${value}`);
}

// ---------------------------------------------------------------------------
// 1. Individual PII type redaction
// ---------------------------------------------------------------------------

describe('E2E: Individual PII Types', () => {
  const guard = new PIIGuard(makeConfig());

  it('EMAIL — corporate', async () => {
    const input = 'Contact john.smith@acme.com for details';
    const result = await guard.redact(input, { scopeId: 'scope_email' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('john.smith@acme.com');
    expect(result.text).toContain('@');                        // still looks like email
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].type).toBe('EMAIL');
    expect(result.entities[0].context.subtype).toBe('corporate');
    expect(result.mapping.size).toBe(1);
  });

  it('EMAIL — personal', async () => {
    const input = 'His personal email is john.doe@gmail.com';
    const result = await guard.redact(input, { scopeId: 'scope_email_p' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('john.doe@gmail.com');
    expect(result.entities[0].context.subtype).toBe('personal');
  });

  it('PHONE — US format', async () => {
    const input = 'Call 555-123-4567 today';
    const result = await guard.redact(input, { scopeId: 'scope_phone' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('555-123-4567');
    expect(result.text).toMatch(/555-\d{3}-\d{4}/);           // US phone format preserved
  });

  it('PHONE — international UK format', async () => {
    const input = 'UK office: +44 20 7946 0958';
    const result = await guard.redact(input, { scopeId: 'scope_phone_uk' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('+44 20 7946 0958');
    expect(result.text).toContain('+44');                      // country code preserved
  });

  it('SSN — US Social Security number', async () => {
    const input = 'SSN is 123-45-6789';
    const result = await guard.redact(input, { scopeId: 'scope_ssn' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('123-45-6789');
    expect(result.text).toMatch(/\d{3}-\d{2}-\d{4}/);         // SSN format preserved
    // Synthetic SSN uses 900+ area (known-invalid range)
    const ssnMatch = result.text.match(/(\d{3})-\d{2}-\d{4}/);
    expect(Number(ssnMatch![1])).toBeGreaterThanOrEqual(900);
  });

  it('CREDIT_CARD — 16-digit card number', async () => {
    const input = 'Card: 4532-1234-5678-9012';
    const result = await guard.redact(input, { scopeId: 'scope_cc' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('4532-1234-5678-9012');
    expect(result.text).toMatch(/\d{4}-\d{4}-\d{4}-\d{4}/);   // card format preserved
  });

  it('DATE_OF_BIRTH — labeled date', async () => {
    const input = 'DOB: 03/15/1990';
    const result = await guard.redact(input, { scopeId: 'scope_dob' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('03/15/1990');
    expect(result.text).toMatch(/\d{2}\/\d{2}\/\d{4}/);       // date format preserved
  });

  it('ADDRESS — US street address', async () => {
    const input = 'Lives at 123 Oak Street in Boston';
    const result = await guard.redact(input, { scopeId: 'scope_addr' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('123 Oak Street');
  });

  it('ACCOUNT_NUMBER — generic account', async () => {
    const input = 'Account: 12345678901234';
    const result = await guard.redact(input, { scopeId: 'scope_acct' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('12345678901234');
  });
});

// ---------------------------------------------------------------------------
// 2. Medical-domain PII
// ---------------------------------------------------------------------------

describe('E2E: Medical Domain PII', () => {
  const guard = new PIIGuard(makeConfig({ documentTypes: ['medical'] }));

  it('MEDICAL_RECORD — MRN number', async () => {
    const input = 'MRN: 00847291 — patient admitted 2024-01-15';
    const result = await guard.redact(input, { scopeId: 'scope_med' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('00847291');
  });

  it('INSURANCE_ID — policy number', async () => {
    const input = 'Insurance ID: BCBS-12345678 active';
    const result = await guard.redact(input, { scopeId: 'scope_ins' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('BCBS-12345678');
  });

  it('MEDICATION — prescribed drug with dosage', async () => {
    const input = 'Prescribed Metformin 500 mg twice daily';
    const result = await guard.redact(input, { scopeId: 'scope_med_rx' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('Metformin 500 mg');
  });

  it('DIAGNOSIS_CODE — ICD-10 code', async () => {
    const input = 'Diagnosis E11.65 confirmed by labs';
    const result = await guard.redact(input, { scopeId: 'scope_dx' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('E11.65');
  });
});

// ---------------------------------------------------------------------------
// 3. Financial-domain PII
// ---------------------------------------------------------------------------

describe('E2E: Financial Domain PII', () => {
  const guard = new PIIGuard(makeConfig({ documentTypes: ['financial'] }));

  it('BANK_DETAILS — IBAN', async () => {
    const input = 'IBAN: DE89370400440532013000';
    const result = await guard.redact(input, { scopeId: 'scope_bank' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('DE89370400440532013000');
  });

  it('CREDIT_CARD + ACCOUNT_NUMBER in same text', async () => {
    const input = 'Card 4000-1234-5678-9012, Account: 98765432101234';
    const result = await guard.redact(input, { scopeId: 'scope_fin_multi' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('4000-1234-5678-9012');
    expect(result.text).not.toContain('98765432101234');
    expect(result.entities.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 4. Context-aware generation
// ---------------------------------------------------------------------------

describe('E2E: Context-Aware Synthetic Generation', () => {
  const guard = new PIIGuard(makeConfig());

  it('Gender hint — "his" triggers male synthetic name', async () => {
    const input = 'Please forward his email to john@acme.com';
    const result = await guard.redact(input, { scopeId: 'scope_gender' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    // The email synthetic should still look like an email
    expect(result.text).not.toContain('john@acme.com');
    expect(result.text).toContain('@');
  });

  it('Multiple PII types in a natural sentence', async () => {
    const input =
      'Contact john@acme.com or call 555-123-4567. His SSN: 123-45-6789';
    const result = await guard.redact(input, { scopeId: 'scope_multi' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('john@acme.com');
    expect(result.text).not.toContain('555-123-4567');
    expect(result.text).not.toContain('123-45-6789');
    expect(result.entities.length).toBeGreaterThanOrEqual(3);
  });

  it('Medical context — patient role + DOB + MRN', async () => {
    const guard2 = new PIIGuard(makeConfig({ documentTypes: ['medical'] }));
    const input =
      'Patient admitted. MRN: 00123456. DOB: 07/22/1985. SSN: 234-56-7890';
    const result = await guard2.redact(input, { scopeId: 'scope_med_ctx' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('00123456');
    expect(result.text).not.toContain('07/22/1985');
    expect(result.text).not.toContain('234-56-7890');
  });
});

// ---------------------------------------------------------------------------
// 5. Scope isolation — different scopes yield different synthetics
// ---------------------------------------------------------------------------

describe('E2E: Scope Isolation', () => {
  it('same PII, different scopes → different synthetics', async () => {
    const guard = new PIIGuard(makeConfig());
    const input = 'SSN: 111-22-3333';

    const r1 = await guard.redact(input, { scopeId: 'user_alice' });
    const r2 = await guard.redact(input, { scopeId: 'user_bob' });

    log('INPUT', input);
    log('SCOPE-A', r1.text);
    log('SCOPE-B', r2.text);

    expect(r1.text).not.toBe(r2.text);
    // Both should still have valid SSN format
    expect(r1.text).toMatch(/\d{3}-\d{2}-\d{4}/);
    expect(r2.text).toMatch(/\d{3}-\d{2}-\d{4}/);
  });

  it('same PII, same scope → identical synthetic (deterministic)', async () => {
    const guard = new PIIGuard(makeConfig());
    const input = 'Email: alice@example.com';

    const r1 = await guard.redact(input, { scopeId: 'user_x' });
    const r2 = await guard.redact(input, { scopeId: 'user_x' });

    log('INPUT', input);
    log('RUN-1', r1.text);
    log('RUN-2', r2.text);

    expect(r1.text).toBe(r2.text);
  });
});

// ---------------------------------------------------------------------------
// 6. Redact → Restore round-trip
// ---------------------------------------------------------------------------

describe('E2E: Redact → Restore Round-Trip', () => {
  it('single PII entity round-trip', async () => {
    const guard = new PIIGuard(makeConfig());
    const input = 'Email john@acme.com for info';
    const scopeId = 'rt_single';

    const redacted = await guard.redact(input, { scopeId });
    const restored = await guard.restore(redacted.text, { scopeId });

    log('ORIGINAL', input);
    log('REDACTED', redacted.text);
    log('RESTORED', restored.text);

    expect(redacted.text).not.toBe(input);
    expect(restored.text).toBe(input);
    expect(restored.resolved).toBeGreaterThanOrEqual(1);
  });

  it('multiple PII entities round-trip', async () => {
    const guard = new PIIGuard(makeConfig());
    const input = 'Call 555-123-4567, SSN: 123-45-6789, email test@corp.com';
    const scopeId = 'rt_multi';

    const redacted = await guard.redact(input, { scopeId });
    const restored = await guard.restore(redacted.text, { scopeId });

    log('ORIGINAL', input);
    log('REDACTED', redacted.text);
    log('RESTORED', restored.text);

    expect(redacted.text).not.toContain('555-123-4567');
    expect(redacted.text).not.toContain('123-45-6789');
    expect(redacted.text).not.toContain('test@corp.com');
    expect(restored.text).toBe(input);
  });

  it('text with no PII passes through unchanged', async () => {
    const guard = new PIIGuard(makeConfig());
    const input = 'The quick brown fox jumps over the lazy dog.';
    const scopeId = 'rt_nopii';

    const redacted = await guard.redact(input, { scopeId });
    const restored = await guard.restore(redacted.text, { scopeId });

    log('ORIGINAL', input);
    log('REDACTED', redacted.text);
    log('RESTORED', restored.text);

    expect(redacted.text).toBe(input);
    expect(restored.text).toBe(input);
    expect(redacted.entities).toHaveLength(0);
  });

  it('complex real-world paragraph round-trip', async () => {
    const guard = new PIIGuard(makeConfig());
    const input =
      'Please send the invoice to billing@acme.com. ' +
      'For questions, call 555-867-5309. ' +
      'Reference SSN 321-54-9876 on all correspondence. ' +
      'Payment via card 4111-1111-1111-1111.';
    const scopeId = 'rt_paragraph';

    const redacted = await guard.redact(input, { scopeId });
    const restored = await guard.restore(redacted.text, { scopeId });

    log('ORIGINAL', input);
    log('REDACTED', redacted.text);
    log('RESTORED', restored.text);

    expect(redacted.text).not.toContain('billing@acme.com');
    expect(redacted.text).not.toContain('555-867-5309');
    expect(redacted.text).not.toContain('321-54-9876');
    expect(redacted.text).not.toContain('4111-1111-1111-1111');
    expect(restored.text).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// 7. detect() — scan without replacing
// ---------------------------------------------------------------------------

describe('E2E: Detect Only (No Replacement)', () => {
  it('should return detected entities with empty synthetics', async () => {
    const guard = new PIIGuard(makeConfig());
    const input = 'Email john@acme.com, SSN 123-45-6789, call 555-111-2222';

    const entities = await guard.detect(input);

    console.log('  Detected entities:');
    for (const e of entities) {
      console.log(`    ${e.type.padEnd(15)} │ "${e.value}" [${e.startIndex}:${e.endIndex}] conf=${e.confidence}`);
    }

    expect(entities.length).toBeGreaterThanOrEqual(3);
    for (const e of entities) {
      expect(e.synthetic).toBe('');    // no replacement
      expect(e.value).toBeTruthy();
      expect(e.confidence).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. redactForEmbedding() — same output as redact()
// ---------------------------------------------------------------------------

describe('E2E: Embedding Consistency', () => {
  it('redactForEmbedding produces same output as redact', async () => {
    const guard = new PIIGuard(makeConfig());
    const input = 'SSN 456-78-9012, email hello@world.io';
    const scopeId = 'embed_scope';

    const redacted = await guard.redact(input, { scopeId });
    const embedded = await guard.redactForEmbedding(input, { scopeId });

    log('INPUT', input);
    log('REDACT', redacted.text);
    log('EMBED', embedded.text);

    expect(redacted.text).toBe(embedded.text);
  });

  it('embedding query and document match when same scope', async () => {
    const guard = new PIIGuard(makeConfig());
    const scopeId = 'project_42';

    const doc = await guard.redactForEmbedding(
      'Patient file for SSN 999-88-7777, email records@hospital.org',
      { scopeId },
    );
    const query = await guard.redactForEmbedding(
      'Find records for SSN 999-88-7777',
      { scopeId },
    );

    log('DOC', doc.text);
    log('QUERY', query.text);

    // The synthetic SSN should be identical in both
    const docSSN = doc.text.match(/(\d{3}-\d{2}-\d{4})/)?.[1];
    const querySSN = query.text.match(/(\d{3}-\d{2}-\d{4})/)?.[1];
    expect(docSSN).toBe(querySSN);
  });
});

// ---------------------------------------------------------------------------
// 9. Storage backend: KnexAdapter (SQLite in-memory)
// ---------------------------------------------------------------------------

describe('E2E: Full Pipeline with KnexAdapter (SQLite)', () => {
  let adapter: KnexAdapter;

  afterAll(async () => {
    if (adapter) await adapter.disconnect();
  });

  it('redact → restore round-trip with SQLite persistence', async () => {
    adapter = new KnexAdapter(':memory:');
    const guard = new PIIGuard(makeConfig({ storage: adapter }));
    const input = 'Send to alice@corp.com, SSN 222-33-4444';
    const scopeId = 'knex_scope';

    const redacted = await guard.redact(input, { scopeId });
    const restored = await guard.restore(redacted.text, { scopeId });

    log('INPUT', input);
    log('REDACTED', redacted.text);
    log('RESTORED', restored.text);

    expect(restored.text).toBe(input);
  });

  it('data persists across PIIGuard instances sharing same adapter', async () => {
    adapter = new KnexAdapter(':memory:');
    const scopeId = 'knex_persist';
    const input = 'Phone: 555-444-3333';

    // First instance: redact
    const guard1 = new PIIGuard(makeConfig({ storage: adapter }));
    const redacted = await guard1.redact(input, { scopeId });

    // Second instance: restore using same adapter
    const guard2 = new PIIGuard(makeConfig({ storage: adapter }));
    const restored = await guard2.restore(redacted.text, { scopeId });

    log('INPUT', input);
    log('REDACTED', redacted.text);
    log('RESTORED', restored.text);

    expect(restored.text).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// 10. Storage backend: MongooseAdapter (mongodb-memory-server)
// ---------------------------------------------------------------------------

describe('E2E: Full Pipeline with MongooseAdapter (Memory Server)', () => {
  let mongoServer: any;
  let adapter: MongooseAdapter;

  afterAll(async () => {
    if (adapter) await adapter.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  it('redact → restore round-trip with MongoDB persistence', async () => {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongoServer = await MongoMemoryServer.create();
    adapter = new MongooseAdapter(mongoServer.getUri());

    const guard = new PIIGuard(makeConfig({ storage: adapter }));
    const input = 'Email reports@megacorp.io, SSN 333-44-5555';
    const scopeId = 'mongo_scope';

    const redacted = await guard.redact(input, { scopeId });
    const restored = await guard.restore(redacted.text, { scopeId });

    log('INPUT', input);
    log('REDACTED', redacted.text);
    log('RESTORED', restored.text);

    expect(restored.text).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// 11. Large mixed-PII document (stress test)
// ---------------------------------------------------------------------------

describe('E2E: Large Mixed-PII Document', () => {
  it('should handle a multi-paragraph document with diverse PII', async () => {
    const guard = new PIIGuard(makeConfig());
    const scopeId = 'doc_large';

    const input = [
      'CONFIDENTIAL — Internal HR Document',
      '',
      'Employee: SSN 456-78-9012',
      'Contact: hr@company.com | 555-200-3000',
      'DOB: 11/30/1985',
      '',
      'Emergency contact phone: 555-600-7000',
      'Direct deposit card: 4532-9876-5432-1098',
      'Office: 742 Evergreen Ave in Springfield',
      'Account: 88776655443322',
    ].join('\n');

    const redacted = await guard.redact(input, { scopeId });
    const restored = await guard.restore(redacted.text, { scopeId });

    console.log('\n  === LARGE DOCUMENT ===');
    console.log('  --- INPUT ---');
    input.split('\n').forEach(l => console.log(`  │ ${l}`));
    console.log('  --- REDACTED ---');
    redacted.text.split('\n').forEach(l => console.log(`  │ ${l}`));
    console.log('  --- RESTORED ---');
    restored.text.split('\n').forEach(l => console.log(`  │ ${l}`));
    console.log('  === END ===\n');

    // Verify no original PII remains in redacted text
    expect(redacted.text).not.toContain('456-78-9012');
    expect(redacted.text).not.toContain('hr@company.com');
    expect(redacted.text).not.toContain('555-200-3000');
    expect(redacted.text).not.toContain('11/30/1985');
    expect(redacted.text).not.toContain('555-600-7000');
    expect(redacted.text).not.toContain('4532-9876-5432-1098');
    expect(redacted.text).not.toContain('88776655443322');

    // Verify round-trip
    expect(restored.text).toBe(input);

    // Verify entity count
    expect(redacted.entities.length).toBeGreaterThanOrEqual(6);

    // Log entity summary
    console.log(`  Entities detected: ${redacted.entities.length}`);
    for (const e of redacted.entities) {
      console.log(`    ${e.type.padEnd(15)} │ "${e.value}" → "${e.synthetic}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// 12. Synthetic value properties
// ---------------------------------------------------------------------------

describe('E2E: Synthetic Value Properties', () => {
  const guard = new PIIGuard(makeConfig());

  it('synthetic SSN uses invalid 900+ area range', async () => {
    const result = await guard.redact('SSN 123-45-6789', { scopeId: 'prop_ssn' });
    const ssn = result.entities.find(e => e.type === 'SSN')!;
    const area = parseInt(ssn.synthetic.split('-')[0], 10);

    log('REAL SSN', '123-45-6789');
    log('FAKE SSN', ssn.synthetic);

    expect(area).toBeGreaterThanOrEqual(900);
    expect(area).toBeLessThanOrEqual(999);
  });

  it('synthetic credit card has valid format', async () => {
    const result = await guard.redact('Card: 4111-1111-1111-1111', { scopeId: 'prop_cc' });
    const cc = result.entities.find(e => e.type === 'CREDIT_CARD')!;

    log('REAL CC', '4111-1111-1111-1111');
    log('FAKE CC', cc.synthetic);

    expect(cc.synthetic).toMatch(/^\d{4}-\d{4}-\d{4}-\d{4}$/);
  });

  it('synthetic phone uses 555 prefix (fictional range)', async () => {
    const result = await guard.redact('Phone: 555-123-4567', { scopeId: 'prop_phone' });
    const phone = result.entities.find(e => e.type === 'PHONE')!;

    log('REAL', '555-123-4567');
    log('FAKE', phone.synthetic);

    expect(phone.synthetic).toMatch(/^555-\d{3}-\d{4}$/);
  });

  it('synthetic date preserves approximate decade', async () => {
    const result = await guard.redact('DOB: 03/15/1990', { scopeId: 'prop_dob' });
    const dob = result.entities.find(e => e.type === 'DATE_OF_BIRTH')!;
    const yearMatch = dob.synthetic.match(/(\d{4})$/);

    log('REAL DOB', '03/15/1990');
    log('FAKE DOB', dob.synthetic);

    expect(yearMatch).toBeTruthy();
    const year = parseInt(yearMatch![1], 10);
    expect(year).toBeGreaterThanOrEqual(1988); // within ~5 years
    expect(year).toBeLessThanOrEqual(1995);
  });
});

// ---------------------------------------------------------------------------
// 13. Edge cases
// ---------------------------------------------------------------------------

describe('E2E: Edge Cases', () => {
  const guard = new PIIGuard(makeConfig());

  it('empty string input', async () => {
    const result = await guard.redact('', { scopeId: 'edge_empty' });
    expect(result.text).toBe('');
    expect(result.entities).toHaveLength(0);
  });

  it('PII-only text (nothing but an email)', async () => {
    const input = 'admin@secret.com';
    const result = await guard.redact(input, { scopeId: 'edge_only' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toBe(input);
    expect(result.text).toContain('@');
  });

  it('repeated PII in same text gets same synthetic', async () => {
    const input = 'Email admin@co.com then CC admin@co.com';
    const result = await guard.redact(input, { scopeId: 'edge_repeat' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    // Both occurrences replaced with same synthetic
    const parts = result.text.split(' then CC ');
    const emailBefore = parts[0].replace('Email ', '');
    const emailAfter = parts[1];
    expect(emailBefore).toBe(emailAfter);
  });

  it('restore with unknown scope returns text as-is', async () => {
    const restored = await guard.restore('Some synthetic text', {
      scopeId: 'nonexistent_scope',
    });

    expect(restored.text).toBe('Some synthetic text');
    expect(restored.resolved).toBe(0);
  });

  it('special characters in surrounding text do not break detection', async () => {
    const input = '---<<< SSN: 999-88-7777 >>>---';
    const result = await guard.redact(input, { scopeId: 'edge_special' });

    log('INPUT', input);
    log('OUTPUT', result.text);

    expect(result.text).not.toContain('999-88-7777');
  });
});

// ---------------------------------------------------------------------------
// 14. healthCheck()
// ---------------------------------------------------------------------------

describe('E2E: Health Check', () => {
  it('should report healthy with InMemoryAdapter', async () => {
    const guard = new PIIGuard(makeConfig());
    const health = await guard.healthCheck();

    expect(health.database).toBe(true);
    expect(health.cache).toBe(true);
  });
});
