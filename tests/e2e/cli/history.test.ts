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

describe('CLI History Command', () => {
  jest.setTimeout(30_000);

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

  it('should list past operations and support repo/state filters', async () => {
    await writeState({
      runId: 'run-1',
      currentState: 'DONE',
      updatedAt: '2026-01-02T00:00:00.000Z',
      attempt: 1,
      context: {
        input: { owner: 'octocat', repo: 'Hello-World', issueNumber: 1 },
        costMetrics: { totalCost: 0.01, totalTokens: 100 },
      },
      history: ['IDLE'],
    });

    await writeState({
      runId: 'run-2',
      currentState: 'ERROR',
      updatedAt: '2026-01-03T00:00:00.000Z',
      attempt: 2,
      context: {
        input: { owner: 'someone', repo: 'Repo', issueNumber: 2 },
      },
      history: ['IDLE'],
      error: { code: 'E_FAIL', message: 'Failed' },
    });

    const all = run('history');
    expect(all).toContain('Workflow history');
    expect(all).toContain('run-1');
    expect(all).toContain('run-2');

    const filteredRepo = run('history --repo octocat/Hello-World');
    expect(filteredRepo).toContain('run-1');
    expect(filteredRepo).not.toContain('run-2');

    const filteredState = run('history --state ERROR');
    expect(filteredState).toContain('run-2');
    expect(filteredState).not.toContain('run-1');
  });

  it('should support date filtering (from/to) and limit', async () => {
    await writeState({
      runId: 'run-a',
      currentState: 'DONE',
      updatedAt: '2026-01-01T00:00:00.000Z',
      attempt: 1,
      context: { input: { owner: 'a', repo: 'b', issueNumber: 1 } },
      history: ['IDLE'],
    });

    await writeState({
      runId: 'run-b',
      currentState: 'DONE',
      updatedAt: '2026-01-05T00:00:00.000Z',
      attempt: 1,
      context: { input: { owner: 'a', repo: 'b', issueNumber: 2 } },
      history: ['IDLE'],
    });

    const filtered = run('history --from 2026-01-02T00:00:00.000Z --to 2026-01-06T00:00:00.000Z');
    expect(filtered).toContain('run-b');
    expect(filtered).not.toContain('run-a');

    const limited = run('history --limit 1');
    expect(limited).toContain('Workflow history');
  });

  it('should show detailed view for a specific run-id', async () => {
    await writeState({
      runId: 'run-detail',
      currentState: 'ERROR',
      updatedAt: '2026-01-04T00:00:00.000Z',
      attempt: 3,
      context: {
        input: { owner: 'octocat', repo: 'Hello-World', issueNumber: 7 },
        costMetrics: { totalCost: 0.2, totalTokens: 999 },
      },
      history: ['IDLE'],
      error: { code: 'E_X', message: 'Oops' },
    });

    const out = run('history --run-id run-detail');
    expect(out).toContain('Workflow operation details');
    expect(out).toContain('runId: run-detail');
    expect(out).toContain('state: ERROR');
    expect(out).toContain('issue: octocat/Hello-World#7');
    expect(out).toContain('cost: $0.2');
    expect(out).toContain('tokens: 999');
    expect(out).toContain('error: E_X - Oops');
  });

  it('should export history results to JSON', async () => {
    await writeState({
      runId: 'run-export',
      currentState: 'DONE',
      updatedAt: '2026-01-06T00:00:00.000Z',
      attempt: 1,
      context: { input: { owner: 'a', repo: 'b', issueNumber: 1 } },
      history: ['IDLE'],
    });

    const exportPath = path.join('.osc-agent', 'export.json');
    const out = run(`history --export ${exportPath}`);
    expect(out).toContain('exported:');

    const exported = await fs.readFile(path.join(rootDir, 'export.json'), 'utf8');
    const parsed = JSON.parse(exported) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(JSON.stringify(parsed)).toContain('run-export');
  });
});
