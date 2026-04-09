import { randomBytes } from 'node:crypto';
/**
 * SQL storage adapter via Knex query builder.
 * Supports PostgreSQL and MySQL. Auto-creates the synthetic_maps table on first use.
 */
export class KnexAdapter {
    knex;
    tableReady = false;
    initPromise = null;
    constructor(databaseUrl, poolConfig) {
        this.initPromise = this.initKnex(databaseUrl, poolConfig);
    }
    async initKnex(databaseUrl, poolConfig) {
        let client;
        if (databaseUrl.startsWith('mysql://') || databaseUrl.startsWith('mysql2://')) {
            client = 'mysql2';
        }
        else if (databaseUrl.startsWith('sqlite:') || databaseUrl === ':memory:') {
            client = 'better-sqlite3';
        }
        else {
            client = 'pg';
        }
        try {
            const knexModule = await import('knex');
            const knexFactory = knexModule.default ?? knexModule;
            this.knex = knexFactory({
                client,
                connection: client === 'better-sqlite3'
                    ? { filename: databaseUrl === ':memory:' ? ':memory:' : databaseUrl.replace('sqlite:', '') }
                    : databaseUrl,
                useNullAsDefault: client === 'better-sqlite3',
                pool: poolConfig ?? { min: 0, max: 3 },
            });
        }
        catch {
            throw new Error(`pii-guard: knex and ${client} are required for SQL storage. ` +
                `Run: npm install knex ${client}`);
        }
    }
    async ensureTable() {
        if (this.tableReady)
            return;
        if (this.initPromise) {
            await this.initPromise;
            this.initPromise = null;
        }
        const exists = await this.knex.schema.hasTable('SyntheticMap');
        if (!exists) {
            await this.knex.schema.createTable('SyntheticMap', (t) => {
                t.string('id').primary();
                t.string('scope_id').notNullable();
                t.string('entity_type').notNullable();
                t.string('entity_hash').notNullable();
                t.string('synthetic').notNullable();
                t.text('encrypted_original').notNullable();
                t.text('context_json').nullable();
                t.timestamp('created_at').defaultTo(this.knex.fn.now());
                t.unique(['scope_id', 'entity_hash']);
                t.index(['scope_id', 'synthetic']);
                t.index(['scope_id', 'entity_type']);
            });
        }
        this.tableReady = true;
    }
    generateId() {
        return randomBytes(16).toString('hex');
    }
    async findByHash(scopeId, entityHash) {
        await this.ensureTable();
        const row = await this.knex('SyntheticMap')
            .select('synthetic', 'entity_type as entityType')
            .where({ scope_id: scopeId, entity_hash: entityHash })
            .first();
        return row ?? null;
    }
    async create(scopeId, entityType, entityHash, synthetic, encryptedOriginal, contextJson) {
        await this.ensureTable();
        await this.knex('SyntheticMap').insert({
            id: this.generateId(),
            scope_id: scopeId,
            entity_type: entityType,
            entity_hash: entityHash,
            synthetic,
            encrypted_original: encryptedOriginal,
            context_json: contextJson ?? null,
        });
    }
    async findBySynthetic(scopeId, synthetic) {
        await this.ensureTable();
        const row = await this.knex('SyntheticMap')
            .select('entity_hash as entityHash', 'entity_type as entityType', 'encrypted_original as encryptedOriginal')
            .where({ scope_id: scopeId, synthetic })
            .first();
        return row ?? null;
    }
    async findAllForScope(scopeId) {
        await this.ensureTable();
        const rows = await this.knex('SyntheticMap')
            .select('synthetic', 'entity_type as entityType', 'encrypted_original as encryptedOriginal')
            .where({ scope_id: scopeId });
        return rows;
    }
    async disconnect() {
        if (this.initPromise) {
            await this.initPromise;
            this.initPromise = null;
        }
        if (this.knex) {
            await this.knex.destroy();
        }
    }
}
