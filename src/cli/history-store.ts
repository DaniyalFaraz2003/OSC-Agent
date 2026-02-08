import fs from 'node:fs/promises';
import path from 'node:path';
import type { PersistedState, State } from '../orchestrator/states';
import type { WorkflowInput } from '../orchestrator/data-flow';

export type HistoryStoreOptions = {
  rootDir?: string;
};

export type HistoryFilter = {
  repo?: string;
  state?: State;
  from?: Date;
  to?: Date;
  limit?: number;
};

export type HistoryEntrySummary = {
  runId: string;
  currentState: State;
  updatedAt: string;
  attempt: number;
  input?: WorkflowInput;
  error?: PersistedState['error'];
  costMetrics?: {
    totalCost: number;
    totalTokens: number;
  };
};

export type HistoryEntryDetail = {
  state: PersistedState;
};

export class HistoryStore {
  private rootDir: string;

  constructor(opts?: HistoryStoreOptions) {
    this.rootDir = opts?.rootDir ?? '.osc-agent';
  }

  private statePath(runId: string): string {
    return path.join(this.rootDir, runId, 'state.json');
  }

  async load(runId: string): Promise<PersistedState | null> {
    try {
      const data = await fs.readFile(this.statePath(runId), 'utf8');
      return JSON.parse(data) as PersistedState;
    } catch {
      return null;
    }
  }

  async listRunIds(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.rootDir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  private toSummary(state: PersistedState): HistoryEntrySummary {
    const ctx = state.context;
    const input = ctx.input as WorkflowInput | undefined;
    const costMetrics = ctx.costMetrics as HistoryEntrySummary['costMetrics'];

    return {
      runId: state.runId,
      currentState: state.currentState,
      updatedAt: state.updatedAt,
      attempt: state.attempt,
      input,
      error: state.error,
      costMetrics,
    };
  }

  private matchesFilter(summary: HistoryEntrySummary, filter: HistoryFilter): boolean {
    if (filter.state && summary.currentState !== filter.state) return false;

    if (filter.repo) {
      const repo = filter.repo.trim();
      const input = summary.input;
      const slug = input ? `${input.owner}/${input.repo}` : '';
      if (slug !== repo) return false;
    }

    const updatedAtMs = Date.parse(summary.updatedAt);
    if (Number.isFinite(updatedAtMs)) {
      if (filter.from && updatedAtMs < filter.from.getTime()) return false;
      if (filter.to && updatedAtMs > filter.to.getTime()) return false;
    }

    return true;
  }

  async list(filter: HistoryFilter = {}): Promise<HistoryEntrySummary[]> {
    const runIds = await this.listRunIds();

    const states = await Promise.all(runIds.map((id) => this.load(id)));

    const summaries = states
      .filter((s): s is PersistedState => Boolean(s))
      .map((s) => this.toSummary(s))
      .filter((s) => this.matchesFilter(s, filter))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

    if (filter.limit && filter.limit > 0) {
      return summaries.slice(0, filter.limit);
    }

    return summaries;
  }

  async latest(): Promise<HistoryEntrySummary | null> {
    const list = await this.list({ limit: 1 });
    return list[0] ?? null;
  }

  async detail(runId: string): Promise<HistoryEntryDetail | null> {
    const state = await this.load(runId);
    if (!state) return null;
    return { state };
  }

  async exportToFile(entries: HistoryEntrySummary[], filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(entries, null, 2), 'utf8');
  }
}
