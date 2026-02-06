import { SandboxManager } from '../sandbox';
import { IExecutor, ExecutionResult } from '../types';

export class NodeExecutor implements IExecutor {
  constructor(private manager: SandboxManager) {}

  async execute(code: string): Promise<ExecutionResult> {
    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const filename = `/tmp/exec_${uniqueId}.js`;
    await this.manager.uploadFile(filename, code);
    let result: ExecutionResult;
    try {
      result = await this.manager.executeCommand('node', [filename]);
    } finally {
      try {
        await this.manager.executeCommand('rm', ['-f', filename]);
      } catch {
        // Ignore cleanup errors
      }
    }
    return result;
  }
}
