/* eslint-disable @typescript-eslint/require-await */
import { parseRepoSlug, parseIssueNumber, validateBranchName, defaultBranchName, validateFlags } from '../../../src/cli/validators';
import { formatStep, formatInfo, formatSuccess, formatError, formatWarning, formatStateTransition, formatWorkflowResult, formatVerboseAnalysis, formatVerboseSearchResults, formatVerboseFix, formatVerboseSection } from '../../../src/cli/formatters';
import { executeIssueCommand, CLIWorkflowLogger, registerIssueCommand } from '../../../src/cli/commands/issue';
import { Command } from 'commander';
import type { WorkflowResult } from '../../../src/orchestrator/data-flow';

// ── Mock orchestrator + register-handlers to avoid real API calls ────────

jest.mock('../../../src/orchestrator/workflow', () => {
  const original: Record<string, unknown> = jest.requireActual('../../../src/orchestrator/workflow');
  return {
    ...original,
    WorkflowOrchestrator: jest.fn().mockImplementation(() => ({
      run: jest.fn().mockResolvedValue({
        status: 'completed',
        runId: 'mock-run-id',
        finalState: 'DONE',
        data: {
          input: { owner: 'octocat', repo: 'Hello-World', issueNumber: 1 },
          submission: { prNumber: 0, prUrl: '', commitMessage: 'fix: mock' },
        },
        attempt: 1,
        durationMs: 1234,
      } satisfies WorkflowResult),
      cancel: jest.fn(),
      getStateMachine: jest.fn().mockReturnValue({
        events: { on: jest.fn(), removeAllListeners: jest.fn() },
      }),
    })),
  };
});

jest.mock('../../../src/orchestrator/register-handlers', () => ({
  createIssueWorkflowCoordinator: jest.fn().mockReturnValue({
    execute: jest.fn(),
    registerHandler: jest.fn(),
    hasHandler: jest.fn().mockReturnValue(true),
    getRegisteredStates: jest.fn().mockReturnValue([]),
  }),
}));

jest.mock('../../../src/config/loader', () => ({
  loadConfig: jest.fn().mockReturnValue({
    github: { token: 'test-token' },
    gemini: { api_key: 'test-key', model_tier: 'auto' },
    e2b: { api_key: 'test-key' },
    testing: { max_iterations: 3, timeout: 300 },
  }),
}));

// ═══════════════════════════════════════════════════════════════════════
// Validators
// ═══════════════════════════════════════════════════════════════════════

