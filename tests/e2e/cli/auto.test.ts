import { describe, it, expect } from '@jest/globals';
import { execSync } from 'child_process';

describe('Auto Command E2E', () => {
  it('should show help text', () => {
    const output = execSync('npm run exec -- auto --help', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });

    expect(output).toContain('Continuously process issues');
    expect(output).toContain('--repo');
    expect(output).toContain('--max-issues');
    expect(output).toContain('--interval');
    expect(output).toContain('--filters');
    expect(output).toContain('--resume');
    expect(output).toContain('--dry-run');
  });

  it('should fail without --repo flag', () => {
    expect(() => {
      execSync('npm run exec -- auto', {
        encoding: 'utf-8',
        cwd: process.cwd(),
        stdio: 'pipe',
      });
    }).toThrow();
  });

  it('should fail with invalid repo format', () => {
    expect(() => {
      execSync('npm run exec -- auto --repo invalid --dry-run', {
        encoding: 'utf-8',
        cwd: process.cwd(),
        stdio: 'pipe',
      });
    }).toThrow(/Invalid repo format/);
  });
});
