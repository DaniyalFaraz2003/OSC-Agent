import type { GitHubRepository } from '../github/types';

export type RepoSlug = {
  owner: GitHubRepository['owner']['login'];
  repo: GitHubRepository['name'];
};

export function parseRepoSlug(input: string): RepoSlug {
  const trimmed = input.trim();
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid --repo value: "${input}". Expected format: owner/repo`);
  }
  const owner = match[1];
  const repo = match[2];
  if (!owner || !repo) {
    throw new Error(`Invalid --repo value: "${input}". Expected format: owner/repo`);
  }
  return { owner, repo };
}

export function parseIssueNumber(input: string): number {
  const n = Number(input);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid --issue value: "${input}". Expected a positive integer.`);
  }
  return n;
}

export function validateBranchName(branch: string): string {
  const trimmed = branch.trim();
  if (!trimmed) {
    throw new Error('Invalid --branch value: branch name cannot be empty.');
  }

  // Simple conservative rule set; avoids spaces and common invalid chars.
  if (!/^[A-Za-z0-9._/-]+$/.test(trimmed)) {
    throw new Error(`Invalid --branch value: "${branch}". Only letters, numbers, '.', '_', '-', '/', are allowed.`);
  }

  return trimmed;
}

export function defaultBranchName(owner: string, repo: string, issueNumber: number): string {
  return `osc/${owner}-${repo}-issue-${issueNumber}`;
}
