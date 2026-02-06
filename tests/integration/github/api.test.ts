import { GitHubClient } from '../../../src/github/client';
import * as dotenv from 'dotenv';

dotenv.config();

const token = process.env.GITHUB_TOKEN;

// Use conditional describe to avoid "No tests found" error
const describeIfToken = token ? describe : describe.skip;

describeIfToken('GitHub API Integration', () => {
  const client = new GitHubClient({ token: token! });

  it('should fetch the public repository octocat/Hello-World', async () => {
    const repo = await client.getRepository('octocat', 'Hello-World');
    expect(repo.full_name).toBe('octocat/Hello-World');
  }, 15000);

  it('should fetch public issues', async () => {
    const issues = await client.listIssues('facebook', 'react');
    expect(issues.length).toBeGreaterThan(0);
  }, 15000);
});

// Dummy test to satisfy Jest if describe is skipped
describe('Integration test check', () => {
  it('should verify environment', () => {
    if (!token) {
      console.warn('Skipping GitHub Integration tests: GITHUB_TOKEN not found');
    }
    expect(true).toBe(true);
  });
});
