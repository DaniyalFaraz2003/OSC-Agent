# Orchestrator Observability Suite

This document describes the logging, metrics, and monitoring infrastructure implemented to provide full visibility into the orchestration system's performance, costs, and reliability.

## Table of Contents

1. [Structured Logging](#1-structured-logging)
2. [Metrics Collection](#2-metrics-collection)
3. [Automated Monitoring](#3-automated-monitoring)
4. [Workflow Analytics](#4-workflow-analytics)
5. [Configuration](#5-configuration)
6. [Testing](#6-testing)

---

## 1. Structured Logging

The system uses a structured logger that outputs both human-readable console logs and machine-readable JSON files.

### Log Levels

| Level   | Value | Description                                    |
| :------ | :---- | :--------------------------------------------- |
| `DEBUG` | 0     | Verbose technical details for troubleshooting. |
| `INFO`  | 1     | Standard operational events (default).         |
| `WARN`  | 2     | Non-critical issues or unexpected behaviors.   |
| `ERROR` | 3     | Critical failures and caught exceptions.       |

#### Basic Usage

```typescript
import { logger } from './utils/logger';

// Standard info log
logger.info('Orchestrator initialized');

// Log with metadata context
logger.warn('Agent retry initiated', {
  agent: 'Researcher',
  attempt: 2,
});
```

## 2. Metrics Collection

Metrics are in-memory quantitative data points used to track performance and system health without the overhead of disk I/O.

### Key Capabilities

**High-Resolution Timing:** Uses process.hrtime.bigint() for sub-millisecond precision.
**Dimensional Data:** Metrics support "tags" (e.g., workflowId, modelName) for advanced filtering.

#### Example code

```TypeScript
import { metrics } from './utils/metrics';

const stop = metrics.startTimer();
// ... logic ...
const duration = stop();

metrics.record('execution_time', duration, { agent: 'Writer' });
```

## 3. Automated Monitoring

The `OrchestratorMonitor` serves as a middleware layer to automatically instrument agent executions.

`traceExecution<T>`

Wraps an asynchronous function to capture its start, end, duration, and success/failure status automatically.

#### Example code

```TypeScript
import { OrchestratorMonitor } from './orchestrator/monitor';

const result = await OrchestratorMonitor.traceExecution(
  'ResearchAgent',
  'wf-001',
  async () => {
    return await agent.run();
  }
);
```

## 4. Workflow Analytics

The Analytics engine aggregates raw metrics into high-level summaries, perfect for dashboards or end-of-workflow reports.

Summary Generation

```TypeScript
import { analytics } from './utils/analytics';

const report = analytics.calculateWorkflowSummary('wf-001');
/*
Result:
{
  totalExecutionTime: 1250.25,
  apiCost: 0.012,
  successRate: 100,
  totalCalls: 4
}
*/
```

## 5. Configuration

System behavior can be adjusted via environment variables.

| Variable        | Description                             | Default                 |
| :-------------- | :-------------------------------------- | :---------------------- |
| `DEBUG`         | If true, enables verbose debug logging. | `false`                 |
| `NODE_ENV`      | If development, enables debug logging.  | `production`            |
| `LOG_FILE_PATH` | Path to the persistent JSON log file.   | `logs/orchestrator.log` |
