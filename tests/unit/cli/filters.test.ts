import { describe, it, expect } from '@jest/globals';
import { filterIssues, parseFilters } from '../../../src/cli/filters';
import type { GitHubIssue } from '../../../src/github/types';

describe('filterIssues', () => {
  const now = Date.now();
  const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const twoYearsAgo = new Date(now - 2 * 365 * 24 * 60 * 60 * 1000);
  const fourYearsAgo = new Date(now - 4 * 365 * 24 * 60 * 60 * 1000);

  const mockIssues: GitHubIssue[] = [
    {
      id: 1,
      number: 101,
      title: 'Bug fix',
      body: 'body',
      state: 'open',
      user: { login: 'user' },
      labels: [{ name: 'bug' }],
      created_at: oneMonthAgo.toISOString(),
    },
    {
      id: 2,
      number: 102,
      title: 'Feature request',
      body: 'body',
      state: 'open',
      user: { login: 'user' },
      labels: [{ name: 'enhancement' }],
      created_at: twoYearsAgo.toISOString(),
    },
    {
      id: 3,
      number: 103,
      title: 'Old bug',
      body: 'body',
      state: 'open',
      user: { login: 'user' },
      labels: [{ name: 'bug' }],
      created_at: fourYearsAgo.toISOString(),
    },
  ];

  it('should filter by labels', () => {
    const result = filterIssues(mockIssues, { labels: ['bug'] });
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe(1);
    expect(result[1]!.id).toBe(3);
  });

  it('should return all issues when no filters', () => {
    const result = filterIssues(mockIssues, {});
    expect(result).toHaveLength(3);
  });

  it('should filter by multiple labels (OR logic)', () => {
    const result = filterIssues(mockIssues, {
      labels: ['bug', 'enhancement'],
    });
    expect(result).toHaveLength(3);
  });

  it('should filter by minAge', () => {
    const result = filterIssues(mockIssues, {
      minAge: 24 * 365 * 3, // 3 years - should return issues older than 3 years
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(3);
  });

  it('should filter by maxAge', () => {
    const result = filterIssues(mockIssues, {
      maxAge: 24 * 365, // 1 year - should return issues newer than 1 year
    });
    expect(result).toHaveLength(1); // Only the 1-month-old issue
    expect(result[0]!.id).toBe(1);
  });
});

describe('parseFilters', () => {
  it('should parse comma-separated labels', () => {
    const result = parseFilters('bug,help-wanted,good-first-issue');
    expect(result.labels).toEqual(['bug', 'help-wanted', 'good-first-issue']);
  });

  it('should handle empty string', () => {
    const result = parseFilters('');
    expect(result).toEqual({});
  });

  it('should handle undefined', () => {
    const result = parseFilters(undefined);
    expect(result).toEqual({});
  });

  it('should trim whitespace', () => {
    const result = parseFilters(' bug , enhancement ');
    expect(result.labels).toEqual(['bug', 'enhancement']);
  });
});
