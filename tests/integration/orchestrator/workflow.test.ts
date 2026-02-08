/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/require-await */
/**
 * Integration tests for the workflow orchestrator.
 *
 * These tests exercise the orchestrator end-to-end with mock handlers
 * that simulate realistic agent behaviour while keeping all external
 * dependencies (Gemini, GitHub, E2B) out of the loop.
 */
import { WorkflowOrchestrator } from '../../../src/orchestrator/workflow';
import type { WorkflowLogger } from '../../../src/orchestrator/workflow';
import { AgentCoordinator } from '../../../src/orchestrator/agent-coordinator';
import { StateMachine } from '../../../src/orchestrator/state-machine';
import { StateStore } from '../../../src/orchestrator/state-store';
import type { WorkflowInput } from '../../../src/orchestrator/data-flow';
import type { PersistedState } from '../../../src/orchestrator/states';

// ── Mocks ───────────────────────────────────────────────────────────────

jest.mock('../../../src/orchestrator/state-store');
jest.mock('../../../src/orchestrator/guards', () => ({
  transitionGuards: {},
}));

// ── Helpers ─────────────────────────────────────────────────────────────

const silentLogger: WorkflowLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

const INPUT: WorkflowInput = { owner: 'acme', repo: 'widget', issueNumber: 7 };

/**
 * Creates a StateStore mock that persists in memory so that
 * resume() can load the state saved by a previous run().
 */
function createPersistentMockStore(): jest.Mocked<StateStore> {
  let persisted: PersistedState | null = null;
  const store = new StateStore('mem') as jest.Mocked<StateStore>;
  store.save.mockImplementation(async (s: PersistedState) => {
    persisted = JSON.parse(JSON.stringify(s)) as PersistedState;
  });
  store.load.mockImplementation(async () => persisted);
  return store;
}

