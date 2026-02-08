# Issue Command

The `osc issue` command is the primary entry point for processing a single GitHub issue through the OSC-Agent pipeline.

## Usage

```bash
osc issue --repo <owner/repo> --issue <number> [options]
```

## Options

| Option                | Required | Default                        | Description                                     |
| --------------------- | -------- | ------------------------------ | ----------------------------------------------- |
| `--repo <owner/repo>` | Yes      | —                              | Repository slug (e.g. `octocat/Hello-World`)    |
| `--issue <number>`    | Yes      | —                              | Issue number (positive integer)                 |
| `--auto-pr`           | No       | `false`                        | Automatically create a PR when the fix is ready |
| `--dry-run`           | No       | `false`                        | Run without writing files or creating PRs       |
| `--branch <name>`     | No       | `osc/<owner>-<repo>-issue-<N>` | Branch name to use                              |

### Global Options

| Option      | Description                                                    |
| ----------- | -------------------------------------------------------------- |
| `--verbose` | Enable verbose logging — shows interim outputs from each stage |

## Examples

```bash
# Dry-run analysis of an issue (no external changes)
osc issue --repo octocat/Hello-World --issue 42 --dry-run

# Process an issue and automatically create a PR
osc issue --repo acme/widget --issue 7 --auto-pr

# Use a custom branch name with verbose output
osc --verbose issue --repo acme/widget --issue 7 --branch fix/null-guard
```

## Pipeline Stages

When the command runs, the orchestrator executes nine states in sequence:

| #   | State          | What Happens                                              |
| --- | -------------- | --------------------------------------------------------- |
| 1   | **ANALYZING**  | Fetches the issue from GitHub and analyzes it with Gemini |
| 2   | **SEARCHING**  | Searches the local codebase for relevant files            |
| 3   | **PLANNING**   | Creates a fix plan based on the analysis                  |
| 4   | **GENERATING** | Generates code patches using Gemini                       |
| 5   | **APPLYING**   | Applies patches to files (skipped in dry-run)             |
| 6   | **BUILDING**   | Runs `npm run build` (skipped in dry-run)                 |
| 7   | **TESTING**    | Runs `npm test` (skipped in dry-run)                      |
| 8   | **REVIEWING**  | AI-powered code review (skipped in dry-run)               |
| 9   | **SUBMITTING** | Creates PR if `--auto-pr` is set                          |

## Dry-Run Mode

With `--dry-run`, the command executes the full analysis and code generation pipeline but skips all write operations:

- Patches are generated but **not** applied to files
- Build and test steps return immediately with success
- Code review is skipped
- No PR is created
- A commit message is still generated for display

This is useful for previewing what the agent would do without making any changes.

## Verbose Mode

With `--verbose`, the command displays additional information:

- State transition events (`[IDLE -> ANALYZING]`, etc.)
- Issue analysis results (type, complexity, affected files)
- Search results (matched files)
- Fix proposal summary (explanation, confidence, patch count)
- Detailed error information (stack traces)

## Interruption Handling (Ctrl+C)

Pressing Ctrl+C during execution:

1. Signals the orchestrator to cancel after the current state completes
2. The workflow transitions to `CANCELLED` state
3. State is persisted so it can potentially be resumed later
4. The process exits cleanly without corrupted state

## Error Recovery

The orchestrator automatically retries when errors occur in the "fix cycle" (GENERATING through REVIEWING):

- Retryable errors restart from **GENERATING** state
- Maximum retries: 3 (configurable)
- Fatal errors (auth, config) terminate immediately

## Input Validation

All inputs are validated before the workflow starts:

- `--repo` must match the format `owner/repo` (alphanumeric, dots, underscores, hyphens)
- `--issue` must be a positive integer
- `--branch` must contain only safe characters (letters, numbers, `.`, `_`, `-`, `/`)
- `--dry-run` and `--auto-pr` cannot be used together

## Exit Codes

| Code | Meaning                                    |
| ---- | ------------------------------------------ |
| 0    | Workflow completed successfully            |
| 1    | Workflow failed, or input validation error |

## Architecture

```
CLI (issue.ts)
  |
  +-> validators.ts       — parse & validate inputs
  +-> formatters.ts        — format all output
  +-> loadConfig()         — load .env / YAML / defaults
  +-> register-handlers.ts — wire agents to coordinator
  |     |
  |     +-> GitHubClient   (ANALYZING, SUBMITTING)
  |     +-> IssueAnalyzer   (ANALYZING)
  |     +-> FixGenerator    (GENERATING)
  |     +-> CodeReviewer    (REVIEWING)
  |     +-> DocGenerator    (SUBMITTING)
  |     +-> ripgrep         (SEARCHING)
  |
  +-> WorkflowOrchestrator — state machine + execution loop
        |
        +-> StateMachine   — state transitions + persistence
        +-> RecoveryManager — error classification + retry
```
