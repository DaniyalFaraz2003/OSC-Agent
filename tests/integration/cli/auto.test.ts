import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TaskQueue } from '../../../src/orchestrator/queue';
import { QueueStore } from '../../../src/orchestrator/queue-store';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Queue Integration', () => {
  const testStorePath = path.join(__dirname, '.test-queue.json');
  let queue: TaskQueue<{ issueNumber: number }>;
  let store: QueueStore;

  beforeEach(() => {
    queue = new TaskQueue({ maxConcurrent: 2 });
    store = new QueueStore(testStorePath);
  });

  afterEach(async () => {
    try {
      await fs.unlink(testStorePath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it('should persist and restore queue state', async () => {
    queue.add({ issueNumber: 1 }, 5);
    queue.add({ issueNumber: 2 }, 8);

    await store.save(queue);

    const newQueue = new TaskQueue<{ issueNumber: number }>();
    const loaded = await store.load(newQueue);

    expect(loaded).toBe(true);
    expect(newQueue.getAll()).toHaveLength(2);
    expect(newQueue.getStats().total).toBe(2);
  });

  it('should handle non-existent state file', async () => {
    const newQueue = new TaskQueue<{ issueNumber: number }>();
    const loaded = await store.load(newQueue);

    expect(loaded).toBe(false);
  });

  it('should check if state exists', async () => {
    expect(await store.exists()).toBe(false);

    await store.save(queue);

    expect(await store.exists()).toBe(true);
  });

  it('should clear state', async () => {
    await store.save(queue);
    expect(await store.exists()).toBe(true);

    await store.clear();
    expect(await store.exists()).toBe(false);
  });
});
