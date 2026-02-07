// src/agents/self-corrector.ts
import { FixGenerator, FixProposal } from './fix-generator';
import { CodeSearchResult } from './context-builder';
import { ErrorAnalyzer } from './error-analyzer';
import { IterationTracker, IterationMetrics, IterationEntry, TestResult, ErrorAnalysis } from './iteration-tracker';

export interface ITestRunner {
  // Logic to apply patches and run tests
  runTests(proposal: FixProposal): Promise<TestResult>;
}

export interface SelfCorrectionResult {
  finalProposal: FixProposal;
  metrics: IterationMetrics;
  history: IterationEntry[];
}

export class SelfCorrector {
  private tracker: IterationTracker;
  private analyzer: ErrorAnalyzer;

  constructor(
    private fixGenerator: FixGenerator,
    private testRunner: ITestRunner,
    private maxIterations: number = 3,
  ) {
    this.tracker = new IterationTracker();
    this.analyzer = new ErrorAnalyzer();
  }

  async run(issueDescription: string, initialAnalysis: string, searchResults: CodeSearchResult[]): Promise<SelfCorrectionResult> {
    let currentAnalysis = initialAnalysis;
    let lastProposal: FixProposal | null = null;
    let isSuccessful = false;

    for (let i = 1; i <= this.maxIterations; i++) {
      // 1. Generate Fix
      const proposal = await this.fixGenerator.generateFix(issueDescription, currentAnalysis, searchResults);
      lastProposal = proposal;

      // 2. Test Fix
      const testResult = await this.testRunner.runTests(proposal);

      // 3. Analyze Results
      const analysisFeedback = this.analyzer.analyze(testResult);

      // 4. Log Iteration
      this.tracker.logIteration({
        iteration: i,
        fix: JSON.stringify(proposal.patches), // Tracking patches as the fix content
        result: testResult,
        analysis: analysisFeedback,
      });

      // 5. Check Termination
      if (testResult.success) {
        isSuccessful = true;
        break;
      }

      // 6. Refine "Analysis" for next iteration
      // We append the failure details so the AI knows why the last fix failed
      currentAnalysis = this.prepareFeedbackContext(initialAnalysis, analysisFeedback, i);
    }

    if (!lastProposal) throw new Error('Self-correction failed to generate any proposals.');

    return {
      finalProposal: lastProposal,
      metrics: this.tracker.getMetrics(isSuccessful),
      history: this.tracker.getHistory(),
    };
  }

  private prepareFeedbackContext(originalAnalysis: string, feedback: ErrorAnalysis, iteration: number): string {
    return `${originalAnalysis}

---
ATTENTION: PREVIOUS FIX ATTEMPT ${iteration} FAILED.
Failure Summary: ${feedback.summary}
Specific Errors:
${feedback.failurePoints.join('\n')}
Suggested Focus: ${feedback.suggestedFocus}
Please provide an improved fix addressing these specific failures.
---`;
  }
}
