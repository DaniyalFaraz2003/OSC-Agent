/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import fs from 'node:fs';
import path from 'node:path';
import { GeminiClient } from './gemini-client';
import { getFixGenerationPrompt, FixStrategy } from './prompts/fix-generation';
import { ContextBuilder, CodeSearchResult } from './context-builder';
import { CodeChange, DiffGenerator } from './diff-generator';

export interface FixProposal {
  explanation: string;
  confidenceScore: number;
  patches: string[];
  strategy: FixStrategy;
  usage?: unknown; // To pass through Gemini usage metrics
}

export class FixGenerator {
  constructor(private client: GeminiClient) {}

  async generateFix(issueDescription: string, analysis: string, searchResults: CodeSearchResult[], strategy: FixStrategy = 'minimal'): Promise<FixProposal> {
    const context = ContextBuilder.build(issueDescription, analysis, searchResults);
    const prompt = getFixGenerationPrompt(issueDescription, analysis, context, strategy);

    // Call your GeminiClient
    const response = await this.client.generate(prompt, {
      temperature: 0.2, // Low temperature for consistent code generation
      useCache: true,
    });

    const parsedOutput = this.parseResponse(response.content);

    // Build patches — supports both modifying existing files and creating new ones.
    const patches: string[] = [];

    for (const change of (parsedOutput.changes ?? []) as CodeChange[]) {
      // 1. Try search results first (already cached in memory)
      let fullContent: string | undefined = searchResults.find((r) => r.filePath === change.filePath)?.content;

      // 2. Fallback: try reading the file from disk (covers files that exist
      //    but weren't included in search results)
      if (fullContent === undefined) {
        try {
          fullContent = fs.readFileSync(path.resolve(process.cwd(), change.filePath), 'utf8');
        } catch {
          // File doesn't exist — will be treated as new-file creation by DiffGenerator
          fullContent = '';
        }
      }

      try {
        const patch = DiffGenerator.generate(change, fullContent);
        if (patch) {
          patches.push(patch);
        }
      } catch (e) {
        console.error(`Diff failed for ${change.filePath}:`, e);
      }
    }

    return {
      explanation: parsedOutput.explanation,
      confidenceScore: parsedOutput.confidenceScore,
      patches,
      strategy,
      usage: response.usage,
    };
  }

  private parseResponse(content: string) {
    try {
      // Remove markdown code blocks if Gemini accidentally included them
      const cleaned = content.replace(/```json|```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      throw new Error('Failed to parse AI fix proposal as JSON. Content: ' + content);
    }
  }
}
