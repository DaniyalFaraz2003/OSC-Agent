import { Command } from 'commander';
import path from 'node:path';
import { HistoryStore } from '../history-store';
import { formatError, formatInfo, formatSuccess } from '../formatters';
import type { State } from '../../orchestrator/states';

type HistoryCommandOptions = {
  runId?: string;
  repo?: string;
  state?: State;
  from?: string;
  to?: string;
  limit?: string;
  export?: string;
  json?: boolean;
};

function parseDate(input: string | undefined): Date | undefined {
  if (!input) return undefined;
  const d = new Date(input);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

function parseLimit(input: string | undefined): number | undefined {
  if (!input) return undefined;
  const n = Number.parseInt(input, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function showDetail(store: HistoryStore, runId: string, json: boolean | undefined): Promise<void> {
  const detail = await store.detail(runId);
  if (!detail) {
    console.log(formatInfo(`No history found for runId: ${runId}`));
    return;
  }

  if (json) {
    console.log(JSON.stringify(detail, null, 2));
    return;
  }

  const input = detail.state.context?.input as { owner?: string; repo?: string; issueNumber?: number } | undefined;
  const cost = detail.state.context?.costMetrics as { totalCost: number; totalTokens: number } | undefined;

  console.log(formatSuccess('Workflow operation details'));
  console.log(formatInfo(`runId: ${detail.state.runId}`));
  console.log(formatInfo(`state: ${detail.state.currentState}`));
  console.log(formatInfo(`updatedAt: ${detail.state.updatedAt}`));
  console.log(formatInfo(`attempt: ${detail.state.attempt}`));
  if (input?.owner && input.repo && typeof input.issueNumber === 'number') {
    console.log(formatInfo(`issue: ${input.owner}/${input.repo}#${input.issueNumber}`));
  }
  if (cost) {
    console.log(formatInfo(`cost: $${cost.totalCost}`));
    console.log(formatInfo(`tokens: ${cost.totalTokens}`));
  }
  if (detail.state.error) {
    console.log(formatError(`error: ${detail.state.error.code} - ${detail.state.error.message}`));
    if (detail.state.error.details) console.log(formatInfo(`details: ${detail.state.error.details}`));
  }
}

async function showList(store: HistoryStore, options: HistoryCommandOptions): Promise<void> {
  const from = parseDate(options.from);
  const to = parseDate(options.to);
  const limit = parseLimit(options.limit);

  const entries = await store.list({
    repo: options.repo,
    state: options.state,
    from,
    to,
    limit,
  });

  if (options.export) {
    const exportPath = path.resolve(process.cwd(), options.export);
    await store.exportToFile(entries, exportPath);
  }

  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (!entries.length) {
    console.log(formatInfo('No history entries found.'));
    return;
  }

  console.log(formatSuccess('Workflow history'));
  for (const e of entries) {
    const slug = e.input ? `${e.input.owner}/${e.input.repo}` : '';
    const issue = e.input ? `#${e.input.issueNumber}` : '';
    const cost = e.costMetrics ? ` $${e.costMetrics.totalCost}` : '';
    console.log(formatInfo(`${e.updatedAt} ${e.runId} ${slug}${issue} ${e.currentState}${cost}`.trim()));
  }

  if (options.export) {
    console.log(formatInfo(`exported: ${options.export}`));
  }
}

export function registerHistoryCommand(program: Command): void {
  program
    .command('history')
    .description('List past workflow operations')
    .option('--run-id <id>', 'Show detailed view for a specific run id')
    .option('--repo <owner/repo>', 'Filter by repository slug')
    .option('--state <state>', 'Filter by workflow state')
    .option('--from <date>', 'Filter by updatedAt >= date (ISO string)')
    .option('--to <date>', 'Filter by updatedAt <= date (ISO string)')
    .option('--limit <n>', 'Limit number of results')
    .option('--export <file>', 'Export results to JSON file')
    .option('--json', 'Output as JSON', false)
    .action(async (options: HistoryCommandOptions) => {
      try {
        const store = new HistoryStore();

        if (options.runId) {
          await showDetail(store, options.runId, options.json);
          return;
        }

        await showList(store, options);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(formatError(msg));
        process.exitCode = 1;
      }
    });
}
