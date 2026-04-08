import type { StorageAdapter } from '../types.js';
/**
 * MongoDB storage adapter via Mongoose.
 * Uses a dedicated connection (not the global mongoose.connect()) to avoid conflicts.
 */
export declare class MongooseAdapter implements StorageAdapter {
    private connection;
    private model;
    private initPromise;
    constructor(mongoUri: string);
    private initMongoose;
    private ready;
    findByHash(scopeId: string, entityHash: string): Promise<any>;
    create(scopeId: string, entityType: string, entityHash: string, synthetic: string, encryptedOriginal: string, contextJson?: string): Promise<void>;
    findBySynthetic(scopeId: string, synthetic: string): Promise<any>;
    findAllForScope(scopeId: string): Promise<any>;
    disconnect(): Promise<void>;
}
