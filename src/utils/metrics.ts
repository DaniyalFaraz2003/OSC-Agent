export interface MetricValue {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: number;
}

export class MetricsCollector {
  private metrics: MetricValue[] = [];

  record(name: string, value: number, tags: Record<string, string> = {}): void {
    this.metrics.push({
      name,
      value,
      tags,
      timestamp: Date.now(),
    });
  }

  startTimer(): () => number {
    const start = process.hrtime.bigint();
    return (): number => {
      const end = process.hrtime.bigint();
      return Number(end - start) / 1_000_000; // returns ms
    };
  }

  getMetrics(): MetricValue[] {
    return [...this.metrics];
  }

  clear(): void {
    this.metrics = [];
  }
}

export const metrics = new MetricsCollector();
