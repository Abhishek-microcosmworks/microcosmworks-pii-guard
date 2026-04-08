import { PIIType } from '../types.js';
/**
 * Mapping from AWS Comprehend PII entity types to our PIIType enum.
 * See: https://docs.aws.amazon.com/comprehend/latest/dg/how-pii.html
 */
const COMPREHEND_TYPE_MAP = {
    NAME: PIIType.NAME,
    ADDRESS: PIIType.ADDRESS,
    EMAIL: PIIType.EMAIL,
    PHONE: PIIType.PHONE,
    SSN: PIIType.SSN,
    SSN_ITIN: PIIType.SSN,
    CREDIT_DEBIT_NUMBER: PIIType.CREDIT_CARD,
    CREDIT_DEBIT_CVV: PIIType.CREDIT_CARD,
    CREDIT_DEBIT_EXPIRY: PIIType.CREDIT_CARD,
    DATE_TIME: PIIType.DATE_OF_BIRTH,
    BANK_ACCOUNT_NUMBER: PIIType.BANK_DETAILS,
    BANK_ROUTING: PIIType.BANK_DETAILS,
    SWIFT_CODE: PIIType.BANK_DETAILS,
    INTERNATIONAL_BANK_ACCOUNT_NUMBER: PIIType.BANK_DETAILS,
    PASSPORT_NUMBER: PIIType.CUSTOM,
    DRIVER_ID: PIIType.CUSTOM,
    IP_ADDRESS: PIIType.CUSTOM,
    MAC_ADDRESS: PIIType.CUSTOM,
    URL: PIIType.CUSTOM,
    USERNAME: PIIType.CUSTOM,
    PASSWORD: PIIType.CUSTOM,
    AGE: PIIType.CUSTOM,
    AWS_ACCESS_KEY: PIIType.CUSTOM,
    AWS_SECRET_KEY: PIIType.CUSTOM,
    VEHICLE_IDENTIFICATION_NUMBER: PIIType.CUSTOM,
    LICENSE_PLATE: PIIType.CUSTOM,
    PIN: PIIType.CUSTOM,
};
/** Default max bytes per Comprehend API call (100KB) */
const DEFAULT_MAX_TEXT_BYTES = 100_000;
/**
 * Uses AWS Comprehend DetectPiiEntities API for ML-based PII detection.
 *
 * Requires `@aws-sdk/client-comprehend` as an optional peer dependency.
 * Only loaded when this provider is instantiated.
 */
