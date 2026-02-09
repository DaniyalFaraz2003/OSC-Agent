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

### OUTPUT REQUIREMENTS
You must return a valid JSON object. Do NOT wrap it in markdown code blocks (\`\`\`json).
The JSON must follow this exact structure:
{
  "explanation": "Detailed explanation of the changes and why they address the issue",
  "confidenceScore": 0.95,
  "changes": [
    {
      "filePath": "relative/path/to/file.ts",
      "originalCode": "exact code to replace — OR empty string for new files",
      "replacementCode": "new code — for new files provide the COMPLETE file content"
    }
  ]
}

### CRITICAL RULES

**For MODIFYING existing files:**
1. "originalCode" must be an EXACT, verbatim substring of the code shown in the CODE CONTEXT section.
2. "replacementCode" replaces only that substring — keep surrounding code intact.
3. Preserve existing indentation, coding style, and conventions.

**For CREATING new files (no existing source in context):**
4. Set "originalCode" to an empty string: ""
5. Set "replacementCode" to the COMPLETE, production-ready file content — including all imports, exports, types, and implementation.
6. File paths must be relative to the project root (e.g., "src/utils/helper.ts", "tests/unit/helper.test.ts").

**General:**
7. You MUST return at least one change. NEVER return an empty "changes" array.
8. If no source code context is provided, assume you need to CREATE new files.
9. Include ALL files required to fully address the issue — do not leave partial implementations.
10. Make sure every file is syntactically valid and can be used as-is.
`;
};