/** Build an AgentCoordinator with handlers that simulate real agent outputs */
function realisticCoordinator(): AgentCoordinator {
  const c = new AgentCoordinator();

  c.registerHandler('ANALYZING', async () => ({
    issue: { id: 7, number: 7, title: 'Widget crashes on null input', body: 'Steps to reproduce…', state: 'open' as const, user: { login: 'reporter' }, created_at: '2024-03-15', html_url: 'https://github.com/acme/widget/issues/7' },
    analysis: { type: 'bug' as const, complexity: 'medium' as const, requirements: ['Add null guard in Widget.render'], affected_files: ['src/widget.ts', 'src/utils.ts'], summary: 'Null check missing', rootCause: 'No guard' },
  }));

  c.registerHandler('SEARCHING', async () => ({
    searchResults: [
      { filePath: 'src/widget.ts', content: 'export class Widget { render(data: unknown) { return data.toString(); } }' },
      { filePath: 'src/utils.ts', content: 'export function format(v: string) { return v.trim(); }' },
    ],
  }));

  c.registerHandler('PLANNING', async () => ({
    plan: [
      { description: 'Add null guard in Widget.render', targetFiles: ['src/widget.ts'], strategy: 'minimal' },
      { description: 'Add null check in format utility', targetFiles: ['src/utils.ts'], strategy: 'minimal' },
    ],
  }));

  c.registerHandler('GENERATING', async () => ({
    fixProposal: {
      explanation: 'Added null guard to Widget.render and format utility',
      confidenceScore: 0.92,
      patches: ['--- a/src/widget.ts\n+++ b/src/widget.ts\n@@ -1 +1,2 @@\n+if (!data) return "";\n return data.toString();'],
      strategy: 'minimal' as const,
    },
  }));

  c.registerHandler('APPLYING', async () => ({
    applyResult: { appliedFiles: ['src/widget.ts', 'src/utils.ts'], patchCount: 2 },
  }));

  c.registerHandler('BUILDING', async () => ({
    buildResult: { success: true, output: 'tsc: 0 errors', errors: [] },
  }));

  c.registerHandler('TESTING', async () => ({
    testResult: { success: true, logs: 'PASS  src/widget.test.ts\n  5 tests passed', failureCount: 0, passedCount: 5 },
  }));

  c.registerHandler('REVIEWING', async () => ({
    reviewResult: { approved: true, summary: 'Null guard correctly added. No side-effects detected.', issues: [], suggestions: ['Consider adding JSDoc'] },
  }));

  c.registerHandler('SUBMITTING', async () => ({
    submission: { prNumber: 101, prUrl: 'https://github.com/acme/widget/pull/101', commitMessage: 'fix: add null guard in Widget.render (#7)' },
  }));

  return c;
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Workflow Integration', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Full pipeline ───────────────────────────────────────────────────

  it('should execute the complete pipeline end-to-end', async () => {
    const store = createPersistentMockStore();
    const machine = new StateMachine(store, 'int-run-1');

    const orch = new WorkflowOrchestrator({
      coordinator: realisticCoordinator(),
      runId: 'int-run-1',
      logger: silentLogger,
      maxAttempts: 3,
      stateMachine: machine,
    });

    const result = await orch.run(INPUT);

    expect(result.status).toBe('completed');
    expect(result.finalState).toBe('DONE');
    expect(result.data.submission?.prNumber).toBe(101);
    expect(result.data.submission?.prUrl).toContain('github.com');
    expect(result.data.analysis?.type).toBe('bug');
    expect(result.data.testResult?.success).toBe(true);
    expect(result.data.reviewResult?.approved).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  // ── End-to-end data flow ────────────────────────────────────────────

  it('should accumulate data across all nine states', async () => {
    const store = createPersistentMockStore();
    const machine = new StateMachine(store, 'int-run-2');
    const orch = new WorkflowOrchestrator({
      coordinator: realisticCoordinator(),
      runId: 'int-run-2',
      logger: silentLogger,
      stateMachine: machine,
    });

    const result = await orch.run(INPUT);

    // Every stage should have contributed data
    const d = result.data;
    expect(d.issue).toBeDefined();
    expect(d.analysis).toBeDefined();
    expect(d.searchResults).toBeDefined();
    expect(d.plan).toBeDefined();
    expect(d.fixProposal).toBeDefined();
    expect(d.applyResult).toBeDefined();
    expect(d.buildResult).toBeDefined();
    expect(d.testResult).toBeDefined();
    expect(d.reviewResult).toBeDefined();
    expect(d.submission).toBeDefined();
  });

  // ── Error recovery ──────────────────────────────────────────────────

  it('should recover from a transient GENERATING failure and complete', async () => {
    const store = createPersistentMockStore();
    const machine = new StateMachine(store, 'int-run-3');
    const coord = realisticCoordinator();

    let genAttempts = 0;
    coord.registerHandler('GENERATING', async () => {
      genAttempts++;
      if (genAttempts === 1) throw new Error('Gemini returned malformed JSON');
      return { fixProposal: { explanation: 'retry succeeded', confidenceScore: 0.8, patches: ['p1'], strategy: 'minimal' as const } };
    });

    const orch = new WorkflowOrchestrator({
      coordinator: coord,
      runId: 'int-run-3',
      logger: silentLogger,
      maxAttempts: 3,
      stateMachine: machine,
    });

    const result = await orch.run(INPUT);

    expect(result.status).toBe('completed');
    expect(genAttempts).toBe(2);
    expect(result.data.fixProposal?.explanation).toBe('retry succeeded');
  });

  it('should fail after exhausting retries in TESTING', async () => {
    const store = createPersistentMockStore();
    const machine = new StateMachine(store, 'int-run-4');
    const coord = realisticCoordinator();

    coord.registerHandler('TESTING', async () => {
      throw new Error('All tests failed');
    });

    const orch = new WorkflowOrchestrator({
      coordinator: coord,
      runId: 'int-run-4',
      logger: silentLogger,
      maxAttempts: 2,
      stateMachine: machine,
    });

    const result = await orch.run(INPUT);

    expect(result.status).toBe('failed');
    expect(result.finalState).toBe('ERROR');
    expect(result.error).toBeDefined();
  });

  // ── Pause / Resume ──────────────────────────────────────────────────

  it('should pause and then resume to completion', async () => {
    const store = createPersistentMockStore();
    const machine = new StateMachine(store, 'int-run-5');
    const coord = realisticCoordinator();

    const orch = new WorkflowOrchestrator({
      coordinator: coord,
      runId: 'int-run-5',
      logger: silentLogger,
      maxAttempts: 3,
      stateMachine: machine,
    });

    // Override handler AFTER orchestrator creation so the closure captures the const
    coord.registerHandler('PLANNING', async () => {
      orch.pause();
      return { plan: [{ description: 'Fix it', targetFiles: ['a.ts'], strategy: 'minimal' }] };
    });

    // Phase 1: run until paused
    const pausedResult = await orch.run(INPUT);
    expect(pausedResult.status).toBe('paused');
    expect(pausedResult.finalState).toBe('PAUSED');

    // Verify data accumulated so far
    expect(pausedResult.data.analysis).toBeDefined();
    expect(pausedResult.data.searchResults).toBeDefined();
    expect(pausedResult.data.plan).toBeDefined();

    // Phase 2: resume and complete
    const resumeResult = await orch.resume();
    expect(resumeResult.status).toBe('completed');
    expect(resumeResult.finalState).toBe('DONE');
    expect(resumeResult.data.submission).toBeDefined();
  });

  // ── Cancel ──────────────────────────────────────────────────────────

  it('should cancel mid-pipeline', async () => {
    const store = createPersistentMockStore();
    const machine = new StateMachine(store, 'int-run-6');
    const coord = realisticCoordinator();

    const orch = new WorkflowOrchestrator({
      coordinator: coord,
      runId: 'int-run-6',
      logger: silentLogger,
      stateMachine: machine,
    });

    coord.registerHandler('BUILDING', async () => {
      orch.cancel();
      return { buildResult: { success: true, output: '', errors: [] } };
    });

    const result = await orch.run(INPUT);

    expect(result.status).toBe('cancelled');
    expect(result.finalState).toBe('CANCELLED');
  });

  // ── Handler ordering ────────────────────────────────────────────────

  it('should call handlers in the correct pipeline order', async () => {
    const store = createPersistentMockStore();
    const machine = new StateMachine(store, 'int-run-7');

    const order: string[] = [];
    const coord = new AgentCoordinator();

    const states = ['ANALYZING', 'SEARCHING', 'PLANNING', 'GENERATING', 'APPLYING', 'BUILDING', 'TESTING', 'REVIEWING', 'SUBMITTING'] as const;

    for (const s of states) {
      coord.registerHandler(s, async () => {
        order.push(s);
        // Return minimal data needed by guards / downstream
        switch (s) {
          case 'ANALYZING':
            return { analysis: { type: 'bug' as const, complexity: 'simple' as const, requirements: [], affected_files: [], summary: '', rootCause: '' } };
          case 'SEARCHING':
            return { searchResults: [{ filePath: 'x.ts', content: '' }] };
          case 'PLANNING':
            return { plan: [] };
          case 'GENERATING':
            return { fixProposal: { explanation: '', confidenceScore: 1, patches: [], strategy: 'minimal' as const } };
          case 'APPLYING':
            return { applyResult: { appliedFiles: [], patchCount: 0 } };
          case 'BUILDING':
            return { buildResult: { success: true, output: '', errors: [] } };
          case 'TESTING':
            return { testResult: { success: true, logs: '', failureCount: 0, passedCount: 0 } };
          case 'REVIEWING':
            return { reviewResult: { approved: true, summary: '', issues: [], suggestions: [] } };
          case 'SUBMITTING':
            return { submission: { prNumber: 1, prUrl: '', commitMessage: '' } };
          default:
            return {};
        }
      });
    }

    const orch = new WorkflowOrchestrator({ coordinator: coord, runId: 'int-run-7', logger: silentLogger, stateMachine: machine });
    await orch.run(INPUT);

    expect(order).toEqual([...states]);
  });
});
