// tests/unit/agents/self-corrector.test.ts
import { SelfCorrector, ITestRunner } from '../../../src/agents/self-corrector';
import { FixGenerator, FixProposal } from '../../../src/agents/fix-generator';
import { TestResult } from '../../../src/agents/iteration-tracker';

describe('SelfCorrector', () => {
  // Use jest.Mocked to get full typing for mocked methods
  let mockGenerator: jest.Mocked<FixGenerator>;
  let mockRunner: jest.Mocked<ITestRunner>;

  const dummyProposal: FixProposal = {
    explanation: 'test',
    confidenceScore: 0.9,
    patches: ['patch1'],
    strategy: 'minimal',
  };

  beforeEach(() => {
    // Cast through unknown to FixGenerator to satisfy the class structure
    // without needing to provide private members or constructor dependencies
    mockGenerator = {
      generateFix: jest.fn(),
    } as unknown as jest.Mocked<FixGenerator>;

    // For interfaces, a simple cast to jest.Mocked is usually sufficient
    mockRunner = {
      runTests: jest.fn(),
    } as jest.Mocked<ITestRunner>;
  });

  it('should stop after 1 iteration if successful', async () => {
    mockGenerator.generateFix.mockResolvedValue(dummyProposal);

    const successResult: TestResult = {
      success: true,
      logs: 'All pass',
      failureCount: 0,
      passedCount: 5,
    };
    mockRunner.runTests.mockResolvedValue(successResult);

    const corrector = new SelfCorrector(mockGenerator, mockRunner, 3);
    const result = await corrector.run('desc', 'analysis', []);

    expect(result.metrics.iterationCount).toBe(1);
    expect(result.metrics.isSuccessful).toBe(true);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockGenerator.generateFix).toHaveBeenCalledTimes(1);
  });

  it('should include error feedback in the next iteration prompt', async () => {
    // First call fails
    mockGenerator.generateFix.mockResolvedValueOnce(dummyProposal);

    const failureResult: TestResult = {
      success: false,
      logs: 'Error: ReferenceError: x is not defined',
      failureCount: 1,
      passedCount: 0,
    };
    mockRunner.runTests.mockResolvedValueOnce(failureResult);

    // Second call succeeds
    mockGenerator.generateFix.mockResolvedValueOnce(dummyProposal);

    const successResult: TestResult = {
      success: true,
      logs: 'Pass',
      failureCount: 0,
      passedCount: 1,
    };
    mockRunner.runTests.mockResolvedValueOnce(successResult);

    const corrector = new SelfCorrector(mockGenerator, mockRunner, 3);
    await corrector.run('desc', 'Initial Root Cause', []);

    // Accessing mock calls safely
    // mock.calls[iterationIndex][argumentIndex]
    const calls = mockGenerator.generateFix.mock.calls;
    const secondCallAnalysis = calls[1]?.[1];

    expect(secondCallAnalysis).toContain('ReferenceError');
    expect(secondCallAnalysis).toContain('ATTENTION: PREVIOUS FIX ATTEMPT');
  });
});
