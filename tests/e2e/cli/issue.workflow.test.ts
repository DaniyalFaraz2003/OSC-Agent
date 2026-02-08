import { execSync } from 'node:child_process';

describe('CLI Issue Workflow (End-to-End)', () => {
  jest.setTimeout(180_000);

  const run = (args: string): string => execSync(`node dist/src/cli/index.js ${args}`, { encoding: 'utf8' });

  const hasRequiredEnv = (): boolean => {
    return Boolean(process.env.GITHUB_TOKEN && process.env.GEMINI_API_KEY && process.env.E2B_API_KEY);
  };

  const isExplicitlyEnabled = (): boolean => {
    return process.env.OSC_RUN_REAL_E2E === '1';
  };

  // This test exercises the full orchestrator state machine via the real CLI.
  // It is skipped unless explicitly enabled (and the required API keys are present),
  // since real network + LLM responses can be flaky in CI.
  (hasRequiredEnv() && isExplicitlyEnabled() ? it : it.skip)('should complete an issue workflow run (dry-run) for a real public issue', () => {
    const output = run('issue --repo octocat/Hello-World --issue 1 --dry-run');

    expect(output).toContain('Starting issue workflow for octocat/Hello-World#1');
    expect(output).toContain('Workflow completed successfully.');
    expect(output).toContain('finalState: DONE');
  });
});
