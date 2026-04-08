/**
 * In-memory storage adapter for testing or stateless/ephemeral use.
 * Stores mappings in a Map. No persistence across restarts.
 */
export class InMemoryAdapter {
    store = new Map(); // key: `${scopeId}:${entityHash}`
    async findByHash(scopeId, entityHash) {
        const record = this.store.get(`${scopeId}:${entityHash}`);
        if (!record)
            return null;
        return { synthetic: record.synthetic, entityType: record.entityType };
    }
    async create(scopeId, entityType, entityHash, synthetic, encryptedOriginal, contextJson) {
        this.store.set(`${scopeId}:${entityHash}`, {
            entityType,
            entityHash,
            synthetic,
            encryptedOriginal,
            contextJson,
        });
    }
    async findBySynthetic(scopeId, synthetic) {
        for (const [key, record] of this.store) {
            if (key.startsWith(`${scopeId}:`) && record.synthetic === synthetic) {
                return {
                    entityHash: record.entityHash,
                    entityType: record.entityType,
                    encryptedOriginal: record.encryptedOriginal,
                };
            }
        }
        return null;
    }
    async findAllForScope(scopeId) {
        const results = [];
        for (const [key, record] of this.store) {
            if (key.startsWith(`${scopeId}:`)) {
                results.push({
                    synthetic: record.synthetic,
                    entityType: record.entityType,
                    encryptedOriginal: record.encryptedOriginal,
                });
            }
        }
        return results;
    }
    async disconnect() {
        this.store.clear();
    }
}
