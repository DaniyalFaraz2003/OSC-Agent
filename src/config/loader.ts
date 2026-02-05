import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import YAML from 'yaml';
import { ConfigSchema, Config } from './validator';
import { defaults } from './defaults';

/**
 * DeepPartial allows recursive partials of Config.
 * Useful for CLI and YAML overrides.
 */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

export function loadConfig(cliOverrides: DeepPartial<Config> = {}): Config {
  dotenv.config();

  // 1. Start from defaults
  const config = structuredClone(defaults) as Record<string, unknown>;

  // 2. Merge YAML if exists
  const yamlPath = path.join(process.cwd(), 'config.yaml');
  if (fs.existsSync(yamlPath)) {
    const yamlFile = fs.readFileSync(yamlPath, 'utf8');
    const parsedYaml = YAML.parse(yamlFile);
    if (parsedYaml) {
      deepMerge(config, parsedYaml);
    }
  }

  // 3. Merge ENV only if values exist
  const envConfig = {
    github: {
      token: process.env.GITHUB_TOKEN,
    },
    gemini: {
      api_key: process.env.GEMINI_API_KEY,
      model_tier: process.env.GEMINI_MODEL_TIER,
    },
    e2b: {
      api_key: process.env.E2B_API_KEY,
    },
  };

  deepMergeDefined(config, envConfig);

  // 4. Merge CLI overrides (highest priority)
  deepMerge(config, cliOverrides as unknown as Record<string, unknown>);

  // 5. Validate
  const result = ConfigSchema.safeParse(config);

  if (!result.success) {
    throw new Error(
      'Invalid configuration:\n' +
        JSON.stringify(result.error.format(), null, 2)
    );
  }

  return result.data;
}

/** Merge all keys */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue)
    ) {
      if (!targetValue || typeof targetValue !== 'object') {
        target[key] = {};
      }
      deepMerge(
        target[key] as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      );
    } else if (sourceValue !== undefined) {
      target[key] = sourceValue;
    }
  }
}

/** Merge only defined values (for ENV) */
function deepMergeDefined(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue)
    ) {
      if (!targetValue || typeof targetValue !== 'object') {
        target[key] = {};
      }
      deepMergeDefined(
        target[key] as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      );
    } else if (sourceValue !== undefined) {
      target[key] = sourceValue;
    }
  }
}
