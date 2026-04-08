import { describe, it, expect } from 'vitest';
import { PIIGuard } from '../src/PIIGuard.js';
import { BuiltInProvider } from '../src/detection/BuiltInProvider.js';
import { DEFAULT_PATTERNS } from '../src/patterns.js';
import { DEFAULT_POOLS } from '../src/pools/index.js';
import { InMemoryAdapter } from '../src/storage/InMemoryAdapter.js';
import { InMemoryCache } from '../src/cache/InMemoryCache.js';
import type { ResolvedConfig } from '../src/types.js';
import { PIIType } from '../src/types.js';

function createTestConfig(): ResolvedConfig {
  return {
    storage: new InMemoryAdapter(),
    cache: new InMemoryCache(),
    patterns: DEFAULT_PATTERNS,
    pools: DEFAULT_POOLS,
    salt: 'bare-test',
    cacheTtlSeconds: 3600,
    contextWindowSize: 50,
    documentTypes: ['general'],
    detectionProvider: new BuiltInProvider(DEFAULT_PATTERNS, ['general']),
    typeOverrides: {},
  };
}

describe('Bare PII detection (no labels)', () => {
  it('bare SSN with dashes: 123-45-6789', async () => {
    const guard = new PIIGuard(createTestConfig());
    const entities = await guard.detect('123-45-6789');
    console.log('Bare SSN:', entities.map(e => `${e.type}=${e.value}`));
    const ssn = entities.find(e => e.type === PIIType.SSN);
    expect(ssn).toBeDefined();
  });

  it('bare SSN without dashes: 123456789', async () => {
    const guard = new PIIGuard(createTestConfig());
    const entities = await guard.detect('123456789');
    console.log('SSN no dashes:', entities.map(e => `${e.type}=${e.value}`));
    const ssn = entities.find(e => e.type === PIIType.SSN);
    // Current pattern requires dashes — this will NOT be detected
    expect(ssn).toBeUndefined();
  });

  it('bare phone with dashes: 555-123-4567', async () => {
    const guard = new PIIGuard(createTestConfig());
    const entities = await guard.detect('555-123-4567');
    console.log('Bare phone:', entities.map(e => `${e.type}=${e.value}`));
    const phone = entities.find(e => e.type === PIIType.PHONE);
    expect(phone).toBeDefined();
  });

  it('bare 10-digit phone: 5551234567', async () => {
    const guard = new PIIGuard(createTestConfig());
    const entities = await guard.detect('5551234567');
    console.log('10-digit:', entities.map(e => `${e.type}=${e.value}`));
    const phone = entities.find(e => e.type === PIIType.PHONE);
    expect(phone).toBeDefined();
  });

  it('bare date without DOB label or keyword: 03/15/1990', async () => {
    const guard = new PIIGuard(createTestConfig());
    const entities = await guard.detect('03/15/1990');
    console.log('Bare date:', entities.map(e => `${e.type}=${e.value}`));
    const dob = entities.find(e => e.type === PIIType.DATE_OF_BIRTH);
    // No DOB keyword nearby — NOT detected as DOB
    expect(dob).toBeUndefined();
  });

  it('bare date detected as DOB when keyword is nearby in context', async () => {
    const guard = new PIIGuard(createTestConfig());
    const text = 'Patient record\nDate of Birth\n03/15/1990';
    const entities = await guard.detect(text);
    console.log('Contextual DOB:', entities.map(e => `${e.type}=${e.value}`));
    const dob = entities.find(e => e.type === PIIType.DATE_OF_BIRTH);
    expect(dob).toBeDefined();
    expect(dob!.value).toBe('03/15/1990');
  });

  it('multiple bare dates under DOB column header all detected', async () => {
    const guard = new PIIGuard(createTestConfig());
    const text = [
      'Name          | DOB        | ID',
      'Alice Smith   | 03/15/1990 | A001',
      'Bob Jones     | 11/22/1985 | B002',
      'Carol White   | 07/04/2000 | C003',
    ].join('\n');
    const entities = await guard.detect(text);
    console.log('Table DOBs:', entities.map(e => `${e.type}=${e.value}`));
    const dobs = entities.filter(e => e.type === PIIType.DATE_OF_BIRTH);
    expect(dobs).toHaveLength(3);
    expect(dobs.map(d => d.value)).toEqual(['03/15/1990', '11/22/1985', '07/04/2000']);
  });

  it('bare date NOT detected as DOB when nearby keyword is unrelated', async () => {
    const guard = new PIIGuard(createTestConfig());
    const text = 'Date of Report: see below\nTransaction on 03/15/1990 was processed.';
    const entities = await guard.detect(text);
    console.log('Non-DOB date:', entities.map(e => `${e.type}=${e.value}`));
    const dob = entities.find(e => e.type === PIIType.DATE_OF_BIRTH);
    expect(dob).toBeUndefined();
  });

  it('SSN and phone together without labels', async () => {
    const guard = new PIIGuard(createTestConfig());
    const entities = await guard.detect('123-45-6789 and 555-123-4567');
    console.log('Both:', entities.map(e => `${e.type}=${e.value}`));
    expect(entities.find(e => e.type === PIIType.SSN)).toBeDefined();
    expect(entities.find(e => e.type === PIIType.PHONE)).toBeDefined();
  });

  it('SSN ambiguity: 123-45-6789 matches both SSN and PHONE patterns', async () => {
    const guard = new PIIGuard(createTestConfig());
    const entities = await guard.detect('123-45-6789');
    console.log('Ambiguous:', entities.map(e => `${e.type}=${e.value} (conf=${e.confidence})`));
    // Both patterns match — dedup keeps highest confidence
    // SSN confidence (0.95) > PHONE confidence (0.85), so SSN wins
    expect(entities.length).toBe(1);
    expect(entities[0].type).toBe(PIIType.SSN);
  });
});
