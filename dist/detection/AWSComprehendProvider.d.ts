import type { DetectionProvider, DetectionOptions, DetectedEntity } from './DetectionProvider.js';
import type { AWSComprehendConfig } from '../types.js';
/**
 * Uses AWS Comprehend DetectPiiEntities API for ML-based PII detection.
 *
 * Requires `@aws-sdk/client-comprehend` as an optional peer dependency.
 * Only loaded when this provider is instantiated.
 */
export declare class AWSComprehendProvider implements DetectionProvider {
    readonly name = "aws-comprehend";
    private config;
    private client;
    private DetectPiiEntitiesCommand;
    constructor(config: AWSComprehendConfig);
    /** Lazily initialize the AWS SDK client */
    private ensureClient;
    detect(text: string, options?: DetectionOptions): Promise<DetectedEntity[]>;
    shutdown(): Promise<void>;
    /** Detect PII in a single text chunk */
    private detectSingle;
    /**
     * Split text at sentence boundaries for texts exceeding the byte limit.
     * Adjusts entity positions to reflect their position in the original text.
     */
    private detectChunked;
    /** Split text into chunks at sentence boundaries that fit within maxBytes */
    private splitAtSentenceBoundaries;
}
