import type { StorageAdapter } from '../types.js';

interface StoredMapping {
  entityType: string;
  entityHash: string;
  synthetic: string;
  encryptedOriginal: string;
  contextJson?: string;
}

/**
 * In-memory storage adapter for testing or stateless/ephemeral use.
 * Stores mappings in a Map. No persistence across restarts.
 */
export class InMemoryAdapter implements StorageAdapter {
  private store = new Map<string, StoredMapping>(); // key: `${scopeId}:${entityHash}`

  async findByHash(scopeId: string, entityHash: string) {
    const record = this.store.get(`${scopeId}:${entityHash}`);
    if (!record) return null;
    return { synthetic: record.synthetic, entityType: record.entityType };
  }

  async create(
    scopeId: string,
    entityType: string,
    entityHash: string,
    synthetic: string,
    encryptedOriginal: string,
    contextJson?: string
  ) {
    this.store.set(`${scopeId}:${entityHash}`, {
      entityType,
      entityHash,
      synthetic,
      encryptedOriginal,
      contextJson,
    });
  }

  async findBySynthetic(scopeId: string, synthetic: string) {
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

  async findAllForScope(scopeId: string) {
    const results: Array<{ synthetic: string; entityType: string; encryptedOriginal: string }> = [];
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
