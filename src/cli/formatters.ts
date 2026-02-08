import chalk from 'chalk';
import type { WorkflowResult } from '../orchestrator/data-flow';
import type { State } from '../orchestrator/states';

// ── Primitives ──────────────────────────────────────────────────────────

export function formatStep(message: string): string {
  return chalk.cyan(`> ${message}`);
}

export function formatInfo(message: string): string {
  return chalk.gray(`  ${message}`);
}

export function formatSuccess(message: string): string {
  return chalk.green(`  ${message}`);
}

export function formatError(message: string): string {
  return chalk.red(`  ${message}`);
}

export function formatWarning(message: string): string {
  return chalk.yellow(`  ${message}`);
}

// ── State progress ──────────────────────────────────────────────────────

const STATE_LABELS: Partial<Record<State, string>> = {
  ANALYZING: 'Analyzing issue...',
  SEARCHING: 'Searching codebase...',
  PLANNING: 'Creating fix plan...',
  GENERATING: 'Generating code fix...',
  APPLYING: 'Applying patches...',
  BUILDING: 'Building project...',
  TESTING: 'Running tests...',
  REVIEWING: 'Reviewing changes...',
  SUBMITTING: 'Submitting PR...',
  DONE: 'Done',
  PAUSED: 'Paused',
  ERROR: 'Error',
  CANCELLED: 'Cancelled',
};

export function formatStateTransition(from: State, to: State): string {
  const label = STATE_LABELS[to] ?? to;
  return chalk.cyan(`  [${from} -> ${to}] ${label}`);
}

// ── Verbose interim output ──────────────────────────────────────────────

export function formatVerboseSection(title: string, body: string): string {
  const separator = chalk.gray('─'.repeat(60));
  return `${separator}\n${chalk.bold(title)}\n${body}\n${separator}`;
}

export function formatVerboseAnalysis(analysis: { type: string; complexity: string; requirements: string[]; affected_files: string[] }): string {
  const lines = [`  type:       ${analysis.type}`, `  complexity: ${analysis.complexity}`, `  requirements:`, ...analysis.requirements.map((r) => `    - ${r}`), `  affected files:`, ...analysis.affected_files.map((f) => `    - ${f}`)];
  return formatVerboseSection('Issue Analysis', lines.join('\n'));
}

export function formatVerboseSearchResults(results: Array<{ filePath: string }>): string {
  if (!results.length) return formatVerboseSection('Search Results', '  (no files found)');
  const lines = results.map((r) => `  - ${r.filePath}`);
  return formatVerboseSection('Search Results', `  ${results.length} file(s) found:\n${lines.join('\n')}`);
}

export function formatVerboseFix(fix: { explanation: string; confidenceScore: number; patches: string[] }): string {
  const lines = [`  explanation: ${fix.explanation}`, `  confidence:  ${(fix.confidenceScore * 100).toFixed(0)}%`, `  patches:     ${fix.patches.length}`];
  return formatVerboseSection('Generated Fix', lines.join('\n'));
}

// ── Final result ────────────────────────────────────────────────────────

export function formatWorkflowResult(result: WorkflowResult, opts?: { dryRun?: boolean; verbose?: boolean }): string {
  const lines: string[] = [''];

  if (result.status === 'completed') {
    lines.push(chalk.green.bold('Workflow completed successfully.'));
  } else if (result.status === 'cancelled') {
    lines.push(chalk.yellow.bold('Workflow cancelled.'));
  } else if (result.status === 'paused') {
    lines.push(chalk.yellow.bold('Workflow paused.'));
  } else {
    lines.push(chalk.red.bold('Workflow failed.'));
  }

  lines.push(formatInfo(`Run ID:    ${result.runId}`));
  lines.push(formatInfo(`State:     ${result.finalState}`));
  lines.push(formatInfo(`Attempts:  ${result.attempt}`));
  lines.push(formatInfo(`Duration:  ${(result.durationMs / 1000).toFixed(1)}s`));

  if (opts?.dryRun) {
    lines.push(formatWarning('(dry-run mode — no external changes were made)'));
  }

  if (result.error) {
    lines.push(formatError(`Error: [${result.error.code}] ${result.error.message}`));
    if (result.error.details && opts?.verbose) {
      lines.push(formatInfo(`Details: ${result.error.details}`));
    }
  }

  if (result.data?.submission?.prUrl) {
    lines.push(chalk.green.bold(`  PR: ${result.data.submission.prUrl}`));
  }

  if (result.data?.applyResult?.appliedFiles?.length) {
    lines.push(formatInfo(`Changed files: ${result.data.applyResult.appliedFiles.join(', ')}`));
  }

  return lines.join('\n');
}
