import { CodeReviewerAgent, ReviewResult } from '../../../src/agents/code-reviewer';
import { GeminiClient } from '../../../src/agents/gemini-client';
import { GeminiResponse } from '../../../src/types/gemini';

// Mock the GeminiClient
jest.mock('../../../src/agents/gemini-client');

describe('CodeReviewerAgent', () => {
  let mockGeminiClient: jest.Mocked<GeminiClient>;
  let agent: CodeReviewerAgent;

  const mockIssue = 'Ensure user email is validated before saving.';
  const mockFix = 'function save(user) { if(validate(user.email)) saveToDb(user); }';

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Initialize mock client with a dummy API key
    mockGeminiClient = new GeminiClient('fake-api-key') as jest.Mocked<GeminiClient>;
    agent = new CodeReviewerAgent(mockGeminiClient);
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

  it('should successfully approve a valid fix (Happy Path)', async () => {
    const mockReview: ReviewResult = {
      approved: true,
      summary: 'The fix correctly implements email validation.',
      issues: [],
      suggestions: ['Add a unit test for invalid email formats.'],
    };

    mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse(JSON.stringify(mockReview)));

    const result = await agent.review(mockIssue, mockFix);

    expect(result.approved).toBe(true);
    expect(result.summary).toBe(mockReview.summary);
    expect(result.issues).toHaveLength(0);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockGeminiClient.generate).toHaveBeenCalledTimes(1);
  });

  it('should handle and clean markdown JSON blocks from LLM response', async () => {
    const mockReview: ReviewResult = {
      approved: true,
      summary: 'Cleaned JSON check',
      issues: [],
      suggestions: [],
    };

    // Wrap response in markdown backticks as LLMs often do
    const markdownResponse = `\`\`\`json\n${JSON.stringify(mockReview)}\n\`\`\``;

    mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse(markdownResponse));

    const result = await agent.review(mockIssue, mockFix);

    expect(result.approved).toBe(true);
    expect(result.summary).toBe('Cleaned JSON check');
  });

  it('should identify bugs and return them in the issues array', async () => {
    const mockReview: ReviewResult = {
      approved: false,
      summary: 'The fix has a potential null pointer.',
      issues: [
        {
          type: 'bug',
          description: 'user object might be null',
          severity: 'high',
        },
      ],
      suggestions: ['Add a null check for the user parameter.'],
    };

    mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse(JSON.stringify(mockReview)));

    const result = await agent.review(mockIssue, mockFix);

    expect(result.approved).toBe(false);
    expect(result.issues).toBeDefined();
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues?.[0]?.type).toBe('bug');
    expect(result.issues?.[0]?.severity).toBe('high');
  });

  it('should return a failure result when LLM returns invalid JSON', async () => {
    mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse('Not a JSON string'));

    const result = await agent.review(mockIssue, mockFix);

    expect(result.approved).toBe(false);
    expect(result.summary).toContain('automated review encountered an error');
    expect(result.issues?.[0]?.description).toContain('Failed to parse LLM response');
  });

  it('should handle unexpected errors from the GeminiClient gracefully', async () => {
    mockGeminiClient.generate.mockRejectedValue(new Error('Network Timeout'));

    const result = await agent.review(mockIssue, mockFix);

    expect(result.approved).toBe(false);
    expect(result.issues?.[0]?.description).toContain('Network Timeout');
    expect(result.suggestions?.[0]).toBe('Perform manual review of the fix.');
  });

  it('should verify correct parameters are passed to the GeminiClient', async () => {
    mockGeminiClient.generate.mockResolvedValue(createMockGeminiResponse(JSON.stringify({ approved: true, summary: 'OK', issues: [], suggestions: [] })));

    await agent.review('Issue A', 'Fix B');

    const callArgs = mockGeminiClient.generate.mock.calls[0];
    const promptSent = callArgs?.[0];
    const optionsSent = callArgs?.[1];

    expect(promptSent).toContain('Issue A');
    expect(promptSent).toContain('Fix B');
    expect(optionsSent).toEqual({ temperature: 0.1 });
  });
});
