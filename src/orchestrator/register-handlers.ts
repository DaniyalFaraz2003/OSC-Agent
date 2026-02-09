import type { Config } from '../config/validator';
import { AgentCoordinator } from './agent-coordinator';
import type { WorkflowData } from './data-flow';
import { GitHubClient } from '../github/client';
import { GeminiClient } from '../agents/gemini-client';
import { IssueAnalyzer } from '../agents/issue-analyzer';
import type { CodeSearchResult } from '../agents/context-builder';
import { FixGenerator } from '../agents/fix-generator';
import { CodeReviewerAgent } from '../agents/code-reviewer';
import { DocumentationGenerator } from '../agents/doc-generator';
import { buildFileTree } from '../search/file-tree';
import { buildSearchPlanningPrompt } from '../agents/prompts/search-planning';
import fs from 'node:fs';
import path from 'node:path';
import { applyPatch } from 'diff';
import { execSync } from 'node:child_process';

export type IssueWorkflowRuntimeOptions = {
  dryRun: boolean;
  autoPr: boolean;
};

export function createIssueWorkflowCoordinator(params: { config: Config; owner: string; repo: string; issueNumber: number; runtime: IssueWorkflowRuntimeOptions; branch?: string }): AgentCoordinator {
  const coordinator = new AgentCoordinator();

  const gh = new GitHubClient({ token: params.config.github.token });
  const gemini = new GeminiClient(params.config.gemini.api_key);

  // ── ANALYZING ─────────────────────────────────────────────────────────

  coordinator.registerHandler('ANALYZING', async () => {
    const issue = await gh.getIssue(params.owner, params.repo, params.issueNumber);
    const analyzer = new IssueAnalyzer({ gemini: params.config.gemini }, gemini);
    const analysis = await analyzer.analyzeIssue(issue);
    return { issue, analysis };
  });

  // ── SEARCHING ─────────────────────────────────────────────────────────
  //
  // LLM-guided search: send the file tree + issue context to Gemini and
  // let IT pick which files are relevant.  Falls back to analysis-based
  // heuristics if the LLM call fails.

  coordinator.registerHandler('SEARCHING', async (ctx: Readonly<WorkflowData>) => {
    const analysis = ctx.analysis;
    const issue = ctx.issue;

    const results: CodeSearchResult[] = [];
    const seen = new Set<string>();

    /** Deduplicated helper — reads a file and pushes into results. */
    const addFile = (filePath: string, maxLines?: number): boolean => {
      if (seen.has(filePath)) return false;
      const abs = path.resolve(process.cwd(), filePath);
      try {
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return false;
        seen.add(filePath);
        let content = fs.readFileSync(abs, 'utf8');
        if (maxLines) {
          content = content.split('\n').slice(0, maxLines).join('\n');
        }
        results.push({ filePath, content });
        return true;
      } catch {
        return false;
      }
    };

    // ── Primary strategy: LLM-guided file selection ─────────────────────
    try {
      console.log('  Building file tree...');
      const fileTree = buildFileTree({ maxDepth: 4, maxEntriesPerDir: 25 });

      const prompt = buildSearchPlanningPrompt({
        title: issue?.title ?? '',
        body: issue?.body ?? '',
        analysisJson: JSON.stringify(analysis ?? {}),
        fileTree,
      });

      console.log('  Asking Gemini which files are relevant...');
      const response = await gemini.generate(prompt, {
        temperature: 0.1,
        useCache: false,
        taskComplexity: 'low',
      });

      const cleaned = response.content.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned) as { files?: string[] };
      const candidates = (parsed.files ?? []).filter((f): f is string => typeof f === 'string');

      console.log(`  LLM selected ${candidates.length} candidate file(s)`);

      for (const filePath of candidates.slice(0, 15)) {
        addFile(filePath, 300);
      }
    } catch (e) {
      // LLM search planning failed — fall back to heuristics
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  LLM search planning failed (${msg}), using heuristic fallback...`);
    }

    // ── Fallback: affected_files from analysis ──────────────────────────
    if (results.length < 3) {
      const candidateFiles = analysis?.affected_files ?? [];
      for (const filePath of candidateFiles.slice(0, 10)) {
        addFile(filePath);
      }

      // If affected files don't exist, explore parent directories
      if (results.length === 0) {
        for (const filePath of candidateFiles.slice(0, 5)) {
          const dir = path.dirname(filePath.replace(/\*.*$/, ''));
          if (!dir || dir === '.') continue;
          const absDir = path.resolve(process.cwd(), dir);
          try {
            if (fs.existsSync(absDir) && fs.statSync(absDir).isDirectory()) {
              for (const entry of fs.readdirSync(absDir).slice(0, 5)) {
                addFile(path.posix.join(dir, entry).replace(/\\/g, '/'), 250);
                if (results.length >= 6) break;
              }
            }
          } catch {
            /* permission error */
          }
        }
      }
    }

    // ── Always include package.json for dependency context ──────────────
    addFile('package.json');

    return { searchResults: results };
  });

  // ── PLANNING ──────────────────────────────────────────────────────────

  coordinator.registerHandler('PLANNING', (ctx: Readonly<WorkflowData>) => {
    const analysis = ctx.analysis;

    const plan = (analysis?.affected_files ?? []).slice(0, 8).map((f: string) => ({
      description: `Update ${f} to address issue requirements`,
      targetFiles: [f],
      strategy: 'minimal',
    }));

    return Promise.resolve({ plan });
  });

  // ── GENERATING ────────────────────────────────────────────────────────

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

    // Add timeout (2 minutes) — Gemini can be slow for complex prompts
    const timeoutMs = 120000;
    const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AI generation timed out after 2 minutes. The API might be slow or rate-limited. Try again.')), timeoutMs));

    try {
      const fixProposal = await Promise.race([fixGenerator.generateFix(issueDescription, analysisText, searchResults), timeoutPromise]);

      return { fixProposal };
    } catch (err) {
      // Re-throw with better context
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Code generation failed: ${msg}`);
    }
  });

  // ── APPLYING ──────────────────────────────────────────────────────────

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

  // ── BUILDING ──────────────────────────────────────────────────────────

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

  // ── TESTING ───────────────────────────────────────────────────────────

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

  // ── REVIEWING ─────────────────────────────────────────────────────────

  coordinator.registerHandler('REVIEWING', async (ctx: Readonly<WorkflowData>) => {
    if (params.runtime.dryRun) {
      return { reviewResult: { approved: true, summary: 'Skipped (dry-run)', issues: [], suggestions: [] } };
    }

    const issue = ctx.issue;
    const fixProposal = ctx.fixProposal;

    if (!issue || !fixProposal) {
      return { reviewResult: { approved: true, summary: 'Auto-approved (insufficient data for review)', issues: [], suggestions: [] } };
    }

    const reviewer = new CodeReviewerAgent(gemini);
    const issueDescription = `${issue.title}\n\n${issue.body ?? ''}`;
    const fixDescription = `${fixProposal.explanation}\n\nPatches:\n${fixProposal.patches.join('\n---\n')}`;

    const reviewResult = await reviewer.review(issueDescription, fixDescription);
    return { reviewResult };
  });

  // ── SUBMITTING ────────────────────────────────────────────────────────

  coordinator.registerHandler('SUBMITTING', async (ctx: Readonly<WorkflowData>) => {
    const issue = ctx.issue;
    const fixProposal = ctx.fixProposal;

    if (params.runtime.dryRun || !params.runtime.autoPr) {
      // Generate commit message even in dry-run for display purposes
      let commitMessage = `fix: address issue #${params.issueNumber}`;

      if (issue && fixProposal) {
        try {
          const docGen = new DocumentationGenerator(gemini);
          const issueDescription = `${issue.title}\n\n${issue.body ?? ''}`;
          const fixDescription = fixProposal.explanation;
          const commitResult = await docGen.generateCommitMessage(issueDescription, fixDescription);
          commitMessage = commitResult.formatted.raw;
        } catch {
          // Use fallback commit message
        }
      }

      return { submission: { prNumber: 0, prUrl: '', commitMessage } };
    }

    // Real PR path (requires autoPr)
    const branch = params.branch ?? `osc/${params.owner}-${params.repo}-issue-${params.issueNumber}`;
    let commitMessage = `fix: address issue #${params.issueNumber}`;

    if (issue && fixProposal) {
      try {
        const docGen = new DocumentationGenerator(gemini);
        const issueDescription = `${issue.title}\n\n${issue.body ?? ''}`;
        const fixDescription = fixProposal.explanation;
        const commitResult = await docGen.generateCommitMessage(issueDescription, fixDescription);
        commitMessage = commitResult.formatted.raw;
      } catch {
        // Use fallback commit message
      }
    }

    try {
      execSync(`git checkout -b ${branch}`, { stdio: 'pipe' });
      execSync('git add -A', { stdio: 'pipe' });
      execSync(`git commit -m "${commitMessage}"`, { stdio: 'pipe' });
      execSync(`git push -u origin ${branch}`, { stdio: 'pipe' });

      const pr = await gh.createPR(params.owner, params.repo, commitMessage, branch, 'main');

      // ── Post a rich summary comment on the PR ─────────────────────────
      try {
        const commentBody = buildPRComment({
          issueNumber: params.issueNumber,
          issueTitle: issue?.title ?? '',
          commitMessage,
          explanation: fixProposal?.explanation ?? '',
          appliedFiles: ctx.applyResult?.appliedFiles ?? [],
          buildSuccess: ctx.buildResult?.success,
          testSuccess: ctx.testResult?.success,
          reviewApproved: ctx.reviewResult?.approved,
          reviewSummary: ctx.reviewResult?.summary,
        });
        await gh.createComment(params.owner, params.repo, pr.number, commentBody);
      } catch {
        // Non-fatal — PR was already created; comment is best-effort
        console.warn('  Warning: could not post PR summary comment');
      }

      return { submission: { prNumber: pr.number, prUrl: pr.html_url, commitMessage } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to create PR: ${msg}`);
    }
  });

  return coordinator;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Build a markdown comment body for the Pull Request.
 */
function buildPRComment(info: { issueNumber: number; issueTitle: string; commitMessage: string; explanation: string; appliedFiles: string[]; buildSuccess?: boolean; testSuccess?: boolean; reviewApproved?: boolean; reviewSummary?: string }): string {
  const lines: string[] = [];

  lines.push('## OSC-Agent Auto-PR Summary');
  lines.push('');
  lines.push(`**Issue:** #${info.issueNumber} — ${info.issueTitle}`);
  lines.push(`**Commit:** \`${info.commitMessage}\``);
  lines.push('');

  if (info.explanation) {
    lines.push('### Explanation');
    lines.push('');
    lines.push(info.explanation);
    lines.push('');
  }

  if (info.appliedFiles.length > 0) {
    lines.push('### Files changed');
    lines.push('');
    for (const f of info.appliedFiles) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }

  lines.push('### Checks');
  lines.push('');
  lines.push(`- Build: ${info.buildSuccess === undefined ? 'N/A' : info.buildSuccess ? 'passed' : 'failed'}`);
  lines.push(`- Tests: ${info.testSuccess === undefined ? 'N/A' : info.testSuccess ? 'passed' : 'failed'}`);
  lines.push(`- Review: ${info.reviewApproved === undefined ? 'N/A' : info.reviewApproved ? 'approved' : 'not approved'}`);

  if (info.reviewSummary) {
    lines.push(`  - ${info.reviewSummary}`);
  }

  lines.push('');
  lines.push('---');
  lines.push('_This PR was generated automatically by [osc-agent](https://github.com/DaniyalFaraz2003/OSC-Agent)._');

  return lines.join('\n');
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
