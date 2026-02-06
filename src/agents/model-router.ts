// src/agents/model-router.ts
import { GEMINI_MODELS, GeminiRequestOptions, ModelTier } from '../types/gemini';

export class ModelRouter {
  route(prompt: string, options: GeminiRequestOptions): string {
    // 1. Respect explicit model tier if provided
    if (options.modelTier) {
      return this.getModelByTier(options.modelTier);
    }

    // 2. Route by complexity
    if (options.taskComplexity === 'high') return 'gemini-3-pro';
    if (options.taskComplexity === 'low') return 'gemini-2.5-flash-lite';

    // 3. Heuristic routing based on prompt length and content
    const wordCount = prompt.split(/\s+/).length;

    // Heuristic: Long prompts or specific keywords suggest complexity
    const isComplex = wordCount > 1000 || /reason|analyze|complex|architect|optimize|debug/i.test(prompt);

    if (isComplex) return 'gemini-3-pro';

    // Default to a balanced model
    return 'gemini-3-flash';
  }

  private getModelByTier(tier: ModelTier): string {
    const model = Object.values(GEMINI_MODELS).find((m) => m.tier === tier);
    return model?.id || 'gemini-3-flash';
  }
}
