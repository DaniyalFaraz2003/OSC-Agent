// src/agents/prompt-cache.ts
import { GeminiResponse } from '../types/gemini';
import crypto from 'crypto';

export class PromptCache {
  private cache = new Map<string, { response: GeminiResponse<unknown>; expires: number }>();
  private readonly ttl: number;

  constructor(ttlSeconds = 3600) {
    this.ttl = ttlSeconds * 1000;
  }

  private generateKey(prompt: string, options: unknown): string {
    const data = JSON.stringify({ prompt, options });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  get<T>(prompt: string, options: unknown): GeminiResponse<T> | null {
    const key = this.generateKey(prompt, options);
    const cached = this.cache.get(key);

    if (cached && cached.expires > Date.now()) {
      return cached.response as GeminiResponse<T>;
    }

    if (cached) this.cache.delete(key);
    return null;
  }

  set<T>(prompt: string, options: unknown, response: GeminiResponse<T>): void {
    const key = this.generateKey(prompt, options);
    this.cache.set(key, {
      response: { ...response, cached: true },
      expires: Date.now() + this.ttl,
    });
  }

  clear(): void {
    this.cache.clear();
  }
}
