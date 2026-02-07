export interface ReviewCategory {
  id: string;
  name: string;
  criteria: string[];
}

export const CODE_REVIEW_CHECKLIST: ReviewCategory[] = [
  {
    id: 'correctness',
    name: 'Correctness & Requirements',
    criteria: ['Does the fix address the original issue description?', 'Are there any obvious logic errors or off-by-one errors?', 'Does the fix introduce any regressions?'],
  },
  {
    id: 'bugs',
    name: 'Common Bugs & Anti-patterns',
    criteria: ['Check for null or undefined pointer risks.', 'Identify race conditions in async/await logic.', 'Check for improper error handling or swallowed exceptions.', 'Ensure memory/resource leaks are avoided (e.g., event listeners, timers).'],
  },
  {
    id: 'standards',
    name: 'Project Standards & Style',
    criteria: ['Consistent naming conventions (camelCase for variables, PascalCase for classes).', 'Adherence to TypeScript strict mode (no "any" unless justified).', "Code is modular and follows DRY (Don't Repeat Yourself) principles."],
  },
];
