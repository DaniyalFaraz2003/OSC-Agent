// tests/integration/agents/gemini-api.test.ts
import { GeminiClient } from '../../../src/agents/gemini-client';
import * as dotenv from 'dotenv';
dotenv.config();

describe('Gemini API Integration', () => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    it.skip('Skipping integration tests: GEMINI_API_KEY not found', () => {});
    return;
  }

  const client = new GeminiClient(apiKey);

  it('should successfully call Gemini API and return usage', async () => {
    const response = await client.generate('Say hello in one word', { taskComplexity: 'low' });
    expect(response.content).toBeDefined();
    expect(response.usage.promptTokens).toBeGreaterThan(0);
    expect(response.usage.modelId).toBe('gemini-2.5-flash-lite');
  }, 15000);

  it('should use cache for repeated requests', async () => {
    const prompt = 'Repeat the word: Avocado';
    await client.generate(prompt, { taskComplexity: 'low' });
    const secondResponse = await client.generate(prompt, { taskComplexity: 'low' });
    expect(secondResponse.cached).toBe(true);
  }, 15000);
});
