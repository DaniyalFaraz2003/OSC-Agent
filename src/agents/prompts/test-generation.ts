// Define the shape of the requirement here
export interface TestRequirement {
  functionName: string;
  testType: 'unit' | 'integration';
  scenarios: {
    description: string;
    isEdgeCase: boolean;
    type: 'positive' | 'negative';
  }[];
}

export const TEST_ANALYSIS_PROMPT = (diff: string, code: string): string => `
Analyze the following code diff and original source code.
Identify modified functions and determine testing needs.
Output a JSON object with a 'requirements' array.

Source Code:
${code}

Diff:
${diff}
`;

export const TEST_GENERATION_PROMPT = (req: TestRequirement, context: string): string => `
You are a Senior QA Engineer. Generate Vitest/Jest unit tests for the following requirement.
Use the project's pattern: Mock external dependencies using 'vi.mock'.
Include assertions for all scenarios.

Context: ${context}
Function to test: ${req.functionName}
Scenarios: ${JSON.stringify(req.scenarios)}

Return only the executable TypeScript code.
`;
