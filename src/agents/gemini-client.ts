/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/agents/gemini-client.ts
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { GeminiRequestOptions, GeminiResponse, UsageMetrics } from '../types/gemini';
import { ModelRouter } from './model-router';
import { CostTracker } from './cost-tracker';
import { PromptCache } from './prompt-cache';

export class GeminiClient {
  private genAI: GoogleGenerativeAI;
  private router: ModelRouter;
  private costTracker: CostTracker;
  private cache: PromptCache;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.router = new ModelRouter();
    this.costTracker = new CostTracker();
    this.cache = new PromptCache();
  }

  async generate<T = string>(prompt: string, options: GeminiRequestOptions = {}): Promise<GeminiResponse<T>> {
    // Check Cache
    if (options.useCache !== false) {
      const cached = this.cache.get<T>(prompt, options);
      if (cached) return cached;
    }

    const modelId = this.router.route(prompt, options);
    const model: GenerativeModel = this.genAI.getGenerativeModel({ model: modelId });

    const result = await this.retryOperation(async () => {
      return await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          topP: options.topP,
          topK: options.topK,
          maxOutputTokens: options.maxOutputTokens,
          stopSequences: options.stopSequences,
        },
      });
    });

    const response = result.response;
    const text = response.text() as unknown as T;

    // Usage Tracking
    const usageMetadata = response.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };
    const cost = this.costTracker.calculateCost(modelId, usageMetadata.promptTokenCount, usageMetadata.candidatesTokenCount);

    const geminiResponse: GeminiResponse<T> = {
      content: text,
      modelId,
      cached: false,
      usage: {
        promptTokens: usageMetadata.promptTokenCount,
        candidatesTokens: usageMetadata.candidatesTokenCount,
        totalTokens: usageMetadata.totalTokenCount,
        estimatedCost: cost,
        modelId,
      },
    };

    if (options.useCache !== false) {
      this.cache.set(prompt, options, geminiResponse);
    }

    return geminiResponse;
  }

  async *generateStream(prompt: string, options: GeminiRequestOptions = {}): AsyncGenerator<{ text: string; usage?: UsageMetrics }> {
    const modelId = this.router.route(prompt, options);

    const model: GenerativeModel = this.genAI.getGenerativeModel({ model: modelId });

    const result = await model.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    for await (const chunk of result.stream) {
      yield { text: chunk.text() };
    }

    // Final usage metadata from the last chunk/response
    const response = await result.response;
    const usage = response.usageMetadata;
    if (usage) {
      const cost = this.costTracker.calculateCost(modelId, usage.promptTokenCount, usage.candidatesTokenCount);
      yield {
        text: '',
        usage: {
          promptTokens: usage.promptTokenCount,
          candidatesTokens: usage.candidatesTokenCount,
          totalTokens: usage.totalTokenCount,
          estimatedCost: cost,
          modelId,
        },
      };
    }
  }

  private async retryOperation<T>(operation: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      if (retries > 0 && status && (status === 429 || status >= 500)) {
        await new Promise((res) => setTimeout(res, delay));
        return this.retryOperation(operation, retries - 1, delay * 2);
      }
      throw error;
    }
  }

  getGlobalMetrics(): ReturnType<typeof this.costTracker.getMetrics> {
    return this.costTracker.getMetrics();
  }
}
