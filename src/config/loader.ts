import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import YAML from 'yaml';
import { ConfigSchema, Config } from './validator';
import { defaults } from './defaults';

export function loadConfig(cliOverrides: any = {}): Config {
  // Load .env into process.env
  dotenv.config();

  // 1. Start with Defaults
  const config: any = { ...defaults };

  // 2. Override with config.yaml (if exists)
  const yamlPath = path.join(process.cwd(), 'config.yaml');
  if (fs.existsSync(yamlPath)) {
    const yamlFile = fs.readFileSync(yamlPath, 'utf8');
    const parsedYaml = YAML.parse(yamlFile);
    deepMerge(config, parsedYaml);
  }

  // 3. Override with Environment Variables
  const envMapping = {
    github: { token: process.env.GITHUB_TOKEN },
    gemini: { 
      api_key: process.env.GEMINI_API_KEY,
      model_tier: process.env.GEMINI_MODEL_TIER 
    },
    e2b: { api_key: process.env.E2B_API_KEY },
  };
  deepMerge(config, envMapping);

  // 4. Override with CLI Arguments
  deepMerge(config, cliOverrides);

  // 5. Validate with Zod
// Inside src/config/loader.ts
const result = ConfigSchema.safeParse(config);

if (!result.success) {
  // This is what the test is looking for
  process.exit(1); 
}

return result.data;

}

/** Simple deep merge for config objects */
function deepMerge(target: any, source: any) {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined) {
      target[key] = source[key];
    }
  }
}