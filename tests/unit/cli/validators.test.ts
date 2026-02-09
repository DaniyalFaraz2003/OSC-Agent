import { describe, it, expect } from '@jest/globals';
import { validateAutoOptions, ValidationError } from '../../../src/cli/validators/auto';

describe('validateAutoOptions', () => {
  it('should validate valid repo format', () => {
    const result = validateAutoOptions({ repo: 'owner/repo' });
    expect(result.repo).toBe('owner/repo');
  });

  it('should throw on invalid repo format', () => {
    expect(() => validateAutoOptions({ repo: 'invalid' })).toThrow(ValidationError);
    expect(() => validateAutoOptions({ repo: 'invalid' })).toThrow(/Invalid repo format/);
  });

  it('should throw on repo with spaces', () => {
    expect(() => validateAutoOptions({ repo: 'owner /repo' })).toThrow(ValidationError);
  });

  it('should apply default maxIssues', () => {
    const result = validateAutoOptions({ repo: 'owner/repo' });
    expect(result.maxIssues).toBe(Infinity);
  });

  it('should validate maxIssues >= 1', () => {
    expect(() => validateAutoOptions({ repo: 'owner/repo', maxIssues: 0 })).toThrow(ValidationError);
    expect(() => validateAutoOptions({ repo: 'owner/repo', maxIssues: -5 })).toThrow(ValidationError);
  });

  it('should accept valid maxIssues', () => {
    const result = validateAutoOptions({ repo: 'owner/repo', maxIssues: 10 });
    expect(result.maxIssues).toBe(10);
  });

  it('should apply default interval', () => {
    const result = validateAutoOptions({ repo: 'owner/repo' });
    expect(result.interval).toBe(300);
  });

  it('should validate interval >= 10', () => {
    expect(() => validateAutoOptions({ repo: 'owner/repo', interval: 5 })).toThrow(ValidationError);
    expect(() => validateAutoOptions({ repo: 'owner/repo', interval: 9 })).toThrow(/must be >= 10/);
  });

  it('should accept valid interval', () => {
    const result = validateAutoOptions({ repo: 'owner/repo', interval: 60 });
    expect(result.interval).toBe(60);
  });

  it('should apply all defaults', () => {
    const result = validateAutoOptions({ repo: 'owner/repo' });
    expect(result.filters).toBe('');
    expect(result.resume).toBe(false);
    expect(result.dryRun).toBe(false);
  });

  it('should preserve provided options', () => {
    const result = validateAutoOptions({
      repo: 'owner/repo',
      filters: 'bug,enhancement',
      resume: true,
      dryRun: true,
    });
    expect(result.filters).toBe('bug,enhancement');
    expect(result.resume).toBe(true);
    expect(result.dryRun).toBe(true);
  });
});
