/* eslint-disable @typescript-eslint/unbound-method */
import { FixGenerator } from '../../../src/agents/fix-generator';
import { GeminiClient } from '../../../src/agents/gemini-client';
import { DiffGenerator } from '../../../src/agents/diff-generator';
import { CodeSearchResult } from '../../../src/agents/context-builder';
import { GeminiResponse } from '../../../src/types/gemini';

// Mock the DiffGenerator to avoid real diff logic overhead
jest.mock('../../../src/agents/diff-generator');

describe('FixGenerator', () => {
  let generator: FixGenerator;
  let mockGeminiClient: jest.Mocked<GeminiClient>;

  const mockIssue = 'Bug in calculator';
  const mockAnalysis = 'The add function subtracts instead of adding.';
  const mockSearchResults: CodeSearchResult[] = [
    {
      filePath: 'src/math.ts',
      content: 'export const add = (a, b) => a - b;',
    },
  ];

  beforeEach(() => {
    // Setup the mock client
    mockGeminiClient = {
      generate: jest.fn(),
      generateStream: jest.fn(),
      getGlobalMetrics: jest.fn(),
    } as unknown as jest.Mocked<GeminiClient>;

    generator = new FixGenerator(mockGeminiClient);
    jest.clearAllMocks();
  });

  it('should successfully generate a fix proposal with patches', async () => {
    // 1. Mock the AI response
    const mockAiResponse = {
      explanation: 'Changed the minus operator to a plus operator.',
      confidenceScore: 0.98,
      changes: [
        {
          filePath: 'src/math.ts',
          originalCode: 'a - b',
          replacementCode: 'a + b',
        },
      ],
    };

    mockGeminiClient.generate.mockResolvedValue({
      content: JSON.stringify(mockAiResponse),
      usage: { totalTokens: 100 },
    } as unknown as GeminiResponse);

    // 2. Mock the DiffGenerator output
    const mockDiff = '--- a/src/math.ts\n+++ b/src/math.ts\n- a - b\n+ a + b';
    (DiffGenerator.generate as jest.Mock).mockReturnValue(mockDiff);

    // 3. Execute
    const result = await generator.generateFix(mockIssue, mockAnalysis, mockSearchResults, 'minimal');

    // 4. Assertions
    expect(result.explanation).toBe(mockAiResponse.explanation);
    expect(result.confidenceScore).toBe(0.98);
    expect(result.patches).toHaveLength(1);
    expect(result.patches[0]).toBe(mockDiff);
    expect(result.strategy).toBe('minimal');
    expect(DiffGenerator.generate).toHaveBeenCalledWith(mockAiResponse.changes[0], mockSearchResults[0]!.content);
  });

  it('should correctly parse responses wrapped in markdown code blocks', async () => {
    const mockAiResponse = {
      explanation: 'Fixing stuff',
      confidenceScore: 0.8,
      changes: [],
    };

    // Simulate Gemini returning JSON inside triple backticks
    const markdownContent = `\`\`\`json\n${JSON.stringify(mockAiResponse)}\n\`\`\``;

    mockGeminiClient.generate.mockResolvedValue({
      content: markdownContent,
      usage: {},
    } as unknown as GeminiResponse);

    const result = await generator.generateFix(mockIssue, mockAnalysis, [], 'refactor');

    expect(result.explanation).toBe('Fixing stuff');
    expect(result.strategy).toBe('refactor');
  });

  it('should handle multiple file changes', async () => {
    const multiFileResponse = {
      explanation: 'Updating multiple files',
      confidenceScore: 0.9,
      changes: [
        { filePath: 'file1.ts', originalCode: 'old1', replacementCode: 'new1' },
        { filePath: 'file2.ts', originalCode: 'old2', replacementCode: 'new2' },
      ],
    };

    const multiSearchResults = [
      { filePath: 'file1.ts', content: 'old1 content' },
      { filePath: 'file2.ts', content: 'old2 content' },
    ];

    mockGeminiClient.generate.mockResolvedValue({
      content: JSON.stringify(multiFileResponse),
      usage: {},
    } as unknown as GeminiResponse);

    (DiffGenerator.generate as jest.Mock).mockReturnValue('mock-diff');

    const result = await generator.generateFix(mockIssue, mockAnalysis, multiSearchResults);

    expect(result.patches).toHaveLength(2);
    expect(DiffGenerator.generate).toHaveBeenCalledTimes(2);
  });

  it('should throw an error if AI response is not valid JSON', async () => {
    mockGeminiClient.generate.mockResolvedValue({
      content: 'Sorry, I cannot help with this request.',
      usage: {},
    } as unknown as GeminiResponse);

    await expect(generator.generateFix(mockIssue, mockAnalysis, mockSearchResults)).rejects.toThrow('Failed to parse AI fix proposal as JSON');
  });

  it('should skip a patch when the file does not exist and originalCode cannot be matched', async () => {
    const mockAiResponse = {
      explanation: 'Fix',
      confidenceScore: 1.0,
      changes: [
        {
          filePath: 'unknown-file.ts',
          originalCode: 'foo',
          replacementCode: 'bar',
        },
      ],
    };

    mockGeminiClient.generate.mockResolvedValue({
      content: JSON.stringify(mockAiResponse),
      usage: {},
    } as unknown as GeminiResponse);

    // File is not in search results and does not exist on disk.
    // DiffGenerator will receive empty content and fail to find the originalCode.
    (DiffGenerator.generate as jest.Mock).mockImplementation(() => {
      throw new Error('Could not find original code block in unknown-file.ts');
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await generator.generateFix(mockIssue, mockAnalysis, mockSearchResults);

    expect(result.patches).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('unknown-file.ts'));

    consoleSpy.mockRestore();
  });

  it('should generate a patch for new files when originalCode is empty', async () => {
    const mockAiResponse = {
      explanation: 'Create a new utility file',
      confidenceScore: 0.9,
      changes: [
        {
          filePath: 'src/new-util.ts',
          originalCode: '',
          replacementCode: 'export const greet = () => "hello";',
        },
      ],
    };

    mockGeminiClient.generate.mockResolvedValue({
      content: JSON.stringify(mockAiResponse),
      usage: {},
    } as unknown as GeminiResponse);

    const newFileDiff = 'Index: src/new-util.ts\n--- src/new-util.ts\n+++ src/new-util.ts\n@@ -0,0 +1 @@\n+export const greet = () => "hello";';
    (DiffGenerator.generate as jest.Mock).mockReturnValue(newFileDiff);

    const result = await generator.generateFix(mockIssue, mockAnalysis, []);

    expect(result.patches).toHaveLength(1);
    expect(result.patches[0]).toBe(newFileDiff);
    // For new files (not in search results, not on disk), DiffGenerator is called with empty content
    expect(DiffGenerator.generate).toHaveBeenCalledWith(mockAiResponse.changes[0], '');
  });

  it('should catch and log errors from DiffGenerator without crashing the whole process', async () => {
    const mockAiResponse = {
      explanation: 'Fix',
      confidenceScore: 1.0,
      changes: [{ filePath: 'src/math.ts', originalCode: 'a', replacementCode: 'b' }],
    };

    mockGeminiClient.generate.mockResolvedValue({
      content: JSON.stringify(mockAiResponse),
      usage: {},
    } as unknown as GeminiResponse);

    // Mock DiffGenerator to throw an error (e.g., snippet not found)
    (DiffGenerator.generate as jest.Mock).mockImplementation(() => {
      throw new Error('Snippet mismatch');
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await generator.generateFix(mockIssue, mockAnalysis, mockSearchResults);

    expect(result.patches).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('src/math.ts'));

    consoleSpy.mockRestore();
  });
});
