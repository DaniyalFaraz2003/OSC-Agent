import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { loadConfig } from '../../../src/config/loader';

describe('Configuration Loader', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    // Use a fresh copy of the environment for each test
    process.env = { ...originalEnv }; 
  });

  it('should prioritize Environment Variables over Defaults', () => {
    process.env.GITHUB_TOKEN = 'env-token';
    process.env.GEMINI_API_KEY = 'gemini-key';
    process.env.E2B_API_KEY = 'e2b-key';

    const config = loadConfig();
    expect(config.github.token).toBe('env-token');
  });

 it('should fail validation if required keys are missing', () => {
  // Explicitly delete the keys from the test's process.env
  delete process.env.GITHUB_TOKEN;
  delete process.env.GEMINI_API_KEY;
  delete process.env.E2B_API_KEY;

  const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit called');
  });

  expect(() => loadConfig({})).toThrow('process.exit called');
  exitSpy.mockRestore();
});
});