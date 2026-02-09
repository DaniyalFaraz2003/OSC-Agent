import { Command } from 'commander';
import readline from 'node:readline';
import chalk from 'chalk';
import { loadConfig } from '../../config/loader';
import { formatError, formatInfo, formatStep, formatSuccess, formatWarning, formatDiffBlock, formatVerboseAnalysis, formatVerboseSearchResults, formatVerboseFix } from '../formatters';
import { defaultBranchName, parseIssueNumber, parseRepoSlug, validateBranchName } from '../validators';
import { createIssueWorkflowCoordinator } from '../../orchestrator/register-handlers';
import type { IssueWorkflowRuntimeOptions } from '../../orchestrator/register-handlers';
import type { WorkflowData } from '../../orchestrator/data-flow';
import type { CoreState } from '../../orchestrator/states';
import type { AgentCoordinator } from '../../orchestrator/agent-coordinator';
import type { WorkflowLogger } from '../../orchestrator/workflow';

// ── Types ───────────────────────────────────────────────────────────────

export type IssueCommandOptions = {
  repo: string;
  issue: string;
  autoPr?: boolean;
  dryRun?: boolean;
  branch?: string;
  verbose?: boolean;
};

// ── Verbose-aware logger (reusable, backward-compatible) ────────────────

/** Logger that writes directly to the console with optional verbose detail */
export class CLIWorkflowLogger implements WorkflowLogger {
  constructor(
    private runId: string,
    private verbose: boolean,
  ) {}

  info(message: string, data?: Record<string, unknown>): void {
    if (this.verbose) {
      const suffix = data ? ` ${JSON.stringify(data)}` : '';
      console.log(formatInfo(`[${this.runId.slice(0, 8)}] ${message}${suffix}`));
    }
  }

  warn(message: string, data?: Record<string, unknown>): void {
    const suffix = data ? ` ${JSON.stringify(data)}` : '';
    console.warn(formatInfo(`WARN: ${message}${suffix}`));
  }

  error(message: string, data?: Record<string, unknown>): void {
    const suffix = data ? ` ${JSON.stringify(data)}` : '';
    console.error(formatError(`${message}${suffix}`));
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (this.verbose) {
      const suffix = data ? ` ${JSON.stringify(data)}` : '';
      console.log(formatInfo(`DEBUG: ${message}${suffix}`));
    }
  }
}

// ── Command registration ────────────────────────────────────────────────

export function registerIssueCommand(program: Command): void {
  program
    .command('issue')
    .description('Analyze a GitHub issue and generate a fix')
    .requiredOption('--repo <owner/repo>', 'Repository slug (owner/repo)')
    .requiredOption('--issue <number>', 'Issue number')
    .option('--auto-pr', 'Automatically apply changes and create a PR (no prompts)', false)
    .option('--dry-run', 'Preview only — analyze and show diffs without modifying files (default)', true)
    .option('--branch <name>', 'Branch name for the PR')
    .option('--verbose', 'Show detailed output')
    .action(async (options: IssueCommandOptions) => {
      await executeIssueCommand(options, program.opts().verbose === true);
    });
}

// ── Main execution ──────────────────────────────────────────────────────

/**
 * Executes the `osc issue` command.
 *
 * Phases:
 *  1. Validate inputs
 *  2. Analyze issue  (ANALYZING → SEARCHING → PLANNING → GENERATING)
 *  3. Display diffs
 *  4. [prompt] Apply patches? (interactive mode only)
 *  5. Apply + Build + Test + Review (APPLYING → BUILDING → TESTING → REVIEWING)
 *  6. [prompt] Create PR? (interactive mode only)
 *  7. Submit PR (SUBMITTING)
 *
 * Modes:
 *  - preview    (dry-run=true, default): show diffs, no writes, no prompts
 *  - interactive (dry-run=false, no auto-pr): show diffs, prompt before writes
 *  - automated   (auto-pr=true): apply + PR automatically, no prompts
 */
