import { execSync } from 'node:child_process';

describe('CLI Issue Command', () => {
  const run = (args: string): string => execSync(`node dist/src/cli/index.js ${args}`, { encoding: 'utf8' });

  it('should show help for issue command', () => {
    const output = run('issue --help');
    expect(output).toContain('Process a single GitHub issue');
    expect(output).toContain('--repo <owner/repo>');
    expect(output).toContain('--issue <number>');
    expect(output).toContain('--dry-run');
    expect(output).toContain('--auto-pr');
    expect(output).toContain('--branch <name>');
  });

  it('should reject invalid repo format', () => {
    expect(() => run('issue --repo invalid --issue 1 --dry-run')).toThrow(/Invalid --repo value/i);
  });

  it('should reject invalid issue number', () => {
    expect(() => run('issue --repo octocat/Hello-World --issue abc --dry-run')).toThrow(/Invalid --issue value/i);
  });
});
