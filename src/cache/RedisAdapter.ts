import type { CacheAdapter } from '../types.js';

/**
 * Redis cache adapter. Uses ioredis (optional peer dependency).
 * Cache key format: pii-guard:{key}
 */
export class RedisAdapter implements CacheAdapter {
  private redis: any; // Redis instance — typed as any to avoid hard coupling
  private prefix = 'pii-guard:';
  private initPromise: Promise<void>;

  constructor(redisUrl: string) {
    this.initPromise = this.initRedis(redisUrl);
  }

  private async initRedis(redisUrl: string): Promise<void> {
    try {
      const Redis = (await import('ioredis')).default;
      this.redis = new Redis(redisUrl);
    } catch {
      throw new Error(
        'pii-guard: ioredis is required for Redis caching. ' +
        'Install it with: npm install ioredis'
      );
    }
  }

  private async client(): Promise<any> {
    await this.initPromise;
    return this.redis;
  }

  async get(key: string): Promise<string | null> {
    const r = await this.client();
    return r.get(this.prefix + key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const r = await this.client();
    await r.set(this.prefix + key, value, 'EX', ttlSeconds);
  }

  async disconnect(): Promise<void> {
    await this.initPromise;
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
