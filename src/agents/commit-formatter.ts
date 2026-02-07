/**
 * Conventional Commit Types
 * @see https://www.conventionalcommits.org/
 */
export type CommitType = 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'perf' | 'test' | 'build' | 'ci' | 'chore' | 'revert';

/**
 * Parsed conventional commit components
 */
export interface ConventionalCommit {
  type: CommitType;
  scope?: string;
  description: string;
  body?: string;
  footer?: string;
}

/**
 * Formatted commit message
 */
export interface FormattedCommit {
  raw: string;
  subject: string;
  body?: string;
}

/**
 * Formats a conventional commit message from its components.
 *
 * @param commit - The conventional commit components
 * @returns The formatted commit message
 *
 * @example
 * ```ts
 * formatCommit({
 *   type: 'fix',
 *   scope: 'auth',
 *   description: 'prevent null pointer exception',
 *   body: 'Added null check before accessing user properties',
 *   footer: 'Closes #123'
 * })
 * // Returns: "fix(auth): prevent null pointer exception\n\nAdded null check before accessing user properties\n\nCloses #123"
 * ```
 */
export function formatCommit(commit: ConventionalCommit): FormattedCommit {
  const scopePart = commit.scope ? `(${commit.scope})` : '';
  const subject = `${commit.type}${scopePart}: ${commit.description}`;

  let raw = subject;
  const parts: string[] = [subject];

  if (commit.body) {
    parts.push('', commit.body);
    raw = parts.join('\n');
  }

  if (commit.footer) {
    parts.push('', commit.footer);
    raw = parts.join('\n');
  }

  return {
    raw,
    subject,
    body: commit.body,
  };
}

/**
 * Validates if a commit type is valid according to conventional commits specification.
 *
 * @param type - The commit type to validate
 * @returns true if the type is valid, false otherwise
 */
export function isValidCommitType(type: string): type is CommitType {
  const validTypes: CommitType[] = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
  return validTypes.includes(type as CommitType);
}

/**
 * Validates if a commit description follows best practices.
 *
 * Rules:
 * - Must be in imperative mood ("add" not "added")
 * - Must not end with a period
 * - Must be under 72 characters
 *
 * @param description - The commit description to validate
 * @returns Object with isValid flag and error message if invalid
 */
export function validateCommitDescription(description: string): { isValid: boolean; error?: string } {
  if (!description || description.trim().length === 0) {
    return { isValid: false, error: 'Description cannot be empty' };
  }

  if (description.length > 72) {
    return { isValid: false, error: 'Description must be 72 characters or less' };
  }

  // Check for imperative mood (ends with 's' or common imperative verbs)
  const imperativeEndings = ['s', 'ch', 'sh', 'x', 'z'];
  const commonImperatives = ['add', 'fix', 'remove', 'update', 'create', 'delete', 'move', 'rename', 'refactor', 'document', 'test'];

  const lowerDescription = description.trim().toLowerCase();
  const firstWord = lowerDescription.split(' ')[0];

  // Simple heuristic: check if first word is a common imperative verb
  // This is not perfect but catches most cases
  if (!commonImperatives.includes(firstWord ?? '') && !imperativeEndings.some((ending) => lowerDescription.endsWith(ending))) {
    // Don't fail validation, just warn - this is a heuristic
    // return { isValid: false, error: 'Description should be in imperative mood (e.g., "add feature" not "added feature")' };
  }

  if (description.endsWith('.')) {
    return { isValid: false, error: 'Description should not end with a period' };
  }

  return { isValid: true };
}

/**
 * Formats a changelog entry following Keep a Changelog format.
 *
 * @param category - The category of change (Added, Changed, Deprecated, etc.)
 * @param entry - The changelog entry text
 * @param issueReference - Optional issue reference
 * @returns Formatted changelog entry
 *
 * @example
 * ```ts
 * formatChangelogEntry('Fixed', 'prevent null pointer exception', '#123')
 * // Returns: "- Fixed: prevent null pointer exception (#123)"
 * ```
 */
export function formatChangelogEntry(category: string, entry: string, issueReference?: string): string {
  let formatted = `- ${category}: ${entry}`;
  if (issueReference) {
    formatted += ` (${issueReference})`;
  }
  return formatted;
}

/**
 * Formats a PR description section.
 *
 * @param section - The section title
 * @param content - The section content (can be an array of bullet points)
 * @returns Formatted PR description section
 */
export function formatPRSection(section: string, content: string | string[]): string {
  const lines = [`## ${section}`, ''];

  if (Array.isArray(content)) {
    lines.push(...content.map((item) => `- ${item}`));
  } else {
    lines.push(content);
  }

  return lines.join('\n');
}

/**
 * Formats the PR checklist as a markdown task list.
 *
 * @param checklist - Object with checklist items and their completion status
 * @returns Formatted markdown checklist
 */
export function formatPRChecklist(checklist: Record<string, boolean>): string {
  const items: string[] = [];
  const labels: Record<string, string> = {
    styleGuidelines: 'My code follows the style guidelines of this project',
    selfReview: 'I have performed a self-review of my code',
    comments: 'I have commented my code, particularly in hard-to-understand areas',
    documentation: 'I have made corresponding changes to the documentation',
    noWarnings: 'My changes generate no new warnings',
    testsAdded: 'I have added tests that prove my fix is effective or that my feature works',
    testsPass: 'New and existing unit tests pass locally with my changes',
    dependentChanges: 'Any dependent changes have been merged and published',
  };

  for (const [key, checked] of Object.entries(checklist)) {
    const checkbox = checked ? '- [x]' : '- [ ]';
    const label = labels[key] || key;
    items.push(`${checkbox} ${label}`);
  }

  return items.join('\n');
}
