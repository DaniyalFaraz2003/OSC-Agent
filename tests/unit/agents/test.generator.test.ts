import { TestGenerator } from '../../../src/agents/test-generator';
import { GeminiClient } from '../../../src/agents/gemini-client';

describe('TestGenerator Agent', () => {
  let mockClient: jest.Mocked<GeminiClient>;
  let generator: TestGenerator;

  beforeEach(() => {
    mockClient = {
      generate: jest.fn(),
    } as unknown as jest.Mocked<GeminiClient>;

    generator = new TestGenerator(mockClient);
  });

  it('should generate Jest test content based on analysis', async () => {
    // 1. Mock Analysis (Step 1)
    (mockClient.generate as jest.Mock).mockResolvedValueOnce({
      content: JSON.stringify({
        requirements: [
          {
            functionName: 'calculate',
            testType: 'unit',
            scenarios: [{ description: 'basic math', type: 'positive', isEdgeCase: false }],
          },
        ],
      }),
      modelId: 'gemini-pro',
      usage: {},
      cached: false,
    });

    // 2. Mock Test Generation (Step 2)
    (mockClient.generate as jest.Mock).mockResolvedValueOnce({
      content: 'describe("calculate", () => { it("does math", () => { expect(1).toBe(1); }); });',
      modelId: 'gemini-pro',
      usage: {},
      cached: false,
    });

    const result = await generator.generateTests({
      diff: '...',
      originalCode: 'export const calculate = () => 1',
      filePath: 'src/logic.ts',
    });

    expect(result.filePath).toBe('src/logic.test.ts');
    expect(result.content).toContain('describe("calculate"');
    expect(result.content).toContain('expect(1).toBe(1)');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockClient.generate).toHaveBeenCalledTimes(2);
  });
});
