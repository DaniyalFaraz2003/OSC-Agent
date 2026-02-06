/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Sandbox } from '@e2b/code-interpreter';
import { SandboxOptions } from './types';

export class E2BClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.E2B_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('E2B_API_KEY is required for authentication');
    }
  }

  async createSandbox(options: SandboxOptions = {}): Promise<Sandbox> {
    const template = options.template || 'base';
    try {
      return await Sandbox.create(template, {
        apiKey: this.apiKey,
        timeoutMs: options.timeoutMs || 300_000,
        metadata: options.metadata,
        envs: options.envs,
      });
    } catch (error) {
      // Add context around E2B sandbox creation failures
      const message = `Failed to create E2B sandbox with template "${template}". ` + 'Please verify your E2B API key, network connectivity, and sandbox configuration.';
      // Preserve original error as cause where supported
      throw new Error(message, { cause: error });
    }
  }
}
