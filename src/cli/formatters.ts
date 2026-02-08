import chalk from 'chalk';
import type { WorkflowResult } from '../orchestrator/data-flow';

export function formatStep(message: string): string {
  return chalk.cyan(message);
}

export function formatInfo(message: string): string {
  return chalk.gray(message);
}

export function formatSuccess(message: string): string {
  return chalk.green(message);
}

export function formatError(message: string): string {
  return chalk.red(message);
}

export function formatWorkflowResult(result: WorkflowResult, opts?: { dryRun?: boolean }): string {
  const lines: string[] = [];

  if (result.status === 'completed') {
    lines.push(formatSuccess('Workflow completed successfully.'));
  } else if (result.status === 'cancelled') {
    lines.push(formatInfo('Workflow cancelled.'));
  } else if (result.status === 'paused') {
    lines.push(formatInfo('Workflow paused.'));
  } else {
    lines.push(formatError('Workflow failed.'));
  }

  lines.push(formatInfo(`runId: ${result.runId}`));
  lines.push(formatInfo(`finalState: ${result.finalState}`));
  lines.push(formatInfo(`attempt: ${result.attempt}`));
  lines.push(formatInfo(`durationMs: ${result.durationMs}`));

  if (opts?.dryRun) {
    lines.push(formatInfo('dryRun: true'));
  }

  if (result.error) {
    lines.push(formatError(`error: ${result.error.code} - ${result.error.message}`));
    if (result.error.details) lines.push(formatInfo(`details: ${result.error.details}`));
  }

  if (result.data?.submission?.prUrl) {
    lines.push(formatSuccess(`PR: ${result.data.submission.prUrl}`));
  }

  if (result.data?.applyResult?.appliedFiles?.length) {
    lines.push(formatInfo(`changedFiles: ${result.data.applyResult.appliedFiles.join(', ')}`));
  }

  return lines.join('\n');
}
