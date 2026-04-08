import type { CacheAdapter } from '../types.js';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

/**
 * LRU in-memory cache. Used when Redis is unavailable or not configured.
 * Default max 10,000 entries.
 */
export class InMemoryCache implements CacheAdapter {
  private cache = new Map<string, CacheEntry>();
  private maxEntries: number;

  constructor(maxEntries: number = 10_000) {
    this.maxEntries = maxEntries;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Move to end for LRU (delete + re-insert)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async disconnect(): Promise<void> {
    this.cache.clear();
  }
}
