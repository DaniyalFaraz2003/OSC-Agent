import { GitHubIssue } from '../github/types';

export interface AutoCommandOptions {
  repo: string;
  maxIssues?: number;
  interval?: number;
  filters?: string;
  resume?: boolean;
  dryRun?: boolean;
}

export interface IssueFilter {
  labels?: string[];
  minAge?: number; // Hours
  maxAge?: number; // Hours
  complexity?: 'low' | 'medium' | 'high';
}

export interface IssueTask {
  owner: string;
  repo: string;
  issueNumber: number;
  title: string;
}

export type { GitHubIssue };
