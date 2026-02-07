// src/agents/error-analyzer.ts
import { TestResult, ErrorAnalysis } from './iteration-tracker';

export class ErrorAnalyzer {
  analyze(result: TestResult): ErrorAnalysis {
    if (result.success) {
      return { summary: 'Success', failurePoints: [], suggestedFocus: 'None' };
    }

    // Extract lines that look like errors (Stack traces, Assertion errors)
    const errorLines = result.logs
      .split('\n')
      .filter((line) => /error|fail|exception|assert|at\s+/i.test(line))
      .map((line) => line.trim())
      .slice(0, 10); // Keep top 10 relevant lines

    return {
      summary: `Test failed with ${result.failureCount} errors.`,
      failurePoints: errorLines,
      suggestedFocus: this.deduceFocus(errorLines),
    };
  }

  private deduceFocus(errors: string[]): string {
    const joined = errors.join(' ');
    if (joined.includes('ReferenceError')) return 'Fix missing variables or imports.';
    if (joined.includes('TypeError')) return 'Verify object structures and null checks.';
    if (joined.includes('AssertionError')) return 'Logic matches requirements, but output values are incorrect.';
    if (joined.includes('timeout')) return 'Check for infinite loops or performance bottlenecks.';
    return 'General debugging and logic refinement.';
  }
}
