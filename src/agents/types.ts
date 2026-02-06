import { z } from 'zod';

export type IssueType = 'bug' | 'feature' | 'documentation' | 'refactor' | 'question' | 'chore' | 'unknown';
export type IssueComplexity = 'simple' | 'medium' | 'complex';

export interface GitHubIssueLabel {
  name?: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body?: string | null;
  html_url?: string;
  labels?: GitHubIssueLabel[];
}

export const IssueAnalysisSchema = z.object({
  type: z.enum(['bug', 'feature', 'documentation', 'refactor', 'question', 'chore', 'unknown']),
  complexity: z.enum(['simple', 'medium', 'complex']),
  requirements: z.array(z.string().min(1)).default([]),
  affected_files: z.array(z.string().min(1)).default([]),
});

export type IssueAnalysis = z.infer<typeof IssueAnalysisSchema>;
