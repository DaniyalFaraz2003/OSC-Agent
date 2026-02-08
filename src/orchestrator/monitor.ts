import { logger } from '../utils/logger';
import { metrics } from '../utils/metrics';

export class OrchestratorMonitor {
  static async traceExecution<T>(agentName: string, workflowId: string, fn: () => Promise<T>): Promise<T> {
    const stopTimer = metrics.startTimer();
    logger.info(`Starting agent: ${agentName}`, { workflowId });

    try {
      const result = await fn();
      const duration = stopTimer();

      metrics.record('execution_time', duration, { agentName, workflowId });
      metrics.record('execution_result', 1, { agentName, workflowId });

      logger.info(`Agent ${agentName} completed`, { workflowId, durationMs: duration });
      return result;
    } catch (error: unknown) {
      const duration = stopTimer();
      metrics.record('execution_time', duration, { agentName, workflowId });
      metrics.record('execution_result', 0, { agentName, workflowId });

      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`Agent ${agentName} failed`, {
        workflowId,
        error: errorMessage,
        durationMs: duration,
      });
      throw error;
    }
  }

  static trackApiCall(provider: string, model: string, cost: number, workflowId: string): void {
    metrics.record('api_cost', cost, { provider, model, workflowId });
    metrics.record('api_call_count', 1, { provider, model, workflowId });
    logger.debug(`API Call tracked`, { provider, model, cost, workflowId });
  }
}
