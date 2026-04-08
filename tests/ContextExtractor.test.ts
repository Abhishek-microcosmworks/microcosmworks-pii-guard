import { describe, it, expect } from 'vitest';
import { ContextExtractor } from '../src/ContextExtractor.js';
import { PIIType } from '../src/types.js';
import type { PIIEntity, PIIContext } from '../src/types.js';

function makeEntity(overrides: Partial<PIIEntity>): PIIEntity {
  return {
    type: PIIType.NAME,
    value: 'John Doe',
    synthetic: '',
    startIndex: 0,
    endIndex: 8,
    confidence: 0.9,
    context: {},
    ...overrides,
  };
}

describe('ContextExtractor', () => {
  const extractor = new ContextExtractor(50);

  describe('extractContext', () => {
    it('should detect title before a name', () => {
      const entity = makeEntity({ startIndex: 4, endIndex: 12 });
      const context = extractor.extractContext(entity, 'Dr. John Doe is the physician');
      expect(context.title).toBe('Dr');
    });

    it('should detect male gender hint', () => {
      const entity = makeEntity({ startIndex: 0, endIndex: 8 });
      const context = extractor.extractContext(entity, 'John Doe and his colleague went');
      expect(context.genderHint).toBe('male');
    });

    it('should detect female gender hint', () => {
      const entity = makeEntity({ value: 'Jane Doe', startIndex: 0, endIndex: 8 });
      const context = extractor.extractContext(entity, 'Jane Doe and her colleague went');
      expect(context.genderHint).toBe('female');
    });

    it('should default to neutral when no gender signals', () => {
      const entity = makeEntity({ startIndex: 0, endIndex: 8 });
      const context = extractor.extractContext(entity, 'John Doe went to the store');
      expect(context.genderHint).toBe('neutral');
    });

    it('should detect age context', () => {
      const entity = makeEntity({ startIndex: 0, endIndex: 8 });
      const context = extractor.extractContext(entity, 'John Doe 45M presented with symptoms');
      expect(context.ageContext).toBe('45');
    });

    it('should detect role from surrounding text', () => {
      const entity = makeEntity({ startIndex: 8, endIndex: 16 });
      const context = extractor.extractContext(entity, 'patient John Doe was admitted');
      expect(context.role).toBe('patient');
    });

    it('should detect corporate email subtype', () => {
      const entity = makeEntity({
        type: PIIType.EMAIL,
        value: 'john@acme.com',
        startIndex: 0,
        endIndex: 13,
      });
      const context = extractor.extractContext(entity, 'john@acme.com');
      expect(context.subtype).toBe('corporate');
      expect(context.domain).toBe('acme.com');
    });

    it('should detect personal email subtype', () => {
      const entity = makeEntity({
        type: PIIType.EMAIL,
        value: 'john@gmail.com',
        startIndex: 0,
        endIndex: 14,
      });
      const context = extractor.extractContext(entity, 'john@gmail.com');
      expect(context.subtype).toBe('personal');
    });

    it('should detect US phone format', () => {
      const entity = makeEntity({
        type: PIIType.PHONE,
        value: '555-123-4567',
        startIndex: 0,
        endIndex: 12,
      });
      const context = extractor.extractContext(entity, '555-123-4567');
      expect(context.format).toBe('US');
    });

    it('should detect UK phone format', () => {
      const entity = makeEntity({
        type: PIIType.PHONE,
        value: '+44 20 7946 0958',
        startIndex: 0,
        endIndex: 16,
      });
      const context = extractor.extractContext(entity, '+44 20 7946 0958');
      expect(context.format).toBe('UK');
    });

    it('should detect international phone format', () => {
      const entity = makeEntity({
        type: PIIType.PHONE,
        value: '+91 9876543210',
        startIndex: 0,
        endIndex: 15,
      });
      const context = extractor.extractContext(entity, '+91 9876543210');
      expect(context.format).toBe('international');
    });
  });

  describe('buildRelationships', () => {
    it('should link email to name when email contains name parts', () => {
      const entities: PIIEntity[] = [
        makeEntity({ value: 'John Doe', startIndex: 0, endIndex: 8 }),
        makeEntity({
          type: PIIType.EMAIL,
          value: 'john.doe@acme.com',
          startIndex: 10,
          endIndex: 27,
        }),
      ];

      // Extract contexts first
      const text = 'John Doe (john.doe@acme.com)';
      entities.forEach(e => {
        e.context = extractor.extractContext(e, text);
      });

      extractor.buildRelationships(entities, text);

      expect(entities[1].context.relatedEntities).toContain(0);
      expect(entities[1].context.relationship).toBe('belongs_to');
    });

    it('should link phone to nearby name', () => {
      const entities: PIIEntity[] = [
        makeEntity({ value: 'John Doe', startIndex: 0, endIndex: 8 }),
        makeEntity({
          type: PIIType.PHONE,
          value: '555-123-4567',
          startIndex: 10,
          endIndex: 22,
        }),
      ];

      const text = 'John Doe (555-123-4567)';
      entities.forEach(e => {
        e.context = extractor.extractContext(e, text);
      });

      extractor.buildRelationships(entities, text);

      expect(entities[1].context.relatedEntities).toContain(0);
    });
  });
});
