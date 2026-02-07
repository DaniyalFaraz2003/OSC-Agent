import { State } from './states';

export type GuardFn = (context: Record<string, unknown>) => boolean | Promise<boolean>;

// Example guards: ensure necessary context exists before moving forward
export const transitionGuards: Partial<Record<State, GuardFn>> = {
  SEARCHING: (ctx) => !!ctx.query || !!ctx.analysisResults,
  PLANNING: (ctx) => Array.isArray(ctx.searchResults) && ctx.searchResults.length > 0,
  // Add more specific guards as needed
};
