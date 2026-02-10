// src/agents/context-builder.ts
export interface CodeSearchResult {
  filePath: string;
  content: string;
}

export class ContextBuilder {
  /**
   * Consolidates all information into a formatted string for the LLM.
   *
   * When no source files are provided the context explicitly tells the model
   * it is likely creating new files, so it does not try to reference
   * non-existent code.
   */
  static build(issue: string, analysis: string, results: CodeSearchResult[]): string {
    let fileContext: string;

    if (results.length === 0) {
      fileContext = '(No existing source files were found for this issue.\n' + 'You are most likely creating NEW files. Use "originalCode": "" for every new file\n' + 'and provide the COMPLETE file content in "replacementCode".)';
    } else {
      // Separate true source files from config/project files for clarity
      const sourceFiles = results.filter((r) => !r.filePath.endsWith('package.json') && !r.filePath.endsWith('tsconfig.json'));
      const configFiles = results.filter((r) => r.filePath.endsWith('package.json') || r.filePath.endsWith('tsconfig.json'));

      const parts: string[] = [];

      if (sourceFiles.length > 0) {
        parts.push(sourceFiles.map((r) => `--- FILE: ${r.filePath} ---\n${r.content}\n--- END FILE ---`).join('\n\n'));
      } else {
        parts.push('(No relevant source files were found. You will likely need to CREATE new files.\n' + 'Use "originalCode": "" for each new file and provide full content in "replacementCode".)');
      }

      if (configFiles.length > 0) {
        parts.push('\n--- PROJECT CONFIGURATION (for reference, do NOT modify unless required) ---\n' + configFiles.map((r) => `--- FILE: ${r.filePath} ---\n${r.content}\n--- END FILE ---`).join('\n\n'));
      }

      fileContext = parts.join('\n\n');
    }

    return `
ISSUE TO ADDRESS:
${issue}

EXPERT ANALYSIS:
${analysis}

SOURCE CODE CONTEXT:
${fileContext}
`.trim();
  }
}
