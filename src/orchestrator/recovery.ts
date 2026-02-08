import type { CoreState } from './states';

/** Severity classification for errors */
export type ErrorSeverity = 'transient' | 'retryable' | 'fatal';

/** Structured classification of an error encountered during workflow execution */
export interface ErrorClassification {
  severity: ErrorSeverity;
  code: string;
  message: string;
  details?: string;
  /** The state to retry from. Undefined means no orchestrator-level retry. */
  retryTarget?: CoreState;
}

/**
 * RecoveryManager classifies errors and determines whether and how to retry.
 *
 * Recovery strategy:
 *  - Fix-cycle states (GENERATING → REVIEWING) are retried from GENERATING
 *    so the AI can produce a fresh fix informed by the failure feedback.
 *  - Pre-fix states (ANALYZING, SEARCHING, PLANNING) rely on agent-internal
 *    retry logic (e.g. GeminiClient exponential backoff). If those retries
 *    exhaust, the error is treated as fatal at the orchestrator level.
 */
export class RecoveryManager {
  private static readonly FIX_CYCLE_STATES: CoreState[] = ['GENERATING', 'APPLYING', 'BUILDING', 'TESTING', 'REVIEWING'];

  constructor(private maxAttempts: number = 3) {}

  /** Classify an error based on its message content and the state it occurred in */
  classify(error: unknown, currentState: CoreState): ErrorClassification {
    const message = error instanceof Error ? error.message : String(error);
    const details = error instanceof Error ? error.stack : undefined;

    // Fatal errors — authentication, config, missing resources
    if (RecoveryManager.isFatal(message)) {
      return { severity: 'fatal', code: 'FATAL_ERROR', message, details };
    }

    // Retryable only when inside the fix cycle
    if (RecoveryManager.FIX_CYCLE_STATES.includes(currentState)) {
      return {
        severity: 'retryable',
        code: 'RETRYABLE_ERROR',
        message,
        details,
        retryTarget: 'GENERATING',
      };
    }

    // Transient errors in early stages — already retried by the agent internally
    if (RecoveryManager.isTransient(message)) {
      return { severity: 'transient', code: 'TRANSIENT_ERROR', message, details };
    }

    // Default: unrecoverable at orchestrator level
    return { severity: 'fatal', code: 'UNRECOVERABLE_ERROR', message, details };
  }

  /** Determine whether a retry should be attempted */
  shouldRetry(attempt: number, classification: ErrorClassification): boolean {
    if (classification.severity === 'fatal') return false;
    if (!classification.retryTarget) return false;
    return attempt < this.maxAttempts;
  }

  /** Get the configured maximum number of retry attempts */
  getMaxAttempts(): number {
    return this.maxAttempts;
  }

  // ── Private Helpers ─────────────────────────────────────────────────

  private static isTransient(message: string): boolean {
    const patterns = ['rate limit', 'timeout', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'socket hang up', 'network error', 'status 429', 'status 503', 'status 502'];
    const lower = message.toLowerCase();
    return patterns.some((p) => lower.includes(p.toLowerCase()));
  }

  private static isFatal(message: string): boolean {
    const patterns = ['Authentication failed', 'API key is required', 'token is required', 'Invalid configuration', 'No handler registered'];
    return patterns.some((p) => message.includes(p));
  }
}
