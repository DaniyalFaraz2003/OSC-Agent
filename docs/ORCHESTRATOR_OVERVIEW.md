---

## 1. Where the workflow and agents meet

The workflow is **state → handler**. Each of the 9 operational states has a **handler** registered on `AgentCoordinator`. Those handlers are the only place the real agents run. So:

- **You implement an “issue” command** that builds a coordinator, registers one handler per state, and each handler calls the right agent(s) from `src/agents/` (and GitHub/search when needed).
- **Agents live in `src/agents/`**; they are used **inside** those handlers, not by the orchestrator directly.

So: **agents come in when you implement the handlers** that you pass to `WorkflowOrchestrator` via `AgentCoordinator`.

---

## 2. End-to-end flow for an “issue” command

Conceptually:

1. **CLI** (e.g. `osc issue --owner acme --repo foo --issue 42`) parses args and builds `WorkflowInput { owner, repo, issueNumber }`.
2. **Bootstrap**: load config, create shared clients (GitHub, Gemini, E2B if needed).
3. **Build coordinator**: create an `AgentCoordinator` and register **nine handlers** (one per state). Each handler receives `WorkflowData` (read-only) and returns `Partial<WorkflowData>` (what that step produced).
4. **Run**: create `WorkflowOrchestrator` with that coordinator and call `orchestrator.run(input)`.
5. **Result**: handle `WorkflowResult` (e.g. print PR URL, or error).

The “issue command” is: steps 1–5. The “workflow approach” is steps 3–4; the “where agents come” is step 3 (inside each handler).

---

## 3. State → agent (and helpers) mapping

Handlers are just functions that the coordinator calls. Each handler should call the right agent and return the slice of `WorkflowData` that this state produces.

| State          | What the handler does                                   | Agents / modules used                                                                                                                                                      |
| -------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ANALYZING**  | Fetch issue from GitHub, then analyze it.               | `GitHubClient.getIssue(owner, repo, issueNumber)` → `IssueAnalyzer.analyzeIssue(issue)`                                                                                    |
| **SEARCHING**  | Search codebase (e.g. by files/keywords from analysis). | `searchPattern` / `runRipgrep` from `src/search/`; map `SearchResult[]` to `CodeSearchResult[]` (filePath + content) for downstream.                                       |
| **PLANNING**   | Turn analysis + search into a small plan.               | Optional: lightweight logic or a small “planning” prompt using `GeminiClient`; output `PlanStep[]`.                                                                        |
| **GENERATING** | Propose code fix.                                       | `FixGenerator.generateFix(issueDescription, analysis, searchResults, strategy)` → `fixProposal`.                                                                           |
| **APPLYING**   | Apply patches to repo (files on disk or in sandbox).    | No agent; use `DiffGenerator` + file writes or sandbox file API; return `ApplyResult`.                                                                                     |
| **BUILDING**   | Run build (e.g.`npm run build`).                        | No agent; run command locally or in `SandboxManager`; return `BuildResult`.                                                                                                |
| **TESTING**    | Run tests and optionally self-correct.                  | `TestGenerator` (+ `TestAnalyzer`) for generating tests; `SelfCorrector` + an `ITestRunner` implementation (e.g. using `SandboxManager`) to run them; return `TestResult`. |
| **REVIEWING**  | Review the change.                                      | `CodeReviewerAgent.review(issue, fix)` → `reviewResult`.                                                                                                                   |
| **SUBMITTING** | Commit message, PR body, then create PR.                | `DocumentationGenerator.generateCommitMessage`, `generatePRDescription`; `GitHubClient.createPR` (and optionally `createComment`); return `submission`.                    |

So: **agents from `src/agents/` are used inside these handlers**; the workflow only sees “run this state’s handler and merge the returned partial data.”

---

## 4. Concrete handler shape (where agents are called)

Handlers have the signature:

```ts
(context: Readonly<WorkflowData>) => Promise<Partial<WorkflowData>>;
```

So for **ANALYZING** you’d do something like:

- Read `context.input` (owner, repo, issueNumber).
- Call `githubClient.getIssue(owner, repo, issueNumber)` → `issue`.
- Call `issueAnalyzer.analyzeIssue(issue)` → `analysis`.
- Return `{ issue, analysis }`.

For **GENERATING**:

- Read `context.issue`, `context.analysis`, `context.searchResults` (and maybe `context.plan`).
- Build issue description string (e.g. from `issue.title` + `issue.body`).
- Call `fixGenerator.generateFix(issueDescription, stringifiedAnalysis, context.searchResults!, strategy)`.
- Return `{ fixProposal }`.

For **REVIEWING**:

- Read `context.issue`, `context.fixProposal` (e.g. join patches or use explanation).
- Call `codeReviewer.review(issueDescription, fixDescriptionOrDiff)`.
- Return `{ reviewResult }`.

Same idea for TESTING (TestGenerator + SelfCorrector + test runner) and SUBMITTING (DocumentationGenerator + GitHubClient). So: **every agent in `src/agents/` that you need for the pipeline is invoked from exactly one (or two) of these handlers.**

---

## 5. Where to put this in the repo

- **CLI entry (issue command)**In `src/cli/` (e.g. `src/cli/index.ts` or `src/cli/commands/issue.ts`): parse `osc issue --owner X --repo Y --issue N`, load config, then call a function that builds the coordinator and runs the orchestrator.
- **Handler registration (where agents get wired)**In a single place that both the CLI and any other caller can use, e.g.:
  - `src/orchestrator/register-handlers.ts`, or
  - `src/cli/issue-workflow.ts`There you:
  - Instantiate `GitHubClient`, `GeminiClient`, `IssueAnalyzer`, `FixGenerator`, `CodeReviewerAgent`, `DocumentationGenerator`, `TestGenerator`, etc. (from config).
  - Create one `AgentCoordinator`.
  - For each of the 9 states, call `coordinator.registerHandler(state, async (context) => { ... })` and inside that async function call the right agent(s) and return the corresponding `Partial<WorkflowData>`.

- **Agents**
  Stay in `src/agents/`; they are not “in” the orchestrator—they are **used by** the handlers you register.

So: **the issue command is implemented in the CLI; the workflow runs the pipeline; the agents from `src/agents/` are used inside the handlers you register on `AgentCoordinator` for each state.**
