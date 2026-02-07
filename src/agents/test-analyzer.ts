import { GeminiClient } from './gemini-client';
import { TEST_ANALYSIS_PROMPT, TestRequirement } from './prompts/test-generation';

export class TestAnalyzer {
  constructor(private client: GeminiClient) {}

  async analyze(diff: string, originalCode: string): Promise<TestRequirement[]> {
    const prompt = TEST_ANALYSIS_PROMPT(diff, originalCode);
    const response = await this.client.generate(prompt, { temperature: 0.1 });

    try {
      // Strip markdown code blocks if present
      const cleanJson = response.content.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanJson) as { requirements: TestRequirement[] };
      return parsed.requirements;
    } catch (error) {
      console.error('Failed to parse test requirements JSON:', response.content);
      return [];
    }
  }
}
