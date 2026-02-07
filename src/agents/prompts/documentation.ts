/**
 * Generates a prompt for creating a conventional commit message.
 */
export const createCommitMessagePrompt = (issue: string, fix: string): string => {
  return `
SYSTEM INSTRUCTIONS:
You are an expert software engineer specializing in writing clear, concise commit messages following the Conventional Commits specification.
Generate a commit message that accurately describes the fix.

CONVENTIONAL COMMIT FORMAT:
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]

TYPES:
- feat: A new feature
- fix: A bug fix
- docs: Documentation only changes
- style: Changes that do not affect the meaning of the code
- refactor: A code change that neither fixes a bug nor adds a feature
- perf: A code change that improves performance
- test: Adding missing tests or correcting existing tests
- build: Changes that affect the build system or external dependencies
- ci: Changes to CI configuration files and scripts
- chore: Other changes that don't modify src or test files
- revert: Reverts a previous commit

RULES:
- Use imperative mood ("add" not "added" or "adds")
- Use lowercase for type
- Keep description under 72 characters
- Reference the issue in the footer if applicable

ORIGINAL ISSUE:
${issue}

GENERATED FIX:
${fix}

RESPONSE FORMAT (JSON):
{
  "type": "fix|feat|docs|style|refactor|perf|test|build|ci|chore",
  "scope": "optional scope (e.g., auth, api, ui)",
  "description": "concise description in imperative mood",
  "body": "detailed explanation of what changed and why",
  "footer": "references to issues (e.g., Closes #123)"
}
`;
};

/**
 * Generates a prompt for creating a comprehensive pull request description.
 */
export const createPRDescriptionPrompt = (issue: string, fix: string, diff: string): string => {
  return `
SYSTEM INSTRUCTIONS:
You are a Senior Software Engineer writing a pull request description for a code change.
Create a comprehensive, well-structured PR description that helps reviewers understand the change.

PR DESCRIPTION STRUCTURE:
## Summary
Brief overview of what this PR does (2-3 sentences)

## Changes
Detailed list of what was changed (bullet points)

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Other (please describe)

## Testing
Describe how the changes were tested

## Related Issues
Link to the original issue this addresses

## Checklist
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

ORIGINAL ISSUE:
${issue}

GENERATED FIX:
${fix}

CODE DIFF:
${diff}

RESPONSE FORMAT (JSON):
{
  "summary": "Brief overview of the PR",
  "changes": ["bullet point 1", "bullet point 2"],
  "typeOfChange": "Bug fix|New feature|Breaking change|Documentation update|Refactoring|Other",
  "testing": "Description of testing performed",
  "relatedIssues": "Issue number or URL",
  "checklist": {
    "styleGuidelines": true,
    "selfReview": true,
    "comments": true,
    "documentation": true,
    "noWarnings": true,
    "testsAdded": true,
    "testsPass": true,
    "dependentChanges": true
  }
}
`;
};

/**
 * Generates a prompt for documenting new or modified functions and classes.
 */
export const createCodeDocumentationPrompt = (code: string, context: string): string => {
  return `
SYSTEM INSTRUCTIONS:
You are a Technical Writer specializing in API documentation.
Generate comprehensive JSDoc/TSDoc documentation for the provided code.

DOCUMENTATION STANDARDS:
- Use /** ... */ for JSDoc/TSDoc comments
- Include @param tags for all parameters with descriptions
- Include @returns tag with description
- Include @throws for exceptions that may be thrown
- Include @example for usage examples when helpful
- Document behavior, edge cases, and assumptions
- Use clear, concise language

CONTEXT:
${context}

CODE TO DOCUMENT:
${code}

RESPONSE FORMAT (JSON):
{
  "documentation": "Full JSDoc/TSDoc comment block",
  "summary": "One-line summary of what the code does",
  "remarks": "Additional remarks about usage or behavior"
}
`;
};

/**
 * Generates a prompt for creating a changelog entry.
 */
export const createChangelogPrompt = (issue: string, version: string): string => {
  return `
SYSTEM INSTRUCTIONS:
You are a Release Manager writing a changelog entry following the Keep a Changelog format.

CHANGELOG FORMAT:
## [Version] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Security vulnerability fixes

RULES:
- Categorize the change appropriately
- Write in clear, user-friendly language
- Focus on impact to users, not implementation details
- Reference the issue number if applicable

ORIGINAL ISSUE:
${issue}

CURRENT VERSION: ${version}

RESPONSE FORMAT (JSON):
{
  "category": "Added|Changed|Deprecated|Removed|Fixed|Security",
  "entry": "Clear, concise description of the change",
  "issueReference": "Issue #123 (if applicable)"
}
`;
};

/**
 * Generates a prompt for linking documentation to the original issue.
 */
export const createIssueLinkPrompt = (issue: string, documentation: string): string => {
  return `
SYSTEM INSTRUCTIONS:
You are a Developer Liaison ensuring documentation is properly connected to its source issue.
Create a comment to post on the GitHub issue that summarizes the documentation generated.

ISSUE:
${issue}

GENERATED DOCUMENTATION:
${documentation}

RESPONSE FORMAT (JSON):
{
  "comment": "Professional comment summarizing the documentation and linking to relevant files",
  "documentationLinks": ["array of documentation file paths or URLs"]
}
`;
};
