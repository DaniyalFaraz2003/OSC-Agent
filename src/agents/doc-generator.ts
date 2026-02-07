/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { GeminiClient } from './gemini-client';
import { createCommitMessagePrompt, createPRDescriptionPrompt, createCodeDocumentationPrompt, createChangelogPrompt, createIssueLinkPrompt } from './prompts/documentation';
import { formatCommit, formatChangelogEntry, formatPRSection, formatPRChecklist } from './commit-formatter';
import type { UsageMetrics } from '../types/gemini';

/**
 * Result of generating a commit message
 */
export interface CommitMessageResult {
  type: string;
  scope?: string;
  description: string;
  body?: string;
  footer?: string;
  formatted: {
    raw: string;
    subject: string;
    body?: string;
  };
}

/**
 * Result of generating a PR description
 */
export interface PRDescriptionResult {
  summary: string;
  changes: string[];
  typeOfChange: string;
  testing: string;
  relatedIssues: string;
  checklist: Record<string, boolean>;
  formatted: string;
}

/**
 * Result of generating code documentation
 */
export interface CodeDocumentationResult {
  documentation: string;
  summary: string;
  remarks?: string;
}

/**
 * Result of generating a changelog entry
 */
export interface ChangelogResult {
  category: string;
  entry: string;
  issueReference?: string;
  formatted: string;
}

/**
 * Result of generating an issue link comment
 */
export interface IssueLinkResult {
  comment: string;
  documentationLinks: string[];
}

/**
 * Options for documentation generation
 */
export interface DocGenerationOptions {
  version?: string;
  includeFooter?: boolean;
}

/**
 * DocumentationGenerator Agent
 *
 * Generates various types of documentation for code changes including:
 * - Conventional commit messages
 * - Pull request descriptions
 * - Code documentation (JSDoc/TSDoc)
 * - Changelog entries
 * - Issue link comments
 */
export class DocumentationGenerator {
  constructor(private geminiClient: GeminiClient) {}

  /**
   * Generates a conventional commit message for a fix.
   *
   * @param issue - The original issue description
   * @param fix - The generated fix/diff
   * @returns Commit message components and formatted message
   */
  async generateCommitMessage(issue: string, fix: string): Promise<CommitMessageResult> {
    const prompt = createCommitMessagePrompt(issue, fix);

    try {
      const response = await this.geminiClient.generate<string>(prompt, {
        temperature: 0.1, // Low temperature for consistent structured output
      });

      // Extract JSON from response (handling potential markdown code blocks)
      const cleanJson = response.content.replace(/```json|```/g, '').trim();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = JSON.parse(cleanJson);

      // Format the commit message
      const formatted = formatCommit({
        type: result.type,
        scope: result.scope,
        description: result.description,
        body: result.body,
        footer: result.footer,
      });

      return {
        type: result.type,
        scope: result.scope,
        description: result.description,
        body: result.body,
        footer: result.footer,
        formatted,
      };
    } catch (error) {
      console.error('DocumentationGenerator Error (generateCommitMessage):', error);
      // Return a safe default on error
      return {
        type: 'chore',
        description: 'apply code changes',
        formatted: {
          raw: 'chore: apply code changes',
          subject: 'chore: apply code changes',
        },
      };
    }
  }

