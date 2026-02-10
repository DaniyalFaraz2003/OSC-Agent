// src/agents/diff-generator.ts
import { createPatch } from 'diff';

export interface CodeChange {
  filePath: string;
  originalCode: string;
  replacementCode: string;
}

export class DiffGenerator {
  /**
   * Generate a unified diff patch for a single code change.
   *
   * Three modes (tried in order):
   *
   * 1. **Empty originalCode** — `originalCode` is empty/absent.
   *    - If the file already exists on disk (`fullFileContent` is non-empty),
   *      this produces a diff of actual changes (full-file rewrite).
   *    - If the file does not exist (`fullFileContent` is empty), this produces
   *      a "new file" diff showing all lines as additions.
   *
   * 2. **Exact substring match** — `originalCode` is found verbatim inside
   *    `fullFileContent`. The substring is replaced and the two versions are
   *    diffed.
   *
   * 3. **Fuzzy line-based match** — Normalises whitespace and tries to find
   *    the closest matching block of lines. Tolerates minor AI reformatting.
   */
  static generate(change: CodeChange, fullFileContent: string): string {
    const hasOriginal = change.originalCode && change.originalCode.trim() !== '';
    const hasReplacement = change.replacementCode && change.replacementCode.trim() !== '';

    if (!hasReplacement) {
      throw new Error(`Empty replacement for ${change.filePath} — nothing to generate`);
    }

    const newContent = ensureTrailingNewline(change.replacementCode);
    const existingContent = fullFileContent.endsWith('\n') || fullFileContent === '' ? fullFileContent : fullFileContent + '\n';

    // ── Path A: Full-file diff (originalCode is empty) ──────────────────
    // Works for BOTH brand-new files AND full-file rewrites of existing files.
    if (!hasOriginal) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
      const patch: string = createPatch(change.filePath, existingContent, newContent);
      // If there are no actual changes, skip
      if (!patch.includes('@@')) {
        throw new Error(`No changes detected for ${change.filePath} — replacement is identical to existing content`);
      }
      return patch;
    }

    // ── Path B: Exact substring match ───────────────────────────────────
    if (fullFileContent.includes(change.originalCode)) {
      const updated = fullFileContent.replace(change.originalCode, change.replacementCode);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
      return createPatch(change.filePath, fullFileContent, updated);
    }

    // ── Path C: Fuzzy line-based match ──────────────────────────────────
    const fuzzyResult = fuzzyLineReplace(fullFileContent, change.originalCode, change.replacementCode);
    if (fuzzyResult !== null) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
      return createPatch(change.filePath, fullFileContent, fuzzyResult);
    }

    // ── Path D: Treat replacementCode as complete file content ──────────
    // Last resort — if the AI provided what looks like a full file, diff it
    // directly against the existing content.
    if (looksLikeCompleteFile(change.replacementCode)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
      const patch: string = createPatch(change.filePath, existingContent, newContent);
      if (patch.includes('@@')) return patch;
    }

    throw new Error(`Could not find original code block in ${change.filePath}`);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function ensureTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s : s + '\n';
}

/**
 * Heuristic: does the string look like a complete file rather than a snippet?
 * Checks for common file-level patterns (imports, exports, top-level declarations).
 */
function looksLikeCompleteFile(content: string): boolean {
  const lines = content.split('\n');
  if (lines.length < 3) return false;
  const first10 = lines.slice(0, 10).join('\n');
  return /^(import |export |\/\/|\/\*|#!|'use strict'|"use strict"|const |let |var |function |class |interface |type |enum |module\.exports|require\()/m.test(first10);
}

/**
 * Line-by-line fuzzy replacement.
 *
 * 1. Splits both `content` and `original` into lines.
 * 2. Finds the block of lines in `content` that best matches `original`
 *    (comparison ignores leading/trailing whitespace per line).
 * 3. If ≥ 60 % of lines match, replaces that block with `replacement`.
 */
function fuzzyLineReplace(content: string, original: string, replacement: string): string | null {
  const contentLines = content.replace(/\r\n/g, '\n').split('\n');
  const originalLines = original
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim() !== '');
  const replacementLines = replacement.replace(/\r\n/g, '\n').split('\n');

  if (originalLines.length === 0) return null;

  let bestStart = -1;
  let bestScore = 0;

  for (let i = 0; i <= contentLines.length - originalLines.length; i++) {
    let matches = 0;
    for (let j = 0; j < originalLines.length; j++) {
      if (contentLines[i + j]!.trim() === originalLines[j]!.trim()) {
        matches++;
      }
    }
    const score = matches / originalLines.length;
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  // Require at least 60% of lines to match
  if (bestScore >= 0.6 && bestStart >= 0) {
    const before = contentLines.slice(0, bestStart);
    const after = contentLines.slice(bestStart + originalLines.length);
    const result = [...before, ...replacementLines, ...after].join('\n');
    return result;
  }

  return null;
}
