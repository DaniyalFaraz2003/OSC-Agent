import { GeminiClient } from './gemini-client';
import { TestAnalyzer } from './test-analyzer';
import { TEST_GENERATION_PROMPT } from './prompts/test-generation';

export interface GeneratedTestFile {
  filePath: string;
  content: string;
}

export class TestGenerator {
  private analyzer: TestAnalyzer;

  constructor(private client: GeminiClient) {
    this.analyzer = new TestAnalyzer(client);
  }

  async generateTests(params: { diff: string; originalCode: string; filePath: string }): Promise<GeneratedTestFile> {
    // 1. Analyze the fix to determine test requirements
    const requirements = await this.analyzer.analyze(params.diff, params.originalCode);

    const testBlocks: string[] = [];

    // 2. Generate test code for each function/requirement identified
    for (const req of requirements) {
      const prompt = TEST_GENERATION_PROMPT(req, params.originalCode);
      const response = await this.client.generate(prompt, {
        temperature: 0.2, // Lower temperature for more consistent code generation
      });

      // Clean up markdown wrapping from LLM
      const cleanCode = response.content.replace(/```typescript|```ts|```/g, '').trim();
      testBlocks.push(cleanCode);
    }

    // 3. Construct the test file name (e.g., service.ts -> service.test.ts)
    const testFilePath = params.filePath.replace(/\.(ts|js)$/, '.test.$1');

    return {
      filePath: testFilePath,
      content: testBlocks.join('\n\n'),
    };
  }
}
