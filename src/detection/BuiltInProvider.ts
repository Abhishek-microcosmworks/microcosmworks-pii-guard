import type { DetectionProvider, DetectionOptions, DetectedEntity } from './DetectionProvider.js';
import { PIIDetector } from '../PIIDetector.js';
import type { PIIPatternConfig } from '../types.js';

/**
 * Wraps the existing regex-based PIIDetector behind the DetectionProvider interface.
 * No behavioral change — existing regex logic is preserved as-is.
 */
export class BuiltInProvider implements DetectionProvider {
  readonly name = 'builtin';
  private detector: PIIDetector;

  constructor(patterns: PIIPatternConfig[], documentTypes: string[]) {
    this.detector = new PIIDetector(patterns, documentTypes);
  }

  async detect(text: string, _options?: DetectionOptions): Promise<DetectedEntity[]> {
    const entities = this.detector.detect(text);

    return entities.map(entity => ({
      type: entity.type,
      value: entity.value,
      startIndex: entity.startIndex,
      endIndex: entity.endIndex,
      confidence: entity.confidence,
    }));
  }
}
