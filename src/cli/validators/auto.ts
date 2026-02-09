import { AutoCommandOptions } from '../types.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate autonomous mode command options
 *
 * @param options - Command options to validate
 * @returns Validated options with defaults applied
 * @throws {ValidationError} If validation fails
 */
export function validateAutoOptions(options: AutoCommandOptions): Required<AutoCommandOptions> {
  // Validate repo format
  const repoRegex = /^[\w-]+\/[\w-]+$/;
  if (!repoRegex.test(options.repo)) {
    throw new ValidationError(`Invalid repo format: "${options.repo}". Expected: owner/repo`);
  }

  // Validate max-issues
  const maxIssues = options.maxIssues ?? Infinity;
  if (maxIssues < 1) {
    throw new ValidationError('--max-issues must be >= 1');
  }

  // Validate interval
  const interval = options.interval ?? 300;
  if (interval < 10) {
    throw new ValidationError('--interval must be >= 10 seconds');
  }

  return {
    ...options,
    maxIssues,
    interval,
    filters: options.filters ?? '',
    resume: options.resume ?? false,
    dryRun: options.dryRun ?? false,
  };
}
