// src/agents/cost-tracker.ts
import { GEMINI_MODELS } from '../types/gemini';

export class CostTracker {
  private totalCost = 0;
  private totalTokens = 0;

  calculateCost(modelId: string, promptTokens: number, candidatesTokens: number): number {
    const model = GEMINI_MODELS[modelId] || GEMINI_MODELS['gemini-3-flash']!;
    const inputCost = (promptTokens / 1_000_000) * model.inputCostPer1M;
    const outputCost = (candidatesTokens / 1_000_000) * model.outputCostPer1M;
    const cost = inputCost + outputCost;

    this.totalCost += cost;
    this.totalTokens += promptTokens + candidatesTokens;

    return cost;
  }

  getMetrics(): { totalCost: number; totalTokens: number } {
    return {
      totalCost: parseFloat(this.totalCost.toFixed(6)),
      totalTokens: this.totalTokens,
    };
  }

  reset(): void {
    this.totalCost = 0;
    this.totalTokens = 0;
  }
}
