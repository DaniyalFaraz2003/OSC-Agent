import { SandboxManager } from '../../../src/testing/sandbox';
import { PythonExecutor } from '../../../src/testing/executors/python-executor';
import { NodeExecutor } from '../../../src/testing/executors/node-executor';

// Determine if we should run the tests based on the environment variable
const apiKey = process.env.E2B_API_KEY;
const describeIntegration = apiKey ? describe : describe.skip;

describeIntegration('E2B Integration', () => {
  let manager: SandboxManager;

  beforeAll(async () => {
    // We can safely instantiate now because this block only runs if apiKey exists
    manager = new SandboxManager(apiKey);
    await manager.init({ timeoutMs: 60000 });
  }, 30000); // 30s timeout for E2B sandbox startup

  afterAll(async () => {
    if (manager) {
      await manager.cleanup();
    }
  });

  it('should execute Python code', async () => {
    const executor = new PythonExecutor(manager);
    const result = await executor.execute('print("Hello from Python")');

    // Check stdout array for the message
    const combinedOutput = result.stdout.join('\n');
    expect(combinedOutput).toContain('Hello from Python');
  });

  it('should execute Node.js code via command', async () => {
    const executor = new NodeExecutor(manager);
    const result = await executor.execute('console.log("Hello from Node")');

    const combinedOutput = result.stdout.join('\n');
    expect(combinedOutput).toContain('Hello from Node');
  });

  it('should handle file lifecycle', async () => {
    const content = 'test data';
    const filePath = 'test.txt';

    await manager.uploadFile(filePath, content);
    const downloaded = await manager.downloadFile(filePath);

    expect(downloaded).toBe(content);
  });
});
