import { createHmac } from 'node:crypto';
import { ContextExtractor } from './ContextExtractor.js';
import { SyntheticGenerator } from './SyntheticGenerator.js';
import { MappingManager } from './MappingManager.js';
import { PIIType } from './types.js';
import { extractText, isWritableFormat, writeTextFile } from './file/index.js';
export class PIIGuard {
    detectionProvider;
    contextExtractor;
    syntheticGenerator;
    mappingManager;
    typeOverrides;
    constructor(config) {
        this.detectionProvider = config.detectionProvider;
        this.contextExtractor = new ContextExtractor(config.contextWindowSize);
        this.syntheticGenerator = new SyntheticGenerator(config.pools, config.salt);
        this.mappingManager = new MappingManager(config.storage, config.cache, config.salt, config.cacheTtlSeconds);
        this.typeOverrides = config.typeOverrides || {};
    }
    /** Replace PII with realistic synthetic values */
    async redact(text, opts) {
        // Step 1: Detect PII using the configured provider
        const detected = await this.detectionProvider.detect(text);
        // Convert DetectedEntity[] to PIIEntity[] (add empty context + synthetic)
        // Filter out entities where enabled === false
        const entities = detected
            .filter(d => {
            const override = this.typeOverrides[d.type];
            return override?.enabled !== false;
        })
            .map(d => {
            // Apply confidence override if set
            const override = this.typeOverrides[d.type];
            return {
                type: d.type,
                value: d.value,
                synthetic: '',
                startIndex: d.startIndex,
                endIndex: d.endIndex,
                confidence: override?.confidence ?? d.confidence,
                context: {},
            };
        });
        // Step 2: Extract context for each entity
        for (const entity of entities) {
            entity.context = this.contextExtractor.extractContext(entity, text);
        }
        // Step 3: Build relationships between entities
        this.contextExtractor.buildRelationships(entities, text);
        // Step 4: Sort by startIndex descending (replace from end to preserve indices)
        const sorted = [...entities].sort((a, b) => b.startIndex - a.startIndex);
        // Step 5: Get or create replacement for each entity (strategy-aware)
        const mapping = new Map();
        for (const entity of sorted) {
            entity.synthetic = await this.resolveReplacement(entity, opts.scopeId);
            mapping.set(entity.value, entity.synthetic);
        }
        // Step 6: For linked entities, ensure email coherence with name (only for synthetic strategy)
        for (const entity of sorted) {
            const override = this.typeOverrides[entity.type];
            const strategy = this.getStrategy(override);
            if (strategy === 'synthetic' && entity.type === PIIType.EMAIL && entity.context.relatedEntities?.length) {
                const nameIdx = entity.context.relatedEntities[0];
                const nameEntity = entities[nameIdx];
                if (nameEntity && nameEntity.synthetic) {
                    const coherentEmail = this.syntheticGenerator.generateEmail(nameEntity.synthetic, entity.context, undefined);
                    entity.synthetic = coherentEmail;
                    mapping.set(entity.value, entity.synthetic);
                }
            }
        }
        // Step 7: Replace entities in text (already sorted end-to-start)
        let resultText = text;
        for (const entity of sorted) {
            const override = this.typeOverrides[entity.type];
            const strategy = this.getStrategy(override);
            // skip strategy: leave original text in place
            if (strategy === 'skip')
                continue;
            resultText =
                resultText.slice(0, entity.startIndex) +
                    entity.synthetic +
                    resultText.slice(entity.endIndex);
        }
        // Step 8: Return result
        return {
            text: resultText,
            entities: entities.sort((a, b) => a.startIndex - b.startIndex),
            mapping,
        };
    }
    /** Replace synthetic values back to originals */
    async restore(text, opts) {
        const mappingsWithTypes = await this.mappingManager.loadScopeWithTypes(opts.scopeId);
        // Sort by synthetic value length descending (replace longest first)
        const sorted = [...mappingsWithTypes].sort((a, b) => b.synthetic.length - a.synthetic.length);
        let resultText = text;
        let resolved = 0;
        const unresolved = [];
        for (const entry of sorted) {
            if (resultText.includes(entry.synthetic)) {
                resultText = resultText.split(entry.synthetic).join(entry.original);
                resolved++;
            }
            else {
                unresolved.push(entry.synthetic);
            }
        }
        return { text: resultText, resolved, unresolved };
    }
    /** Restore known synthetics AND redact any NEW PII hallucinated by the LLM */
    async restoreAndGuard(text, opts) {
        // ── Phase 1: Restore known synthetics ──────────────────────────
        const restoreResult = await this.restore(text, opts);
        let resultText = restoreResult.text;
        // Build restored list from the mappings that were actually found
        const mappingsWithTypes = await this.mappingManager.loadScopeWithTypes(opts.scopeId);
        const restored = [];
        for (const entry of mappingsWithTypes) {
            if (text.includes(entry.synthetic)) {
                restored.push({ synthetic: entry.synthetic, original: entry.original });
            }
        }
        // ── Phase 2: Build exclusion map ───────────────────────────────
        // Track positions of restored originals so we don't re-redact them
        const exclusions = [];
        for (const entry of restored) {
            let searchFrom = 0;
            while (true) {
                const idx = resultText.indexOf(entry.original, searchFrom);
                if (idx === -1)
                    break;
                exclusions.push({ start: idx, end: idx + entry.original.length });
                searchFrom = idx + entry.original.length;
            }
        }
        // ── Phase 3: Guard — detect and redact NEW PII ─────────────────
        const detected = await this.detectionProvider.detect(resultText);
        // Filter: enabled types only, exclude overlaps with restored originals
        const newEntities = detected
            .filter(d => {
            const override = this.typeOverrides[d.type];
            if (override?.enabled === false)
                return false;
            // Exclude entities overlapping restored positions
            return !exclusions.some(ex => this.rangesOverlap(d.startIndex, d.endIndex, ex.start, ex.end));
        })
            .map(d => {
            const override = this.typeOverrides[d.type];
            return {
                type: d.type,
                value: d.value,
                synthetic: '',
                startIndex: d.startIndex,
                endIndex: d.endIndex,
                confidence: override?.confidence ?? d.confidence,
                context: {},
            };
        });
        // Extract context for new entities
        for (const entity of newEntities) {
            entity.context = this.contextExtractor.extractContext(entity, resultText);
        }
        this.contextExtractor.buildRelationships(newEntities, resultText);
        // Sort descending by startIndex (replace from end to preserve indices)
        const sorted = [...newEntities].sort((a, b) => b.startIndex - a.startIndex);
        // Generate synthetics and replace
        for (const entity of sorted) {
            const override = this.typeOverrides[entity.type];
            const strategy = this.getStrategy(override);
            if (strategy === 'skip')
                continue;
            entity.synthetic = await this.resolveReplacement(entity, opts.scopeId);
        }
        for (const entity of sorted) {
            const override = this.typeOverrides[entity.type];
            const strategy = this.getStrategy(override);
            if (strategy === 'skip')
                continue;
            resultText =
                resultText.slice(0, entity.startIndex) +
                    entity.synthetic +
                    resultText.slice(entity.endIndex);
        }
        return {
            text: resultText,
            restored,
            guarded: newEntities.sort((a, b) => a.startIndex - b.startIndex),
            unresolved: restoreResult.unresolved,
        };
    }
    rangesOverlap(s1, e1, s2, e2) {
        return s1 < e2 && s2 < e1;
    }
    /** Same as redact — consistent synthetics ensure vector search works */
    async redactForEmbedding(text, opts) {
        return this.redact(text, opts);
    }
    /** Detection only — scan without replacing */
    async detect(text) {
        const detected = await this.detectionProvider.detect(text);
        return detected
            .filter(d => {
            const override = this.typeOverrides[d.type];
            return override?.enabled !== false;
        })
            .map(d => {
            const override = this.typeOverrides[d.type];
            return {
                type: d.type,
                value: d.value,
                synthetic: '',
                startIndex: d.startIndex,
                endIndex: d.endIndex,
                confidence: override?.confidence ?? d.confidence,
                context: {},
            };
        });
    }
    /** Redact PII in a file (path or Buffer) */
    async redactFile(input, opts) {
        // Early validation: if format is known and outputPath is set, check writability upfront
        if (opts.outputPath && opts.format && !isWritableFormat(opts.format)) {
            throw new Error(`Cannot write output for format "${opts.format}". Only text-based formats support outputPath.`);
        }
        const extraction = await extractText(input, {
            format: opts.format,
            encoding: opts.encoding,
        });
        const redactResult = await this.redact(extraction.text, { scopeId: opts.scopeId });
        if (opts.outputPath) {
            if (!isWritableFormat(extraction.format)) {
                throw new Error(`Cannot write output for format "${extraction.format}". Only text-based formats support outputPath.`);
            }
            await writeTextFile(opts.outputPath, redactResult.text, opts.encoding);
        }
        return {
            ...redactResult,
            format: extraction.format,
            source: extraction.source,
            outputPath: opts.outputPath,
        };
    }
    /** Detect PII in a file (path or Buffer) without replacing */
    async detectFile(input, opts) {
        const extraction = await extractText(input, {
            format: opts?.format,
            encoding: opts?.encoding,
        });
        const entities = await this.detect(extraction.text);
        return {
            entities,
            format: extraction.format,
            source: extraction.source,
            extractedText: extraction.text,
        };
    }
    /** Redact a file for embedding — delegates to redactFile */
    async redactFileForEmbedding(input, opts) {
        return this.redactFile(input, opts);
    }
    getStrategy(override) {
        if (!override?.strategy)
            return 'synthetic';
        if (typeof override.strategy === 'function')
            return 'function';
        return override.strategy;
    }
    async resolveReplacement(entity, scopeId) {
        const override = this.typeOverrides[entity.type];
        const strategy = this.getStrategy(override);
        switch (strategy) {
            case 'synthetic':
                return this.mappingManager.getOrCreate(scopeId, entity, this.syntheticGenerator);
            case 'mask':
                return (override?.maskLabel || `[${entity.type}_REDACTED]`).replace(/\{TYPE\}/g, entity.type);
            case 'hash':
                return `[HASH-${createHmac('sha256', scopeId).update(entity.value).digest('hex').slice(0, 8).toUpperCase()}]`;
            case 'skip':
                return entity.value;
            case 'function':
                return typeof override?.strategy === 'function' ? override.strategy(entity.value, entity) : entity.value;
        }
    }
    /** Health check for storage and cache connectivity */
    async healthCheck() {
        // Basic check: try to read a non-existent key
        let database = false;
        let cache = false;
        try {
            await this.mappingManager.loadScope('__health_check__');
            database = true;
        }
        catch {
            database = false;
        }
        // Cache health is assumed true for in-memory
        cache = true;
        return { database, cache };
    }
    /** Clean shutdown of all connections */
    async shutdown() {
        await this.detectionProvider.shutdown?.();
        await this.mappingManager.shutdown();
    }
}
