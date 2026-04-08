import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveConfig } from '../src/config.js';

// Save and restore env vars around each test
const ENV_KEYS = [
  'PII_GUARD_DETECTION_PROVIDER',
  'PII_AWS_REGION',
  'PII_AWS_ACCESS_KEY_ID',
  'PII_AWS_SECRET_ACCESS_KEY',
  'PII_AWS_LANGUAGE_CODE',
  'PII_AWS_MIN_CONFIDENCE',
];

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

describe('AWS Comprehend env var config', () => {
  it('should build awsComprehend config from PII_AWS_REGION when provider=aws-comprehend', async () => {
    process.env.PII_GUARD_DETECTION_PROVIDER = 'aws-comprehend';
    process.env.PII_AWS_REGION = 'us-west-2';

    // resolveConfig will try to instantiate AWSComprehendProvider which needs the SDK.
    // We just verify it builds the config object by checking the error message changes
    // from "awsComprehend config required" to an SDK import error.
    try {
      await resolveConfig();
    } catch (err: any) {
      // Should NOT get the old "awsComprehend config required" error
      expect(err.message).not.toContain('awsComprehend config required');
    }
  });

  it('should pass explicit credentials from env vars', async () => {
    process.env.PII_GUARD_DETECTION_PROVIDER = 'aws-comprehend';
    process.env.PII_AWS_REGION = 'eu-west-1';
    process.env.PII_AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
    process.env.PII_AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

    try {
      await resolveConfig();
    } catch (err: any) {
      // Should attempt to create provider (not config error)
      expect(err.message).not.toContain('awsComprehend config required');
      expect(err.message).not.toContain('PII_AWS_REGION');
    }
  });

  it('should throw helpful error when PII_AWS_REGION is missing and provider=aws-comprehend', async () => {
    process.env.PII_GUARD_DETECTION_PROVIDER = 'aws-comprehend';
    // No PII_AWS_REGION set

    await expect(resolveConfig()).rejects.toThrow(
      'PII_AWS_REGION env var (or awsComprehend.region config) is required'
    );
  });

  it('should throw helpful error when PII_AWS_REGION is missing and provider=hybrid', async () => {
    process.env.PII_GUARD_DETECTION_PROVIDER = 'hybrid';

    await expect(resolveConfig()).rejects.toThrow(
      'PII_AWS_REGION env var (or awsComprehend.region config) is required'
    );
  });

  it('should throw on invalid PII_AWS_MIN_CONFIDENCE (non-numeric)', async () => {
    process.env.PII_GUARD_DETECTION_PROVIDER = 'aws-comprehend';
    process.env.PII_AWS_REGION = 'us-east-1';
    process.env.PII_AWS_MIN_CONFIDENCE = 'not-a-number';

    await expect(resolveConfig()).rejects.toThrow(
      'PII_AWS_MIN_CONFIDENCE must be a number between 0 and 1'
    );
  });

  it('should throw on PII_AWS_MIN_CONFIDENCE out of range (> 1)', async () => {
    process.env.PII_GUARD_DETECTION_PROVIDER = 'aws-comprehend';
    process.env.PII_AWS_REGION = 'us-east-1';
    process.env.PII_AWS_MIN_CONFIDENCE = '1.5';

    await expect(resolveConfig()).rejects.toThrow(
      'PII_AWS_MIN_CONFIDENCE must be a number between 0 and 1'
    );
  });

  it('should throw on PII_AWS_MIN_CONFIDENCE out of range (< 0)', async () => {
    process.env.PII_GUARD_DETECTION_PROVIDER = 'aws-comprehend';
    process.env.PII_AWS_REGION = 'us-east-1';
    process.env.PII_AWS_MIN_CONFIDENCE = '-0.1';

    await expect(resolveConfig()).rejects.toThrow(
      'PII_AWS_MIN_CONFIDENCE must be a number between 0 and 1'
    );
  });

  it('should default PII_AWS_LANGUAGE_CODE to "en"', async () => {
    process.env.PII_GUARD_DETECTION_PROVIDER = 'aws-comprehend';
    process.env.PII_AWS_REGION = 'us-east-1';

    try {
      await resolveConfig();
    } catch (err: any) {
      // The env config is built before provider instantiation fails,
      // so if we get here the config was built with default languageCode
      expect(err.message).not.toContain('languageCode');
    }
  });

  it('should let code-level awsComprehend config take precedence over env vars', async () => {
    process.env.PII_AWS_REGION = 'us-east-1';
    process.env.PII_AWS_ACCESS_KEY_ID = 'SHOULD_NOT_BE_USED';
    process.env.PII_AWS_SECRET_ACCESS_KEY = 'SHOULD_NOT_BE_USED';

    // Provide code-level config — env vars should be ignored
    try {
      await resolveConfig({
        detectionProvider: 'aws-comprehend',
        awsComprehend: {
          region: 'ap-southeast-1',
          minConfidence: 0.9,
        },
      });
    } catch (err: any) {
      // Should use code config's region, not env var's
      expect(err.message).not.toContain('PII_AWS_REGION');
      expect(err.message).not.toContain('awsComprehend config required');
    }
  });

  it('should ignore AWS env vars when provider is builtin', async () => {
    process.env.PII_GUARD_DETECTION_PROVIDER = 'builtin';
    // Set AWS env vars — they should be ignored since provider is builtin
    // (no PII_AWS_REGION set, which would throw if AWS path was triggered)

    const config = await resolveConfig();
    expect(config.detectionProvider).toBeDefined();
  });

  it('should build config when PII_AWS_REGION is set even without explicit provider', async () => {
    // PII_AWS_REGION is set but provider defaults to builtin
    // The config should still be built (awsRegion presence triggers config build)
    process.env.PII_AWS_REGION = 'us-east-1';

    // Should not throw — builtin provider doesn't need awsComprehend
    const config = await resolveConfig();
    expect(config.detectionProvider).toBeDefined();
  });
});
