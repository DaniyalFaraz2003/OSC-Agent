import { Config } from './validator';

export const defaults: Partial<Config> = {
  gemini: {
      model_tier: 'auto',
      api_key: ''
  },
  testing: {
    max_iterations: 3,
    timeout: 300,
  },
};