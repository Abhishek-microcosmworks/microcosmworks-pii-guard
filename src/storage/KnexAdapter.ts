import { randomBytes } from 'node:crypto';
import type { StorageAdapter } from '../types.js';

/**
 * SQL storage adapter via Knex query builder.
 * Supports PostgreSQL and MySQL. Auto-creates the synthetic_maps table on first use.
 */
export class KnexAdapter implements StorageAdapter {
  private knex: any;
  private tableReady = false;
  private initPromise: Promise<void> | null = null;

  constructor(databaseUrl: string, poolConfig?: { min?: number; max?: number }) {
    this.initPromise = this.initKnex(databaseUrl, poolConfig);
  }

  private async initKnex(
    databaseUrl: string,
    poolConfig?: { min?: number; max?: number },
  ): Promise<void> {
    let client: string;
    if (databaseUrl.startsWith('mysql://') || databaseUrl.startsWith('mysql2://')) {
      client = 'mysql2';
    } else if (databaseUrl.startsWith('sqlite:') || databaseUrl === ':memory:') {
      client = 'better-sqlite3';
    } else {
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
    } catch {
      throw new Error(
        `pii-guard: knex and ${client} are required for SQL storage. ` +
        `Run: npm install knex ${client}`
      );
    }
  }

  private async ensureTable(): Promise<void> {
    if (this.tableReady) return;
    if (this.initPromise) {
      await this.initPromise;
      this.initPromise = null;
    }
    const exists = await this.knex.schema.hasTable('synthetic_maps');
    if (!exists) {
      await this.knex.schema.createTable('synthetic_maps', (t: any) => {
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

  private generateId(): string {
    return randomBytes(16).toString('hex');
  }

  async findByHash(scopeId: string, entityHash: string) {
    await this.ensureTable();
    const row = await this.knex('synthetic_maps')
      .select('synthetic', 'entity_type as entityType')
      .where({ scope_id: scopeId, entity_hash: entityHash })
      .first();
    return row ?? null;
  }

  async create(
    scopeId: string,
    entityType: string,
    entityHash: string,
    synthetic: string,
    encryptedOriginal: string,
    contextJson?: string,
  ) {
    await this.ensureTable();
    await this.knex('synthetic_maps').insert({
      id: this.generateId(),
      scope_id: scopeId,
      entity_type: entityType,
      entity_hash: entityHash,
      synthetic,
      encrypted_original: encryptedOriginal,
      context_json: contextJson ?? null,
    });
  }

  async findBySynthetic(scopeId: string, synthetic: string) {
    await this.ensureTable();
    const row = await this.knex('synthetic_maps')
      .select(
        'entity_hash as entityHash',
        'entity_type as entityType',
        'encrypted_original as encryptedOriginal',
      )
      .where({ scope_id: scopeId, synthetic })
      .first();
    return row ?? null;
  }

  async findAllForScope(scopeId: string) {
    await this.ensureTable();
    const rows = await this.knex('synthetic_maps')
      .select(
        'synthetic',
        'entity_type as entityType',
        'encrypted_original as encryptedOriginal',
      )
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
