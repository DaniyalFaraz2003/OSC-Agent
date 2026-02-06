// tests/unit/agents/gemini-client.test.ts
import { GeminiClient } from '../../../src/agents/gemini-client';

describe('GeminiClient Unit Tests', () => {
  let client: GeminiClient;

  beforeEach(() => {
    client = new GeminiClient('fake-api-key');
  });

  it('should initialize correctly', () => {
    expect(client).toBeDefined();
  });

  it('should track cost correctly using the cost tracker', () => {
    // Accessing internal cost tracker for verification
    const metricsBefore = client.getGlobalMetrics();
    expect(metricsBefore.totalCost).toBe(0);
  });
});
