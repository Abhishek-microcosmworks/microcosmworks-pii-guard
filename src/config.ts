import { randomBytes } from 'node:crypto';
import type { PIIGuardConfig, ResolvedConfig, PIIPatternConfig, AWSComprehendConfig, TypeOverrideConfig } from './types.js';
import type { DetectionProvider } from './detection/DetectionProvider.js';
import { BuiltInProvider } from './detection/BuiltInProvider.js';
import { AWSComprehendProvider } from './detection/AWSComprehendProvider.js';
import { HybridProvider } from './detection/HybridProvider.js';
import { DEFAULT_PATTERNS } from './patterns.js';
import { DEFAULT_POOLS, mergePools } from './pools/index.js';
import { InMemoryAdapter } from './storage/InMemoryAdapter.js';
import { InMemoryCache } from './cache/InMemoryCache.js';

function isDetectionProviderInstance(value: unknown): value is DetectionProvider {
  return (
    typeof value === 'object' &&
    value !== null &&
    'detect' in value &&
    typeof (value as any).detect === 'function'
  );
}

/** Resolve a string provider name to a DetectionProvider instance */
function resolveProviderByName(
  name: string,
  config: PIIGuardConfig | undefined,
  patterns: PIIPatternConfig[],
  documentTypes: string[]
): DetectionProvider {
  if (name === 'builtin') {
    return new BuiltInProvider(patterns, documentTypes);
  }
  if (name === 'aws-comprehend') {
    if (!config?.awsComprehend) {
      throw new Error('pii-guard: awsComprehend config required when using aws-comprehend provider');
    }
    return new AWSComprehendProvider(config.awsComprehend);
  }
  throw new Error(`pii-guard: Unknown detection provider "${name}"`);
}

