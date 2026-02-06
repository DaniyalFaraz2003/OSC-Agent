/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { SandboxManager } from '../../../src/testing/sandbox';
import { Sandbox } from '@e2b/code-interpreter';

jest.mock('@e2b/code-interpreter', () => ({
  Sandbox: {
    create: jest.fn(),
  },
}));

describe('SandboxManager', () => {
  let manager: SandboxManager;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSandbox: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSandbox = {
      files: {
        write: jest.fn().mockResolvedValue(undefined),
        read: jest.fn().mockResolvedValue('file content'),
      },
      commands: {
        run: jest.fn().mockResolvedValue({
          stdout: 'output line 1\noutput line 2',
          stderr: '',
          exitCode: 0,
        }),
      },
      kill: jest.fn().mockResolvedValue(undefined),
    };

    (Sandbox.create as jest.Mock).mockResolvedValue(mockSandbox);
    manager = new SandboxManager('test-api-key');
  });

  describe('initialization', () => {
    it('should initialize the sandbox with provided options', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const spy = jest.spyOn(Sandbox, 'create');
      const options = { timeoutMs: 1000, template: 'base' };
      await manager.init(options);

      expect(spy).toHaveBeenCalledWith(
        'base',
        expect.objectContaining({
          apiKey: 'test-api-key',
          timeoutMs: 1000,
        }),
      );
    });
  });

  describe('file operations', () => {
    beforeEach(async () => {
      await manager.init();
    });

    it('should call files.write with correct arguments', async () => {
      await manager.uploadFile('/tmp/test.txt', 'hello world');
      expect(mockSandbox.files.write).toHaveBeenCalledWith('/tmp/test.txt', 'hello world');
    });
  });

  describe('command execution', () => {
    beforeEach(async () => {
      await manager.init();
    });

    it('should format command output into string arrays', async () => {
      const result = await manager.executeCommand('ls', ['-la']);

      expect(mockSandbox.commands.run).toHaveBeenCalledWith('ls -la');
      expect(result.stdout).toEqual(['output line 1', 'output line 2']);
      expect(result.exitCode).toBe(0);
    });

    it('should handle commands without arguments', async () => {
      await manager.executeCommand('whoami');
      expect(mockSandbox.commands.run).toHaveBeenCalledWith('whoami');
    });
  });

  describe('cleanup', () => {
    it('should call kill on the sandbox and nullify the reference', async () => {
      await manager.init();
      await manager.cleanup();
      expect(mockSandbox.kill).toHaveBeenCalled();
    });
  });
});
