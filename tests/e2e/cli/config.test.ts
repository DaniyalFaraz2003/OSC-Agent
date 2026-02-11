import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

describe('CLI Config Command', () => {
  const ENV_PATH = path.join(process.cwd(), '.env');
  let backupEnv: string | null = null;

  beforeAll(() => {
    // Backup existing .env
    if (fs.existsSync(ENV_PATH)) {
      backupEnv = fs.readFileSync(ENV_PATH, 'utf-8');
    }
  });

  afterAll(() => {
    // Restore .env
    if (backupEnv) {
      fs.writeFileSync(ENV_PATH, backupEnv);
    } else if (fs.existsSync(ENV_PATH)) {
      fs.unlinkSync(ENV_PATH);
    }
  });

  const run = (args: string): string => {
    // Use node to run the compiled JS file
    // We assume the build is done and bin/osc.js points to dist/src/index.js or we run node dist/src/index.js directly.
    // package.json says "bin": { "osc": "./bin/osc.js" }
    // Let's check bin/osc.js content or just run node dist/src/index.js
    return execSync(`node dist/src/index.js ${args}`, { encoding: 'utf8' });
  };

  it('should validate valid configuration', () => {
    // Create valid .env
    fs.writeFileSync(ENV_PATH, 'GITHUB_TOKEN=test\nGEMINI_API_KEY=test\nE2B_API_KEY=test\n');

    const output = run('config validate');
    expect(output).toContain('Configuration structure is valid');
  });

  it('should show configuration', () => {
    // Create valid .env
    fs.writeFileSync(ENV_PATH, 'GITHUB_TOKEN=test_token\nGEMINI_API_KEY=test_key\nE2B_API_KEY=test_key\n');

    const output = run('config show');
    // Secrets should be masked
    expect(output).toContain('********');
    expect(output).not.toContain('test_token');
  });

  it('should list config commands in help', () => {
    const output = run('config --help');
    expect(output).toContain('init');
    expect(output).toContain('validate');
    expect(output).toContain('show');
  });
});
