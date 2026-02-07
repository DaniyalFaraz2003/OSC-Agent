// src/agents/iteration-tracker.ts
export interface TestResult {
  success: boolean;
  logs: string;
  failureCount: number;
  passedCount: number;
}

export interface ErrorAnalysis {
  summary: string;
  failurePoints: string[];
  suggestedFocus: string;
}

export interface IterationEntry {
  iteration: number;
  fix: string;
  result: TestResult;
  analysis?: ErrorAnalysis;
}

export interface IterationMetrics {
  iterationCount: number;
  startTime: number;
  endTime: number;
  totalTimeMs: number;
  improvementScore: number;
  isSuccessful: boolean;
}

export class IterationTracker {
  private history: IterationEntry[] = [];
  private startTime: number = Date.now();

  logIteration(entry: IterationEntry): void {
    this.history.push(entry);
  }

  getMetrics(isSuccessful: boolean): IterationMetrics {
    const endTime = Date.now();
    const lastEntry = this.history[this.history.length - 1];

    let improvementScore = 0;
    if (lastEntry) {
      const total = lastEntry.result.passedCount + lastEntry.result.failureCount;
      improvementScore = total > 0 ? (lastEntry.result.passedCount / total) * 100 : 0;
    }

    return {
      iterationCount: this.history.length,
      startTime: this.startTime,
      endTime,
      totalTimeMs: endTime - this.startTime,
      improvementScore,
      isSuccessful,
    };
  }

  getHistory(): IterationEntry[] {
    return [...this.history];
  }
}
