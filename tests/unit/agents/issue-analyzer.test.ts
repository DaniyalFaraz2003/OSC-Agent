import { IssueAnalyzer } from '../../../src/agents/issue-analyzer';
import { Config } from '../../../src/config/validator';
import { GitHubIssue } from '../../../src/agents/types';

describe('IssueAnalyzer', () => {
  const baseConfig: Pick<Config, 'gemini'> = {
    gemini: {
      api_key: 'test-key',
      model_tier: 'basic',
    },
  };

  const makeGeminiResponse = (text: string): Promise<Response> =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => ({
        candidates: [
          {
            content: {
              parts: [{ text }],
            },
          },
        ],
      }),
    } as unknown as Response);

  const makeErrorResponse = (status: number, body: string): Promise<Response> =>
    Promise.resolve({
      ok: false,
      status,
      statusText: status === 404 ? 'Not Found' : 'Error',
      text: () => body,
    } as unknown as Response);

  const makeListModelsResponse = (models: Array<{ name: string; supportedGenerationMethods: string[] }>): Promise<Response> =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => ({
        models,
      }),
    } as unknown as Response);

  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  it('returns structured analysis for minimal issue', async () => {
    (globalThis.fetch as unknown as jest.Mock).mockImplementation(() =>
      makeGeminiResponse(
        JSON.stringify({
          type: 'bug',
          complexity: 'simple',
          requirements: ['Fix crash on startup'],
          affected_files: ['src/index.ts'],
        }),
      ),
    );

    const analyzer = new IssueAnalyzer(baseConfig);

    const issue: GitHubIssue = {
      number: 1,
      title: 'App crashes on startup',
      body: 'It crashes when I run it.',
      labels: [{ name: 'bug' }],
    };

    const result = await analyzer.analyzeIssue(issue);

    expect(result.type).toBe('bug');
    expect(result.complexity).toBe('simple');
    expect(result.requirements.length).toBeGreaterThan(0);
  });

  it('parses fenced JSON output from model', async () => {
    (globalThis.fetch as unknown as jest.Mock).mockImplementation(() =>
      makeGeminiResponse(
        '```json\n' +
          JSON.stringify({
            type: 'feature',
            complexity: 'medium',
            requirements: ['Add new flag --dry-run'],
            affected_files: ['src/cli/index.ts'],
          }) +
          '\n```',
      ),
    );

    const analyzer = new IssueAnalyzer(baseConfig);

    const issue: GitHubIssue = {
      number: 2,
      title: 'Add dry run mode',
      body: 'Please add a dry-run flag.\n\n```ts\nconsole.log("hello")\n```',
      labels: [{ name: 'enhancement' }],
    };

    const result = await analyzer.analyzeIssue(issue);

    expect(result.type).toBe('feature');
    expect(result.affected_files).toContain('src/cli/index.ts');
  });

  it('throws on invalid schema', async () => {
    (globalThis.fetch as unknown as jest.Mock).mockImplementation(() =>
      makeGeminiResponse(
        JSON.stringify({
          type: 'bug',
          complexity: 'simple',
          requirements: 'not-an-array',
          affected_files: [],
        }),
      ),
    );

    const analyzer = new IssueAnalyzer(baseConfig);

    const issue: GitHubIssue = {
      number: 3,
      title: 'Bad output test',
      body: '',
    };

    await expect(analyzer.analyzeIssue(issue)).rejects.toThrow(/invalid analysis schema/i);
  });

  it('retries next configured model on 404', async () => {
    (globalThis.fetch as unknown as jest.Mock)
      .mockImplementationOnce(() => makeErrorResponse(404, '{"error":"model not found"}'))
      .mockImplementationOnce(() =>
        makeGeminiResponse(
          JSON.stringify({
            type: 'documentation',
            complexity: 'simple',
            requirements: ['Update README'],
            affected_files: ['README.md'],
          }),
        ),
      );

    const analyzer = new IssueAnalyzer(baseConfig);

    const issue: GitHubIssue = {
      number: 4,
      title: 'Docs update',
      body: 'Please update docs',
    };

    const result = await analyzer.analyzeIssue(issue);
    expect(result.type).toBe('documentation');
  });

  it('falls back to listModels discovery when all configured models 404', async () => {
    (globalThis.fetch as unknown as jest.Mock)
      .mockImplementationOnce(() => makeErrorResponse(404, '{"error":"model not found"}'))
      .mockImplementationOnce(() => makeErrorResponse(404, '{"error":"model not found"}'))
      .mockImplementationOnce(() => makeListModelsResponse([{ name: 'models/gemini-discovered', supportedGenerationMethods: ['generateContent'] }]))
      .mockImplementationOnce(() =>
        makeGeminiResponse(
          JSON.stringify({
            type: 'bug',
            complexity: 'medium',
            requirements: ['Fix parsing'],
            affected_files: ['src/parser.ts'],
          }),
        ),
      );

    const analyzer = new IssueAnalyzer(baseConfig);

    const issue: GitHubIssue = {
      number: 5,
      title: 'Parsing bug',
      body: 'Fails sometimes',
    };

    const result = await analyzer.analyzeIssue(issue);
    expect(result.affected_files).toContain('src/parser.ts');
  });

  it('throws when model output is not JSON', async () => {
    (globalThis.fetch as unknown as jest.Mock).mockImplementation(() => makeGeminiResponse('not json at all'));

    const analyzer = new IssueAnalyzer(baseConfig);
    const issue: GitHubIssue = {
      number: 6,
      title: 'Bad json',
      body: 'body',
    };

    await expect(analyzer.analyzeIssue(issue)).rejects.toThrow(/failed to parse model json output/i);
  });
});
