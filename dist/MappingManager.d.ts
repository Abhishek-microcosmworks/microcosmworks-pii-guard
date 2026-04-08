import type { StorageAdapter, CacheAdapter, PIIEntity } from './types.js';
import type { SyntheticGenerator } from './SyntheticGenerator.js';
export declare class MappingManager {
    private storage;
    private cache;
    private salt;
    private cacheTtl;
    constructor(storage: StorageAdapter, cache: CacheAdapter | null, salt: string, cacheTtl?: number);
    /** Get existing synthetic for an original, or create a new one */
    getOrCreate(scopeId: string, entity: PIIEntity, generator: SyntheticGenerator): Promise<string>;
    /** Reverse lookup: find the original for a synthetic value */
    resolveOriginal(scopeId: string, synthetic: string): Promise<string | null>;
    /** Load all mappings for a scope (synthetic -> original) */
    loadScope(scopeId: string): Promise<Map<string, string>>;
    /** Load all mappings for a scope with entity type information */
    loadScopeWithTypes(scopeId: string): Promise<Array<{
        synthetic: string;
        original: string;
        entityType: string;
    }>>;
    /** Closes storage and cache connections cleanly on server shutdown */
    shutdown(): Promise<void>;
    /** HMAC-SHA256 hash of the original value scoped to the scopeId */
    private hashEntity;
    /** Encrypt a value with AES-256-GCM using the salt as key material */
    private encrypt;
    /** Decrypt a value encrypted with encrypt() */
    private decrypt;
}
