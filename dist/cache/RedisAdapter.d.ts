import type { CacheAdapter } from '../types.js';
/**
 * Redis cache adapter. Uses ioredis (optional peer dependency).
 * Cache key format: pii-guard:{key}
 */
export declare class RedisAdapter implements CacheAdapter {
    private redis;
    private prefix;
    private initPromise;
    constructor(redisUrl: string);
    private initRedis;
    private client;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds: number): Promise<void>;
    disconnect(): Promise<void>;
}
