// ── Core Orchestrator ───────────────────────────────────────────────────
export { WorkflowOrchestrator, ConsoleWorkflowLogger } from './workflow';
export type { WorkflowOptions, WorkflowLogger } from './workflow';

// ── Agent Coordination ──────────────────────────────────────────────────
export { AgentCoordinator } from './agent-coordinator';
export type { StateHandler } from './agent-coordinator';

// ── Data Flow ───────────────────────────────────────────────────────────
export { SUCCESS_TRIGGERS, OPERATIONAL_STATES, workflowDataToContext, contextToWorkflowData } from './data-flow';
export type { WorkflowInput, WorkflowData, WorkflowResult, WorkflowStatus, PlanStep, ApplyResult, BuildResult, SubmissionResult } from './data-flow';

// ── Recovery ────────────────────────────────────────────────────────────
export { RecoveryManager } from './recovery';
export type { ErrorClassification, ErrorSeverity } from './recovery';

// ── State Machine ───────────────────────────────────────────────────────
export { StateMachine } from './state-machine';
export { StateStore } from './state-store';
export { StateMachineEvents } from './events';
export { transitions } from './transitions';
export { transitionGuards } from './guards';

// ── Types ───────────────────────────────────────────────────────────────
export type { State, CoreState, ControlState, PersistedState } from './states';
export type { Trigger } from './transitions';
export type { GuardFn } from './guards';
export type { StateChangeEvent } from './events';
