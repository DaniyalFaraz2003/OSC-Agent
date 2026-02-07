export type CoreState = 'IDLE' | 'ANALYZING' | 'SEARCHING' | 'PLANNING' | 'GENERATING' | 'APPLYING' | 'BUILDING' | 'TESTING' | 'REVIEWING' | 'SUBMITTING' | 'DONE';

export type ControlState = 'PAUSED' | 'ERROR' | 'CANCELLED';

export type State = CoreState | ControlState;

export interface PersistedState {
  runId: string;
  currentState: State;
  updatedAt: string;
  attempt: number;
  context: Record<string, unknown>;
  history: State[];
  error?: {
    code: string;
    message: string;
    details?: string;
  };
}
