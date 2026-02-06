/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Sandbox } from '@e2b/code-interpreter';
import { E2BClient } from './e2b-client';
import { SandboxOptions, ExecutionResult } from './types';

export class SandboxManager {
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  private sandbox: Sandbox | null = null;
  private client: E2BClient;

  constructor(apiKey?: string) {
    this.client = new E2BClient(apiKey);
  }

  async init(options?: SandboxOptions): Promise<void> {
    this.sandbox = await this.client.createSandbox(options);
  }

  async uploadFile(path: string, content: string): Promise<void> {
    if (!this.sandbox) throw new Error('Sandbox not initialized');
    // The SDK expects a single object for some versions or simple args for others.
    // Based on your test error, it's expecting (path, content)
    await this.sandbox.files.write(path, content);
  }

  async downloadFile(path: string): Promise<string> {
    if (!this.sandbox) throw new Error('Sandbox not initialized');
    return await this.sandbox.files.read(path);
  }

  async executeCommand(command: string, args: string[] = []): Promise<ExecutionResult> {
    if (!this.sandbox) throw new Error('Sandbox not initialized');

    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
    const execution = await this.sandbox.commands.run(fullCommand);

    return {
      stdout: execution.stdout ? execution.stdout.split('\n').filter((l) => l !== '') : [],
      stderr: execution.stderr ? execution.stderr.split('\n').filter((l) => l !== '') : [],
      exitCode: execution.exitCode ?? undefined,
    };
  }

  async cleanup(): Promise<void> {
    if (this.sandbox) {
      await this.sandbox.kill();
      this.sandbox = null;
    }
  }

  get rawSandbox(): Sandbox {
    if (!this.sandbox) throw new Error('Sandbox not initialized');
    return this.sandbox;
  }
}
