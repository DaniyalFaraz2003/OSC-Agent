import crypto from 'crypto';
import { StateMachine } from './state-machine';
import { StateStore } from './state-store';
import type { State, CoreState } from './states';
import { AgentCoordinator } from './agent-coordinator';
import { RecoveryManager } from './recovery';
import type { ErrorClassification } from './recovery';
import { type WorkflowInput, type WorkflowData, type WorkflowResult, type WorkflowStatus, SUCCESS_TRIGGERS, workflowDataToContext, contextToWorkflowData } from './data-flow';

// ── Logger ──────────────────────────────────────────────────────────────

/** Logger interface for workflow observability */
export interface WorkflowLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

/** Default console-based logger with run-id prefix */
export class ConsoleWorkflowLogger implements WorkflowLogger {
  private prefix: string;

  constructor(runId?: string) {
    this.prefix = runId ? `[OSC:${runId.slice(0, 8)}]` : '[OSC]';
  }

  info(message: string, data?: Record<string, unknown>): void {
    console.log(this.format('INFO', message, data));
  }

  warn(message: string, data?: Record<string, unknown>): void {
    console.warn(this.format('WARN', message, data));
  }

  error(message: string, data?: Record<string, unknown>): void {
    console.error(this.format('ERROR', message, data));
  }

  debug(message: string, data?: Record<string, unknown>): void {
    console.debug(this.format('DEBUG', message, data));
  }

  private format(level: string, message: string, data?: Record<string, unknown>): string {
    const base = `${this.prefix} ${level.padEnd(5)} ${message}`;
    return data ? `${base} ${JSON.stringify(data)}` : base;
  }
}

// ── Options ─────────────────────────────────────────────────────────────

/** Configuration for creating a WorkflowOrchestrator */
export interface WorkflowOptions {
  /** Pre-configured coordinator with registered state handlers */
  coordinator: AgentCoordinator;
  /** Unique identifier for this workflow run (auto-generated if omitted) */
  runId?: string;
  /** Filesystem path for state persistence */
  storePath?: string;
  /** Logger implementation (defaults to ConsoleWorkflowLogger) */
  logger?: WorkflowLogger;
  /** Maximum retry attempts on retryable errors (default: 3) */
  maxAttempts?: number;
  /** Pre-built state machine — primarily for testing */
  stateMachine?: StateMachine;
}

// ── Orchestrator ────────────────────────────────────────────────────────

/**
 * WorkflowOrchestrator drives the entire contribution pipeline.
 *
 * Responsibilities:
 *  - Coordinates agents via the state machine
 *  - Manages typed data flow between states
 *  - Handles error recovery (classify → retry from GENERATING)
 *  - Supports pause / resume / cancel
 *  - Logs every state transition and handler execution
 */
export class WorkflowOrchestrator {
  private machine: StateMachine;
  private coordinator: AgentCoordinator;
  private recovery: RecoveryManager;
  private logger: WorkflowLogger;
  private runId: string;
  private data: WorkflowData;
  private startTime = 0;
  private pauseRequested = false;
  private cancelRequested = false;
  private lastError?: ErrorClassification;

  constructor(options: WorkflowOptions) {
    this.runId = options.runId ?? crypto.randomUUID();

    if (options.stateMachine) {
      this.machine = options.stateMachine;
    } else {
      const storePath = options.storePath ?? `.osc-agent/${this.runId}/state.json`;
      const store = new StateStore(storePath);
      this.machine = new StateMachine(store, this.runId);
    }

    this.coordinator = options.coordinator;
    this.recovery = new RecoveryManager(options.maxAttempts ?? 3);
    this.logger = options.logger ?? new ConsoleWorkflowLogger(this.runId);
    this.data = { input: { owner: '', repo: '', issueNumber: 0 } };
  }

  // ── Public API ──────────────────────────────────────────────────────

  /** Start a new workflow for the given input */
  async run(input: WorkflowInput): Promise<WorkflowResult> {
    this.startTime = Date.now();
    this.data = { input };
    this.pauseRequested = false;
    this.cancelRequested = false;
    this.lastError = undefined;

    this.logger.info('Starting workflow', { runId: this.runId, owner: input.owner, repo: input.repo, issue: input.issueNumber });

    await this.machine.initialize();
    this.attachEventListeners();

    if (this.machine.getState() === 'IDLE') {
      await this.machine.transition('START', { context: workflowDataToContext(this.data) });
    }

    return this.executeLoop();
  }

  /** Resume a previously paused (or errored) workflow */
  async resume(): Promise<WorkflowResult> {
    this.startTime = Date.now();
    this.pauseRequested = false;
    this.cancelRequested = false;
    this.lastError = undefined;

    this.logger.info('Resuming workflow', { runId: this.runId });

    await this.machine.initialize();
    this.attachEventListeners();
    this.data = contextToWorkflowData(this.machine.getContext());

    const currentState = this.machine.getState();
    if (currentState === 'PAUSED') {
      await this.machine.transition('RESUME');
    } else if (currentState === 'ERROR') {
      const canRecover = await this.attemptRecovery();
      if (!canRecover) {
        return this.buildResult('failed');
      }
    }

    return this.executeLoop();
  }

