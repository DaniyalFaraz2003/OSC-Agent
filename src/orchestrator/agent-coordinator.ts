import type { CoreState } from './states';
import type { WorkflowData } from './data-flow';

/**
 * A handler function executed when the workflow enters a specific state.
 * Receives the current (read-only) workflow data and returns a partial
 * update that will be merged into the data for downstream states.
 */
export type StateHandler = (context: Readonly<WorkflowData>) => Promise<Partial<WorkflowData>>;

/**
 * AgentCoordinator manages the mapping between workflow states and their
 * handler functions. Each state in the pipeline is backed by exactly one
 * handler that encapsulates agent logic (issue analysis, code generation,
 * test execution, etc.).
 *
 * Handlers are registered externally — either with real agents in production
 * or with lightweight mocks in tests — keeping the coordinator itself free
 * of hard dependencies on specific agent implementations.
 */
export class AgentCoordinator {
  private handlers = new Map<CoreState, StateHandler>();

  /** Register a handler for a specific operational state */
  registerHandler(state: CoreState, handler: StateHandler): void {
    this.handlers.set(state, handler);
  }

  /** Check whether a handler has been registered for the given state */
  hasHandler(state: CoreState): boolean {
    return this.handlers.has(state);
  }

  /**
   * Execute the handler registered for the given state.
   * @throws Error if no handler is registered for the state.
   */
  async execute(state: CoreState, context: WorkflowData): Promise<Partial<WorkflowData>> {
    const handler = this.handlers.get(state);
    if (!handler) {
      throw new Error(`No handler registered for state: ${state}`);
    }
    return handler(context);
  }

  /** Return a list of all states that currently have a registered handler */
  getRegisteredStates(): CoreState[] {
    return [...this.handlers.keys()];
  }
}
