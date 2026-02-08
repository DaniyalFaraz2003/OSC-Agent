import type { Config } from '../config/validator';
import { AgentCoordinator } from './agent-coordinator';
import type { WorkflowData } from './data-flow';
import { GitHubClient } from '../github/client';
import { GeminiClient } from '../agents/gemini-client';
import { IssueAnalyzer } from '../agents/issue-analyzer';
import type { CodeSearchResult } from '../agents/context-builder';
import { FixGenerator } from '../agents/fix-generator';
import { runRipgrep } from '../search/ripgrep';
import fs from 'node:fs';
import path from 'node:path';
import { applyPatch } from 'diff';
import { execSync } from 'node:child_process';

export type IssueWorkflowRuntimeOptions = {
  dryRun: boolean;
  autoPr: boolean;
};

export function createIssueWorkflowCoordinator(params: { config: Config; owner: string; repo: string; issueNumber: number; runtime: IssueWorkflowRuntimeOptions }): AgentCoordinator {
  const coordinator = new AgentCoordinator();

  const gh = new GitHubClient({ token: params.config.github.token });
  const gemini = new GeminiClient(params.config.gemini.api_key);

  const getCostMetrics = (): { totalCost: number; totalTokens: number } => {
    return gemini.getGlobalMetrics();
  };

  coordinator.registerHandler('ANALYZING', async () => {
    const issue = await gh.getIssue(params.owner, params.repo, params.issueNumber);
    const analyzer = new IssueAnalyzer({ gemini: params.config.gemini }, gemini);
    const analysis = await analyzer.analyzeIssue(issue);
    return { issue, analysis, costMetrics: getCostMetrics() };
  });

  coordinator.registerHandler('SEARCHING', async (ctx: Readonly<WorkflowData>) => {
    const analysis = ctx.analysis;
    const issue = ctx.issue;

    const results = readCandidateFiles(analysis?.affected_files);
    if (!results.length && issue?.title) {
      const extra = await searchByIssueTitle(issue.title);
      results.push(...extra);
    }

    return { searchResults: results };
  });

  coordinator.registerHandler('PLANNING', (ctx: Readonly<WorkflowData>) => {
    const analysis = ctx.analysis;

    const plan = (analysis?.affected_files ?? []).slice(0, 8).map((f: string) => ({
      description: `Update ${f} to address issue requirements`,
      targetFiles: [f],
      strategy: 'minimal',
    }));

    return Promise.resolve({ plan });
  });

  coordinator.registerHandler('GENERATING', async (ctx: Readonly<WorkflowData>) => {
    const issue = ctx.issue;
    const analysis = ctx.analysis;
    const searchResults = ctx.searchResults ?? [];

    if (!issue || !analysis) {
      throw new Error('Missing issue or analysis in workflow context');
    }

    const fixGenerator = new FixGenerator(gemini);

    const issueDescription = `${issue.title}\n\n${issue.body ?? ''}`;
    const analysisText = JSON.stringify(analysis);

    const fixProposal = await fixGenerator.generateFix(issueDescription, analysisText, searchResults);
    return { fixProposal, costMetrics: getCostMetrics() };
  });

  coordinator.registerHandler('APPLYING', (ctx: Readonly<WorkflowData>) => {
    const fixProposal = ctx.fixProposal;
    if (!fixProposal) {
      throw new Error('Missing fixProposal in workflow context');
    }

    if (params.runtime.dryRun) {
      return Promise.resolve({ applyResult: { appliedFiles: [], patchCount: fixProposal.patches.length } });
    }

    const appliedFiles: string[] = [];

    for (const patchText of fixProposal.patches) {
      const filePath = guessPatchFilePath(patchText);
      if (!filePath) continue;

      const abs = path.resolve(process.cwd(), filePath);
      const original = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
      const updated = applyPatch(original, patchText);
      if (updated === false) {
        throw new Error(`Failed to apply patch for ${filePath}`);
      }

      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, updated, 'utf8');
      appliedFiles.push(filePath);
    }

    return Promise.resolve({ applyResult: { appliedFiles, patchCount: fixProposal.patches.length } });
  });

  coordinator.registerHandler('BUILDING', () => {
    if (params.runtime.dryRun) {
      return Promise.resolve({ buildResult: { success: true, output: 'dry-run', errors: [] } });
    }

    try {
      const output = execSync('npm run build', { encoding: 'utf8', stdio: 'pipe' });
      return Promise.resolve({ buildResult: { success: true, output, errors: [] } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return Promise.resolve({ buildResult: { success: false, output: msg, errors: [msg] } });
    }
  });

  coordinator.registerHandler('TESTING', () => {
    if (params.runtime.dryRun) {
      return Promise.resolve({ testResult: { success: true, logs: 'dry-run', failureCount: 0, passedCount: 0 } });
    }

    try {
      const output = execSync('npm test', { encoding: 'utf8', stdio: 'pipe' });
      return Promise.resolve({ testResult: { success: true, logs: output, failureCount: 0, passedCount: 0 } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return Promise.resolve({ testResult: { success: false, logs: msg, failureCount: 1, passedCount: 0 } });
    }
  });

  coordinator.registerHandler('REVIEWING', () => {
    return Promise.resolve({ reviewResult: { approved: true, summary: 'Auto-approved', issues: [], suggestions: [] } });
  });

  coordinator.registerHandler('SUBMITTING', () => {
    return Promise.resolve({ submission: { prNumber: 0, prUrl: '', commitMessage: '' } });
  });

  return coordinator;
}

function readCandidateFiles(affectedFiles: unknown): CodeSearchResult[] {
  const files = Array.isArray(affectedFiles) ? affectedFiles : [];
  const results: CodeSearchResult[] = [];

  for (const f of files.slice(0, 8)) {
    if (typeof f !== 'string') continue;
    const abs = path.resolve(process.cwd(), f);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      results.push({ filePath: f, content: fs.readFileSync(abs, 'utf8') });
    }
  }

  return results;
}

async function searchByIssueTitle(title: string): Promise<CodeSearchResult[]> {
  const results: CodeSearchResult[] = [];
  const words = title
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 3);

  for (const w of words) {
    try {
      const rg = await runRipgrep({ pattern: w, cwd: process.cwd(), context: 2 });
      for (const hit of rg.slice(0, 3)) {
        const abs = path.resolve(process.cwd(), hit.file);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
          results.push({ filePath: hit.file, content: fs.readFileSync(abs, 'utf8') });
        }
      }
    } catch {
      // If ripgrep isn't installed or fails, we still want the workflow to proceed.
    }
  }

  return results;
}

function guessPatchFilePath(patchText: string): string | undefined {
  const lines = patchText.split(/\r?\n/);
  for (const line of lines) {
    const m1 = /^\*\*\*\s+(\S+)/.exec(line);
    if (m1) return m1[1];
    const m2 = /^---\s+(\S+)/.exec(line);
    if (m2) return m2[1];
  }
  return undefined;
}