export async function executeIssueCommand(options: IssueCommandOptions, globalVerbose = false): Promise<void> {
  let interrupted = false;

  const onSigint = (): void => {
    if (interrupted) {
      // Second Ctrl+C: hard exit
      console.log(formatError('\nForce exit.'));
      process.exit(130);
    }
    interrupted = true;
    console.log(formatWarning('\nCtrl+C received. Stopping after current phase...'));
  };
  process.on('SIGINT', onSigint);

  try {
    // ── 1. INPUT VALIDATION ─────────────────────────────────────────

    const { owner, repo } = parseRepoSlug(options.repo);
    const issueNumber = parseIssueNumber(options.issue);
    const verbose = globalVerbose || Boolean(options.verbose);
    const autoPr = Boolean(options.autoPr);

    // dry-run defaults to true; --auto-pr forces it off
    const dryRun = autoPr ? false : options.dryRun !== false;

    const branch = options.branch ? validateBranchName(options.branch) : defaultBranchName(owner, repo, issueNumber);

    const mode: 'preview' | 'automated' | 'interactive' = dryRun ? 'preview' : autoPr ? 'automated' : 'interactive';

    // ── 2. DISPLAY HEADER ───────────────────────────────────────────

    console.log('');
    console.log(formatStep(`Processing ${owner}/${repo}#${issueNumber}`));
    console.log(formatInfo(`mode:    ${mode}`));
    console.log(formatInfo(`branch:  ${branch}`));
    console.log(formatInfo(`dryRun:  ${dryRun}`));
    console.log(formatInfo(`autoPr:  ${autoPr}`));
    if (verbose) console.log(formatInfo('verbose: true'));
    console.log('');

    // ── 3. LOAD CONFIG ──────────────────────────────────────────────

    const config = loadConfig();

    // ── 4. BUILD COORDINATOR ────────────────────────────────────────
    //
    // `runtime` is a mutable reference shared with handler closures.
    // We start in safe mode (dryRun=true) and flip it only after user
    // consent (or immediately in automated mode).

    const runtime: IssueWorkflowRuntimeOptions = { dryRun: true, autoPr: false };

    const coordinator = createIssueWorkflowCoordinator({
      config,
      owner,
      repo,
      issueNumber,
      runtime,
      branch,
    });

    let data: WorkflowData = { input: { owner, repo, issueNumber } };

    // ── PHASE 1: ANALYZING ──────────────────────────────────────────

    console.log(formatStep('Phase 1/4 — Analyzing issue...'));
    data = mergeData(data, await runPhase('Issue analysis', coordinator, 'ANALYZING', data));

    if (verbose && data.analysis) {
      console.log(
        formatVerboseAnalysis(data.analysis as { type: string; complexity: string; requirements: string[]; affected_files: string[] }),
      );
    }
    console.log(formatSuccess('Issue analyzed'));
    assertNotInterrupted(interrupted);

    // ── PHASE 2: SEARCHING ──────────────────────────────────────────

    console.log(formatStep('Phase 2/4 — Searching codebase...'));
    data = mergeData(data, await runPhase('Code search', coordinator, 'SEARCHING', data));
    console.log(formatSuccess(`Found ${data.searchResults?.length ?? 0} relevant file(s)`));

    if (verbose && data.searchResults) {
      console.log(formatVerboseSearchResults(data.searchResults));
    }
    assertNotInterrupted(interrupted);

    // ── PHASE 3: PLANNING ───────────────────────────────────────────

    console.log(formatStep('Phase 3/4 — Creating fix plan...'));
    data = mergeData(data, await runPhase('Fix planning', coordinator, 'PLANNING', data));
    console.log(formatSuccess('Fix plan ready'));
    assertNotInterrupted(interrupted);

    // ── PHASE 4: GENERATING PATCHES ─────────────────────────────────

    console.log(formatStep('Phase 4/4 — Generating patches...'));
    data = mergeData(data, await runPhase('Patch generation', coordinator, 'GENERATING', data));

    const patches = data.fixProposal?.patches ?? [];
    console.log(formatSuccess(`Generated ${patches.length} patch(es)`));

    if (verbose && data.fixProposal) {
      console.log(formatVerboseFix(data.fixProposal as { explanation: string; confidenceScore: number; patches: string[] }));
    }
    assertNotInterrupted(interrupted);

    // ── DISPLAY DIFFS ───────────────────────────────────────────────

    if (patches.length === 0) {
      console.log('');
      console.log(formatWarning('No patches were generated. Nothing to apply.'));
      return;
    }

    console.log('');
    console.log(formatStep('Proposed changes:'));
    console.log('');
    for (const patch of patches) {
      console.log(formatDiffBlock(patch));
      console.log('');
    }

    if (data.fixProposal?.explanation) {
      console.log(formatInfo(`Explanation: ${data.fixProposal.explanation}`));
      console.log('');
    }

    // ── DRY-RUN EXIT POINT ──────────────────────────────────────────

    if (dryRun) {
      console.log(chalk.yellow.bold('  Dry-run mode — no files were modified.'));
      console.log(formatInfo('Run with --no-dry-run to enable interactive mode.'));
      return;
    }

    // ── INTERACTIVE: PROMPT TO APPLY ────────────────────────────────

    if (!autoPr) {
      const wantsApply = await promptConfirm('Do you want to apply these changes? (y/N)');
      console.log('');

      if (!wantsApply) {
        console.log(formatInfo('Aborted. No files were modified.'));
        return;
      }
    } else {
      console.log(formatInfo('Auto-PR mode — applying changes automatically.'));
    }

    // ── APPLY PATCHES ───────────────────────────────────────────────

    console.log(formatStep('Applying patches...'));
    runtime.dryRun = false; // Enable filesystem writes

    data = mergeData(data, await runPhase('Patch application', coordinator, 'APPLYING', data));

    const appliedFiles = data.applyResult?.appliedFiles ?? [];
    console.log(formatSuccess(`Applied to ${appliedFiles.length} file(s):`));
    for (const f of appliedFiles) {
      console.log(formatInfo(`  \u2022 ${f}`));
    }
    assertNotInterrupted(interrupted);

    // ── BUILD ───────────────────────────────────────────────────────

    console.log(formatStep('Building project...'));
    data = mergeData(data, await runPhase('Build verification', coordinator, 'BUILDING', data));

    if (data.buildResult?.success) {
      console.log(formatSuccess('Build succeeded'));
    } else {
      console.log(formatWarning(`Build issues: ${data.buildResult?.errors?.join(', ') ?? 'unknown'}`));
    }
    assertNotInterrupted(interrupted);

    // ── TEST ────────────────────────────────────────────────────────

    console.log(formatStep('Running tests...'));
    data = mergeData(data, await runPhase('Test execution', coordinator, 'TESTING', data));

    if (data.testResult?.success) {
      console.log(formatSuccess('Tests passed'));
    } else {
      console.log(formatWarning('Some tests failed'));
    }
    assertNotInterrupted(interrupted);

    // ── REVIEW ──────────────────────────────────────────────────────

    console.log(formatStep('Reviewing changes...'));
    data = mergeData(data, await runPhase('Code review', coordinator, 'REVIEWING', data));

    if (data.reviewResult?.approved) {
      console.log(formatSuccess('Review: approved'));
    } else {
      console.log(formatWarning(`Review: ${data.reviewResult?.summary ?? 'not approved'}`));
    }
    assertNotInterrupted(interrupted);

    // ── POST-APPLY SUMMARY ──────────────────────────────────────────

    console.log('');
    console.log(formatStep('Summary of changes:'));
    console.log(formatInfo(`Files modified: ${appliedFiles.length}`));
    for (const f of appliedFiles) {
      console.log(formatInfo(`  \u2022 ${f}`));
    }
    if (data.fixProposal?.explanation) {
      console.log(formatInfo(`Explanation: ${data.fixProposal.explanation}`));
    }
    console.log('');

    // ── PR DECISION ─────────────────────────────────────────────────

    if (!autoPr) {
      const wantsPR = await promptConfirm('Do you want to create a Pull Request now? (y/N)');
      console.log('');

      if (!wantsPR) {
        console.log(formatSuccess('Changes applied locally. No PR created.'));
        return;
      }
    } else {
      console.log(formatInfo('Auto-PR mode — creating Pull Request automatically.'));
    }

    // ── SUBMIT PR ───────────────────────────────────────────────────

    console.log(formatStep('Creating Pull Request...'));
    runtime.autoPr = true; // Enable the real PR path in SUBMITTING handler

    data = mergeData(data, await runPhase('PR submission', coordinator, 'SUBMITTING', data));

    if (data.submission?.prUrl) {
      console.log(formatSuccess(`Pull Request created: ${data.submission.prUrl}`));
    } else if (data.submission?.commitMessage) {
      console.log(formatSuccess(`Changes committed: ${data.submission.commitMessage}`));
    }

    // ── DONE ────────────────────────────────────────────────────────

    console.log('');
    console.log(chalk.green.bold('  Workflow completed successfully.'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(formatError(msg));
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Execute a single phase via the coordinator, wrapping errors with context.
 */
async function runPhase(label: string, coordinator: AgentCoordinator, state: CoreState, data: WorkflowData): Promise<Partial<WorkflowData>> {
  try {
    return await coordinator.execute(state, data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} failed: ${msg}`);
  }
}

/** Immutable merge of base data with a partial update */
function mergeData(base: WorkflowData, update: Partial<WorkflowData>): WorkflowData {
  return { ...base, ...update };
}

/** Throw if the user pressed Ctrl+C between phases */
function assertNotInterrupted(interrupted: boolean): void {
  if (interrupted) {
    throw new Error('Workflow interrupted by user (Ctrl+C)');
  }
}

/**
 * Prompt the user for a yes/no confirmation.
 *
 * Returns `false` in non-TTY environments (CI, piped stdin) for safety.
 * Handles Ctrl+C during the prompt by returning `false`.
 */
async function promptConfirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.log(formatWarning('Non-interactive terminal detected. Defaulting to no.'));
    return false;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    let answered = false;

    rl.on('close', () => {
      if (!answered) {
        answered = true;
        resolve(false);
      }
    });

    rl.question(chalk.yellow(`  ${message} `), (answer) => {
      answered = true;
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}
