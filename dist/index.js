import { PIIGuard } from './PIIGuard.js';
import { resolveConfig } from './config.js';
export async function createPIIGuard(config) {
    const resolved = await resolveConfig(config);
    return new PIIGuard(resolved);
}
// Re-export types
export * from './types.js';
export { DEFAULT_PATTERNS } from './patterns.js';
export { DEFAULT_POOLS } from './pools/index.js';
export { PIIGuard } from './PIIGuard.js';
export { BuiltInProvider } from './detection/BuiltInProvider.js';
export { AWSComprehendProvider } from './detection/AWSComprehendProvider.js';
export { HybridProvider } from './detection/HybridProvider.js';
// Storage & cache exports
export { InMemoryAdapter } from './storage/InMemoryAdapter.js';
export { KnexAdapter } from './storage/KnexAdapter.js';
export { MongooseAdapter } from './storage/MongooseAdapter.js';
export { InMemoryCache } from './cache/InMemoryCache.js';
export { RedisAdapter } from './cache/RedisAdapter.js';
// File processing
export { extractText, inferFormat, isWritableFormat } from './file/index.js';
// Express middleware
export { createExpressMiddleware } from './middleware/express.js';
