import { State } from './states';

export type Trigger = 'START' | 'ANALYSIS_OK' | 'SEARCH_OK' | 'PLAN_OK' | 'GENERATION_OK' | 'APPLY_OK' | 'BUILD_OK' | 'TEST_OK' | 'REVIEW_OK' | 'SUBMIT_OK' | 'PAUSE' | 'RESUME' | 'CANCEL' | 'FAIL' | 'RETRY';

export const transitions: Record<State, Partial<Record<Trigger, State>>> = {
  IDLE: { START: 'ANALYZING' },
  ANALYZING: { ANALYSIS_OK: 'SEARCHING' },
  SEARCHING: { SEARCH_OK: 'PLANNING' },
  PLANNING: { PLAN_OK: 'GENERATING' },
  GENERATING: {
    GENERATION_OK: 'APPLYING',
    PAUSE: 'PAUSED',
    CANCEL: 'CANCELLED',
    FAIL: 'ERROR',
  },
  APPLYING: { APPLY_OK: 'BUILDING' },
  BUILDING: { BUILD_OK: 'TESTING' },
  TESTING: { TEST_OK: 'REVIEWING' },
  REVIEWING: { REVIEW_OK: 'SUBMITTING' },
  SUBMITTING: { SUBMIT_OK: 'DONE' },
  DONE: {},
  PAUSED: { RESUME: 'GENERATING' },
  ERROR: { RETRY: 'GENERATING' },
  CANCELLED: {},
};
