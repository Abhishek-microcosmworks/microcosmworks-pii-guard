import { PIIDetector } from '../PIIDetector.js';
/**
 * Wraps the existing regex-based PIIDetector behind the DetectionProvider interface.
 * No behavioral change — existing regex logic is preserved as-is.
 */
export class BuiltInProvider {
    name = 'builtin';
    detector;
    constructor(patterns, documentTypes) {
        this.detector = new PIIDetector(patterns, documentTypes);
    }
    async detect(text, _options) {
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
