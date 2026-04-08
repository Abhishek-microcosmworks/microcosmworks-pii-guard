import { describe, it, expect } from 'vitest';
import { SyntheticGenerator } from '../src/SyntheticGenerator.js';
import { DEFAULT_POOLS } from '../src/pools/index.js';
import { PIIType } from '../src/types.js';
import type { PIIEntity } from '../src/types.js';

function makeEntity(overrides: Partial<PIIEntity>): PIIEntity {
  return {
    type: PIIType.NAME,
    value: 'John Smith',
    synthetic: '',
    startIndex: 0,
    endIndex: 10,
    confidence: 0.9,
    context: {},
    ...overrides,
  };
}

describe('SyntheticGenerator', () => {
  const generator = new SyntheticGenerator(DEFAULT_POOLS, 'test-salt-123');

  it('should generate a name for PIIType.NAME', () => {
    const entity = makeEntity({ context: { genderHint: 'male' } });
    const synthetic = generator.generate(entity, 'scope1');
    expect(synthetic).toBeTruthy();
    expect(synthetic.split(' ')).toHaveLength(2); // first + last
  });

  it('should generate deterministic results for same input + scope', () => {
    const entity = makeEntity({ context: { genderHint: 'male' } });
    const result1 = generator.generate(entity, 'scope1');
    const result2 = generator.generate(entity, 'scope1');
    expect(result1).toBe(result2);
  });

  it('should generate different results for different scopes', () => {
    const entity = makeEntity({ context: { genderHint: 'male' } });
    const result1 = generator.generate(entity, 'scope1');
    const result2 = generator.generate(entity, 'scope2');
    expect(result1).not.toBe(result2);
  });

  it('should generate female names for female gender hint', () => {
    const entity = makeEntity({ context: { genderHint: 'female' } });
    const synthetic = generator.generate(entity, 'scope1');
    expect(synthetic).toBeTruthy();
    const firstName = synthetic.split(' ')[0];
    expect(DEFAULT_POOLS.femaleFirstNames).toContain(firstName);
  });

  it('should generate neutral names when no gender hint', () => {
    const entity = makeEntity({ context: { genderHint: 'neutral' } });
    const synthetic = generator.generate(entity, 'scope1');
    expect(synthetic).toBeTruthy();
    const firstName = synthetic.split(' ')[0];
    expect(DEFAULT_POOLS.neutralFirstNames).toContain(firstName);
  });

  it('should generate valid SSN in 900+ range', () => {
    const entity = makeEntity({ type: PIIType.SSN, value: '123-45-6789' });
    const synthetic = generator.generate(entity, 'scope1');
    expect(synthetic).toMatch(/^\d{3}-\d{2}-\d{4}$/);
    const area = parseInt(synthetic.split('-')[0], 10);
    expect(area).toBeGreaterThanOrEqual(900);
    expect(area).toBeLessThanOrEqual(999);
  });

  it('should generate valid formatted credit card', () => {
    const entity = makeEntity({ type: PIIType.CREDIT_CARD, value: '4111-1111-1111-1111' });
    const synthetic = generator.generate(entity, 'scope1');
    expect(synthetic).toMatch(/^\d{4}-\d{4}-\d{4}-\d{4}$/);
  });

  it('should generate US phone with 555 prefix', () => {
    const entity = makeEntity({
      type: PIIType.PHONE,
      value: '555-123-4567',
      context: { format: 'US' },
    });
    const synthetic = generator.generate(entity, 'scope1');
    expect(synthetic).toMatch(/^555-\d{3}-\d{4}$/);
  });

  it('should generate UK phone preserving country code', () => {
    const entity = makeEntity({
      type: PIIType.PHONE,
      value: '+44 20 7946 0958',
      context: { format: 'UK' },
    });
    const synthetic = generator.generate(entity, 'scope1');
    expect(synthetic).toContain('+44');
  });

  it('should generate email with corporate domain', () => {
    const entity = makeEntity({
      type: PIIType.EMAIL,
      value: 'john@acme.com',
      context: { subtype: 'corporate' },
    });
    const synthetic = generator.generate(entity, 'scope1');
    expect(synthetic).toContain('@');
    const domain = synthetic.split('@')[1];
    expect(DEFAULT_POOLS.corporateDomains).toContain(domain);
  });

  it('should generate email with personal domain', () => {
    const entity = makeEntity({
      type: PIIType.EMAIL,
      value: 'john@gmail.com',
      context: { subtype: 'personal' },
    });
    const synthetic = generator.generate(entity, 'scope1');
    expect(synthetic).toContain('@');
    const domain = synthetic.split('@')[1];
    expect(DEFAULT_POOLS.personalDomains).toContain(domain);
  });

  it('should generate coherent email from synthetic name', () => {
    const email = generator.generateEmail('David Park', { subtype: 'corporate' });
    expect(email).toContain('@');
    const localPart = email.split('@')[0].toLowerCase();
    expect(localPart).toMatch(/david|park/);
  });

  it('should generate date preserving approximate decade', () => {
    const entity = makeEntity({
      type: PIIType.DATE_OF_BIRTH,
      value: '03/15/1990',
    });
    const synthetic = generator.generate(entity, 'scope1');
    expect(synthetic).toMatch(/^\d{2}[/-]\d{2}[/-]\d{4}$/);
    const year = parseInt(synthetic.split(/[/-]/)[2], 10);
    expect(year).toBeGreaterThanOrEqual(1988);
    expect(year).toBeLessThanOrEqual(1995);
  });

  it('should generate address from pool', () => {
    const entity = makeEntity({
      type: PIIType.ADDRESS,
      value: '123 Oak St',
    });
    const synthetic = generator.generate(entity, 'scope1');
    expect(synthetic).toBeTruthy();
    expect(DEFAULT_POOLS.streetNames).toContain(synthetic);
  });

  it('should generate medical record number', () => {
    const entity = makeEntity({
      type: PIIType.MEDICAL_RECORD,
      value: 'MRN-12345678',
    });
    const synthetic = generator.generate(entity, 'scope1');
    expect(synthetic).toMatch(/^MRN-\d{8}$/);
  });

  it('should generate fallback for unknown types', () => {
    const entity = makeEntity({
      type: PIIType.CUSTOM,
      value: 'some-custom-pii',
    });
    const synthetic = generator.generate(entity, 'scope1');
    expect(synthetic).toMatch(/^\[REDACTED-[A-F0-9]+\]$/);
  });
});
