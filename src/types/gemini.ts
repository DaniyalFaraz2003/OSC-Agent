// src/types/gemini.ts

export type ModelTier = 'flash-lite' | 'flash' | 'pro' | 'ultra';

export interface GeminiModelConfig {
  id: string;
  tier: ModelTier;
  inputCostPer1M: number;
  outputCostPer1M: number;
  contextWindow: number;
  maxOutputTokens: number;
}

export interface UsageMetrics {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  estimatedCost: number;
  modelId: string;
}

export interface GeminiResponse<T = string> {
  content: T;
  usage: UsageMetrics;
  modelId: string;
  cached: boolean;
}

export interface GeminiRequestOptions {
  modelTier?: ModelTier;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  stream?: boolean;
  useCache?: boolean;
  taskComplexity?: 'low' | 'medium' | 'high';
}

export const GEMINI_MODELS: Record<string, GeminiModelConfig> = {
  'gemini-2.5-flash-lite': {
    id: 'gemini-2.5-flash-lite',
    tier: 'flash-lite',
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    contextWindow: 1048576,
    maxOutputTokens: 8192,
  },
  'gemini-3-flash': {
    id: 'gemini-3-flash',
    tier: 'flash',
    inputCostPer1M: 0.5,
    outputCostPer1M: 3.0,
    contextWindow: 1048576,
    maxOutputTokens: 8192,
  },
  'gemini-3-pro': {
    id: 'gemini-3-pro',
    tier: 'pro',
    inputCostPer1M: 2.0,
    outputCostPer1M: 12.0,
    contextWindow: 2097152,
    maxOutputTokens: 8192,
  },
};
