import { PIIType } from './types.js';
import type { PIIPatternConfig, PIIEntity, PIIContext } from './types.js';

export class PIIDetector {
  private patterns: PIIPatternConfig[];
  private documentTypes: string[];

  constructor(patterns: PIIPatternConfig[], documentTypes: string[]) {
    this.patterns = patterns;
    this.documentTypes = documentTypes;
  }

  /** Detect all PII spans in text. Entities returned without synthetic values. */
  detect(text: string): PIIEntity[] {
    const entities: PIIEntity[] = [];

    for (const patternConfig of this.patterns) {
      // Skip patterns not relevant to configured document types
      if (patternConfig.documentTypes) {
        const hasOverlap = patternConfig.documentTypes.some(dt =>
          this.documentTypes.includes(dt)
        );
        if (!hasOverlap) continue;
      }

      // Reset regex lastIndex for global patterns
      const regex = new RegExp(patternConfig.pattern.source, patternConfig.pattern.flags);

      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        // Use capture group 1 if present (for patterns with labels like "DOB: 03/15/1990"),
        // otherwise use the full match
        const value = match[1] || match[0];
        const startIndex = match[1]
          ? match.index + match[0].indexOf(match[1])
          : match.index;
        const endIndex = startIndex + value.length;

        const entity: PIIEntity = {
          type: (typeof patternConfig.type === 'string' && patternConfig.type in PIIType
            ? patternConfig.type
            : patternConfig.type) as PIIType,
          value,
          synthetic: '', // filled later by SyntheticGenerator
          startIndex,
          endIndex,
          confidence: patternConfig.confidence,
          context: {} as PIIContext,
        };

        entities.push(entity);
      }
    }

    // Detect bare dates as DATE_OF_BIRTH when a DOB keyword is nearby
    this.detectContextualDOB(text, entities);

    // Remove overlapping detections — keep highest confidence
    return this.deduplicateOverlaps(entities);
  }

  /** Auto-detect document type from keywords in text */
  static inferDocumentType(text: string): 'general' | 'medical' | 'financial' {
    const lower = text.toLowerCase();

    const medicalKeywords = [
      'patient', 'diagnosis', 'medication', 'prescribed', 'medical record',
      'mrn', 'icd', 'treatment', 'physician', 'hospital', 'clinical',
      'insurance', 'dosage', 'symptoms', 'prognosis',
    ];
    const financialKeywords = [
      'account', 'routing', 'iban', 'swift', 'bank', 'transaction',
      'balance', 'credit', 'debit', 'wire transfer', 'investment',
      'portfolio', 'loan', 'mortgage',
    ];

    const medicalScore = medicalKeywords.filter(kw => lower.includes(kw)).length;
    const financialScore = financialKeywords.filter(kw => lower.includes(kw)).length;

    if (medicalScore >= 2) return 'medical';
    if (financialScore >= 2) return 'financial';
    return 'general';
  }

  /**
   * Detect bare dates (MM/DD/YYYY etc.) and classify as DATE_OF_BIRTH
   * when a DOB-related keyword appears within ±500 chars.
   */
  private detectContextualDOB(text: string, entities: PIIEntity[]): void {
    const bareDate = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/g;
    const dobKeyword = /\b(?:DOB|Date of Birth|Birth\s*Date|Born|Birthday)\b/i;

    let match: RegExpExecArray | null;
    while ((match = bareDate.exec(text)) !== null) {
      const month = parseInt(match[1], 10);
      const day = parseInt(match[2], 10);

      // Basic validation: month 1-12, day 1-31
      if (month < 1 || month > 12 || day < 1 || day > 31) continue;

      const startIndex = match.index;
      const endIndex = startIndex + match[0].length;

      // Skip if overlapping with an already-detected entity
      const overlaps = entities.some(
        e => startIndex < e.endIndex && endIndex > e.startIndex,
      );
      if (overlaps) continue;

      // Check ±500 char window for a DOB keyword
      const windowStart = Math.max(0, startIndex - 500);
      const windowEnd = Math.min(text.length, endIndex + 500);
      const window = text.slice(windowStart, windowEnd);

      if (!dobKeyword.test(window)) continue;

      entities.push({
        type: PIIType.DATE_OF_BIRTH,
        value: match[0],
        synthetic: '',
        startIndex,
        endIndex,
        confidence: 0.75,
        context: {} as PIIContext,
      });
    }
  }

  /** Remove overlapping entity spans, keeping highest confidence */
  private deduplicateOverlaps(entities: PIIEntity[]): PIIEntity[] {
    if (entities.length <= 1) return entities;

    // Sort by start index, then by span length descending
    entities.sort((a, b) => a.startIndex - b.startIndex || (b.endIndex - b.startIndex) - (a.endIndex - a.startIndex));

    const result: PIIEntity[] = [];
    for (const entity of entities) {
      const lastKept = result[result.length - 1];
      if (lastKept && entity.startIndex < lastKept.endIndex) {
        // Overlapping — keep higher confidence
        if (entity.confidence > lastKept.confidence) {
          result[result.length - 1] = entity;
        }
      } else {
        result.push(entity);
      }
    }

    return result;
  }
}