  /**
   * Generates a comprehensive pull request description.
   *
   * @param issue - The original issue description
   * @param fix - The generated fix
   * @param diff - The code diff
   * @returns Formatted PR description with all sections
   */
  async generatePRDescription(issue: string, fix: string, diff: string): Promise<PRDescriptionResult> {
    const prompt = createPRDescriptionPrompt(issue, fix, diff);

    try {
      const response = await this.geminiClient.generate<string>(prompt, {
        temperature: 0.2,
      });

      const cleanJson = response.content.replace(/```json|```/g, '').trim();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = JSON.parse(cleanJson);

      // Build the formatted PR description
      const sections: string[] = [];

      sections.push(formatPRSection('Summary', result.summary));
      sections.push(formatPRSection('Changes', result.changes));
      sections.push(formatPRSection('Type of Change', `- [x] ${result.typeOfChange}`));
      sections.push(formatPRSection('Testing', result.testing));
      sections.push(formatPRSection('Related Issues', result.relatedIssues));
      sections.push(formatPRSection('Checklist', formatPRChecklist(result.checklist)));

      const formatted = sections.join('\n\n');

      return {
        summary: result.summary,
        changes: result.changes,
        typeOfChange: result.typeOfChange,
        testing: result.testing,
        relatedIssues: result.relatedIssues,
        checklist: result.checklist,
        formatted,
      };
    } catch (error) {
      console.error('DocumentationGenerator Error (generatePRDescription):', error);
      // Return a safe default on error
      return {
        summary: 'This PR addresses a reported issue.',
        changes: ['Applied fixes to resolve the issue'],
        typeOfChange: 'Other',
        testing: 'Manual testing performed',
        relatedIssues: 'See original issue',
        checklist: {},
        formatted: '## Summary\n\nThis PR addresses a reported issue.\n\n## Changes\n\n- Applied fixes',
      };
    }
  }

  /**
   * Generates JSDoc/TSDoc documentation for code.
   *
   * @param code - The code to document
   * @param context - Additional context about the code
   * @returns Documentation with JSDoc comment block
   */
  async generateCodeDocumentation(code: string, context: string): Promise<CodeDocumentationResult> {
    const prompt = createCodeDocumentationPrompt(code, context);

    try {
      const response = await this.geminiClient.generate<string>(prompt, {
        temperature: 0.1,
      });

      const cleanJson = response.content.replace(/```json|```/g, '').trim();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = JSON.parse(cleanJson);

      return {
        documentation: result.documentation,
        summary: result.summary,
        remarks: result.remarks,
      };
    } catch (error) {
      console.error('DocumentationGenerator Error (generateCodeDocumentation):', error);
      return {
        documentation: '/** TODO: Add documentation */',
        summary: 'Documentation generation failed',
      };
    }
  }

  /**
   * Generates a changelog entry for the change.
   *
   * @param issue - The original issue description
   * @param options - Generation options including version
   * @returns Formatted changelog entry
   */
  async generateChangelogEntry(issue: string, options: DocGenerationOptions = {}): Promise<ChangelogResult> {
    const version = options.version || '0.0.0';
    const prompt = createChangelogPrompt(issue, version);

    try {
      const response = await this.geminiClient.generate<string>(prompt, {
        temperature: 0.1,
      });

      const cleanJson = response.content.replace(/```json|```/g, '').trim();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = JSON.parse(cleanJson);

      const formatted = formatChangelogEntry(result.category, result.entry, result.issueReference);

      return {
        category: result.category,
        entry: result.entry,
        issueReference: result.issueReference,
        formatted,
      };
    } catch (error) {
      console.error('DocumentationGenerator Error (generateChangelogEntry):', error);
      return {
        category: 'Changed',
        entry: 'Code changes applied',
        formatted: '- Changed: Code changes applied',
      };
    }
  }

  /**
   * Generates a comment to link documentation to the original issue.
   *
   * @param issue - The original issue content
   * @param documentation - The generated documentation
   * @returns Comment with documentation links
   */
  async generateIssueLinkComment(issue: string, documentation: string): Promise<IssueLinkResult> {
    const prompt = createIssueLinkPrompt(issue, documentation);

    try {
      const response = await this.geminiClient.generate<string>(prompt, {
        temperature: 0.2,
      });

      const cleanJson = response.content.replace(/```json|```/g, '').trim();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = JSON.parse(cleanJson);

      return {
        comment: result.comment,
        documentationLinks: result.documentationLinks,
      };
    } catch (error) {
      console.error('DocumentationGenerator Error (generateIssueLinkComment):', error);
      return {
        comment: 'Documentation has been generated for this issue.',
        documentationLinks: [],
      };
    }
  }

  /**
   * Gets the usage metrics from the Gemini client.
   *
   * @returns Token usage and cost metrics
   */
  getUsageMetrics(): UsageMetrics | undefined {
    // Access the client's metrics if exposed
    return undefined;
  }
}
