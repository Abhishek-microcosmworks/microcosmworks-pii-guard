import { describe, it, expect } from 'vitest';
import { PIIDetector } from '../src/PIIDetector.js';
import { DEFAULT_PATTERNS } from '../src/patterns.js';
import { PIIType } from '../src/types.js';

describe('PIIDetector', () => {
  const detector = new PIIDetector(DEFAULT_PATTERNS, ['general']);

  it('should detect email addresses', () => {
    const entities = detector.detect('Contact john@acme.com for details');
    expect(entities.some(e => e.type === PIIType.EMAIL && e.value === 'john@acme.com')).toBe(true);
  });

  it('should detect US phone numbers', () => {
    const entities = detector.detect('Call 555-123-4567 for info');
    expect(entities.some(e => e.type === PIIType.PHONE && e.value.includes('555-123-4567'))).toBe(true);
  });

  it('should detect SSNs', () => {
    const entities = detector.detect('SSN is 123-45-6789');
    expect(entities.some(e => e.type === PIIType.SSN && e.value === '123-45-6789')).toBe(true);
  });

  it('should detect credit card numbers', () => {
    const entities = detector.detect('Card: 4000-0012-3456-7890');
    expect(entities.some(e => e.type === PIIType.CREDIT_CARD)).toBe(true);
  });

  it('should detect addresses', () => {
    const entities = detector.detect('Lives at 123 Oak Street in Boston');
    expect(entities.some(e => e.type === PIIType.ADDRESS)).toBe(true);
  });

  it('should detect date of birth with label', () => {
    const entities = detector.detect('DOB: 03/15/1990');
    expect(entities.some(e => e.type === PIIType.DATE_OF_BIRTH)).toBe(true);
  });

  it('should detect multiple entities in one text', () => {
    const entities = detector.detect(
      'Email john@acme.com or call 555-123-4567. SSN: 123-45-6789'
    );
    expect(entities.length).toBeGreaterThanOrEqual(3);
  });

  it('should return empty array for text with no PII', () => {
    const entities = detector.detect('The weather is nice today');
    expect(entities).toHaveLength(0);
  });

  it('should deduplicate overlapping detections', () => {
    // This tests that overlapping regex matches are deduplicated
    const entities = detector.detect('Call 555-123-4567');
    const phoneEntities = entities.filter(e => e.type === PIIType.PHONE);
    // Should not have duplicate phone matches for the same span
    const uniqueStarts = new Set(phoneEntities.map(e => e.startIndex));
    expect(uniqueStarts.size).toBe(phoneEntities.length);
  });

  it('should filter patterns by document type', () => {
    const medicalDetector = new PIIDetector(DEFAULT_PATTERNS, ['medical']);
    const entities = medicalDetector.detect('MRN: MRN-12345678');
    expect(entities.some(e => e.type === PIIType.MEDICAL_RECORD)).toBe(true);
  });

  it('should not detect medical patterns in general mode', () => {
    const generalDetector = new PIIDetector(DEFAULT_PATTERNS, ['general']);
    const entities = generalDetector.detect('MRN: MRN-12345678');
    // Medical record patterns only apply to 'medical' document type
    expect(entities.some(e => e.type === PIIType.MEDICAL_RECORD)).toBe(false);
  });

  describe('inferDocumentType', () => {
    it('should detect medical documents', () => {
      const type = PIIDetector.inferDocumentType(
        'The patient was diagnosed with diabetes. Physician ordered medication.'
      );
      expect(type).toBe('medical');
    });

    it('should detect financial documents', () => {
      const type = PIIDetector.inferDocumentType(
        'Wire transfer from account to bank routing number.'
      );
      expect(type).toBe('financial');
    });

    it('should default to general', () => {
      const type = PIIDetector.inferDocumentType(
        'Please send the report by Friday.'
      );
      expect(type).toBe('general');
    });
  });
});