describe('validators', () => {
  describe('parseRepoSlug', () => {
    it('should parse valid owner/repo', () => {
      expect(parseRepoSlug('octocat/Hello-World')).toEqual({ owner: 'octocat', repo: 'Hello-World' });
    });

    it('should parse slugs with dots and underscores', () => {
      expect(parseRepoSlug('my.org/my_repo')).toEqual({ owner: 'my.org', repo: 'my_repo' });
    });

    it('should trim whitespace', () => {
      expect(parseRepoSlug('  acme/widget  ')).toEqual({ owner: 'acme', repo: 'widget' });
    });

    it('should reject missing slash', () => {
      expect(() => parseRepoSlug('invalid')).toThrow('Invalid --repo value');
    });

    it('should reject empty string', () => {
      expect(() => parseRepoSlug('')).toThrow('Invalid --repo value');
    });

    it('should reject multiple slashes', () => {
      expect(() => parseRepoSlug('a/b/c')).toThrow('Invalid --repo value');
    });

    it('should reject special characters', () => {
      expect(() => parseRepoSlug('owner/repo name')).toThrow('Invalid --repo value');
    });
  });

  describe('parseIssueNumber', () => {
    it('should parse valid positive integers', () => {
      expect(parseIssueNumber('1')).toBe(1);
      expect(parseIssueNumber('42')).toBe(42);
      expect(parseIssueNumber('9999')).toBe(9999);
    });

    it('should reject zero', () => {
      expect(() => parseIssueNumber('0')).toThrow('Invalid --issue value');
    });

    it('should reject negative numbers', () => {
      expect(() => parseIssueNumber('-5')).toThrow('Invalid --issue value');
    });

    it('should reject non-numeric strings', () => {
      expect(() => parseIssueNumber('abc')).toThrow('Invalid --issue value');
    });

    it('should reject floats', () => {
      expect(() => parseIssueNumber('1.5')).toThrow('Invalid --issue value');
    });
  });

  describe('validateBranchName', () => {
    it('should accept valid branch names', () => {
      expect(validateBranchName('fix/issue-42')).toBe('fix/issue-42');
      expect(validateBranchName('osc/owner-repo-issue-1')).toBe('osc/owner-repo-issue-1');
    });

    it('should reject empty branch names', () => {
      expect(() => validateBranchName('')).toThrow('Invalid --branch value');
      expect(() => validateBranchName('   ')).toThrow('Invalid --branch value');
    });

    it('should reject branch names with spaces', () => {
      expect(() => validateBranchName('my branch')).toThrow('Invalid --branch value');
    });
  });

  describe('defaultBranchName', () => {
    it('should generate expected format', () => {
      expect(defaultBranchName('acme', 'widget', 42)).toBe('osc/acme-widget-issue-42');
    });
  });

  describe('validateFlags', () => {
    it('should allow dry-run alone', () => {
      expect(() => validateFlags({ dryRun: true, autoPr: false })).not.toThrow();
    });

    it('should allow auto-pr alone', () => {
      expect(() => validateFlags({ dryRun: false, autoPr: true })).not.toThrow();
    });

    it('should allow neither', () => {
      expect(() => validateFlags({ dryRun: false, autoPr: false })).not.toThrow();
    });

    it('should reject both dry-run and auto-pr', () => {
      expect(() => validateFlags({ dryRun: true, autoPr: true })).toThrow('Conflicting options');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Formatters
// ═══════════════════════════════════════════════════════════════════════

describe('formatters', () => {
  describe('primitive formatters', () => {
    it('formatStep should return a non-empty string', () => {
      expect(formatStep('test')).toBeTruthy();
      expect(formatStep('test')).toContain('test');
    });

    it('formatInfo should return a non-empty string', () => {
      expect(formatInfo('info')).toContain('info');
    });

    it('formatSuccess should return a non-empty string', () => {
      expect(formatSuccess('ok')).toContain('ok');
    });

    it('formatError should return a non-empty string', () => {
      expect(formatError('fail')).toContain('fail');
    });

    it('formatWarning should return a non-empty string', () => {
      expect(formatWarning('warn')).toContain('warn');
    });
  });

  describe('formatStateTransition', () => {
    it('should include from and to states', () => {
      const result = formatStateTransition('IDLE', 'ANALYZING');
      expect(result).toContain('IDLE');
      expect(result).toContain('ANALYZING');
    });
  });

  describe('formatVerboseSection', () => {
    it('should include title and body', () => {
      const result = formatVerboseSection('Title', 'Body text');
      expect(result).toContain('Title');
      expect(result).toContain('Body text');
    });
  });

  describe('formatVerboseAnalysis', () => {
    it('should format analysis data', () => {
      const result = formatVerboseAnalysis({
        type: 'bug',
        complexity: 'simple',
        requirements: ['fix null check'],
        affected_files: ['src/widget.ts'],
      });
      expect(result).toContain('bug');
      expect(result).toContain('simple');
      expect(result).toContain('fix null check');
      expect(result).toContain('src/widget.ts');
    });
  });

  describe('formatVerboseSearchResults', () => {
    it('should format search results', () => {
      const result = formatVerboseSearchResults([{ filePath: 'a.ts' }, { filePath: 'b.ts' }]);
      expect(result).toContain('a.ts');
      expect(result).toContain('b.ts');
      expect(result).toContain('2 file(s)');
    });

    it('should handle empty results', () => {
      const result = formatVerboseSearchResults([]);
      expect(result).toContain('no files found');
    });
  });

  describe('formatVerboseFix', () => {
    it('should format fix proposal', () => {
      const result = formatVerboseFix({
        explanation: 'Added guard',
        confidenceScore: 0.95,
        patches: ['patch1'],
      });
      expect(result).toContain('Added guard');
      expect(result).toContain('95%');
      expect(result).toContain('1');
    });
  });

  describe('formatWorkflowResult', () => {
    const baseResult: WorkflowResult = {
      status: 'completed',
      runId: 'test-run',
      finalState: 'DONE',
      data: { input: { owner: 'o', repo: 'r', issueNumber: 1 } },
      attempt: 1,
      durationMs: 5000,
    };

    it('should indicate success for completed workflows', () => {
      const output = formatWorkflowResult(baseResult);
      expect(output).toContain('completed successfully');
      expect(output).toContain('test-run');
    });

    it('should indicate failure', () => {
      const output = formatWorkflowResult({ ...baseResult, status: 'failed', error: { code: 'E1', message: 'fail' } });
      expect(output).toContain('failed');
      expect(output).toContain('E1');
    });

    it('should indicate cancellation', () => {
      const output = formatWorkflowResult({ ...baseResult, status: 'cancelled' });
      expect(output).toContain('cancelled');
    });

    it('should indicate paused', () => {
      const output = formatWorkflowResult({ ...baseResult, status: 'paused' });
      expect(output).toContain('paused');
    });

    it('should show dry-run notice', () => {
      const output = formatWorkflowResult(baseResult, { dryRun: true });
      expect(output).toContain('dry-run');
    });

    it('should show PR URL when present', () => {
      const result: WorkflowResult = {
        ...baseResult,
        data: { ...baseResult.data, submission: { prNumber: 1, prUrl: 'https://github.com/o/r/pull/1', commitMessage: 'fix' } },
      };
      const output = formatWorkflowResult(result);
      expect(output).toContain('https://github.com/o/r/pull/1');
    });

    it('should show changed files when present', () => {
      const result: WorkflowResult = {
        ...baseResult,
        data: { ...baseResult.data, applyResult: { appliedFiles: ['a.ts', 'b.ts'], patchCount: 2 } },
      };
      const output = formatWorkflowResult(result);
      expect(output).toContain('a.ts');
      expect(output).toContain('b.ts');
    });

    it('should show error details in verbose mode', () => {
      const result: WorkflowResult = {
        ...baseResult,
        status: 'failed',
        error: { code: 'ERR', message: 'something broke', details: 'stack trace here' },
      };
      const output = formatWorkflowResult(result, { verbose: true });
      expect(output).toContain('stack trace here');
    });

    it('should hide error details in non-verbose mode', () => {
      const result: WorkflowResult = {
        ...baseResult,
        status: 'failed',
        error: { code: 'ERR', message: 'something broke', details: 'stack trace here' },
      };
      const output = formatWorkflowResult(result, { verbose: false });
      expect(output).not.toContain('stack trace here');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Issue Command (with mocked orchestrator)
// ═══════════════════════════════════════════════════════════════════════

describe('executeIssueCommand', () => {
  let consoleSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('should run successfully with valid options', async () => {
    await executeIssueCommand({ repo: 'octocat/Hello-World', issue: '1', dryRun: true });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('octocat/Hello-World#1'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('completed successfully'));
    expect(process.exitCode).toBeUndefined();
  });

  it('should display dry-run notice', async () => {
    await executeIssueCommand({ repo: 'octocat/Hello-World', issue: '1', dryRun: true });

    const allLogs = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLogs).toContain('dryRun');
  });

  it('should display branch info', async () => {
    await executeIssueCommand({ repo: 'acme/widget', issue: '42' });

    const allLogs = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLogs).toContain('osc/acme-widget-issue-42');
  });

  it('should use custom branch name', async () => {
    await executeIssueCommand({ repo: 'acme/widget', issue: '42', branch: 'my-branch' });

    const allLogs = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLogs).toContain('my-branch');
  });

  it('should fail on invalid repo format', async () => {
    await executeIssueCommand({ repo: 'invalid', issue: '1' });

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid --repo value'));
    expect(process.exitCode).toBe(1);
  });

  it('should fail on invalid issue number', async () => {
    await executeIssueCommand({ repo: 'octocat/Hello-World', issue: 'abc' });

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid --issue value'));
    expect(process.exitCode).toBe(1);
  });

  it('should fail on conflicting flags', async () => {
    await executeIssueCommand({ repo: 'octocat/Hello-World', issue: '1', dryRun: true, autoPr: true });

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Conflicting options'));
    expect(process.exitCode).toBe(1);
  });

  it('should fail on invalid branch name', async () => {
    await executeIssueCommand({ repo: 'octocat/Hello-World', issue: '1', branch: 'bad branch name' });

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid --branch value'));
    expect(process.exitCode).toBe(1);
  });

  it('should set exitCode=1 when workflow fails', async () => {
    const { WorkflowOrchestrator }: { WorkflowOrchestrator: jest.Mock } = jest.requireMock('../../../src/orchestrator/workflow');
    WorkflowOrchestrator.mockImplementationOnce(() => ({
      run: jest.fn().mockResolvedValue({
        status: 'failed',
        runId: 'fail-run',
        finalState: 'ERROR',
        data: { input: { owner: 'o', repo: 'r', issueNumber: 1 } },
        attempt: 1,
        durationMs: 100,
        error: { code: 'ERR', message: 'Test failure' },
      }),
      cancel: jest.fn(),
      getStateMachine: jest.fn().mockReturnValue({
        events: { on: jest.fn(), removeAllListeners: jest.fn() },
      }),
    }));

    await executeIssueCommand({ repo: 'octocat/Hello-World', issue: '1' });
    expect(process.exitCode).toBe(1);
  });

  it('should display verbose info when verbose is true', async () => {
    await executeIssueCommand({ repo: 'octocat/Hello-World', issue: '1' }, true);

    const allLogs = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLogs).toContain('verbose: true');
  });

  it('should handle SIGINT registration and cleanup', async () => {
    const processSpy = jest.spyOn(process, 'once');
    const removeListenerSpy = jest.spyOn(process, 'removeListener');

    await executeIssueCommand({ repo: 'octocat/Hello-World', issue: '1' });

    expect(processSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));

    processSpy.mockRestore();
    removeListenerSpy.mockRestore();
  });

  it('should invoke orchestrator.cancel when SIGINT fires', async () => {
    let sigintHandler: (() => void) | undefined;
    const cancelMock = jest.fn();

    const { WorkflowOrchestrator: WO }: { WorkflowOrchestrator: jest.Mock } = jest.requireMock('../../../src/orchestrator/workflow');
    WO.mockImplementationOnce(() => ({
      run: jest.fn().mockImplementation(() => {
        // Simulate SIGINT during execution
        if (sigintHandler) sigintHandler();
        return Promise.resolve({
          status: 'cancelled',
          runId: 'cancel-run',
          finalState: 'CANCELLED',
          data: { input: { owner: 'o', repo: 'r', issueNumber: 1 } },
          attempt: 1,
          durationMs: 50,
        });
      }),
      cancel: cancelMock,
      getStateMachine: jest.fn().mockReturnValue({
        events: { on: jest.fn(), removeAllListeners: jest.fn() },
      }),
    }));

    // Capture the SIGINT handler that issue.ts registers
    jest.spyOn(process, 'once').mockImplementation(((event: string, handler: () => void) => {
      if (event === 'SIGINT') sigintHandler = handler;
      return process;
    }) as typeof process.once);

    await executeIssueCommand({ repo: 'octocat/Hello-World', issue: '1' });
    expect(cancelMock).toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  it('should work with verbose option on the command itself', async () => {
    await executeIssueCommand({ repo: 'octocat/Hello-World', issue: '1', verbose: true });

    const allLogs = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLogs).toContain('verbose: true');
  });

  it('should handle orchestrator throwing unexpected error', async () => {
    const { WorkflowOrchestrator: WO }: { WorkflowOrchestrator: jest.Mock } = jest.requireMock('../../../src/orchestrator/workflow');
    WO.mockImplementationOnce(() => ({
      run: jest.fn().mockRejectedValue(new Error('Unexpected crash')),
      cancel: jest.fn(),
      getStateMachine: jest.fn().mockReturnValue({
        events: { on: jest.fn(), removeAllListeners: jest.fn() },
      }),
    }));

    await executeIssueCommand({ repo: 'octocat/Hello-World', issue: '1' });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Unexpected crash'));
    expect(process.exitCode).toBe(1);
  });

  it('should handle non-Error throws', async () => {
    const { WorkflowOrchestrator: WO }: { WorkflowOrchestrator: jest.Mock } = jest.requireMock('../../../src/orchestrator/workflow');
    WO.mockImplementationOnce(() => ({
      run: jest.fn().mockRejectedValue('string error'),
      cancel: jest.fn(),
      getStateMachine: jest.fn().mockReturnValue({
        events: { on: jest.fn(), removeAllListeners: jest.fn() },
      }),
    }));

    await executeIssueCommand({ repo: 'octocat/Hello-World', issue: '1' });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('string error'));
    expect(process.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CLIWorkflowLogger
// ═══════════════════════════════════════════════════════════════════════

describe('CLIWorkflowLogger', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('info: should print when verbose is true', () => {
    const logger = new CLIWorkflowLogger('test-run-id', true);
    logger.info('hello');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('hello'));
  });

  it('info: should include data when provided', () => {
    const logger = new CLIWorkflowLogger('test-run-id', true);
    logger.info('hello', { key: 'val' });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('val'));
  });

  it('info: should not print when verbose is false', () => {
    const logger = new CLIWorkflowLogger('test-run-id', false);
    logger.info('hello');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('warn: should always print', () => {
    const logger = new CLIWorkflowLogger('test-run-id', false);
    logger.warn('warning msg');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('warning msg'));
  });

  it('warn: should include data when provided', () => {
    const logger = new CLIWorkflowLogger('test-run-id', false);
    logger.warn('warning msg', { detail: 1 });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"detail":1'));
  });

  it('error: should always print', () => {
    const logger = new CLIWorkflowLogger('test-run-id', false);
    logger.error('error msg');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('error msg'));
  });

  it('error: should include data when provided', () => {
    const logger = new CLIWorkflowLogger('test-run-id', false);
    logger.error('error msg', { stack: 'trace' });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('trace'));
  });

  it('debug: should print when verbose is true', () => {
    const logger = new CLIWorkflowLogger('test-run-id', true);
    logger.debug('debug info');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('debug info'));
  });

  it('debug: should include data when provided', () => {
    const logger = new CLIWorkflowLogger('test-run-id', true);
    logger.debug('debug info', { extra: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('true'));
  });

  it('debug: should not print when verbose is false', () => {
    const logger = new CLIWorkflowLogger('test-run-id', false);
    logger.debug('debug info');
    expect(logSpy).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// registerIssueCommand
// ═══════════════════════════════════════════════════════════════════════

describe('registerIssueCommand', () => {
  it('should register "issue" as a subcommand', () => {
    const program = new Command();
    registerIssueCommand(program);

    const issueCmd = program.commands.find((c) => c.name() === 'issue');
    expect(issueCmd).toBeDefined();
    expect(issueCmd?.description()).toBe('Process a single GitHub issue');
  });

  it('should register required and optional options', () => {
    const program = new Command();
    registerIssueCommand(program);

    const helpText = program.commands.find((c) => c.name() === 'issue')?.helpInformation() ?? '';
    expect(helpText).toContain('--repo');
    expect(helpText).toContain('--issue');
    expect(helpText).toContain('--dry-run');
    expect(helpText).toContain('--auto-pr');
    expect(helpText).toContain('--branch');
  });
});
