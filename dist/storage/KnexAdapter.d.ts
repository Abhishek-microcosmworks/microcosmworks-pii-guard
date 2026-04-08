import type { StorageAdapter } from '../types.js';
/**
 * SQL storage adapter via Knex query builder.
 * Supports PostgreSQL and MySQL. Auto-creates the synthetic_maps table on first use.
 */
export declare class KnexAdapter implements StorageAdapter {
    private knex;
    private tableReady;
    private initPromise;
    constructor(databaseUrl: string, poolConfig?: {
        min?: number;
        max?: number;
    });
    private initKnex;
    private ensureTable;
    private generateId;
    findByHash(scopeId: string, entityHash: string): Promise<any>;
    create(scopeId: string, entityType: string, entityHash: string, synthetic: string, encryptedOriginal: string, contextJson?: string): Promise<void>;
    findBySynthetic(scopeId: string, synthetic: string): Promise<any>;
    findAllForScope(scopeId: string): Promise<any>;
    disconnect(): Promise<void>;
}
