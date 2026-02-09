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
import { runRipgrep } from '../search/ripgrep';
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

    const candidateFiles = analysis?.affected_files?.length ? analysis.affected_files : [];

    // ── Strategy 1: Try affected files directly (works for existing files) ──
    for (const filePath of candidateFiles.slice(0, 10)) {
      addFile(filePath);
    }

    // ── Strategy 2: When affected files don't exist, explore their parent
    //    directories — gives context about the project area the issue targets ──
    if (results.length === 0) {
      for (const filePath of candidateFiles.slice(0, 5)) {
        // Strip glob stars and get the directory
        const dir = path.dirname(filePath.replace(/\*.*$/, ''));
        if (!dir || dir === '.') continue;

        const absDir = path.resolve(process.cwd(), dir);
        try {
          if (fs.existsSync(absDir) && fs.statSync(absDir).isDirectory()) {
            const entries = fs.readdirSync(absDir);
            for (const entry of entries.slice(0, 5)) {
              addFile(path.posix.join(dir, entry).replace(/\\/g, '/'), 250);
              if (results.length >= 6) break;
            }
          }
        } catch {
          /* permission error, etc. */
        }
      }
    }

    // ── Strategy 3: Ripgrep with analysis-derived keywords ──────────────
    if (results.length < 5 && analysis?.requirements?.length) {
      const keywords = extractSearchKeywords(analysis.requirements);
      for (const kw of keywords) {
        if (results.length >= 8) break;
        try {
          const hits = await runRipgrep({ pattern: kw, cwd: process.cwd(), context: 0 });
          const unique = deduplicateHitsByFile(hits);
          for (const hit of unique.slice(0, 3)) {
            addFile(hit.file, 250);
          }
        } catch {
          /* ripgrep may not be installed */
        }
      }
    }

    // ── Strategy 4: Ripgrep with issue title words ──────────────────────
    if (results.length < 5 && issue?.title) {
      const words = issue.title
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 5);

      for (const w of words) {
        if (results.length >= 8) break;
        try {
          const hits = await runRipgrep({ pattern: w, cwd: process.cwd(), context: 0 });
          const unique = deduplicateHitsByFile(hits);
          for (const hit of unique.slice(0, 3)) {
            addFile(hit.file, 250);
          }
        } catch {
          /* ripgrep may not be installed */
        }
      }
    }

    // ── Strategy 5: Always include project context files ────────────────
    addFile('package.json');
    addFile('tsconfig.json');

    // ── Strategy 6: Find existing similar files as templates ────────────
    // If the issue asks for tests, find existing test files so the AI can
    // mimic the project's testing patterns.
    const wantsTests = candidateFiles.some((f) => /test/i.test(f));
    if (wantsTests && results.length < 12) {
      try {
        const hits = await runRipgrep({ pattern: 'describe\\(', cwd: process.cwd(), context: 0 });
        const testFiles = deduplicateHitsByFile(hits).slice(0, 3);
        for (const hit of testFiles) {
          addFile(hit.file, 150);
        }
      } catch {
        /* ripgrep may not be installed */
      }
    }

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
      return { submission: { prNumber: pr.number, prUrl: pr.html_url, commitMessage } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to create PR: ${msg}`);
    }
  });

  return coordinator;
}

// ── Helpers ─────────────────────────────────────────────────────────────

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

/**
 * Extract meaningful search keywords from issue requirements, filtering out
 * common stop words and very short tokens.
 */
function extractSearchKeywords(requirements: string[]): string[] {
  const stopWords = new Set(['implement', 'ensure', 'add', 'create', 'update', 'should', 'must', 'that', 'with', 'from', 'this', 'the', 'for', 'and', 'not', 'are', 'can', 'will', 'has', 'have', 'test', 'tests', 'file', 'code', 'data', 'make', 'also', 'need', 'into', 'when', 'each', 'only', 'more', 'than', 'under', 'over', 'between', 'through', 'during', 'before', 'after', 'define', 'document', 'identify', 'suite', 'runs', 'mode']);

  return requirements
    .flatMap((r) => r.split(/[\s,;.()]+/))
    .map((w) => w.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase())
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .filter((w, i, arr) => arr.indexOf(w) === i)
    .slice(0, 8);
}

/**
 * Deduplicate ripgrep hits so we get at most one entry per unique file path.
 */
function deduplicateHitsByFile(hits: { file: string }[]): { file: string }[] {
  const seen = new Set<string>();
  return hits.filter((h) => {
    if (seen.has(h.file)) return false;
    seen.add(h.file);
    return true;
  });
}
