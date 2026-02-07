/* eslint-disable @typescript-eslint/unbound-method */
import { StateMachine } from '../../../src/orchestrator/state-machine';
import { StateStore } from '../../../src/orchestrator/state-store';
import { transitionGuards } from '../../../src/orchestrator/guards';
import { PersistedState } from '../../../src/orchestrator/states';

// Mock dependencies
jest.mock('../../../src/orchestrator/state-store');
jest.mock('../../../src/orchestrator/guards', () => ({
  transitionGuards: {},
}));

describe('StateMachine', () => {
  let machine: StateMachine;
  let mockStore: jest.Mocked<StateStore>;
  const RUN_ID = 'test-run-123';

  // Helper to force the state machine into a specific state via the public API
  const setupState = async (state: unknown, context = {}, _history: unknown[] = []): Promise<void> => {
    mockStore.load.mockResolvedValue({
      runId: RUN_ID,
      currentState: state,
      updatedAt: new Date().toISOString(),
      attempt: 1,
      context,
      // Note: We'd need to add history to PersistedState if we want to
      // fully restore it via initialize, or just rely on transitions for history.
    } as PersistedState);
    await machine.initialize();
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore = new StateStore('path') as jest.Mocked<StateStore>;
    machine = new StateMachine(mockStore, RUN_ID);
  });

  describe('Core Transitions (Happy Path)', () => {
    it('should transition correctly based on the transition map', async () => {
      // Use initialize to set private state safely
      await setupState('ANALYZING');

      await machine.transition('ANALYSIS_OK');
      expect(machine.getState()).toBe('SEARCHING');
      expect(mockStore.save).toHaveBeenCalled();
    });

    it('should update context and persist it during transition', async () => {
      await setupState('SEARCHING');

      const newContext = { results: [1, 2, 3] };
      await machine.transition('SEARCH_OK', { context: newContext });

      expect(machine.getContext()).toEqual(newContext);
      expect(mockStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          context: newContext,
          currentState: 'PLANNING',
        }),
      );
    });
  });

  describe('Global Control Triggers', () => {
    it('should allow PAUSE from any non-terminal state', async () => {
      await setupState('GENERATING');

      await machine.transition('PAUSE');
      expect(machine.getState()).toBe('PAUSED');
    });

    it('should allow FAIL from any non-terminal state and record error', async () => {
      await setupState('BUILDING');
      const error = { code: 'BUILD_FAIL', message: 'Syntax Error' };

      await machine.transition('FAIL', { error });

      expect(machine.getState()).toBe('ERROR');
      expect(mockStore.save).toHaveBeenCalledWith(expect.objectContaining({ error }));
    });
  });

  describe('Guards', () => {
    it('should block transition if guard returns false', async () => {
      // Set a guard for this specific test
      transitionGuards['SEARCHING'] = jest.fn().mockResolvedValue(false);

      await setupState('ANALYZING');

      await expect(machine.transition('ANALYSIS_OK')).rejects.toThrow(/rejected by guard logic/);
    });

    it('should allow transition if guard returns true', async () => {
      transitionGuards['SEARCHING'] = jest.fn().mockResolvedValue(true);

      await setupState('ANALYZING');
      await machine.transition('ANALYSIS_OK');

      expect(machine.getState()).toBe('SEARCHING');
    });
  });

  describe('Resume and Retry Logic', () => {
    it('should return to previous state on RESUME', async () => {
      // 1. Start at ANALYZING
      await setupState('ANALYZING');

      // 2. Transition to SEARCHING.
      // History now contains: ['ANALYZING']
      await machine.transition('ANALYSIS_OK');
      expect(machine.getState()).toBe('SEARCHING');

      // 3. Trigger PAUSE.
      // Current state (SEARCHING) is pushed to history.
      // History now contains: ['ANALYZING', 'SEARCHING']
      await machine.transition('PAUSE');
      expect(machine.getState()).toBe('PAUSED');

      // 4. Trigger RESUME.
      // Logic pops 'SEARCHING' from history.
      await machine.transition('RESUME');
      expect(machine.getState()).toBe('SEARCHING');
    });

    it('should return to the correct state even after multiple functional steps', async () => {
      await setupState('PLANNING');

      await machine.transition('PLAN_OK'); // state: GENERATING, hist: [PLANNING]
      await machine.transition('PAUSE'); // state: PAUSED, hist: [PLANNING, GENERATING]
      await machine.transition('RESUME'); // state: GENERATING, hist: [PLANNING]

      expect(machine.getState()).toBe('GENERATING');
    });
  });

  describe('Terminal States', () => {
    it('should prevent transitions from CANCELLED', async () => {
      await setupState('CANCELLED');

      await expect(machine.transition('PAUSE')).rejects.toThrow(/Invalid transition/);
    });

    it('should prevent transitions from DONE', async () => {
      await setupState('DONE');

      await expect(machine.transition('PAUSE')).rejects.toThrow(/Invalid transition/);
    });
  });
});
