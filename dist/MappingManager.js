import { createHmac, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export class MappingManager {
    storage;
    cache;
    salt;
    cacheTtl;
    constructor(storage, cache, salt, cacheTtl = 3600) {
        this.storage = storage;
        this.cache = cache;
        this.salt = salt;
        this.cacheTtl = cacheTtl;
    }
    /** Get existing synthetic for an original, or create a new one */
    async getOrCreate(scopeId, entity, generator) {
        const entityHash = this.hashEntity(entity.value, scopeId);
        // Check cache first
        if (this.cache) {
            const cached = await this.cache.get(`${scopeId}:${entityHash}`);
            if (cached)
                return cached;
        }
        // Check persistent storage
        const existing = await this.storage.findByHash(scopeId, entityHash);
        if (existing) {
            // Populate cache
            if (this.cache) {
                await this.cache.set(`${scopeId}:${entityHash}`, existing.synthetic, this.cacheTtl);
            }
            return existing.synthetic;
        }
        // Generate new synthetic
        const synthetic = generator.generate(entity, scopeId);
        // Encrypt the original for restore
        const encryptedOriginal = this.encrypt(entity.value);
        // Store mapping
        try {
            await this.storage.create(scopeId, entity.type, entityHash, synthetic, encryptedOriginal, JSON.stringify(entity.context));
        }
        catch (err) {
            // Log but don't fail — synthetic is still returned
            console.warn('pii-guard: Failed to persist mapping:', err);
        }
        // Populate cache
        if (this.cache) {
            await this.cache.set(`${scopeId}:${entityHash}`, synthetic, this.cacheTtl);
        }
        return synthetic;
    }
    /** Reverse lookup: find the original for a synthetic value */
    async resolveOriginal(scopeId, synthetic) {
        const record = await this.storage.findBySynthetic(scopeId, synthetic);
        if (!record)
            return null;
        return this.decrypt(record.encryptedOriginal);
    }
    /** Load all mappings for a scope (synthetic -> original) */
    async loadScope(scopeId) {
        const records = await this.storage.findAllForScope(scopeId);
        const mapping = new Map();
        for (const record of records) {
            try {
                const original = this.decrypt(record.encryptedOriginal);
                mapping.set(record.synthetic, original);
            }
            catch {
                // Skip corrupted entries
                console.warn(`pii-guard: Failed to decrypt mapping for synthetic "${record.synthetic}"`);
            }
        }
        return mapping;
    }
    /** Load all mappings for a scope with entity type information */
    async loadScopeWithTypes(scopeId) {
        const records = await this.storage.findAllForScope(scopeId);
        const results = [];
        for (const record of records) {
            try {
                const original = this.decrypt(record.encryptedOriginal);
                results.push({
                    synthetic: record.synthetic,
                    original,
                    entityType: record.entityType,
                });
            }
            catch {
                console.warn(`pii-guard: Failed to decrypt mapping for synthetic "${record.synthetic}"`);
            }
        }
        return results;
    }
    /** HMAC-SHA256 hash of the original value scoped to the scopeId */
    hashEntity(value, scopeId) {
        return createHmac('sha256', this.salt + scopeId)
            .update(value)
            .digest('hex');
    }
    /** Encrypt a value with AES-256-GCM using the salt as key material */
    encrypt(plaintext) {
        const key = createHmac('sha256', this.salt).update('encryption-key').digest();
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        // Format: iv:authTag:ciphertext
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    }
    /** Decrypt a value encrypted with encrypt() */
    decrypt(ciphertext) {
        const key = createHmac('sha256', this.salt).update('encryption-key').digest();
        const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    /** Closes storage and cache connections cleanly on server shutdown */
    async shutdown() {
        await this.cache?.disconnect();
        await this.storage.disconnect();
    }
}
