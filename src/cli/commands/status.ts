import { Command } from 'commander';
import { HistoryStore } from '../history-store';
import { formatError, formatInfo, formatSuccess } from '../formatters';

type Persisted = Awaited<ReturnType<HistoryStore['load']>>;

type StatusCommandOptions = {
  runId?: string;
  json?: boolean;
};

async function resolveState(store: HistoryStore, runId?: string): Promise<Persisted> {
  if (runId) {
    return store.load(runId);
  }

  const latest = await store.latest();
  if (!latest?.runId) return null;
  return store.load(latest.runId);
}

function renderText(state: NonNullable<Persisted>): void {
  const ctx = state.context;
  const input = ctx.input as { owner?: string; repo?: string; issueNumber?: number } | undefined;
  const costMetrics = ctx.costMetrics as { totalCost: number; totalTokens: number } | undefined;

  console.log(formatSuccess('Workflow status'));
  console.log(formatInfo(`runId: ${state.runId}`));
  if (input?.owner && input.repo && typeof input.issueNumber === 'number') {
    console.log(formatInfo(`issue: ${input.owner}/${input.repo}#${input.issueNumber}`));
  }
  console.log(formatInfo(`state: ${state.currentState}`));
  console.log(formatInfo(`attempt: ${state.attempt}`));
  console.log(formatInfo(`updatedAt: ${state.updatedAt}`));

  if (costMetrics) {
    console.log(formatInfo(`cost: $${costMetrics.totalCost}`));
    console.log(formatInfo(`tokens: ${costMetrics.totalTokens}`));
  }

  if (state.error) {
    console.log(formatError(`error: ${state.error.code} - ${state.error.message}`));
    if (state.error.details) console.log(formatInfo(`details: ${state.error.details}`));
  }
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show current workflow state')
    .option('--run-id <id>', 'Show status for a specific run id')
    .option('--json', 'Output status as JSON', false)
    .action(async (options: StatusCommandOptions) => {
      try {
        const store = new HistoryStore();

        const state = await resolveState(store, options.runId);

        if (!state) {
          const msg = options.runId ? `No state found for runId: ${options.runId}` : 'No workflow state found.';
          console.log(formatInfo(msg));
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(state, null, 2));
          return;
        }

        renderText(state);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(formatError(msg));
        process.exitCode = 1;
      }
    });
}
