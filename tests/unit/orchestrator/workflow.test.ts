/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/require-await */
import { WorkflowOrchestrator, ConsoleWorkflowLogger } from '../../../src/orchestrator/workflow';
import type { WorkflowLogger } from '../../../src/orchestrator/workflow';
import { AgentCoordinator } from '../../../src/orchestrator/agent-coordinator';
import { RecoveryManager } from '../../../src/orchestrator/recovery';
import type { ErrorClassification } from '../../../src/orchestrator/recovery';
import { StateMachine } from '../../../src/orchestrator/state-machine';
import { StateStore } from '../../../src/orchestrator/state-store';
import type { WorkflowData, WorkflowInput } from '../../../src/orchestrator/data-flow';
import { workflowDataToContext, contextToWorkflowData, SUCCESS_TRIGGERS, OPERATIONAL_STATES } from '../../../src/orchestrator/data-flow';
import type { PersistedState } from '../../../src/orchestrator/states';

// ── Mocks ───────────────────────────────────────────────────────────────

jest.mock('../../../src/orchestrator/state-store');
jest.mock('../../../src/orchestrator/guards', () => ({
  transitionGuards: {},
}));

// ── Helpers ─────────────────────────────────────────────────────────────

function createSilentLogger(): WorkflowLogger {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function createMockStore(): jest.Mocked<StateStore> {
  const store = new StateStore('test-path') as jest.Mocked<StateStore>;
  store.save.mockResolvedValue(undefined);
  store.load.mockResolvedValue(null);
  return store;
}

const TEST_INPUT: WorkflowInput = { owner: 'test-owner', repo: 'test-repo', issueNumber: 42 };

/** Register all nine operational-state handlers with minimal valid returns */
function registerAllHandlers(coordinator: AgentCoordinator): void {
  coordinator.registerHandler('ANALYZING', async () => ({
    issue: { id: 1, number: 42, title: 'Bug', body: 'Fix it', state: 'open' as const, user: { login: 'u' }, created_at: '2024-01-01', html_url: '' },
    analysis: { type: 'bug' as const, complexity: 'simple' as const, requirements: ['fix'], affected_files: ['a.ts'], summary: '', rootCause: '' },
  }));
  coordinator.registerHandler('SEARCHING', async () => ({
    searchResults: [{ filePath: 'a.ts', content: 'const x = 1;' }],
  }));
  coordinator.registerHandler('PLANNING', async () => ({
    plan: [{ description: 'Fix bug in a.ts', targetFiles: ['a.ts'], strategy: 'minimal' }],
  }));
  coordinator.registerHandler('GENERATING', async () => ({
    fixProposal: { explanation: 'Fixed variable', confidenceScore: 0.95, patches: ['--- a.ts\n+++ a.ts\n@@ ...\n-const x = 1;\n+const x = 2;'], strategy: 'minimal' as const },
  }));
  coordinator.registerHandler('APPLYING', async () => ({
    applyResult: { appliedFiles: ['a.ts'], patchCount: 1 },
  }));
  coordinator.registerHandler('BUILDING', async () => ({
    buildResult: { success: true, output: 'Build OK', errors: [] },
  }));
  coordinator.registerHandler('TESTING', async () => ({
    testResult: { success: true, logs: '5 passed', failureCount: 0, passedCount: 5 },
  }));
  coordinator.registerHandler('REVIEWING', async () => ({
    reviewResult: { approved: true, summary: 'LGTM', issues: [], suggestions: [] },
  }));
  coordinator.registerHandler('SUBMITTING', async () => ({
    submission: { prNumber: 99, prUrl: 'https://github.com/o/r/pull/99', commitMessage: 'fix: resolved issue #42' },
  }));
}

// ═══════════════════════════════════════════════════════════════════════
// AgentCoordinator
// ═══════════════════════════════════════════════════════════════════════

describe('AgentCoordinator', () => {
  it('should register and execute a handler', async () => {
    const coordinator = new AgentCoordinator();
    const handler = jest.fn().mockResolvedValue({ analysis: { type: 'bug' } });
    coordinator.registerHandler('ANALYZING', handler);

    const data: WorkflowData = { input: TEST_INPUT };
    const result = await coordinator.execute('ANALYZING', data);

    expect(handler).toHaveBeenCalledWith(data);
    expect(result).toEqual({ analysis: { type: 'bug' } });
  });

  it('should throw when no handler is registered', async () => {
    const coordinator = new AgentCoordinator();
    await expect(coordinator.execute('ANALYZING', { input: TEST_INPUT })).rejects.toThrow('No handler registered for state: ANALYZING');
  });

  it('should report registered states', () => {
    const coordinator = new AgentCoordinator();
    coordinator.registerHandler('ANALYZING', async () => ({}));
    coordinator.registerHandler('TESTING', async () => ({}));
    expect(coordinator.getRegisteredStates()).toEqual(expect.arrayContaining(['ANALYZING', 'TESTING']));
    expect(coordinator.getRegisteredStates()).toHaveLength(2);
  });

  it('should report whether a handler exists', () => {
    const coordinator = new AgentCoordinator();
    expect(coordinator.hasHandler('ANALYZING')).toBe(false);
    coordinator.registerHandler('ANALYZING', async () => ({}));
    expect(coordinator.hasHandler('ANALYZING')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// RecoveryManager
// ═══════════════════════════════════════════════════════════════════════

describe('RecoveryManager', () => {
  const recovery = new RecoveryManager(3);

  it('should classify fatal errors', () => {
    const result = recovery.classify(new Error('Authentication failed'), 'ANALYZING');
    expect(result.severity).toBe('fatal');
    expect(result.code).toBe('FATAL_ERROR');
    expect(result.retryTarget).toBeUndefined();
  });

  it('should classify retryable errors in fix-cycle states', () => {
    const result = recovery.classify(new Error('JSON parse failure'), 'GENERATING');
    expect(result.severity).toBe('retryable');
    expect(result.retryTarget).toBe('GENERATING');
  });

  it('should classify errors in TESTING as retryable', () => {
    const result = recovery.classify(new Error('Tests failed'), 'TESTING');
    expect(result.severity).toBe('retryable');
    expect(result.retryTarget).toBe('GENERATING');
  });

  it('should classify errors in REVIEWING as retryable', () => {
    const result = recovery.classify(new Error('Review parsing failed'), 'REVIEWING');
    expect(result.severity).toBe('retryable');
    expect(result.retryTarget).toBe('GENERATING');
  });

  it('should classify transient errors in early states without retry target', () => {
    const result = recovery.classify(new Error('rate limit exceeded'), 'SEARCHING');
    expect(result.severity).toBe('transient');
    expect(result.retryTarget).toBeUndefined();
  });

  it('should classify unknown errors in early states as fatal', () => {
    const result = recovery.classify(new Error('something unexpected'), 'PLANNING');
    expect(result.severity).toBe('fatal');
    expect(result.code).toBe('UNRECOVERABLE_ERROR');
  });

  it('should classify non-Error values', () => {
    const result = recovery.classify('string error', 'GENERATING');
    expect(result.message).toBe('string error');
    expect(result.severity).toBe('retryable');
  });

  it('should allow retry when within attempt limit and retryable', () => {
    const classification: ErrorClassification = { severity: 'retryable', code: 'X', message: 'x', retryTarget: 'GENERATING' };
    expect(recovery.shouldRetry(1, classification)).toBe(true);
    expect(recovery.shouldRetry(2, classification)).toBe(true);
    expect(recovery.shouldRetry(3, classification)).toBe(false); // at max
  });

  it('should not allow retry for fatal errors', () => {
    const classification: ErrorClassification = { severity: 'fatal', code: 'X', message: 'x' };
    expect(recovery.shouldRetry(1, classification)).toBe(false);
  });

  it('should not allow retry when retryTarget is undefined', () => {
    const classification: ErrorClassification = { severity: 'transient', code: 'X', message: 'x' };
    expect(recovery.shouldRetry(1, classification)).toBe(false);
  });

  it('should expose maxAttempts', () => {
    expect(recovery.getMaxAttempts()).toBe(3);
    const custom = new RecoveryManager(5);
    expect(custom.getMaxAttempts()).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Data-Flow Utilities
// ═══════════════════════════════════════════════════════════════════════

describe('data-flow utilities', () => {
  it('workflowDataToContext should omit undefined values', () => {
    const data: WorkflowData = { input: TEST_INPUT, analysis: undefined };
    const ctx = workflowDataToContext(data);
    expect(ctx.input).toEqual(TEST_INPUT);
    expect('analysis' in ctx).toBe(false);
  });

  it('contextToWorkflowData should restore known fields', () => {
    const ctx: Record<string, unknown> = {
      input: TEST_INPUT,
      analysis: { type: 'bug' },
      unknown_field: 'ignored-by-type',
    };
    const data = contextToWorkflowData(ctx);
    expect(data.input).toEqual(TEST_INPUT);
    expect(data.analysis).toEqual({ type: 'bug' });
  });

  it('contextToWorkflowData should provide default input when missing', () => {
    const data = contextToWorkflowData({});
    expect(data.input).toEqual({ owner: '', repo: '', issueNumber: 0 });
  });

  it('SUCCESS_TRIGGERS should have entries for all operational states', () => {
    for (const state of OPERATIONAL_STATES) {
      expect(SUCCESS_TRIGGERS[state]).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ConsoleWorkflowLogger
// ═══════════════════════════════════════════════════════════════════════

describe('ConsoleWorkflowLogger', () => {
  it('should log without errors', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new ConsoleWorkflowLogger('run-123');
    logger.info('test message', { key: 'value' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('INFO'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('run-123'));
    spy.mockRestore();
  });

  it('should work without a run id', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new ConsoleWorkflowLogger();
    logger.info('msg');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[OSC]'));
    spy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// WorkflowOrchestrator
// ═══════════════════════════════════════════════════════════════════════

describe('WorkflowOrchestrator', () => {
  let coordinator: AgentCoordinator;
  let logger: WorkflowLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    coordinator = new AgentCoordinator();
    registerAllHandlers(coordinator);
    logger = createSilentLogger();
  });

  // ── Helpers ─────────────────────────────────────────────────────────

  function createOrchestrator(overrides?: Partial<{ coordinator: AgentCoordinator; maxAttempts: number; stateMachine: StateMachine }>): WorkflowOrchestrator {
    const store = createMockStore();
    const machine = overrides?.stateMachine ?? new StateMachine(store, 'test-run');
    return new WorkflowOrchestrator({
      coordinator: overrides?.coordinator ?? coordinator,
      runId: 'test-run',
      logger,
      maxAttempts: overrides?.maxAttempts ?? 3,
      stateMachine: machine,
    });
  }

  // ── Happy Path ──────────────────────────────────────────────────────

  describe('run() — happy path', () => {
    it('should execute the full pipeline from IDLE to DONE', async () => {
      const orch = createOrchestrator();
      const result = await orch.run(TEST_INPUT);

      expect(result.status).toBe('completed');
      expect(result.finalState).toBe('DONE');
      expect(result.runId).toBe('test-run');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.data.submission?.prNumber).toBe(99);
    });

    it('should pass accumulated data to downstream handlers', async () => {
      const received: WorkflowData[] = [];

      const tracking = new AgentCoordinator();
      tracking.registerHandler('ANALYZING', async () => ({
        analysis: { type: 'bug' as const, complexity: 'simple' as const, requirements: ['fix'], affected_files: ['a.ts'], summary: '', rootCause: '' },
      }));
      tracking.registerHandler('SEARCHING', async (ctx) => {
        received.push({ ...ctx });
        return { searchResults: [{ filePath: 'a.ts', content: '' }] };
      });
      tracking.registerHandler('PLANNING', async (ctx) => {
        received.push({ ...ctx });
        return { plan: [] };
      });
      tracking.registerHandler('GENERATING', async () => ({ fixProposal: { explanation: '', confidenceScore: 1, patches: [], strategy: 'minimal' as const } }));
      tracking.registerHandler('APPLYING', async () => ({ applyResult: { appliedFiles: [], patchCount: 0 } }));
      tracking.registerHandler('BUILDING', async () => ({ buildResult: { success: true, output: '', errors: [] } }));
      tracking.registerHandler('TESTING', async () => ({ testResult: { success: true, logs: '', failureCount: 0, passedCount: 0 } }));
      tracking.registerHandler('REVIEWING', async () => ({ reviewResult: { approved: true, summary: '', issues: [], suggestions: [] } }));
      tracking.registerHandler('SUBMITTING', async () => ({ submission: { prNumber: 1, prUrl: '', commitMessage: '' } }));

      const orch = createOrchestrator({ coordinator: tracking });
      await orch.run(TEST_INPUT);

      // SEARCHING handler should see the analysis from ANALYZING
      expect(received[0]?.analysis).toBeDefined();
      expect(received[0]?.analysis?.type).toBe('bug');

      // PLANNING handler should see both analysis and searchResults
      expect(received[1]?.searchResults).toBeDefined();
      expect(received[1]?.analysis).toBeDefined();
    });
  });

  // ── Error Handling ──────────────────────────────────────────────────

  describe('run() — error handling', () => {
    it('should end in failed when a handler throws a fatal error', async () => {
      const failing = new AgentCoordinator();
      failing.registerHandler('ANALYZING', async () => {
        throw new Error('Authentication failed');
      });

      const orch = createOrchestrator({ coordinator: failing, maxAttempts: 1 });
      const result = await orch.run(TEST_INPUT);

      expect(result.status).toBe('failed');
      expect(result.finalState).toBe('ERROR');
      expect(result.error?.code).toBe('FATAL_ERROR');
    });

    it('should end in failed when no handler is registered', async () => {
      const empty = new AgentCoordinator();
      const orch = createOrchestrator({ coordinator: empty, maxAttempts: 1 });
      const result = await orch.run(TEST_INPUT);

      expect(result.status).toBe('failed');
      expect(result.finalState).toBe('ERROR');
      expect(result.error?.message).toContain('No handler registered');
    });
  });

  // ── Retry / Recovery ────────────────────────────────────────────────

  describe('run() — retry logic', () => {
    it('should recover from a retryable error in GENERATING', async () => {
      let genCalls = 0;
      const retryCoord = new AgentCoordinator();
      registerAllHandlers(retryCoord); // base handlers

      // Override GENERATING to fail on first call
      retryCoord.registerHandler('GENERATING', async () => {
        genCalls++;
        if (genCalls === 1) throw new Error('Failed to parse AI response');
        return { fixProposal: { explanation: '', confidenceScore: 1, patches: [], strategy: 'minimal' as const } };
      });

      const orch = createOrchestrator({ coordinator: retryCoord, maxAttempts: 3 });
      const result = await orch.run(TEST_INPUT);

      expect(result.status).toBe('completed');
      expect(genCalls).toBe(2);
    });

    it('should fail after exhausting max retry attempts', async () => {
      const alwaysFail = new AgentCoordinator();
      registerAllHandlers(alwaysFail);
      alwaysFail.registerHandler('GENERATING', async () => {
        throw new Error('Persistent generation failure');
      });

      const orch = createOrchestrator({ coordinator: alwaysFail, maxAttempts: 2 });
      const result = await orch.run(TEST_INPUT);

      expect(result.status).toBe('failed');
      expect(result.finalState).toBe('ERROR');
    });

    it('should recover from TESTING failure by retrying from GENERATING', async () => {
      let testCalls = 0;
      let genCalls = 0;
      const retryCoord = new AgentCoordinator();
      registerAllHandlers(retryCoord);

      retryCoord.registerHandler('GENERATING', async () => {
        genCalls++;
        return { fixProposal: { explanation: `attempt-${genCalls}`, confidenceScore: 1, patches: [], strategy: 'minimal' as const } };
      });
      retryCoord.registerHandler('TESTING', async () => {
        testCalls++;
        if (testCalls === 1) throw new Error('Tests failed');
        return { testResult: { success: true, logs: '', failureCount: 0, passedCount: 1 } };
      });

      const orch = createOrchestrator({ coordinator: retryCoord, maxAttempts: 5 });
      const result = await orch.run(TEST_INPUT);

      expect(result.status).toBe('completed');
      expect(genCalls).toBe(2); // initial + retry
      expect(testCalls).toBe(2);
    });
  });

  // ── Pause / Resume / Cancel ─────────────────────────────────────────

  describe('pause()', () => {
    it('should pause after the current state completes', async () => {
      const pauseCoord = new AgentCoordinator();
      registerAllHandlers(pauseCoord);

      const orchestrator = createOrchestrator({ coordinator: pauseCoord });

      // Override handler AFTER orchestrator creation so the closure captures the const
      pauseCoord.registerHandler('ANALYZING', async () => {
        orchestrator.pause();
        return {
          analysis: { type: 'bug' as const, complexity: 'simple' as const, requirements: [], affected_files: [], summary: '', rootCause: '' },
        };
      });

      const result = await orchestrator.run(TEST_INPUT);

      expect(result.status).toBe('paused');
      expect(result.finalState).toBe('PAUSED');
    });
  });

  describe('cancel()', () => {
    it('should cancel after the current state completes', async () => {
      const cancelCoord = new AgentCoordinator();
      registerAllHandlers(cancelCoord);

      const orchestrator = createOrchestrator({ coordinator: cancelCoord });

      cancelCoord.registerHandler('SEARCHING', async () => {
        orchestrator.cancel();
        return { searchResults: [{ filePath: 'x.ts', content: '' }] };
      });

      const result = await orchestrator.run(TEST_INPUT);

      expect(result.status).toBe('cancelled');
      expect(result.finalState).toBe('CANCELLED');
    });
  });

  describe('resume()', () => {
    it('should resume from PAUSED and complete the pipeline', async () => {
      // Use in-memory persistence so resume can restore state
      let persisted: PersistedState | null = null;
      const store = createMockStore();
      store.save.mockImplementation(async (state: PersistedState) => {
        persisted = state;
      });
      store.load.mockImplementation(async () => persisted);

      const machine = new StateMachine(store, 'test-run');

      const pauseCoord = new AgentCoordinator();
      registerAllHandlers(pauseCoord);

      const orchestrator = new WorkflowOrchestrator({
        coordinator: pauseCoord,
        runId: 'test-run',
        logger,
        maxAttempts: 3,
        stateMachine: machine,
      });

      // Override ANALYZING handler to trigger pause
      pauseCoord.registerHandler('ANALYZING', async () => {
        orchestrator.pause();
        return {
          issue: { id: 1, number: 42, title: 'Bug', body: 'b', state: 'open' as const, user: { login: 'u' }, created_at: '', html_url: '' },
          analysis: { type: 'bug' as const, complexity: 'simple' as const, requirements: [], affected_files: [], summary: '', rootCause: '' },
        };
      });

      // Run until pause
      const pausedResult = await orchestrator.run(TEST_INPUT);
      expect(pausedResult.status).toBe('paused');

      // Resume — the orchestrator re-initializes from persisted state
      const resumeResult = await orchestrator.resume();
      expect(resumeResult.status).toBe('completed');
      expect(resumeResult.finalState).toBe('DONE');
    });
  });

  // ── getStatus ───────────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('should return current state and run id', () => {
      const orch = createOrchestrator();
      const status = orch.getStatus();
      expect(status.runId).toBe('test-run');
      expect(status.state).toBe('IDLE');
    });
  });

  // ── getStateMachine ─────────────────────────────────────────────────

  describe('getStateMachine()', () => {
    it('should return the underlying state machine', () => {
      const orch = createOrchestrator();
      const sm = orch.getStateMachine();
      expect(sm).toBeInstanceOf(StateMachine);
    });
  });
});
