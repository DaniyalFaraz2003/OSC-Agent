import { SandboxManager } from '../sandbox';
import { IExecutor, ExecutionResult } from '../types';

export class NodeExecutor implements IExecutor {
  constructor(private manager: SandboxManager) {}

  async execute(code: string): Promise<ExecutionResult> {
    const filename = `/tmp/exec_${Date.now()}.js`;
    await this.manager.uploadFile(filename, code);
    return await this.manager.executeCommand('node', [filename]);
  }
}
