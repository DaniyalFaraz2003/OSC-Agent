import { Command } from 'commander';
import { loadConfig } from '../../config/loader';
import { formatError, formatInfo, formatStep, formatStateTransition, formatWorkflowResult, formatVerboseAnalysis, formatVerboseSearchResults, formatVerboseFix } from '../formatters';
import { defaultBranchName, parseIssueNumber, parseRepoSlug, validateBranchName, validateFlags } from '../validators';
import { WorkflowOrchestrator } from '../../orchestrator/workflow';
import type { WorkflowLogger } from '../../orchestrator/workflow';
import type { WorkflowInput } from '../../orchestrator/data-flow';
import type { State } from '../../orchestrator/states';
import { createIssueWorkflowCoordinator } from '../../orchestrator/register-handlers';

// ── Types ───────────────────────────────────────────────────────────────

export type IssueCommandOptions = {
  repo: string;
  issue: string;
  autoPr?: boolean;
  dryRun?: boolean;
  branch?: string;
  verbose?: boolean;
};

// ── Verbose-aware logger ────────────────────────────────────────────────

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
    .description('Process a single GitHub issue')
    .requiredOption('--repo <owner/repo>', 'Repository slug in the form owner/repo')
    .requiredOption('--issue <number>', 'Issue number')
    .option('--auto-pr', 'Automatically create/update a PR', false)
    .option('--dry-run', 'Run without writing changes / creating PR', false)
    .option('--branch <name>', 'Branch name to use')
    .action(async (options: IssueCommandOptions) => {
      await executeIssueCommand(options, program.opts().verbose === true);
    });
}

// ── Execution (exported for testing) ────────────────────────────────────

export async function executeIssueCommand(options: IssueCommandOptions, globalVerbose = false): Promise<void> {
  try {
    // 1. Parse & validate inputs
    const { owner, repo } = parseRepoSlug(options.repo);
    const issueNumber = parseIssueNumber(options.issue);
    const dryRun = Boolean(options.dryRun);
    const autoPr = Boolean(options.autoPr);
    const verbose = globalVerbose || Boolean(options.verbose);

    validateFlags({ dryRun, autoPr });

    const branch = options.branch ? validateBranchName(options.branch) : defaultBranchName(owner, repo, issueNumber);

    // 2. Display header
    console.log(formatStep(`Processing ${owner}/${repo}#${issueNumber}`));
    console.log(formatInfo(`branch:  ${branch}`));
    console.log(formatInfo(`dryRun:  ${dryRun}`));
    console.log(formatInfo(`autoPr:  ${autoPr}`));
    if (verbose) console.log(formatInfo('verbose: true'));

    // 3. Load config
    const config = loadConfig();

    // 4. Build coordinator
    const coordinator = createIssueWorkflowCoordinator({
      config,
      owner,
      repo,
      issueNumber,
      runtime: { dryRun, autoPr },
    });

    // 5. Create orchestrator
    const logger = new CLIWorkflowLogger('issue', verbose);
    const orchestrator = new WorkflowOrchestrator({ coordinator, logger });

    // 6. Attach progress listener
    orchestrator.getStateMachine().events.on('stateChange', (event: { from: State; to: State }) => {
      console.log(formatStateTransition(event.from, event.to));
    });

    // 7. Attach verbose data listener (prints interim outputs after each state)
    if (verbose) {
      const origExecute = coordinator.execute.bind(coordinator);
      coordinator.execute = async (state: Parameters<typeof origExecute>[0], ctx: Parameters<typeof origExecute>[1]): ReturnType<typeof origExecute> => {
        const result = await origExecute(state, ctx);
        printInterimVerbose(state, { ...ctx, ...result });
        return result;
      };
    }

    // 8. SIGINT handler
    const onSigint = (): void => {
      console.log(formatInfo('\nCtrl+C received. Cancelling workflow...'));
      orchestrator.cancel();
    };
    process.once('SIGINT', onSigint);

    // 9. Run
    const input: WorkflowInput = { owner, repo, issueNumber };
    const result = await orchestrator.run(input);

    // 10. Cleanup
    process.removeListener('SIGINT', onSigint);

    // 11. Output
    console.log(formatWorkflowResult(result, { dryRun, verbose }));

    if (result.status === 'failed') {
      process.exitCode = 1;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(formatError(msg));
    process.exitCode = 1;
  }
}

// ── Verbose interim output ──────────────────────────────────────────────

function printInterimVerbose(state: string, data: Record<string, unknown>): void {
  switch (state) {
    case 'ANALYZING':
      if (data.analysis) {
        const a = data.analysis as { type: string; complexity: string; requirements: string[]; affected_files: string[] };
        console.log(formatVerboseAnalysis(a));
      }
      break;
    case 'SEARCHING':
      if (data.searchResults) {
        const s = data.searchResults as Array<{ filePath: string }>;
        console.log(formatVerboseSearchResults(s));
      }
      break;
    case 'GENERATING':
      if (data.fixProposal) {
        const f = data.fixProposal as { explanation: string; confidenceScore: number; patches: string[] };
        console.log(formatVerboseFix(f));
      }
      break;
    default:
      break;
  }
}
