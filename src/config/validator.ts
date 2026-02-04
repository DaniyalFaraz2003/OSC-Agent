import { z } from 'zod';


export const ConfigSchema = z.object({
  github: z.object({
    token: z.string().min(1, "GitHub token is required"),
  }),
  gemini: z.object({
    api_key: z.string().min(1, "Gemini API key is required"),
    model_tier: z.enum(['auto', 'basic', 'advanced']).default('auto'),
  }),
  e2b: z.object({
    api_key: z.string().min(1, "E2B API key is required"),
  }),
  testing: z.object({
    max_iterations: z.number().int().positive().default(3),
    timeout: z.number().positive().default(300),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;