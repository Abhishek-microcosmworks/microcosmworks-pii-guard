import type { DetectionProvider, DetectionOptions, DetectedEntity } from './DetectionProvider.js';

/**
 * Combines multiple detection providers for maximum coverage.
 *
 * Strategies:
 * - `union`: Merge all results, deduplicate overlapping spans (keep highest confidence).
 * - `highest-confidence`: For overlapping spans, keep only the entity with the highest confidence score.
 *
 * Useful for running regex (fast, catches structured patterns like SSN/credit cards well)
 * + Comprehend (catches names/addresses better) together.
 */
export class HybridProvider implements DetectionProvider {
  readonly name = 'hybrid';

  private providers: DetectionProvider[];
  private strategy: 'union' | 'highest-confidence';

  constructor(
    providers: DetectionProvider[],
    strategy: 'union' | 'highest-confidence' = 'union'
  ) {
    if (providers.length === 0) {
      throw new Error('pii-guard: HybridProvider requires at least one sub-provider');
    }
    this.providers = providers;
    this.strategy = strategy;
  }

  async detect(text: string, options?: DetectionOptions): Promise<DetectedEntity[]> {
    // Run all providers in parallel
    const results = await Promise.all(
      this.providers.map(provider => provider.detect(text, options))
    );

    // Flatten all entities
    const allEntities = results.flat();

    if (allEntities.length === 0) return [];

    // Sort by start index, then by confidence descending
    allEntities.sort((a, b) =>
      a.startIndex - b.startIndex || b.confidence - a.confidence
    );

    if (this.strategy === 'highest-confidence') {
      return this.deduplicateHighestConfidence(allEntities);
    }

    // 'union' strategy: merge all, deduplicate overlapping spans
    return this.deduplicateUnion(allEntities);
  }

  async shutdown(): Promise<void> {
    await Promise.all(
      this.providers.map(p => p.shutdown?.())
    );
  }

  /**
   * Union strategy: keep all non-overlapping entities.
   * For overlapping spans, keep the one with highest confidence.
   */
  private deduplicateUnion(entities: DetectedEntity[]): DetectedEntity[] {
    const result: DetectedEntity[] = [];

    for (const entity of entities) {
      const overlapIdx = result.findIndex(
        existing => this.spansOverlap(existing, entity)
      );

      if (overlapIdx === -1) {
        // No overlap — include this entity
        result.push(entity);
      } else {
        // Overlapping — keep higher confidence
        if (entity.confidence > result[overlapIdx].confidence) {
          result[overlapIdx] = entity;
        }
      }
    }

    return result.sort((a, b) => a.startIndex - b.startIndex);
  }

  /**
   * Highest-confidence strategy: for any overlapping spans,
   * keep only the entity with the highest confidence.
   */
  private deduplicateHighestConfidence(entities: DetectedEntity[]): DetectedEntity[] {
    // Same logic as union for deduplication
    return this.deduplicateUnion(entities);
  }

  /** Check if two entity spans overlap */
  private spansOverlap(a: DetectedEntity, b: DetectedEntity): boolean {
    return a.startIndex < b.endIndex && b.startIndex < a.endIndex;
  }
}
