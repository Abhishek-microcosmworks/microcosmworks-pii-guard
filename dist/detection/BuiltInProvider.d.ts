import type { DetectionProvider, DetectionOptions, DetectedEntity } from './DetectionProvider.js';
import type { PIIPatternConfig } from '../types.js';
/**
 * Wraps the existing regex-based PIIDetector behind the DetectionProvider interface.
 * No behavioral change — existing regex logic is preserved as-is.
 */
export declare class BuiltInProvider implements DetectionProvider {
    readonly name = "builtin";
    private detector;
    constructor(patterns: PIIPatternConfig[], documentTypes: string[]);
    detect(text: string, _options?: DetectionOptions): Promise<DetectedEntity[]>;
}
