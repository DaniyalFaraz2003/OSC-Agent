import { Command } from 'commander';
import { loadConfig } from '../../config/loader';
import { formatError, formatInfo, formatStep, formatWorkflowResult } from '../formatters';
import { defaultBranchName, parseIssueNumber, parseRepoSlug, validateBranchName } from '../validators';
import { WorkflowOrchestrator } from '../../orchestrator/workflow';
import type { WorkflowInput } from '../../orchestrator/data-flow';
import { createIssueWorkflowCoordinator } from '../../orchestrator/register-handlers';

type IssueCommandOptions = {
  repo: string;
  issue: string;
  autoPr?: boolean;
  dryRun?: boolean;
  branch?: string;
};

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
      try {
        const { owner, repo } = parseRepoSlug(options.repo);
        const issueNumber = parseIssueNumber(options.issue);

        const branch = options.branch ? validateBranchName(options.branch) : defaultBranchName(owner, repo, issueNumber);
        const dryRun = Boolean(options.dryRun);
        const autoPr = Boolean(options.autoPr);

        console.log(formatStep(`Starting issue workflow for ${owner}/${repo}#${issueNumber}`));
        console.log(formatInfo(`branch: ${branch}`));
        console.log(formatInfo(`dryRun: ${dryRun}`));
        console.log(formatInfo(`autoPr: ${autoPr}`));

        const config = loadConfig();

        const coordinator = createIssueWorkflowCoordinator({
          config,
          owner,
          repo,
          issueNumber,
          runtime: { dryRun, autoPr },
        });

        const orchestrator = new WorkflowOrchestrator({
          coordinator,
        });

        const onSigint = (): void => {
          console.log(formatInfo('Ctrl+C received. Cancelling workflow...'));
          orchestrator.cancel();
        };

        process.once('SIGINT', onSigint);

        const input: WorkflowInput = { owner, repo, issueNumber };
        const result = await orchestrator.run(input);

        process.removeListener('SIGINT', onSigint);

        console.log(formatWorkflowResult(result, { dryRun }));

        if (result.status === 'failed') {
          process.exitCode = 1;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(formatError(msg));
        process.exitCode = 1;
      }
    });
}
