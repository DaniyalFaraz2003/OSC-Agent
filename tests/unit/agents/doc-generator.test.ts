import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { DocumentationGenerator } from '../../../src/agents/doc-generator';
import { GeminiClient } from '../../../src/agents/gemini-client';
import { GeminiResponse } from '../../../src/types/gemini';

// Mock the GeminiClient
jest.mock('../../../src/agents/gemini-client');

describe('DocumentationGenerator', () => {
  let mockGeminiClient: jest.Mocked<GeminiClient>;
  let docGenerator: DocumentationGenerator;

  const mockIssue = 'User email validation fails when email contains special characters';
  const mockFix = 'function validateEmail(email: string): boolean { return /^[^@]+@[^@]+$/.test(email); }';
  const mockDiff = '--- a/src/auth/validator.ts\n+++ b/src/auth/validator.ts\n@@ -1,1 +1,2 @@\n+function validateEmail(email: string): boolean { return /^[^@]+@[^@]+$/.test(email); }';

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Initialize mock client with a dummy API key
    mockGeminiClient = new GeminiClient('fake-api-key') as jest.Mocked<GeminiClient>;
    docGenerator = new DocumentationGenerator(mockGeminiClient);
  });

  const createMockGeminiResponse = (content: string): GeminiResponse<string> => ({
    content,
    modelId: 'gemini-1.5-pro',
    cached: false,
    usage: {
      promptTokens: 100,
      candidatesTokens: 50,
      totalTokens: 150,
      estimatedCost: 0.001,
      modelId: 'gemini-1.5-pro',
    },
  });

  describe('generateCommitMessage', () => {
    it('should generate a conventional commit message (Happy Path)', async () => {
      const mockCommitResult = {
        type: 'fix',
        scope: 'auth',
        description: 'add email validation regex pattern',
        body: 'Implemented proper email validation using regex pattern to accept valid email addresses',
        footer: 'Closes #123',
      };

      mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse(JSON.stringify(mockCommitResult)));

      const result = await docGenerator.generateCommitMessage(mockIssue, mockFix);

      expect(result.type).toBe('fix');
      expect(result.scope).toBe('auth');
      expect(result.description).toBe('add email validation regex pattern');
      expect(result.formatted.raw).toBe('fix(auth): add email validation regex pattern\n\nImplemented proper email validation using regex pattern to accept valid email addresses\n\nCloses #123');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockGeminiClient.generate).toHaveBeenCalledTimes(1);
    });

    it('should handle markdown JSON blocks from LLM response', async () => {
      const mockCommitResult = {
        type: 'feat',
        scope: undefined,
        description: 'add user authentication',
        body: undefined,
        footer: undefined,
      };

      const markdownResponse = `\`\`\`json\n${JSON.stringify(mockCommitResult)}\n\`\`\``;
      mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse(markdownResponse));

      const result = await docGenerator.generateCommitMessage(mockIssue, mockFix);

      expect(result.type).toBe('feat');
      expect(result.formatted.subject).toBe('feat: add user authentication');
    });

    it('should return safe default on JSON parse error', async () => {
      mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse('Not valid JSON'));

      const result = await docGenerator.generateCommitMessage(mockIssue, mockFix);

      expect(result.type).toBe('chore');
      expect(result.description).toBe('apply code changes');
      expect(result.formatted.raw).toBe('chore: apply code changes');
    });

    it('should return safe default on Gemini client error', async () => {
      mockGeminiClient.generate.mockRejectedValue(new Error('Network timeout'));

      const result = await docGenerator.generateCommitMessage(mockIssue, mockFix);

      expect(result.type).toBe('chore');
      expect(result.description).toBe('apply code changes');
    });

    it('should verify correct parameters are passed to GeminiClient', async () => {
      mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse(JSON.stringify({ type: 'fix', description: 'test' })));

      await docGenerator.generateCommitMessage('Issue A', 'Fix B');

      const callArgs = mockGeminiClient.generate.mock.calls[0];
      const promptSent = callArgs?.[0];
      const optionsSent = callArgs?.[1];

      expect(promptSent).toContain('Issue A');
      expect(promptSent).toContain('Fix B');
      expect(optionsSent).toEqual({ temperature: 0.1 });
    });
  });

  describe('generatePRDescription', () => {
    it('should generate a comprehensive PR description (Happy Path)', async () => {
      const mockPRResult = {
        summary: 'This PR fixes email validation by implementing a proper regex pattern',
        changes: ['Added validateEmail function', 'Updated email validation logic', 'Added unit tests'],
        typeOfChange: 'Bug fix',
        testing: 'Tested with valid and invalid email addresses including edge cases',
        relatedIssues: 'Closes #123',
        checklist: {
          styleGuidelines: true,
          selfReview: true,
          comments: true,
          documentation: true,
          noWarnings: true,
          testsAdded: true,
          testsPass: true,
          dependentChanges: true,
        },
      };

      mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse(JSON.stringify(mockPRResult)));

      const result = await docGenerator.generatePRDescription(mockIssue, mockFix, mockDiff);

      expect(result.summary).toBe(mockPRResult.summary);
      expect(result.changes).toHaveLength(3);
      expect(result.typeOfChange).toBe('Bug fix');
      expect(result.formatted).toContain('## Summary');
      expect(result.formatted).toContain('## Changes');
      expect(result.formatted).toContain('- [x] My code follows the style guidelines');
    });

    it('should handle markdown JSON blocks in PR description', async () => {
      const mockPRResult = {
        summary: 'Test PR',
        changes: ['Change 1'],
        typeOfChange: 'New feature',
        testing: 'Tests pass',
        relatedIssues: '#1',
        checklist: {
          styleGuidelines: true,
          selfReview: false,
          comments: true,
          documentation: false,
          noWarnings: true,
          testsAdded: true,
          testsPass: true,
          dependentChanges: false,
        },
      };

      const markdownResponse = `\`\`\`json\n${JSON.stringify(mockPRResult)}\n\`\`\``;
      mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse(markdownResponse));

      const result = await docGenerator.generatePRDescription(mockIssue, mockFix, mockDiff);

      expect(result.summary).toBe('Test PR');
      expect(result.formatted).toContain('## Summary');
    });

    it('should return safe default on error', async () => {
      mockGeminiClient.generate.mockRejectedValue(new Error('API error'));

      const result = await docGenerator.generatePRDescription(mockIssue, mockFix, mockDiff);

      expect(result.summary).toContain('addresses a reported issue');
      expect(result.formatted).toContain('## Summary');
    });

    it('should verify correct parameters are passed to GeminiClient', async () => {
      mockGeminiClient.generate.mockResolvedValue(
        createMockGeminiResponse(
          JSON.stringify({
            summary: 'Test',
            changes: [],
            typeOfChange: 'Bug fix',
            testing: 'Test',
            relatedIssues: '#1',
            checklist: {},
          }),
        ),
      );

      await docGenerator.generatePRDescription('Issue', 'Fix', 'Diff');

      const callArgs = mockGeminiClient.generate.mock.calls[0];
      const optionsSent = callArgs?.[1];

      expect(optionsSent).toEqual({ temperature: 0.2 });
    });
  });

  describe('generateCodeDocumentation', () => {
    it('should generate JSDoc for a function (Happy Path)', async () => {
      const mockCode = 'function add(a: number, b: number): number { return a + b; }';
      const mockContext = 'Utility functions for basic arithmetic';

      const mockDocResult = {
        documentation: '/**\n * Adds two numbers together.\n *\n * @param a - The first number\n * @param b - The second number\n * @returns The sum of a and b\n * @example\n * ```ts\n * add(1, 2) // returns 3\n * ```\n */',
        summary: 'Adds two numbers together',
        remarks: 'This function does not perform type checking at runtime',
      };

      mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse(JSON.stringify(mockDocResult)));

      const result = await docGenerator.generateCodeDocumentation(mockCode, mockContext);

      expect(result.documentation).toContain('/**');
      expect(result.documentation).toContain('@param');
      expect(result.documentation).toContain('@returns');
      expect(result.summary).toBe('Adds two numbers together');
    });

    it('should handle markdown JSON in documentation generation', async () => {
      const mockDocResult = {
        documentation: '/** Simple doc */',
        summary: 'Test',
        remarks: undefined,
      };

      const markdownResponse = `\`\`\`json\n${JSON.stringify(mockDocResult)}\n\`\`\``;
      mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse(markdownResponse));

      const result = await docGenerator.generateCodeDocumentation('code', 'context');

      expect(result.documentation).toContain('/**');
    });

    it('should return safe default on error', async () => {
      mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse('Invalid'));

      const result = await docGenerator.generateCodeDocumentation('code', 'context');

      expect(result.documentation).toContain('TODO');
      expect(result.summary).toContain('failed');
    });
  });

  describe('generateChangelogEntry', () => {
    it('should generate a changelog entry (Happy Path)', async () => {
      const mockChangelogResult = {
        category: 'Fixed',
        entry: 'email validation now properly handles special characters',
        issueReference: '#123',
      };

      mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse(JSON.stringify(mockChangelogResult)));

      const result = await docGenerator.generateChangelogEntry(mockIssue, { version: '1.2.0' });

      expect(result.category).toBe('Fixed');
      expect(result.entry).toContain('email validation');
      expect(result.formatted).toContain('- Fixed:');
      expect(result.formatted).toContain('(#123)');
    });

    it('should use default version when not provided', async () => {
      mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse(JSON.stringify({ category: 'Changed', entry: 'test', issueReference: undefined })));

      await docGenerator.generateChangelogEntry(mockIssue);

      const callArgs = mockGeminiClient.generate.mock.calls[0];
      const promptSent = callArgs?.[0];

      expect(promptSent).toContain('0.0.0');
    });

    it('should return safe default on error', async () => {
      mockGeminiClient.generate.mockRejectedValue(new Error('API error'));

      const result = await docGenerator.generateChangelogEntry(mockIssue);

      expect(result.category).toBe('Changed');
      expect(result.formatted).toContain('- Changed:');
    });
  });

  describe('generateIssueLinkComment', () => {
    it('should generate an issue link comment (Happy Path)', async () => {
      const mockIssueLinkResult = {
        comment: 'Documentation has been generated for this issue. See [docs.md](./docs.md) for details.',
        documentationLinks: ['./docs.md', './README.md'],
      };

      mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse(JSON.stringify(mockIssueLinkResult)));

      const result = await docGenerator.generateIssueLinkComment(mockIssue, 'Generated documentation content');

      expect(result.comment).toContain('Documentation has been generated');
      expect(result.documentationLinks).toHaveLength(2);
      expect(result.documentationLinks).toContain('./docs.md');
    });

    it('should handle markdown JSON in issue link generation', async () => {
      const mockResult = {
        comment: 'Test comment',
        documentationLinks: ['./test.md'],
      };

      const markdownResponse = `\`\`\`json\n${JSON.stringify(mockResult)}\n\`\`\``;
      mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse(markdownResponse));

      const result = await docGenerator.generateIssueLinkComment(mockIssue, 'doc');

      expect(result.comment).toBe('Test comment');
    });

    it('should return safe default on error', async () => {
      mockGeminiClient.generate.mockRejectedValue(new Error('API error'));

      const result = await docGenerator.generateIssueLinkComment(mockIssue, 'doc');

      expect(result.comment).toContain('Documentation has been generated');
      expect(result.documentationLinks).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should handle all methods returning safe defaults on consecutive errors', async () => {
      mockGeminiClient.generate.mockRejectedValue(new Error('Service unavailable'));

      const commitResult = await docGenerator.generateCommitMessage(mockIssue, mockFix);
      const prResult = await docGenerator.generatePRDescription(mockIssue, mockFix, mockDiff);
      const docResult = await docGenerator.generateCodeDocumentation('code', 'context');
      const changelogResult = await docGenerator.generateChangelogEntry(mockIssue);
      const issueLinkResult = await docGenerator.generateIssueLinkComment(mockIssue, 'doc');

      expect(commitResult.type).toBe('chore');
      expect(prResult.summary).toContain('addresses a reported issue');
      expect(docResult.documentation).toContain('TODO');
      expect(changelogResult.category).toBe('Changed');
      expect(issueLinkResult.comment).toContain('Documentation has been generated');
    });
  });
});
