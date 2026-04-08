import type { DetectionProvider } from './detection/DetectionProvider.js';
export declare enum PIIType {
    EMAIL = "EMAIL",
    PHONE = "PHONE",
    SSN = "SSN",
    CREDIT_CARD = "CREDIT_CARD",
    NAME = "NAME",
    ADDRESS = "ADDRESS",
    ACCOUNT_NUMBER = "ACCOUNT_NUMBER",
    DATE_OF_BIRTH = "DATE_OF_BIRTH",
    MEDICAL_RECORD = "MEDICAL_RECORD",
    DIAGNOSIS_CODE = "DIAGNOSIS_CODE",
    INSURANCE_ID = "INSURANCE_ID",
    MEDICATION = "MEDICATION",
    BANK_DETAILS = "BANK_DETAILS",
    CUSTOM = "CUSTOM"
}
/** Contextual metadata extracted from surrounding text */
export interface PIIContext {
    role?: string;
    title?: string;
    subtype?: string;
    genderHint?: string;
    ageContext?: string;
    domain?: string;
    format?: string;
    relatedEntities?: number[];
    relationship?: string;
}
export interface PIIEntity {
    type: PIIType;
    value: string;
    synthetic: string;
    startIndex: number;
    endIndex: number;
    confidence: number;
    context: PIIContext;
}
export interface RedactResult {
    text: string;
    entities: PIIEntity[];
    mapping: Map<string, string>;
}
export interface RestoreResult {
    text: string;
    resolved: number;
    unresolved: string[];
}
export interface RestoreAndGuardResult {
    /** Final text with known synthetics restored AND new PII redacted */
    text: string;
    /** Entities that were restored (synthetic → original) */
    restored: {
        synthetic: string;
        original: string;
    }[];
    /** NEW PII entities detected and redacted in the LLM response */
    guarded: PIIEntity[];
    /** Synthetics that could not be matched (LLM dropped them) */
    unresolved: string[];
}
export type RedactStrategy = 'synthetic' | 'mask' | 'hash' | 'skip';
export type RedactStrategyFn = (value: string, entity: PIIEntity) => string;
export interface TypeOverrideConfig {
    /** false = skip detection entirely for this type */
    enabled?: boolean;
    /** Override confidence threshold for this type */
    confidence?: number;
    /** Replacement strategy (default: 'synthetic') */
    strategy?: RedactStrategy | RedactStrategyFn;
    /** Custom label for 'mask' strategy (default: '[{TYPE}_REDACTED]') */
    maskLabel?: string;
    /** REPLACE all default patterns for this type */
    patterns?: PIIPatternConfig[];
    /** ADD extra patterns for this type */
    addPatterns?: PIIPatternConfig[];
}
export interface PIIGuardConfig {
    databaseUrl?: string;
    redisUrl?: string;
    storage?: StorageAdapter;
    cache?: CacheAdapter;
    patterns?: PIIPatternConfig[];
    pools?: Partial<SyntheticPools>;
    salt?: string;
    cacheTtlSeconds?: number;
    contextWindowSize?: number;
    documentTypes?: ('general' | 'medical' | 'financial')[];
    /** Database type. Default: 'postgresql'. Reads PII_GUARD_DB_TYPE env var. */
    dbType?: 'mongodb' | 'postgresql' | 'mysql';
    /** MongoDB connection URI. Used when dbType is 'mongodb'. Reads PII_MONGODB_URI env var. */
    mongoUri?: string;
    /** Detection provider. Default: 'builtin' (regex). */
    detectionProvider?: DetectionProvider | 'builtin' | 'aws-comprehend' | 'hybrid';
    /** AWS Comprehend config. Required when detectionProvider is 'aws-comprehend' or 'hybrid'. */
    awsComprehend?: AWSComprehendConfig;
    /**
     * Hybrid provider config. Used when detectionProvider is 'hybrid'.
     * Default: ['builtin', 'aws-comprehend'] with 'union' strategy.
     */
    hybridDetection?: {
        providers?: Array<DetectionProvider | 'builtin' | 'aws-comprehend'>;
        strategy?: 'union' | 'highest-confidence';
    };
    /** Per-type overrides for detection and redaction behavior */
    typeOverrides?: Record<string, TypeOverrideConfig>;
}
export interface AWSComprehendConfig {
    region: string;
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
    };
    /** Language code for Comprehend. Default: 'en' */
    languageCode?: string;
    /** Minimum confidence threshold (0-1). Default: 0.8 */
    minConfidence?: number;
    /** Comprehend limit: 100KB per call. Auto-chunks if exceeded. */
    maxTextBytes?: number;
}
export interface SyntheticPools {
    maleFirstNames: string[];
    femaleFirstNames: string[];
    neutralFirstNames: string[];
    surnames: string[];
    corporateDomains: string[];
    personalDomains: string[];
    streetNames: string[];
}
export interface PIIPatternConfig {
    type: PIIType | string;
    pattern: RegExp;
    confidence: number;
    documentTypes?: string[];
    contextRules?: ContextRule[];
}
export interface ContextRule {
    signal: RegExp;
    extract: string;
    value: string | ((match: RegExpMatchArray) => string);
}
export interface StorageAdapter {
    findByHash(scopeId: string, entityHash: string): Promise<{
        synthetic: string;
        entityType: string;
    } | null>;
    create(scopeId: string, entityType: string, entityHash: string, synthetic: string, encryptedOriginal: string, contextJson?: string): Promise<void>;
    findBySynthetic(scopeId: string, synthetic: string): Promise<{
        entityHash: string;
        entityType: string;
        encryptedOriginal: string;
    } | null>;
    findAllForScope(scopeId: string): Promise<Array<{
        synthetic: string;
        entityType: string;
        encryptedOriginal: string;
    }>>;
    disconnect(): Promise<void>;
}
export interface CacheAdapter {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds: number): Promise<void>;
    disconnect(): Promise<void>;
}
export interface ResolvedConfig {
    storage: StorageAdapter;
    cache: CacheAdapter;
    patterns: PIIPatternConfig[];
    pools: SyntheticPools;
    salt: string;
    cacheTtlSeconds: number;
    contextWindowSize: number;
    documentTypes: string[];
    detectionProvider: DetectionProvider;
    typeOverrides: Record<string, TypeOverrideConfig>;
}
export type SupportedFileFormat = 'txt' | 'md' | 'csv' | 'log' | 'json' | 'pdf' | 'docx' | 'html' | 'xml';
export interface TextExtractionResult {
    text: string;
    format: SupportedFileFormat;
    source: string;
    charCount: number;
}
export interface FileRedactOptions {
    scopeId: string;
    outputPath?: string;
    format?: SupportedFileFormat;
    encoding?: BufferEncoding;
}
export interface FileDetectOptions {
    format?: SupportedFileFormat;
    encoding?: BufferEncoding;
}
export interface FileRedactResult extends RedactResult {
    format: SupportedFileFormat;
    source: string;
    outputPath?: string;
}
export interface FileDetectResult {
    entities: PIIEntity[];
    format: SupportedFileFormat;
    source: string;
    extractedText: string;
}
