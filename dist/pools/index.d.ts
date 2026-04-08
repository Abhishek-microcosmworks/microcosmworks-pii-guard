import type { SyntheticPools } from '../types.js';
export declare const DEFAULT_POOLS: SyntheticPools;
/** Merge user-provided pools with defaults */
export declare function mergePools(defaults: SyntheticPools, overrides?: Partial<SyntheticPools>): SyntheticPools;
