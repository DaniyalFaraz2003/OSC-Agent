export type FixStrategy = 'minimal' | 'comprehensive' | 'refactor';

export const getFixGenerationPrompt = (issueDescription: string, analysis: string, context: string, strategy: FixStrategy): string => {
  const strategyInstructions = {
    minimal: 'Make the smallest set of changes necessary to address the issue. Do not touch unrelated code.',
    comprehensive: 'Address the issue thoroughly, including edge cases, validation, and error handling identified in the analysis.',
    refactor: 'Address the issue while improving code readability, structure, and adherence to best practices.',
  };

  return `
ACT AS: Senior Software Engineer
TASK: Generate code changes to address the reported GitHub issue.

### ISSUE DESCRIPTION
${issueDescription}

### ANALYSIS
${analysis}

### CODE CONTEXT
${context}

### STRATEGY
${strategyInstructions[strategy]}

### OUTPUT FORMAT

You must return a valid JSON object. Do NOT wrap it in markdown code blocks.

{
  "explanation": "Clear explanation of what you changed and why",
  "confidenceScore": 0.95,
  "changes": [
    {
      "filePath": "relative/path/to/file.ts",
      "originalCode": "",
      "replacementCode": "THE COMPLETE FILE CONTENT AFTER YOUR CHANGES"
    }
  ]
}

### CRITICAL RULES

1. **ALWAYS set "originalCode" to an empty string: ""**
   - For EVERY change (new files AND modifications to existing files).
   - Do NOT try to copy code snippets from the context — just use "".

2. **"replacementCode" must be the COMPLETE file content.**
   - For existing files: provide the ENTIRE modified file (all imports, all functions, everything).
   - For new files: provide the ENTIRE new file content.
   - The system will automatically compute the diff against the existing file.

3. **File paths must be relative** to the project root (e.g., "src/utils/helper.ts").

4. **You MUST return at least one change.** Never return an empty "changes" array.

5. **Include ALL files** required to fully address the issue. Do not leave partial work.

6. **Every file must be syntactically valid** TypeScript/JavaScript that compiles and runs.

7. **Preserve existing code** that is unrelated to the issue. If modifying an existing file,
   keep all the existing functions, imports, and logic that are not part of your fix.
   Only change what is necessary.
`;
};
