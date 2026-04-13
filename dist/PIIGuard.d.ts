import type { PIIEntity, RedactResult, RestoreResult, RestoreAndGuardResult, ResolvedConfig, FileRedactOptions, FileDetectOptions, FileRedactResult, FileDetectResult } from './types.js';
export declare class PIIGuard {
    private detectionProvider;
    private contextExtractor;
    private syntheticGenerator;
    private mappingManager;
    private typeOverrides;
    constructor(config: ResolvedConfig);
    /** Replace PII with realistic synthetic values */
    redact(text: string, opts: {
        scopeId: string;
    }): Promise<RedactResult>;
    /** Replace synthetic values back to originals */
    restore(text: string, opts: {
        scopeId: string;
    }): Promise<RestoreResult>;
    /** Restore known synthetics AND redact any NEW PII hallucinated by the LLM */
    restoreAndGuard(text: string, opts: {
        scopeId: string;
    }): Promise<RestoreAndGuardResult>;
    private rangesOverlap;
    /**
     * Remove overlapping entity spans, keeping the longest (or highest confidence
     * when spans are equal length).  This is applied after every provider's
     * detect() so that providers that return sub-span duplicates (e.g.
     * "Jonathan", "Richards", AND "Jonathan Richards") are collapsed to the
     * single best entity before any replacement occurs.
     */
    private deduplicateEntities;
    /** Same as redact — consistent synthetics ensure vector search works */
    redactForEmbedding(text: string, opts: {
        scopeId: string;
    }): Promise<RedactResult>;
    /** Detection only — scan without replacing */
    detect(text: string): Promise<PIIEntity[]>;
    /** Redact PII in a file (path or Buffer) */
    redactFile(input: string | Buffer, opts: FileRedactOptions): Promise<FileRedactResult>;
    /** Detect PII in a file (path or Buffer) without replacing */
    detectFile(input: string | Buffer, opts?: FileDetectOptions): Promise<FileDetectResult>;
    /** Redact a file for embedding — delegates to redactFile */
    redactFileForEmbedding(input: string | Buffer, opts: FileRedactOptions): Promise<FileRedactResult>;
    private getStrategy;
    private resolveReplacement;
    /** Health check for storage and cache connectivity */
    healthCheck(): Promise<{
        database: boolean;
        cache: boolean;
    }>;
    /** Clean shutdown of all connections */
    shutdown(): Promise<void>;
}