export async function resolveConfig(config?: PIIGuardConfig): Promise<ResolvedConfig> {
  // 1. Load .env if available
  try {
    const dotenv = await import('dotenv');
    dotenv.config();
  } catch {
    // dotenv not available — that's fine, env vars may already be set
  }

  // 2. Resolve database type
  const dbType = config?.dbType || process.env.PII_GUARD_DB_TYPE || 'postgresql';

  // 3. Resolve Redis (optional)
  const redisUrl = config?.redisUrl || process.env.PII_REDIS_URL;

  // 4. Resolve salt
  const salt = config?.salt || process.env.PII_GUARD_SALT || randomBytes(32).toString('hex');

  // 5. Build storage adapter
  let storage = config?.storage;
  if (!storage) {
    if (dbType === 'mongodb') {
      const mongoUri = config?.mongoUri || process.env.PII_MONGODB_URI;
      if (!mongoUri) {
        throw new Error("pii-guard: PII_MONGODB_URI required when dbType is 'mongodb'");
      }
      try {
        const { MongooseAdapter } = await import('./storage/MongooseAdapter.js');
        storage = new MongooseAdapter(mongoUri);
      } catch (err: any) {
        if (err?.message?.includes('pii-guard:')) throw err;
        console.warn('pii-guard: Failed to initialize MongooseAdapter, falling back to InMemoryAdapter');
        storage = new InMemoryAdapter();
      }
    } else {
      const databaseUrl = config?.databaseUrl || process.env.PII_DATABASE_URL;
      if (databaseUrl) {
        try {
          const { KnexAdapter } = await import('./storage/KnexAdapter.js');
          storage = new KnexAdapter(databaseUrl);
        } catch (err: any) {
          if (err?.message?.includes('pii-guard:')) throw err;
          console.warn('pii-guard: Failed to initialize KnexAdapter, falling back to InMemoryAdapter');
          storage = new InMemoryAdapter();
        }
      } else {
        storage = new InMemoryAdapter();
      }
    }
  }

  // 6. Build cache adapter
  let cache = config?.cache;
  if (!cache) {
    if (redisUrl) {
      try {
        const { RedisAdapter } = await import('./cache/RedisAdapter.js');
        cache = new RedisAdapter(redisUrl);
      } catch {
        console.warn('pii-guard: Failed to initialize RedisAdapter, falling back to InMemoryCache');
        cache = new InMemoryCache();
      }
    } else {
      cache = new InMemoryCache();
    }
  }

  // 7. Merge patterns
  let patterns = [...DEFAULT_PATTERNS, ...(config?.patterns || [])];

  // 8. Merge pools
  const pools = mergePools(DEFAULT_POOLS, config?.pools);

  // 9. Document types
  const documentTypes = config?.documentTypes || ['general'];

  // 10. Context window size
  const contextWindowSize = config?.contextWindowSize ?? 50;

  // 11. Cache TTL
  const cacheTtlSeconds = config?.cacheTtlSeconds ?? 3600;

  // 12. Resolve typeOverrides and apply pattern overrides
  const typeOverrides: Record<string, TypeOverrideConfig> = config?.typeOverrides || {};
  patterns = applyPatternOverrides(patterns, typeOverrides);

  // 13. Resolve detection provider (from env var or config)
  const providerSetting = config?.detectionProvider
    || process.env.PII_GUARD_DETECTION_PROVIDER
    || 'builtin';

  // 14. Build AWS Comprehend config from env vars if not provided in code
  let effectiveConfig = config;
  if (!effectiveConfig?.awsComprehend) {
    const awsRegion = process.env.PII_AWS_REGION;
    const providerName = typeof providerSetting === 'string' ? providerSetting : '';
    const hybridProviders = effectiveConfig?.hybridDetection?.providers || [];
    const hybridNeedsAws = providerName === 'hybrid'
      && (hybridProviders.length === 0 || hybridProviders.includes('aws-comprehend'));
    const needsAws = providerName === 'aws-comprehend' || hybridNeedsAws;

    if (awsRegion || needsAws) {
      if (!awsRegion) {
        throw new Error(
          'pii-guard: PII_AWS_REGION env var (or awsComprehend.region config) is required ' +
          'when using aws-comprehend or hybrid detection provider'
        );
      }

      // Validate PII_AWS_MIN_CONFIDENCE
      let minConfidence = 0.8;
      const minConfidenceEnv = process.env.PII_AWS_MIN_CONFIDENCE;
      if (minConfidenceEnv !== undefined && minConfidenceEnv !== '') {
        const parsed = parseFloat(minConfidenceEnv);
        if (isNaN(parsed) || parsed < 0 || parsed > 1) {
          throw new Error(
            'pii-guard: PII_AWS_MIN_CONFIDENCE must be a number between 0 and 1, ' +
            `got "${minConfidenceEnv}"`
          );
        }
        minConfidence = parsed;
      }

      const awsComprehendFromEnv: AWSComprehendConfig = {
        region: awsRegion,
        languageCode: process.env.PII_AWS_LANGUAGE_CODE || 'en',
        minConfidence,
      };

      // Include explicit credentials only if both are provided
      const accessKeyId = process.env.PII_AWS_ACCESS_KEY_ID;
      const secretAccessKey = process.env.PII_AWS_SECRET_ACCESS_KEY;
      if (accessKeyId && secretAccessKey) {
        awsComprehendFromEnv.credentials = { accessKeyId, secretAccessKey };
      }

      effectiveConfig = { ...effectiveConfig, awsComprehend: awsComprehendFromEnv };
    }
  }

  let detectionProvider: DetectionProvider;

  if (isDetectionProviderInstance(providerSetting)) {
    // Custom provider instance passed directly
    detectionProvider = providerSetting;
  } else if (providerSetting === 'hybrid') {
    // Build hybrid from sub-providers
    const subProviderNames = effectiveConfig?.hybridDetection?.providers || ['builtin', 'aws-comprehend'];
    const subProviders = subProviderNames.map(p => {
      if (isDetectionProviderInstance(p)) return p;
      return resolveProviderByName(p as string, effectiveConfig, patterns, documentTypes);
    });
    const strategy = effectiveConfig?.hybridDetection?.strategy || 'union';
    detectionProvider = new HybridProvider(subProviders, strategy);
  } else {
    detectionProvider = resolveProviderByName(providerSetting as string, effectiveConfig, patterns, documentTypes);
  }

  return {
    storage,
    cache,
    patterns,
    pools,
    salt,
    cacheTtlSeconds,
    contextWindowSize,
    documentTypes,
    detectionProvider,
    typeOverrides,
  };
}

/** Apply typeOverrides pattern settings to the patterns array */
function applyPatternOverrides(
  patterns: PIIPatternConfig[],
  typeOverrides: Record<string, TypeOverrideConfig>
): PIIPatternConfig[] {
  if (!typeOverrides || Object.keys(typeOverrides).length === 0) return patterns;

  let result = [...patterns];

  for (const [type, override] of Object.entries(typeOverrides)) {
    // enabled: false → remove all patterns for this type
    if (override.enabled === false) {
      result = result.filter(p => p.type !== type);
      continue;
    }

    // patterns set → replace default patterns for this type
    if (override.patterns) {
      result = result.filter(p => p.type !== type);
      result.push(...override.patterns);
    }

    // addPatterns set → append additional patterns
    if (override.addPatterns) {
      result.push(...override.addPatterns);
    }
  }

  return result;
}