  /** Request the workflow to pause after the current state completes */
  pause(): void {
    this.pauseRequested = true;
    this.logger.info('Pause requested — will pause after current state completes');
  }

  /** Request the workflow to cancel after the current state completes */
  cancel(): void {
    this.cancelRequested = true;
    this.logger.info('Cancel requested — will cancel after current state completes');
  }

  /** Snapshot of the current workflow status */
  getStatus(): { state: State; data: Readonly<WorkflowData>; runId: string } {
    return {
      state: this.machine.getState(),
      data: { ...this.data },
      runId: this.runId,
    };
  }

  /** Expose the underlying state machine (useful for diagnostics / testing) */
  getStateMachine(): StateMachine {
    return this.machine;
  }

  // ── Execution Loop ──────────────────────────────────────────────────

  private attachEventListeners(): void {
    this.machine.events.removeAllListeners('stateChange');
    this.machine.events.on('stateChange', (event: { from: State; to: State; trigger: string }) => {
      this.logger.debug('State transition', { from: event.from, to: event.to, trigger: event.trigger });
    });
  }

  private shouldContinue(state: State): boolean {
    return !(['DONE', 'CANCELLED', 'PAUSED'] as State[]).includes(state);
  }

  private async executeLoop(): Promise<WorkflowResult> {
    let currentState = this.machine.getState();

    while (this.shouldContinue(currentState)) {
      // ── Error recovery ──
      if (currentState === 'ERROR') {
        const recovered = await this.attemptRecovery();
        if (!recovered) {
          this.logger.error('Recovery failed — workflow ending in ERROR state');
          break;
        }
        currentState = this.machine.getState();
        continue;
      }

      // ── Pause / cancel ──
      if (this.pauseRequested) {
        this.logger.info('Pausing workflow');
        await this.machine.transition('PAUSE', { context: workflowDataToContext(this.data) });
        break;
      }
      if (this.cancelRequested) {
        this.logger.info('Cancelling workflow');
        await this.machine.transition('CANCEL', { context: workflowDataToContext(this.data) });
        break;
      }

      // ── Execute state handler ──
      await this.executeState(currentState as CoreState);
      currentState = this.machine.getState();
    }

    return this.buildResult(this.mapStateToStatus(this.machine.getState()));
  }

  // ── State Execution ─────────────────────────────────────────────────

  private async executeState(state: CoreState): Promise<void> {
    const trigger = SUCCESS_TRIGGERS[state];
    if (!trigger) {
      this.logger.warn(`No success trigger defined for state: ${state}`);
      return;
    }

    this.logger.info(`Executing: ${state}`);
    const stateStart = Date.now();

    try {
      const result = await this.coordinator.execute(state, this.data);
      this.data = { ...this.data, ...result };

      const elapsed = Date.now() - stateStart;
      this.logger.info(`Completed: ${state} (${elapsed}ms)`);

      await this.machine.transition(trigger, { context: workflowDataToContext(this.data) });
    } catch (error) {
      const elapsed = Date.now() - stateStart;
      this.logger.error(`Failed: ${state} (${elapsed}ms)`, { error: error instanceof Error ? error.message : String(error) });

      this.lastError = this.recovery.classify(error, state);

      await this.machine.transition('FAIL', {
        context: workflowDataToContext(this.data),
        error: { code: this.lastError.code, message: this.lastError.message, details: this.lastError.details },
      });
    }
  }

  // ── Recovery ────────────────────────────────────────────────────────

  private async attemptRecovery(): Promise<boolean> {
    if (!this.lastError) {
      this.logger.warn('No error information available for recovery');
      return false;
    }

    const attempt = this.machine.getAttempt();
    if (!this.recovery.shouldRetry(attempt, this.lastError)) {
      this.logger.error('Cannot retry', {
        attempt,
        maxAttempts: this.recovery.getMaxAttempts(),
        severity: this.lastError.severity,
      });
      return false;
    }

    this.logger.info(`Attempting recovery (attempt ${attempt + 1}/${this.recovery.getMaxAttempts()})`, {
      retryTarget: this.lastError.retryTarget,
      errorCode: this.lastError.code,
    });

    try {
      await this.machine.transition('RETRY');
      this.lastError = undefined;
      return true;
    } catch (retryError) {
      this.logger.error('Recovery transition failed', { error: retryError instanceof Error ? retryError.message : String(retryError) });
      return false;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private mapStateToStatus(state: State): WorkflowStatus {
    switch (state) {
      case 'DONE':
        return 'completed';
      case 'CANCELLED':
        return 'cancelled';
      case 'PAUSED':
        return 'paused';
      case 'ERROR':
        return 'failed';
      default:
        return 'running';
    }
  }

  private buildResult(status: WorkflowStatus): WorkflowResult {
    const result: WorkflowResult = {
      status,
      runId: this.runId,
      finalState: this.machine.getState(),
      data: { ...this.data },
      attempt: this.machine.getAttempt(),
      durationMs: Date.now() - this.startTime,
    };

    if (status === 'failed' && this.lastError) {
      result.error = { code: this.lastError.code, message: this.lastError.message, details: this.lastError.details };
    }

    this.logger.info('Workflow result', { status: result.status, finalState: result.finalState, attempt: result.attempt, durationMs: result.durationMs });

    return result;
  }
}
