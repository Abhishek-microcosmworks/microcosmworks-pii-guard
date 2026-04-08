import { MALE_FIRST_NAMES, FEMALE_FIRST_NAMES, NEUTRAL_FIRST_NAMES, SURNAMES } from './names.js';
import { CORPORATE_DOMAINS, PERSONAL_DOMAINS } from './domains.js';
import { STREET_NAMES } from './addresses.js';
import type { SyntheticPools } from '../types.js';

export const DEFAULT_POOLS: SyntheticPools = {
  maleFirstNames: MALE_FIRST_NAMES,
  femaleFirstNames: FEMALE_FIRST_NAMES,
  neutralFirstNames: NEUTRAL_FIRST_NAMES,
  surnames: SURNAMES,
  corporateDomains: CORPORATE_DOMAINS,
  personalDomains: PERSONAL_DOMAINS,
  streetNames: STREET_NAMES,
};

/** Merge user-provided pools with defaults */
export function mergePools(defaults: SyntheticPools, overrides?: Partial<SyntheticPools>): SyntheticPools {
  if (!overrides) return defaults;
  return { ...defaults, ...overrides };
}
