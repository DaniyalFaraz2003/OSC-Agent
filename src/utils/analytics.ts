import { metrics } from './metrics';

export interface WorkflowSummary {
  totalExecutionTime: number;
  apiCost: number;
  successRate: number;
  totalCalls: number;
}

export class Analytics {
  calculateWorkflowSummary(workflowId: string): WorkflowSummary {
    const allMetrics = metrics.getMetrics();
    const workflowMetrics = allMetrics.filter((m) => m.tags.workflowId === workflowId);

    const durations = workflowMetrics.filter((m) => m.name === 'execution_time');
    const costs = workflowMetrics.filter((m) => m.name === 'api_cost');
    const results = workflowMetrics.filter((m) => m.name === 'execution_result');

    const totalTime = durations.reduce((sum, m) => sum + m.value, 0);
    const totalCost = costs.reduce((sum, m) => sum + m.value, 0);
    const successes = results.filter((m) => m.value === 1).length;

    return {
      totalExecutionTime: totalTime,
      apiCost: totalCost,
      totalCalls: results.length,
      successRate: results.length > 0 ? (successes / results.length) * 100 : 0,
    };
  }
}

export const analytics = new Analytics();