export class AWSComprehendProvider {
    name = 'aws-comprehend';
    config;
    client; // ComprehendClient — typed as any to avoid hard dependency
    DetectPiiEntitiesCommand;
    constructor(config) {
        this.config = config;
    }
    /** Lazily initialize the AWS SDK client */
    async ensureClient() {
        if (this.client)
            return;
        let sdk;
        try {
            // @ts-ignore — optional peer dependency, loaded dynamically
            sdk = await import('@aws-sdk/client-comprehend');
        }
        catch {
            throw new Error('pii-guard: @aws-sdk/client-comprehend is required for the aws-comprehend detection provider. ' +
                'Install it with: npm install @aws-sdk/client-comprehend');
        }
        const clientConfig = {
            region: this.config.region,
        };
        if (this.config.credentials) {
            clientConfig.credentials = {
                accessKeyId: this.config.credentials.accessKeyId,
                secretAccessKey: this.config.credentials.secretAccessKey,
            };
        }
        this.client = new sdk.ComprehendClient(clientConfig);
        this.DetectPiiEntitiesCommand = sdk.DetectPiiEntitiesCommand;
    }
    async detect(text, options) {
        await this.ensureClient();
        const languageCode = options?.languageCode || this.config.languageCode || 'en';
        const minConfidence = options?.minConfidence ?? this.config.minConfidence ?? 0.8;
        const maxBytes = this.config.maxTextBytes || DEFAULT_MAX_TEXT_BYTES;
        // Check if text needs chunking
        const textBytes = Buffer.byteLength(text, 'utf-8');
        if (textBytes <= maxBytes) {
            return this.detectSingle(text, languageCode, minConfidence);
        }
        // Chunk at sentence boundaries and adjust offsets
        return this.detectChunked(text, languageCode, minConfidence, maxBytes);
    }
    async shutdown() {
        if (this.client) {
            this.client.destroy();
            this.client = null;
        }
    }
    /** Detect PII in a single text chunk */
    async detectSingle(text, languageCode, minConfidence, offset = 0) {
        const command = new this.DetectPiiEntitiesCommand({
            Text: text,
            LanguageCode: languageCode,
        });
        const response = await this.client.send(command);
        const entities = [];
        for (const entity of response.Entities || []) {
            const score = entity.Score ?? 0;
            if (score < minConfidence)
                continue;
            const type = COMPREHEND_TYPE_MAP[entity.Type || ''];
            if (!type)
                continue;
            const beginOffset = (entity.BeginOffset ?? 0) + offset;
            const endOffset = (entity.EndOffset ?? 0) + offset;
            const value = text.slice(entity.BeginOffset ?? 0, entity.EndOffset ?? 0);
            entities.push({
                type,
                value,
                startIndex: beginOffset,
                endIndex: endOffset,
                confidence: score,
                providerMetadata: {
                    awsEntityType: entity.Type,
                    awsScore: entity.Score,
                },
            });
        }
        return entities;
    }
    /**
     * Split text at sentence boundaries for texts exceeding the byte limit.
     * Adjusts entity positions to reflect their position in the original text.
     */
    async detectChunked(text, languageCode, minConfidence, maxBytes) {
        const chunks = this.splitAtSentenceBoundaries(text, maxBytes);
        const allEntities = [];
        let charOffset = 0;
        for (const chunk of chunks) {
            const chunkEntities = await this.detectSingle(chunk, languageCode, minConfidence, charOffset);
            allEntities.push(...chunkEntities);
            charOffset += chunk.length;
        }
        return allEntities;
    }
    /** Split text into chunks at sentence boundaries that fit within maxBytes */
    splitAtSentenceBoundaries(text, maxBytes) {
        const chunks = [];
        let remaining = text;
        while (remaining.length > 0) {
            const remainingBytes = Buffer.byteLength(remaining, 'utf-8');
            if (remainingBytes <= maxBytes) {
                chunks.push(remaining);
                break;
            }
            // Find a sentence boundary within the byte limit
            // Start from an estimated character position and work backwards
            let splitPos = Math.min(remaining.length, maxBytes);
            // Find the last sentence-ending punctuation before splitPos
            const searchRange = remaining.slice(0, splitPos);
            const sentenceEnd = Math.max(searchRange.lastIndexOf('. '), searchRange.lastIndexOf('! '), searchRange.lastIndexOf('? '), searchRange.lastIndexOf('.\n'), searchRange.lastIndexOf('!\n'), searchRange.lastIndexOf('?\n'));
            if (sentenceEnd > 0) {
                splitPos = sentenceEnd + 2; // include the punctuation and space
            }
            else {
                // No sentence boundary found — split at last space
                const lastSpace = searchRange.lastIndexOf(' ');
                if (lastSpace > 0) {
                    splitPos = lastSpace + 1;
                }
                // else: just split at maxBytes char estimate
            }
            // Verify the chunk fits within maxBytes; shrink if needed
            let chunk = remaining.slice(0, splitPos);
            while (Buffer.byteLength(chunk, 'utf-8') > maxBytes && splitPos > 1) {
                splitPos = Math.floor(splitPos * 0.9);
                chunk = remaining.slice(0, splitPos);
            }
            chunks.push(chunk);
            remaining = remaining.slice(splitPos);
        }
        return chunks;
    }
}
