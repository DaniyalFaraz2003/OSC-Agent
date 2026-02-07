import { CODE_REVIEW_CHECKLIST } from '../review-checklist';

export const createReviewPrompt = (issue: string, fix: string): string => {
  const checklistStr = CODE_REVIEW_CHECKLIST.map((cat) => `### ${cat.name}\n${cat.criteria.map((c) => `- ${c}`).join('\n')}`).join('\n\n');

  return `
SYSTEM INSTRUCTIONS:
You are a Senior Software Engineer and Code Reviewer. Review the provided fix against the original issue.
You must provide your review in VALID JSON format only.

CRITERIA:
${checklistStr}

### ORIGINAL ISSUE
${issue}

### GENERATED FIX
${fix}

RESPONSE FORMAT (JSON):
{
  "approved": boolean,
  "summary": "High-level overview",
  "issues": [
    { "type": "bug|style|logic|edge-case", "description": "...", "severity": "low|medium|high" }
  ],
  "suggestions": ["specific improvement 1", "..."]
}
`;
};
