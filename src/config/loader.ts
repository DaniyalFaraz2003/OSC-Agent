import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import YAML from 'yaml';
import { ConfigSchema, Config } from './validator';
import { defaults } from './defaults';

/**
 * PartialConfig allows for recursive partials of our Config interface
 * This is useful for CLI and YAML overrides.
 */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[] ? DeepPartial<U>[] : T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function loadConfig(cliOverrides: DeepPartial<Config> = {}): Config {
  // Load .env into process.env
  dotenv.config();

  // 1. Start with Defaults
  // We cast to 'any' briefly during construction to allow merging,
  // but the final validation ensures type safety.
  const config = { ...defaults } as Config;

  // 2. Override with config.yaml (if exists)
  const yamlPath = path.join(process.cwd(), 'config.yaml');
  if (fs.existsSync(yamlPath)) {
    const yamlFile = fs.readFileSync(yamlPath, 'utf8');
    const parsedYaml = YAML.parse(yamlFile) as Record<string, unknown>;
    if (parsedYaml) {
      deepMerge(config as unknown as Record<string, unknown>, parsedYaml);
    }
  }

  // 3. Override with Environment Variables
  const envMapping = {
    github: { token: process.env.GITHUB_TOKEN },
    gemini: {
      api_key: process.env.GEMINI_API_KEY,
      model_tier: process.env.GEMINI_MODEL_TIER,
    },
    e2b: { api_key: process.env.E2B_API_KEY },
  };

  // Cast envMapping to unknown then Record to satisfy the merge function
  deepMerge(config as unknown as Record<string, unknown>, envMapping as unknown as Record<string, unknown>);

  // 4. Override with CLI Arguments
  deepMerge(config as unknown as Record<string, unknown>, cliOverrides as unknown as Record<string, unknown>);

  // 5. Validate with Zod
  const result = ConfigSchema.safeParse(config);

  if (!result.success) {
    console.error('Configuration validation failed:', result.error.format());
    process.exit(1);
  }

  return result.data;
}

/**
 * Simple deep merge for config objects.
 * Uses Record<string, unknown> to avoid 'any' errors.
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        // Ensure target has an object to merge into
        if (!targetValue || typeof targetValue !== 'object') {
          target[key] = {};
        }

        deepMerge(target[key] as Record<string, unknown>, sourceValue as Record<string, unknown>);
      } else if (sourceValue !== undefined) {
        target[key] = sourceValue;
      }
    }
  }
}
