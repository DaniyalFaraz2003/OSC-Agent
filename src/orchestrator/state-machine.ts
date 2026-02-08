import { State, PersistedState } from './states';
import { Trigger, transitions } from './transitions';
import { StateMachineEvents } from './events';
import { StateStore } from './state-store';
import { transitionGuards } from './guards';

export class StateMachine {
  private state: State = 'IDLE';
  private history: State[] = []; // Functional checkpoints
  private runId: string;
  private attempt: number = 1;
  private context: Record<string, unknown> = {};

  public events = new StateMachineEvents();

  constructor(
    private store: StateStore,
    runId: string,
  ) {
    this.runId = runId;
  }

  async initialize(): Promise<void> {
    const loaded = await this.store.load();
    if (loaded && loaded.runId === this.runId) {
      this.state = loaded.currentState;
      this.attempt = loaded.attempt;
      this.context = loaded.context;
      // Restore history if it exists in the persisted state
      if (loaded.history) {
        this.history = loaded.history;
      }
    }
  }

  getState(): State {
    return this.state;
  }

  getContext(): Record<string, unknown> {
    return { ...this.context };
  }

  getAttempt(): number {
    return this.attempt;
  }

  getRunId(): string {
    return this.runId;
  }

  async transition(
    trigger: Trigger,
    payload?: {
      context?: Record<string, unknown>;
      error?: {
        code: string;
        message: string;
        details?: string;
      };
    },
  ): Promise<void> {
    const fromState = this.state;
    let nextState: State | undefined;

    // 1a. Handle Resume (Dynamic Recovery via History)
    if (trigger === 'RESUME') {
      nextState = this.history.pop();
      if (!nextState) nextState = 'IDLE';
    }

    // 1b. Handle Retry (Prefer explicit transition map, fallback to history)
    if (trigger === 'RETRY') {
      this.attempt++;
      const mapped = transitions[this.state]?.[trigger];
      if (mapped) {
        nextState = mapped;
      } else {
        nextState = this.history.pop();
        if (!nextState) nextState = 'IDLE';
      }
    }

    // 2. Handle Global Overrides (Control Triggers)
    if (!nextState && this.state !== 'DONE' && this.state !== 'CANCELLED') {
      if (trigger === 'PAUSE') nextState = 'PAUSED';
      if (trigger === 'CANCEL') nextState = 'CANCELLED';
      if (trigger === 'FAIL') nextState = 'ERROR';
    }

    // 3. Standard Transition Lookup
    if (!nextState) {
      nextState = transitions[this.state][trigger];
    }

    // 4. Validation
    if (!nextState) {
      throw new Error(`Invalid transition: Trigger [${trigger}] is not valid from state [${this.state}]`);
    }

    // 5. Guards
    const guard = transitionGuards[nextState];
    if (guard) {
      const canProceed = await guard({ ...this.context, ...payload?.context });
      if (!canProceed) {
        throw new Error(`Transition to [${nextState}] rejected by guard logic.`);
      }
    }

    // 6. Update History
    // If we are currently in a functional state and NOT currently resuming/retrying,
    // we save the current state as a checkpoint before moving to the next state.
    const isCurrentStateControl = ['PAUSED', 'ERROR', 'CANCELLED'].includes(this.state);
    if (!isCurrentStateControl && trigger !== 'RESUME' && trigger !== 'RETRY') {
      this.history.push(this.state);
    }

    // 7. Commit State
    this.state = nextState;
    if (payload?.context) {
      this.context = { ...this.context, ...payload.context };
    }

    // 8. Persistence
    const persisted: PersistedState & { history: State[] } = {
      runId: this.runId,
      currentState: this.state,
      updatedAt: new Date().toISOString(),
      attempt: this.attempt,
      context: this.context,
      error: payload?.error,
      history: this.history, // Save history to allow recovery after restart
    };
    await this.store.save(persisted);

    // 9. Events
    this.events.emitTransition({
      from: fromState,
      to: this.state,
      trigger,
      runId: this.runId,
      timestamp: persisted.updatedAt,
    });
  }
}
