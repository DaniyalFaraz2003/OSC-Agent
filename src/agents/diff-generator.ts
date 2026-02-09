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
   * Handles two modes:
   * 1. **New file creation** — `originalCode` is empty/absent ⇒ patch from nothing to `replacementCode`.
   * 2. **Existing file modification** — locate `originalCode` inside `fullFileContent`, replace, and diff.
   */
  static generate(change: CodeChange, fullFileContent: string): string {
    // ── New-file creation ───────────────────────────────────────────────
    if (!change.originalCode || change.originalCode.trim() === '') {
      if (!change.replacementCode || change.replacementCode.trim() === '') {
        throw new Error(`Empty change for ${change.filePath} — both original and replacement are blank`);
      }
      // Ensure the new content ends with a trailing newline for clean diffs
      const content = change.replacementCode.endsWith('\n') ? change.replacementCode : change.replacementCode + '\n';
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
      return createPatch(change.filePath, '', content);
    }

    // ── Existing-file modification ──────────────────────────────────────
    const updatedContent = fullFileContent.replace(change.originalCode, change.replacementCode);

    if (updatedContent === fullFileContent) {
      throw new Error(`Could not find original code block in ${change.filePath}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
    return createPatch(change.filePath, fullFileContent, updatedContent);
  }
}
