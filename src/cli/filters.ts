import { GitHubIssue, IssueFilter } from './types';

/**
 * Filter GitHub issues based on criteria
 *
 * @param issues - Array of GitHub issues to filter
 * @param filters - Filtering criteria (labels, age, complexity)
 * @returns Filtered array of issues
 */
export function filterIssues(issues: GitHubIssue[], filters: IssueFilter): GitHubIssue[] {
  let filtered = [...issues];

  // Filter by labels (OR logic - matches any label)
  if (filters.labels && filters.labels.length > 0) {
    filtered = filtered.filter((issue) => filters.labels!.some((label) => issue.labels?.some((l) => l.name === label)));
  }

  // Filter by age (minAge = older than X hours, maxAge = newer than X hours ago)
  if (filters.minAge !== undefined) {
    const minDate = Date.now() - filters.minAge * 60 * 60 * 1000;
    filtered = filtered.filter((issue) => new Date(issue.created_at).getTime() <= minDate);
  }

  if (filters.maxAge !== undefined) {
    const maxDate = Date.now() - filters.maxAge * 60 * 60 * 1000;
    filtered = filtered.filter((issue) => new Date(issue.created_at).getTime() >= maxDate);
  }

  // TODO: Filter by complexity (needs issue analysis from Task 3.x)
  if (filters.complexity) {
    console.warn('Complexity filtering not yet implemented (requires Task 3.x)');
  }

  return filtered;
}

/**
 * Parse comma-separated filter string
 *
 * @param filterString - Comma-separated labels (e.g., "bug,help-wanted")
 * @returns IssueFilter object
 */
export function parseFilters(filterString?: string): IssueFilter {
  if (!filterString) return {};

  const labels = filterString.split(',').map((s) => s.trim());
  return { labels };
}
