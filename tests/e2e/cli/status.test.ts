import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

type PersistedState = {
  runId: string;
  currentState: string;
  updatedAt: string;
  attempt: number;
  context: Record<string, unknown>;
  history: string[];
  error?: {
    code: string;
    message: string;
    details?: string;
  };
};

describe('CLI Status Command', () => {
  const run = (args: string): string => execSync(`node dist/src/cli/index.js ${args}`, { encoding: 'utf8' });
  const rootDir = path.resolve(process.cwd(), '.osc-agent');

  async function writeState(state: PersistedState): Promise<void> {
    const dir = path.join(rootDir, state.runId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify(state, null, 2), 'utf8');
  }

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('should show the latest workflow state when no run-id is provided', async () => {
    await writeState({
      runId: 'run-old',
      currentState: 'ANALYZING',
      updatedAt: '2026-01-01T00:00:00.000Z',
      attempt: 1,
      context: {
        input: { owner: 'octocat', repo: 'Hello-World', issueNumber: 1 },
        costMetrics: { totalCost: 0.01, totalTokens: 100 },
      },
      history: ['IDLE'],
    });

    await writeState({
      runId: 'run-new',
      currentState: 'DONE',
      updatedAt: '2026-01-02T00:00:00.000Z',
      attempt: 1,
      context: {
        input: { owner: 'octocat', repo: 'Hello-World', issueNumber: 2 },
        costMetrics: { totalCost: 0.02, totalTokens: 200 },
      },
      history: ['IDLE'],
    });

    const output = run('status');
    expect(output).toContain('Workflow status');
    expect(output).toContain('runId: run-new');
    expect(output).toContain('state: DONE');
    expect(output).toContain('issue: octocat/Hello-World#2');
    expect(output).toContain('cost: $0.02');
    expect(output).toContain('tokens: 200');
  });

  it('should show status for a specific run-id', async () => {
    await writeState({
      runId: 'run-specific',
      currentState: 'ERROR',
      updatedAt: '2026-01-03T00:00:00.000Z',
      attempt: 2,
      context: {
        input: { owner: 'a', repo: 'b', issueNumber: 3 },
      },
      history: ['IDLE'],
      error: { code: 'E_TEST', message: 'Boom' },
    });

    const output = run('status --run-id run-specific');
    expect(output).toContain('runId: run-specific');
    expect(output).toContain('state: ERROR');
    expect(output).toContain('error: E_TEST - Boom');
  });
});
