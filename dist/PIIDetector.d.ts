import type { PIIPatternConfig, PIIEntity } from './types.js';
export declare class PIIDetector {
    private patterns;
    private documentTypes;
    constructor(patterns: PIIPatternConfig[], documentTypes: string[]);
    /** Detect all PII spans in text. Entities returned without synthetic values. */
    detect(text: string): PIIEntity[];
    /** Auto-detect document type from keywords in text */
    static inferDocumentType(text: string): 'general' | 'medical' | 'financial';
    /**
     * Detect bare dates (MM/DD/YYYY etc.) and classify as DATE_OF_BIRTH
     * when a DOB-related keyword appears within ±500 chars.
     */
    private detectContextualDOB;
    /** Remove overlapping entity spans, keeping highest confidence */
    private deduplicateOverlaps;
}
