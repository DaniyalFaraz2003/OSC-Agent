/**
 * Prompt for the LLM-guided search planner.
 *
 * Given the issue details and a compact file tree, the LLM picks the most
 * relevant files and directories to read — replacing fragile hard-coded
 * heuristics.
 */

export function buildSearchPlanningPrompt(input: { title: string; body: string; analysisJson: string; fileTree: string }): string {
  return `You are a senior software engineer preparing to fix a GitHub issue.

Your task: given the issue description, expert analysis, and the project's file tree,
select the **most relevant files** that should be read to understand, fix, and test
the issue. These files will be fed as context to the code-generation step.

### ISSUE
Title: ${input.title}
Body:
${input.body}

### EXPERT ANALYSIS
${input.analysisJson}

### PROJECT FILE TREE
${input.fileTree}

### INSTRUCTIONS

Return a JSON object with a single key "files" — an array of **file paths**
(relative to the project root, exactly as shown in the tree).

Guidelines:
- Pick **8-15 files** that are most relevant.
- Prefer source files (*.ts, *.tsx, *.js) and test files over config files.
- Include files that the fix will MODIFY or that the fix DEPENDS ON.
- Include existing test files that follow the project's testing patterns.
- Include at most ONE config file (package.json) only if dependencies matter.
- Do NOT include tsconfig.json, lock files, or build output.
- Do NOT include files that are unrelated to the issue.
- If a directory is highly relevant but you don't know exact files, pick the
  most likely files inside it based on their names.
- Paths must match the tree EXACTLY (case-sensitive).

### OUTPUT FORMAT

Return ONLY valid JSON. No markdown. No explanation.

{
  "files": [
    "src/cli/commands/issue.ts",
    "src/orchestrator/register-handlers.ts",
    "tests/e2e/cli/issue.test.ts"
  ]
}
`;
}
