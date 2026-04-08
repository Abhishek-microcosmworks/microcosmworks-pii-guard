import type { PIIEntity, PIIContext } from './types.js';
export declare class ContextExtractor {
    private windowSize;
    constructor(contextWindowSize?: number);
    /** Extract context for a single entity from surrounding text */
    extractContext(entity: PIIEntity, fullText: string): PIIContext;
    /** Build relationships between entities in the same text */
    buildRelationships(entities: PIIEntity[], fullText: string): void;
}
