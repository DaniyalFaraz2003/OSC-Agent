/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { SandboxManager } from '../sandbox';
import { IExecutor, ExecutionResult } from '../types';

export class PythonExecutor implements IExecutor {
  constructor(private manager: SandboxManager) {}

  async execute(code: string): Promise<ExecutionResult> {
    // E2B's runCode uses the built-in Jupyter kernel for Python
    const result = await this.manager.rawSandbox.runCode(code);
    return {
      stdout: result.logs.stdout,
      stderr: result.logs.stderr,
      error: result.error?.value,
    };
  }
}
