/**
 * Redis cache adapter. Uses ioredis (optional peer dependency).
 * Cache key format: pii-guard:{key}
 */
export class RedisAdapter {
    redis; // Redis instance — typed as any to avoid hard coupling
    prefix = 'pii-guard:';
    initPromise;
    constructor(redisUrl) {
        this.initPromise = this.initRedis(redisUrl);
    }
    async initRedis(redisUrl) {
        try {
            const Redis = (await import('ioredis')).default;
            this.redis = new Redis(redisUrl);
        }
        catch {
            throw new Error('pii-guard: ioredis is required for Redis caching. ' +
                'Install it with: npm install ioredis');
        }
    }
    async client() {
        await this.initPromise;
        return this.redis;
    }
    async get(key) {
        const r = await this.client();
        return r.get(this.prefix + key);
    }
    async set(key, value, ttlSeconds) {
        const r = await this.client();
        await r.set(this.prefix + key, value, 'EX', ttlSeconds);
    }
    async disconnect() {
        await this.initPromise;
        if (this.redis) {
            await this.redis.quit();
        }
    }
}
