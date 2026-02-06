export interface ExecutionResult {
  stdout: string[];
  stderr: string[];
  exitCode?: number;
  error?: string;
}

export interface SandboxOptions {
  template?: string;
  timeoutMs?: number;
  metadata?: Record<string, string>;
  envs?: Record<string, string>;
}

export interface IExecutor {
  execute(code: string): Promise<ExecutionResult>;
}
