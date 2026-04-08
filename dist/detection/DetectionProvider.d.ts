import type { PIIType } from '../types.js';
/** Abstract interface that all detection backends implement */
export interface DetectionProvider {
    readonly name: string;
    detect(text: string, options?: DetectionOptions): Promise<DetectedEntity[]>;
    shutdown?(): Promise<void>;
}
/** Options passed to detection providers */
export interface DetectionOptions {
    documentTypes?: string[];
    languageCode?: string;
    minConfidence?: number;
}
/** Raw detection result before context extraction / synthetic generation */
export interface DetectedEntity {
    type: PIIType;
    value: string;
    startIndex: number;
    endIndex: number;
    confidence: number;
    /** Provider-specific metadata (e.g., AWS Comprehend entity score details) */
    providerMetadata?: Record<string, unknown>;
}
