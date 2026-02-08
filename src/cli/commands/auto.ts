import { Command } from 'commander';
import { GitHubClient } from '../../github/client';
import { GitHubIssue } from '../../github/types';
import { TaskQueue } from '../../orchestrator/queue';
import { TaskScheduler } from '../../orchestrator/scheduler';
import { QueueStore } from '../../orchestrator/queue-store';
import { Dashboard } from '../dashboard.js';
import { filterIssues, parseFilters } from '../filters.js';
import { validateAutoOptions, ValidationError } from '../validators/auto.js';
import { AutoCommandOptions, IssueTask } from '../types.js';
import { logger } from '../../utils/logger.js';

/**
 * Register the autonomous mode command
 *
 * @param program - Commander program instance
 */
export function registerAutoCommand(program: Command): void {
  program
    .command('auto')
    .description('Continuously process issues from a repository')
    .requiredOption('--repo <owner/repo>', 'GitHub repository (owner/repo)')
    .option('--max-issues <number>', 'Maximum number of issues to process', parseInt)
    .option('--interval <seconds>', 'Polling interval in seconds', parseInt, 300)
    .option('--filters <labels>', 'Comma-separated labels to filter (e.g., "bug,help-wanted")')
    .option('--resume', 'Resume from previous session')
    .option('--dry-run', "Preview mode - don't actually process issues")
    .action(async (options) => {
      try {
        await handleAutoCommand(options as AutoCommandOptions);
      } catch (error) {
        if (error instanceof ValidationError) {
          logger.error(error.message);
          process.exit(1);
        }
        logger.error('Auto command failed:', error);
        process.exit(1);
      }
    });
}

/**
 * Handle autonomous mode command
 */
async function handleAutoCommand(options: AutoCommandOptions): Promise<void> {
  // Validate options
  const validatedOptions = validateAutoOptions(options);
  const parts = validatedOptions.repo.split('/');
  const owner = parts[0]!;
  const repo = parts[1]!;

  logger.info(`Starting autonomous mode for ${owner}/${repo}`);
  if (validatedOptions.dryRun) {
    logger.info('DRY RUN MODE - No issues will be processed');
  }

  // Initialize queue and store
  const queue = new TaskQueue<IssueTask>({ maxConcurrent: 1 });
  const store = new QueueStore();

  // Resume from previous session if requested
  if (validatedOptions.resume) {
    const loaded = await store.load(queue);
    if (loaded) {
      logger.info('Resumed from previous session');
    } else {
      logger.warn('No previous session found, starting fresh');
    }
  }

  // Initialize dashboard
  const dashboard = new Dashboard();
  dashboard.start();

  // Fetch and filter issues
  try {
    const issues = await fetchIssues(owner, repo);
    logger.info(`Fetched ${issues.length} issues from ${owner}/${repo}`);

    const filters = parseFilters(validatedOptions.filters);
    const filteredIssues = filterIssues(issues, filters);
    logger.info(`Filtered to ${filteredIssues.length} issues`);

    // Limit to maxIssues
    const issuesToProcess = filteredIssues.slice(0, validatedOptions.maxIssues);

    // Enqueue issues with priorities
    for (const issue of issuesToProcess) {
      const priority = calculatePriority(issue);
      const task: IssueTask = {
        owner,
        repo,
        issueNumber: issue.number,
        title: issue.title,
      };
      queue.add(task, priority);
    }

    logger.info(`Enqueued ${issuesToProcess.length} issues`);
    dashboard.updateStats(queue.getStats());

    if (validatedOptions.dryRun) {
      logger.info('Dry run complete. Exiting.');
      dashboard.stop();
      return;
    }

    // Start task scheduler
    const scheduler = new TaskScheduler<IssueTask>(
      queue,
      async (task) => {
        dashboard.updateCurrent(`Processing issue #${task.issueNumber}: ${task.title}`);
        logger.info(`Processing issue #${task.issueNumber}`);

        // TODO: Integrate with workflow orchestrator (Task 4.3)
        // For now, simulate processing
        await new Promise((resolve) => setTimeout(resolve, 2000));

        dashboard.incrementCompleted();
        dashboard.updateStats(queue.getStats());
      },
      validatedOptions.interval * 1000,
    );

    scheduler.start();

    // Graceful shutdown
    setupGracefulShutdown(scheduler, dashboard, queue, store);

    // Keep process alive
    await new Promise(() => {});
  } catch (error) {
    logger.error('Failed to fetch or process issues:', error);
    dashboard.stop();
    throw error;
  }
}

/**
 * Fetch issues from GitHub
 * Note: Requires GitHub token in environment (GITHUB_TOKEN)
 */
async function fetchIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }

  const client = new GitHubClient({ token });
  return await client.listIssues(owner, repo);
}

/**
 * Calculate priority for an issue based on labels
 */
function calculatePriority(issue: GitHubIssue): number {
  let priority = 5; // default

  const labels = issue.labels?.map((l) => l.name?.toLowerCase() || '') || [];

  if (labels.includes('priority: high') || labels.includes('urgent')) {
    priority = 8;
  } else if (labels.includes('priority: low')) {
    priority = 3;
  } else if (labels.includes('good first issue')) {
    priority = 4;
  } else if (labels.includes('bug')) {
    priority = 6;
  }

  return priority;
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown(scheduler: TaskScheduler<IssueTask>, dashboard: Dashboard, queue: TaskQueue<IssueTask>, store: QueueStore): void {
  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down gracefully...');
    scheduler.stop();
    dashboard.stop();

    logger.info('Saving queue state...');
    await store.save(queue);

    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}
