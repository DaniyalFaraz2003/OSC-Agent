# Contributing to OSC-Agent

Thank you for your interest in contributing to OSC-Agent! We're excited to have you join our community of developers working to revolutionize open-source contributions through AI automation.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Finding an Issue](#finding-an-issue)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Code Standards](#code-standards)
- [Testing Guidelines](#testing-guidelines)
- [Communication Guidelines](#communication-guidelines)
- [Need Help?](#need-help)

## Code of Conduct

By participating in this project, you agree to maintain a respectful, inclusive, and collaborative environment. We expect all contributors to:

- Be respectful and considerate in discussions
- Accept constructive feedback gracefully
- Focus on what's best for the community and project
- Show empathy towards other community members

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** >= 18
- **npm** (comes with Node.js)
- **Git** for version control
- **ripgrep** for code searching capabilities

### Setting Up Your Development Environment

1. **Fork the Repository**

   Click the "Fork" button at the top right of the [OSC-Agent repository](https://github.com/DaniyalFaraz2003/OSC-Agent) to create your own copy.

2. **Clone Your Fork**

   ```bash
   git clone https://github.com/YOUR-USERNAME/OSC-Agent.git
   cd OSC-Agent
   ```

3. **Add Upstream Remote**

   ```bash
   git remote add upstream https://github.com/DaniyalFaraz2003/OSC-Agent.git
   ```

4. **Install Dependencies**

   ```bash
   npm install
   ```

5. **Set Up Configuration**

   Create a `.env` file or `config.yaml` in the root directory:

   **Option 1: Using .env file**

   ```env
   GITHUB_TOKEN=your_github_token
   GEMINI_API_KEY=your_gemini_api_key
   E2B_API_KEY=your_e2b_api_key
   ```

   **Option 2: Using config.yaml**

   ```yaml
   github:
     token: YOUR_GITHUB_TOKEN

   gemini:
     api_key: YOUR_GEMINI_API_KEY
     model_tier: auto # auto, basic, advanced

   e2b:
     api_key: YOUR_E2B_API_KEY

   testing:
     max_iterations: 3
     timeout: 300
   ```

6. **Verify Setup**

   ```bash
   npm run build
   npm test
   ```

## How to Contribute

We welcome various types of contributions:

- 🐛 **Bug Fixes**: Fix issues and improve stability
- ✨ **New Features**: Implement new functionality
- 📝 **Documentation**: Improve or add documentation
- 🧪 **Tests**: Add or improve test coverage
- 🎨 **Code Quality**: Refactoring and optimization
- 💡 **Ideas**: Share suggestions via GitHub Discussions

## Finding an Issue

### 1. Browse Open Issues

Visit the [Issues page](https://github.com/DaniyalFaraz2003/OSC-Agent/issues) to find open issues.

### 2. Look for Labels

Issues are labeled to help you find suitable tasks:

- `good first issue` - Great for newcomers
- `help wanted` - We need community help
- `bug` - Something isn't working
- `enhancement` - New feature or improvement
- `documentation` - Documentation improvements
- `priority: high` - Important issues to address

### 3. Claim an Issue

**Before starting work:**

1. **Check if the issue is already assigned** - If someone is already working on it, consider finding another issue or asking if you can collaborate.

2. **Comment on the issue** to express your interest:

   ```
   Hi! I'd like to work on this issue. Here's my proposed approach:
   [Briefly describe your plan]

   Could you assign this to me?
   ```

3. **Wait for confirmation** from a maintainer before starting work. This prevents duplicate efforts.

### 4. Understand the Issue Completely

- Read the issue description thoroughly
- Review any attached screenshots, logs, or error messages
- Check related issues or pull requests
- Ask questions in the issue comments if anything is unclear
- Review the relevant code sections mentioned in the issue

**Important**: Use the issue comments for all discussions related to that issue. This keeps all context in one place and helps future contributors understand the decisions made.

## Development Workflow

### 1. Create a Feature Branch

Always create a new branch for your work:

```bash
# Update your main branch
git checkout main
git pull upstream main

# Create and switch to a new branch using the exact issue title
# Replace spaces with hyphens and use lowercase
git checkout -b "exact-issue-title-here"
```

**Branch naming convention:**

- Name your branch **exactly** as the issue title (with spaces replaced by hyphens and in lowercase)
- For example, if the issue title is "Add Multi-Agent System", your branch should be: `add-multi-agent-system`
- This ensures clear traceability between issues and branches

### 2. Make Your Changes

- Write clean, readable code following our [Code Standards](#code-standards)
- Keep changes focused and minimal
- Add comments where necessary to explain complex logic
- Update documentation if you change behavior or add features

### 3. Follow the Development Plan

Refer to `DEVELOPMENT_PLAN.md` for:

- Project architecture understanding
- Module dependencies
- Implementation guidelines
- Definition of done criteria

### 4. Test Your Changes

```bash
# Run all tests
npm test

# Run specific test file
npm test -- path/to/test-file

# Run tests in watch mode during development
npm run test:watch

# Check test coverage
npm run test:coverage
```

### 5. Ensure Code Quality

```bash
# Run linter
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code
npm run format

# Build the project
npm run build
```

### 6. Commit Your Changes

Write clear, descriptive commit messages:

```bash
git add .
git commit -m "fix: resolve issue with agent state management (#123)"
```

**Commit message format:**

```
<type>: <short description> (#issue-number)

[Optional longer description]
```

**Types:**

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

### 7. Keep Your Branch Updated

Regularly sync your branch with the upstream main:

```bash
git fetch upstream
git rebase upstream/main
```

If there are conflicts, resolve them locally before pushing.

## Pull Request Process

### Before Submitting a Pull Request

✅ **Checklist:**

- [ ] All tests pass locally
- [ ] Code follows project style guidelines
- [ ] Linter passes without errors
- [ ] You've added tests for new functionality
- [ ] Documentation is updated (if applicable)
- [ ] Your branch is up to date with main
- [ ] Commits are clear and descriptive
- [ ] You've tested the changes manually

### Submitting a Pull Request

1. **Push Your Branch**

   ```bash
   git push origin your-branch-name
   ```

2. **Create the Pull Request**
   - Go to your fork on GitHub
   - Click "Compare & pull request"
   - Select the base repository: `DaniyalFaraz2003/OSC-Agent`
   - Select the base branch: `main`
   - Select your feature branch

3. **Fill Out the PR Template**

   Provide a clear description including:

   ```markdown
   ## Description

   Brief description of what this PR does

   ## Related Issue

   Fixes #<issue-number>

   ## Type of Change

   - [ ] Bug fix
   - [ ] New feature
   - [ ] Documentation update
   - [ ] Refactoring

   ## Changes Made

   - List key changes
   - One per line

   ## Testing Done

   - Describe how you tested your changes
   - Include test scenarios covered

   ## Screenshots (if applicable)

   ## Checklist

   - [ ] Tests pass locally
   - [ ] Code follows style guidelines
   - [ ] Documentation updated
   - [ ] No breaking changes (or documented)
   ```

4. **Link to the Issue**

   Use keywords to automatically close the issue when the PR is merged:
   - `Fixes #123`
   - `Closes #123`
   - `Resolves #123`

### The Review Process

**🚨 IMPORTANT: Never merge your own pull request!**

All pull requests must be reviewed and approved by at least one maintainer before merging.

#### What to Expect

1. **Automated Checks**: CI/CD workflows will run automatically
   - All tests must pass
   - Linting must pass
   - Build must succeed

2. **Code Review**: Maintainers will review your code for:
   - Code quality and adherence to standards
   - Proper testing
   - Documentation completeness
   - Potential bugs or security issues
   - Architecture and design decisions

3. **Feedback and Iterations**:
   - Reviewers may request changes
   - Address feedback by pushing new commits to your branch
   - Respond to comments to facilitate discussion
   - Don't take feedback personally - it's about improving the code!

4. **Approval**:
   - Once approved, a maintainer will merge your PR
   - Your changes will be included in the next release

#### Responding to Review Feedback

- **Be responsive**: Try to address feedback within a few days
- **Ask questions**: If feedback is unclear, ask for clarification
- **Explain your decisions**: If you disagree with feedback, explain your reasoning respectfully
- **Update your PR**: Push additional commits to address requested changes
- **Mark conversations as resolved**: Once you've addressed a comment

#### After Your PR is Merged

- Delete your feature branch (both locally and on GitHub)
- Update your local main branch:
  ```bash
  git checkout main
  git pull upstream main
  ```
- Celebrate! 🎉 You've contributed to OSC-Agent!

### If Your PR is Not Accepted

Sometimes PRs aren't accepted. Common reasons:

- The feature doesn't align with project goals
- A different approach is preferred
- The change introduces breaking changes
- More discussion is needed on the approach

Don't be discouraged! Use it as a learning opportunity and consider:

- Discussing the feature in GitHub Discussions first
- Opening an issue to discuss the approach before implementing
- Making requested changes and resubmitting

## Code Standards

### TypeScript Guidelines

- Use **strict mode** (`strict: true` in tsconfig.json)
- Provide explicit type annotations for function parameters and return types
- Avoid using `any` - use `unknown` if the type is truly unknown
- Use interfaces for object shapes, types for unions/intersections
- Prefer `const` over `let`, never use `var`

### Code Style

- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings
- **Semicolons**: Use semicolons
- **Line length**: Maximum 100 characters
- **File naming**: Use kebab-case for files (`my-component.ts`)
- **Class naming**: Use PascalCase (`MyClass`)
- **Variable/function naming**: Use camelCase (`myVariable`, `myFunction`)
- **Constants**: Use UPPER_SNAKE_CASE (`MAX_RETRIES`)

### Documentation Standards

- Add JSDoc comments for all public functions and classes
- Include parameter descriptions and return value descriptions
- Document any side effects or important behavior
- Keep README.md and other docs updated with your changes

Example:

```typescript
/**
 * Analyzes a GitHub issue and extracts key information.
 *
 * @param issueUrl - The URL of the GitHub issue to analyze
 * @param options - Configuration options for the analysis
 * @returns A promise resolving to the analyzed issue data
 * @throws {InvalidUrlError} If the issue URL is malformed
 */
async function analyzeIssue(issueUrl: string, options: AnalysisOptions): Promise<IssueAnalysis> {
  // Implementation
}
```

## Testing Guidelines

### Test Structure

We follow a three-tier testing approach:

1. **Unit Tests** (`tests/unit/`)
   - Test individual functions and classes in isolation
   - Mock external dependencies
   - Fast execution

2. **Integration Tests** (`tests/integration/`)
   - Test multiple components working together
   - May use real instances of some dependencies
   - Focus on interaction between modules

3. **End-to-End Tests** (`tests/e2e/`)
   - Test complete workflows
   - Simulate real-world usage
   - May be slower but provide high confidence

### Writing Tests

- **Test file naming**: `*.test.ts` or `*.spec.ts`
- **Describe what you're testing**: Use descriptive test names
- **Follow AAA pattern**: Arrange, Act, Assert
- **One assertion per test** (when possible)
- **Test edge cases**: Don't just test the happy path
- **Mock external services**: GitHub API, Gemini API, E2B Sandbox

Example:

```typescript
describe('IssueAnalyzer', () => {
  describe('analyzeIssue', () => {
    it('should extract issue title and description', async () => {
      // Arrange
      const mockIssue = createMockIssue();
      const analyzer = new IssueAnalyzer();

      // Act
      const result = await analyzer.analyzeIssue(mockIssue);

      // Assert
      expect(result.title).toBe('Expected Title');
      expect(result.description).toBeDefined();
    });

    it('should throw error for invalid issue URL', async () => {
      // Arrange
      const analyzer = new IssueAnalyzer();

      // Act & Assert
      await expect(analyzer.analyzeIssue('invalid-url')).rejects.toThrow(InvalidUrlError);
    });
  });
});
```

### Test Coverage

- Aim for **>80% code coverage**
- Critical paths should have **100% coverage**
- Run `npm run test:coverage` to check coverage

## Communication Guidelines

### Using GitHub Issues

- **Search first**: Before creating a new issue, search to see if it already exists
- **Be descriptive**: Provide clear reproduction steps for bugs
- **Be respectful**: Remember there are humans on the other side
- **Stay on topic**: Keep discussions focused on the issue at hand
- **Use reactions**: 👍 for agreement, ❤️ for appreciation instead of "+1" comments

### Discussing in Issue Comments

**All discussions related to an issue should happen in that issue's comments.** This is crucial for:

- Keeping context centralized
- Allowing others to follow the discussion
- Preserving decision-making history
- Helping future contributors understand the reasoning

**What to discuss in issue comments:**

- Clarifying requirements
- Proposing implementation approaches
- Asking questions about the issue
- Sharing progress updates
- Discussing challenges you've encountered
- Requesting feedback on your approach

**Example:**

```
@maintainer I'm working on implementing the fix for this issue.
I noticed that approach A would be simpler but approach B would be
more maintainable. I'm leaning towards B. What do you think?
```

### Using GitHub Discussions

For broader topics not tied to specific issues:

- Feature ideas that need discussion before an issue is created
- General questions about the project
- Showing off what you've built with OSC-Agent
- Getting help with setup or usage

### Response Times

- We aim to respond to new issues within 48 hours
- PRs are typically reviewed within 3-5 business days
- Be patient - this is an open-source project run by volunteers

## Need Help?

### Resources

- **README.md**: Project overview and basic setup
- **DEVELOPMENT_PLAN.md**: Detailed development roadmap and architecture
- **GitHub Discussions**: Ask questions and connect with the community
- **GitHub Issues**: Report bugs or request features

### Getting Unstuck

If you're stuck:

1. **Check existing documentation** first
2. **Search closed issues** - your question might have been answered
3. **Ask in the issue comments** - for issue-specific questions
4. **Use GitHub Discussions** - for general questions
5. **Be patient and polite** - maintainers are volunteers

### Maintainer Team

Current maintainers:

- @DaniyalFaraz2003 - Project Lead

---

## Recognition

We value all contributions, big or small! Contributors will be:

- Listed in our CONTRIBUTORS.md file
- Acknowledged in release notes
- Highlighted in our community showcases

Thank you for contributing to OSC-Agent! Together, we're building the future of automated open-source contributions. 🚀

---

**Last Updated**: February 2026
