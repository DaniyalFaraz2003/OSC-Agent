import { execSync } from 'child_process';

describe('CLI Basic Functionality', () => {
  const run = (args: string): string => execSync(`node dist/src/cli/index.js ${args}`, { encoding: 'utf8' });

  it('should display version number', () => {
    const output = run('--version');
    expect(output).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should display help text', () => {
    const output = run('--help');
    expect(output).toContain('Usage: osc [options] [command]');
    expect(output).toContain('Options:');
    expect(output).toContain('Commands:');
  });

  it('should accept global options with subcommands', () => {
    const output = run('--verbose init');
    expect(output).toContain('DEBUG: Verbose mode enabled');
    expect(output).toContain('Initializing');
  });
});
