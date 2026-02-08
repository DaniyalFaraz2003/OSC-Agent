import { State } from './states';

export type GuardFn = (context: Record<string, unknown>) => boolean | Promise<boolean>;

// Guards: ensure necessary context exists before moving forward
export const transitionGuards: Partial<Record<State, GuardFn>> = {
  SEARCHING: (ctx) => !!ctx.analysis,
  PLANNING: (ctx) => Array.isArray(ctx.searchResults) && ctx.searchResults.length > 0,
};
