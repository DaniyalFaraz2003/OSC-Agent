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

    // Always log during generation since it's a slow operation (30-60s)
    console.log(`  Calling Gemini API (prompt: ${Math.round(prompt.length / 1000)}KB, files: ${searchResults.length})...`);

    // Call your GeminiClient
    const response = await this.client.generate(prompt, {
      temperature: 0.2, // Low temperature for consistent code generation
      useCache: true,
      // Strongly prefer pure JSON output for easier parsing.
      responseMimeType: 'application/json',
    });

    console.log(`  Parsing AI response...`);

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
          const mode = !change.originalCode || change.originalCode.trim() === '' ? (fullContent === '' ? 'new file' : 'full-file diff') : 'targeted replacement';
          console.log(`  ✓ ${change.filePath} (${mode})`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  ✗ ${change.filePath}: ${msg}`);
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
    // First pass: strip common markdown code fences and try direct JSON parse.
    const cleaned = content.replace(/```json|```/g, '').trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      // Second pass: try to recover the first JSON object within the text by
      // slicing between the first '{' and the last '}'.
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const jsonSlice = cleaned.slice(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(jsonSlice);
        } catch {
          // fall through to error handling below
        }
      }

      const preview = cleaned.length > 500 ? cleaned.slice(0, 500) + '...[truncated]' : cleaned;
      console.error('[FixGenerator] Raw AI response:', preview);
      throw new Error('Failed to parse AI fix proposal as JSON. The AI might have returned text instead of code. ' + `Response preview: "${preview.slice(0, 200)}..."`);
    }
  }
}
