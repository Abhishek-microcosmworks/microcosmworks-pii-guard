import type { DetectionProvider, DetectionOptions, DetectedEntity } from './DetectionProvider.js';
/**
 * Combines multiple detection providers for maximum coverage.
 *
 * Strategies:
 * - `union`: Merge all results, deduplicate overlapping spans (keep highest confidence).
 * - `highest-confidence`: For overlapping spans, keep only the entity with the highest confidence score.
 *
 * Useful for running regex (fast, catches structured patterns like SSN/credit cards well)
 * + Comprehend (catches names/addresses better) together.
 */
export declare class HybridProvider implements DetectionProvider {
    readonly name = "hybrid";
    private providers;
    private strategy;
    constructor(providers: DetectionProvider[], strategy?: 'union' | 'highest-confidence');
    detect(text: string, options?: DetectionOptions): Promise<DetectedEntity[]>;
    shutdown(): Promise<void>;
    /**
     * Union strategy: keep all non-overlapping entities.
     * For overlapping spans, keep the one with highest confidence.
     */
    private deduplicateUnion;
    /**
     * Highest-confidence strategy: for any overlapping spans,
     * keep only the entity with the highest confidence.
     */
    private deduplicateHighestConfidence;
    /** Check if two entity spans overlap */
    private spansOverlap;
}
