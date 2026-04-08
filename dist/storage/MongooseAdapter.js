/**
 * MongoDB storage adapter via Mongoose.
 * Uses a dedicated connection (not the global mongoose.connect()) to avoid conflicts.
 */
export class MongooseAdapter {
    connection;
    model;
    initPromise;
    constructor(mongoUri) {
        this.initPromise = this.initMongoose(mongoUri);
    }
    async initMongoose(mongoUri) {
        try {
            const mongoose = await import('mongoose');
            this.connection = mongoose.createConnection(mongoUri);
            const schema = new mongoose.Schema({
                scopeId: { type: String, required: true },
                entityType: { type: String, required: true },
                entityHash: { type: String, required: true },
                synthetic: { type: String, required: true },
                encryptedOriginal: { type: String, required: true },
                contextJson: { type: String, default: null },
            }, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
            schema.index({ scopeId: 1, entityHash: 1 }, { unique: true });
            schema.index({ scopeId: 1, synthetic: 1 });
            schema.index({ scopeId: 1, entityType: 1 });
            this.model = this.connection.model('SyntheticMap', schema);
        }
        catch {
            throw new Error('pii-guard: mongoose is required for MongoDB storage. ' +
                'Run: npm install mongoose');
        }
    }
    async ready() {
        await this.initPromise;
    }
    async findByHash(scopeId, entityHash) {
        await this.ready();
        const doc = await this.model.findOne({ scopeId, entityHash }, { synthetic: 1, entityType: 1, _id: 0 }).lean();
        return doc ?? null;
    }
    async create(scopeId, entityType, entityHash, synthetic, encryptedOriginal, contextJson) {
        await this.ready();
        await this.model.create({
            scopeId,
            entityType,
            entityHash,
            synthetic,
            encryptedOriginal,
            contextJson: contextJson ?? null,
        });
    }
    async findBySynthetic(scopeId, synthetic) {
        await this.ready();
        const doc = await this.model.findOne({ scopeId, synthetic }, { entityHash: 1, entityType: 1, encryptedOriginal: 1, _id: 0 }).lean();
        return doc ?? null;
    }
    async findAllForScope(scopeId) {
        await this.ready();
        const docs = await this.model.find({ scopeId }, { synthetic: 1, entityType: 1, encryptedOriginal: 1, _id: 0 }).lean();
        return docs;
    }
    async disconnect() {
        await this.initPromise;
        if (this.connection) {
            await this.connection.close();
        }
    }
}
