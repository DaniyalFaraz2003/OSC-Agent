import { GitHubClient } from '../../../src/github/client';
import * as dotenv from 'dotenv';

dotenv.config();

describe('GitHub API Integration', () => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn('Skipping integration tests: GITHUB_TOKEN not set');
    return;
  }

  const client = new GitHubClient({ token });

  it('should fetch the public repository of the client itself', async () => {
    const repo = await client.getRepository('octocat', 'Hello-World');
    expect(repo.full_name).toBe('octocat/Hello-World');
  });

  it('should fetch issues from a public repository', async () => {
    const issues = await client.listIssues('facebook', 'react');
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBeGreaterThan(0);
  });
});
