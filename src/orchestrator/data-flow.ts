import type { CoreState, State } from './states';
import type { Trigger } from './transitions';
import type { GitHubIssue } from '../github/types';
import type { IssueAnalysis } from '../agents/types';
import type { CodeSearchResult } from '../agents/context-builder';
import type { FixProposal } from '../agents/fix-generator';
import type { ReviewResult } from '../agents/code-reviewer';
import type { TestResult } from '../agents/iteration-tracker';

// ── Input / Output Interfaces ───────────────────────────────────────────

/** Input parameters to start a workflow */
export interface WorkflowInput {
  owner: string;
  repo: string;
  issueNumber: number;
}

/** A single step in the fix plan */
export interface PlanStep {
  description: string;
  targetFiles: string[];
  strategy: string;
}

/** Result of applying patches to the codebase */
export interface ApplyResult {
  appliedFiles: string[];
  patchCount: number;
}

/** Result of build verification */
export interface BuildResult {
  success: boolean;
  output: string;
  errors: string[];
}

/** Result of PR submission */
export interface SubmissionResult {
  prNumber: number;
  prUrl: string;
  commitMessage: string;
}

// ── Workflow Data ────────────────────────────────────────────────────────

/**
 * Complete workflow data flowing between stages.
 * Each field is populated by its respective state handler.
 */
export interface WorkflowData {
  input: WorkflowInput;
  issue?: GitHubIssue;
  analysis?: IssueAnalysis;
  searchResults?: CodeSearchResult[];
  plan?: PlanStep[];
  fixProposal?: FixProposal;
  applyResult?: ApplyResult;
  buildResult?: BuildResult;
  testResult?: TestResult;
  reviewResult?: ReviewResult;
  submission?: SubmissionResult;
  costMetrics?: {
    totalCost: number;
    totalTokens: number;
  };
}

// ── Workflow Result ─────────────────────────────────────────────────────

/** Final status of a workflow execution */
export type WorkflowStatus = 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';

/** Complete result returned when a workflow run finishes or suspends */
export interface WorkflowResult {
  status: WorkflowStatus;
  runId: string;
  finalState: State;
  data: WorkflowData;
  attempt: number;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
  durationMs: number;
}

// ── Constants ───────────────────────────────────────────────────────────

/** Maps each operational state to the trigger that advances the pipeline on success */
export const SUCCESS_TRIGGERS: Partial<Record<CoreState, Trigger>> = {
  ANALYZING: 'ANALYSIS_OK',
  SEARCHING: 'SEARCH_OK',
  PLANNING: 'PLAN_OK',
  GENERATING: 'GENERATION_OK',
  APPLYING: 'APPLY_OK',
  BUILDING: 'BUILD_OK',
  TESTING: 'TEST_OK',
  REVIEWING: 'REVIEW_OK',
  SUBMITTING: 'SUBMIT_OK',
};

/** All states that require a registered handler for execution */
export const OPERATIONAL_STATES: CoreState[] = ['ANALYZING', 'SEARCHING', 'PLANNING', 'GENERATING', 'APPLYING', 'BUILDING', 'TESTING', 'REVIEWING', 'SUBMITTING'];

// ── Context Bridge ──────────────────────────────────────────────────────

/** Convert typed WorkflowData into the state-machine context format */
export function workflowDataToContext(data: WorkflowData): Record<string, unknown> {
  const context: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      context[key] = value;
    }
  }
  return context;
}

/** Restore typed WorkflowData from a state-machine context */
export function contextToWorkflowData(context: Record<string, unknown>): WorkflowData {
  return {
    input: (context.input as WorkflowInput | undefined) ?? { owner: '', repo: '', issueNumber: 0 },
    issue: context.issue as WorkflowData['issue'],
    analysis: context.analysis as WorkflowData['analysis'],
    searchResults: context.searchResults as WorkflowData['searchResults'],
    plan: context.plan as WorkflowData['plan'],
    fixProposal: context.fixProposal as WorkflowData['fixProposal'],
    applyResult: context.applyResult as WorkflowData['applyResult'],
    buildResult: context.buildResult as WorkflowData['buildResult'],
    testResult: context.testResult as WorkflowData['testResult'],
    reviewResult: context.reviewResult as WorkflowData['reviewResult'],
    submission: context.submission as WorkflowData['submission'],
    costMetrics: context.costMetrics as WorkflowData['costMetrics'],
  };
}
