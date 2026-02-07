import { GeminiClient } from './gemini-client';
import { createReviewPrompt } from './prompts/code-review';

export interface ReviewResult {
  approved: boolean;
  summary: string;
  issues: Array<{
    type: 'bug' | 'style' | 'logic' | 'edge-case';
    description: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  suggestions: string[];
}

export class CodeReviewerAgent {
  constructor(private geminiClient: GeminiClient) {}

  async review(issue: string, fix: string): Promise<ReviewResult> {
    const prompt = createReviewPrompt(issue, fix);

    try {
      const response = await this.geminiClient.generate<string>(prompt, {
        temperature: 0.1, // Low temperature for consistent structural output
      });

      // Extract JSON from response (handling potential markdown code blocks)
      const cleanJson: string = response.content.replace(/```json|```/g, '').trim();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result: ReviewResult = JSON.parse(cleanJson);

      return result;
    } catch (error) {
      console.error('Code Reviewer Error:', error);
      return {
        approved: false,
        summary: 'The automated review encountered an error.',
        issues: [
          {
            type: 'logic',
            description: `Failed to parse LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`,
            severity: 'high',
          },
        ],
        suggestions: ['Perform manual review of the fix.'],
      };
    }
  }
}
