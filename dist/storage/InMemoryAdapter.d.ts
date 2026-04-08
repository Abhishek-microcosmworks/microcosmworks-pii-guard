import type { StorageAdapter } from '../types.js';
/**
 * In-memory storage adapter for testing or stateless/ephemeral use.
 * Stores mappings in a Map. No persistence across restarts.
 */
export declare class InMemoryAdapter implements StorageAdapter {
    private store;
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
    findAllForScope(scopeId: string): Promise<{
        synthetic: string;
        entityType: string;
        encryptedOriginal: string;
    }[]>;
    disconnect(): Promise<void>;
}
