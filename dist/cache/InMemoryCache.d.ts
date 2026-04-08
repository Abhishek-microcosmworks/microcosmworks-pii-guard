import type { CacheAdapter } from '../types.js';
/**
 * LRU in-memory cache. Used when Redis is unavailable or not configured.
 * Default max 10,000 entries.
 */
export declare class InMemoryCache implements CacheAdapter {
    private cache;
    private maxEntries;
    constructor(maxEntries?: number);
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds: number): Promise<void>;
    disconnect(): Promise<void>;
}
