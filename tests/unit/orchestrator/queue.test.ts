import fs from 'fs/promises';
import path from 'path';
import { TaskQueue, type Task } from '../../../src/orchestrator/queue';
import { QueueStore } from '../../../src/orchestrator/queue-store';
import { TaskScheduler } from '../../../src/orchestrator/scheduler';
import type { WorkflowInput, WorkflowResult } from '../../../src/orchestrator/data-flow';

describe('TaskQueue', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  describe('add', () => {
    it('should add a task with default priority', () => {
      const input: WorkflowInput = { owner: 'test', repo: 'repo', issueNumber: 1 };
      const taskId = queue.add(input);

      expect(taskId).toBeDefined();
      const task = queue.get(taskId);
      expect(task).toBeDefined();
      expect(task?.priority).toBe(5);
      expect(task?.status).toBe('pending');
      expect(task?.workflowInput).toEqual(input);
    });

    it('should add a task with custom priority', () => {
      const input: WorkflowInput = { owner: 'test', repo: 'repo', issueNumber: 1 };
      const taskId = queue.add(input, 8);

      const task = queue.get(taskId);
      expect(task?.priority).toBe(8);
    });

    it('should clamp priority to valid range (1-10)', () => {
      const input: WorkflowInput = { owner: 'test', repo: 'repo', issueNumber: 1 };

      const taskId1 = queue.add(input, 0);
      expect(queue.get(taskId1)?.priority).toBe(1);

      const taskId2 = queue.add(input, 15);
      expect(queue.get(taskId2)?.priority).toBe(10);
    });
  });

  describe('remove', () => {
    it('should remove a task from the queue', () => {
      const input: WorkflowInput = { owner: 'test', repo: 'repo', issueNumber: 1 };
      const taskId = queue.add(input);

      const removed = queue.remove(taskId);
      expect(removed).toBe(true);
      expect(queue.get(taskId)).toBeUndefined();
    });

    it('should return false when removing non-existent task', () => {
      const removed = queue.remove('non-existent-id');
      expect(removed).toBe(false);
    });
  });

  describe('get', () => {
    it('should retrieve a task by ID', () => {
      const input: WorkflowInput = { owner: 'test', repo: 'repo', issueNumber: 1 };
      const taskId = queue.add(input);

      const task = queue.get(taskId);
      expect(task).toBeDefined();
      expect(task?.id).toBe(taskId);
    });

    it('should return undefined for non-existent task', () => {
      const task = queue.get('non-existent');
      expect(task).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all tasks', () => {
      queue.add({ owner: 'test', repo: 'repo1', issueNumber: 1 });
      queue.add({ owner: 'test', repo: 'repo2', issueNumber: 2 });
      queue.add({ owner: 'test', repo: 'repo3', issueNumber: 3 });

      const all = queue.getAll();
      expect(all).toHaveLength(3);
    });

    it('should return empty array when queue is empty', () => {
      const all = queue.getAll();
      expect(all).toHaveLength(0);
    });
  });

  describe('getByStatus', () => {
    it('should filter tasks by status', () => {
      queue.add({ owner: 'test', repo: 'repo1', issueNumber: 1 });
      const id2 = queue.add({ owner: 'test', repo: 'repo2', issueNumber: 2 });
      queue.add({ owner: 'test', repo: 'repo3', issueNumber: 3 });

      queue.updateStatus(id2, 'running');

      const pending = queue.getByStatus('pending');
      const running = queue.getByStatus('running');

      expect(pending).toHaveLength(2);
      expect(running).toHaveLength(1);
      expect(running[0]?.id).toBe(id2);
    });
  });

  describe('priority ordering', () => {
    it('should order tasks by priority (higher first)', () => {
      queue.add({ owner: 'test', repo: 'low', issueNumber: 1 }, 3);
      queue.add({ owner: 'test', repo: 'high', issueNumber: 2 }, 9);
      queue.add({ owner: 'test', repo: 'medium', issueNumber: 3 }, 6);

      const first = queue.peek();
      expect(first?.workflowInput.repo).toBe('high');
    });

    it('should use createdAt for tie-breaking (earlier first)', async () => {
      const id1 = queue.add({ owner: 'test', repo: 'first', issueNumber: 1 }, 5);
      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      queue.add({ owner: 'test', repo: 'second', issueNumber: 2 }, 5);

      const first = queue.peek();
      expect(first?.id).toBe(id1);
    });
  });

  describe('peek and dequeue', () => {
    it('should peek at highest priority pending task without removing', () => {
      const id = queue.add({ owner: 'test', repo: 'repo', issueNumber: 1 }, 7);

      const peeked = queue.peek();
      expect(peeked?.id).toBe(id);

      // Should still be in queue
      const stillThere = queue.peek();
      expect(stillThere?.id).toBe(id);
    });

    it('should dequeue highest priority pending task', () => {
      queue.add({ owner: 'test', repo: 'low', issueNumber: 1 }, 3);
      const highId = queue.add({ owner: 'test', repo: 'high', issueNumber: 2 }, 9);

      const dequeued = queue.dequeue();
      expect(dequeued?.id).toBe(highId);
    });

    it('should skip non-pending tasks when peeking', () => {
      const id1 = queue.add({ owner: 'test', repo: 'running', issueNumber: 1 }, 9);
      const id2 = queue.add({ owner: 'test', repo: 'pending', issueNumber: 2 }, 5);

      queue.updateStatus(id1, 'running');

      const peeked = queue.peek();
      expect(peeked?.id).toBe(id2);
    });

    it('should return undefined when no pending tasks', () => {
      const id = queue.add({ owner: 'test', repo: 'repo', issueNumber: 1 });
      queue.updateStatus(id, 'completed');

      expect(queue.peek()).toBeUndefined();
      expect(queue.dequeue()).toBeUndefined();
    });
  });

  describe('updateStatus', () => {
    it('should update task status', () => {
      const id = queue.add({ owner: 'test', repo: 'repo', issueNumber: 1 });
      queue.updateStatus(id, 'running');

      const task = queue.get(id);
      expect(task?.status).toBe('running');
    });

    it('should set startedAt when status changes to running', () => {
      const id = queue.add({ owner: 'test', repo: 'repo', issueNumber: 1 });
      const before = queue.get(id);
      expect(before?.startedAt).toBeUndefined();

      queue.updateStatus(id, 'running');

      const after = queue.get(id);
      expect(after?.startedAt).toBeInstanceOf(Date);
    });

    it('should set completedAt when status changes to completed', () => {
      const id = queue.add({ owner: 'test', repo: 'repo', issueNumber: 1 });
      queue.updateStatus(id, 'completed');

      const task = queue.get(id);
      expect(task?.completedAt).toBeInstanceOf(Date);
    });

    it('should set completedAt when status changes to failed', () => {
      const id = queue.add({ owner: 'test', repo: 'repo', issueNumber: 1 });
      queue.updateStatus(id, 'failed');

      const task = queue.get(id);
      expect(task?.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('updateResult', () => {
    it('should update task with successful result', () => {
      const id = queue.add({ owner: 'test', repo: 'repo', issueNumber: 1 });

      const result: WorkflowResult = {
        status: 'completed',
        runId: id,
        finalState: 'DONE',
        data: { input: { owner: 'test', repo: 'repo', issueNumber: 1 } },
        attempt: 1,
        durationMs: 1000,
      };

      queue.updateResult(id, result);

      const task = queue.get(id);
      expect(task?.status).toBe('completed');
      expect(task?.result).toEqual(result);
      expect(task?.completedAt).toBeInstanceOf(Date);
    });

    it('should update task with failed result and error', () => {
      const id = queue.add({ owner: 'test', repo: 'repo', issueNumber: 1 });

      const result: WorkflowResult = {
        status: 'failed',
        runId: id,
        finalState: 'ERROR',
        data: { input: { owner: 'test', repo: 'repo', issueNumber: 1 } },
        attempt: 3,
        error: { code: 'TEST_ERROR', message: 'Test error message' },
        durationMs: 5000,
      };

      queue.updateResult(id, result);

      const task = queue.get(id);
      expect(task?.status).toBe('failed');
      expect(task?.error).toBe('Test error message');
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', () => {
      queue.add({ owner: 'test', repo: 'repo1', issueNumber: 1 });
      const id2 = queue.add({ owner: 'test', repo: 'repo2', issueNumber: 2 });
      const id3 = queue.add({ owner: 'test', repo: 'repo3', issueNumber: 3 });
      const id4 = queue.add({ owner: 'test', repo: 'repo4', issueNumber: 4 });

      queue.updateStatus(id2, 'running');
      queue.updateStatus(id3, 'completed');
      queue.updateStatus(id4, 'failed');

      const stats = queue.getStats();

      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(1);
      expect(stats.running).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.paused).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all tasks from queue', () => {
      queue.add({ owner: 'test', repo: 'repo1', issueNumber: 1 });
      queue.add({ owner: 'test', repo: 'repo2', issueNumber: 2 });

      expect(queue.getAll()).toHaveLength(2);

      queue.clear();

      expect(queue.getAll()).toHaveLength(0);
      expect(queue.peek()).toBeUndefined();
    });
  });
});

describe('QueueStore', () => {
  const testDir = path.join(__dirname, '../../../test-queue-store');
  const testFilePath = path.join(testDir, 'test-queue.json');
  let store: QueueStore;

  beforeEach(async () => {
    store = new QueueStore(testFilePath);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('save and load', () => {
    it('should save and load tasks', async () => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          priority: 5,
          status: 'pending',
          workflowInput: { owner: 'test', repo: 'repo1', issueNumber: 1 },
          createdAt: new Date(),
        },
        {
          id: 'task-2',
          priority: 8,
          status: 'running',
          workflowInput: { owner: 'test', repo: 'repo2', issueNumber: 2 },
          createdAt: new Date(),
          startedAt: new Date(),
        },
      ];

      await store.save(tasks);

      const loaded = await store.load();

      expect(loaded).toHaveLength(2);
      expect(loaded[0]?.id).toBe('task-1');
      expect(loaded[0]?.createdAt).toBeInstanceOf(Date);
      expect(loaded[1]?.startedAt).toBeInstanceOf(Date);
    });

    it('should return empty array when file does not exist', async () => {
      const loaded = await store.load();
      expect(loaded).toEqual([]);
    });

    it('should handle tasks with all timestamp fields', async () => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          priority: 5,
          status: 'completed',
          workflowInput: { owner: 'test', repo: 'repo1', issueNumber: 1 },
          createdAt: new Date('2026-01-01T00:00:00Z'),
          startedAt: new Date('2026-01-01T00:01:00Z'),
          completedAt: new Date('2026-01-01T00:05:00Z'),
        },
      ];

      await store.save(tasks);
      const loaded = await store.load();

      expect(loaded[0]?.createdAt).toBeInstanceOf(Date);
      expect(loaded[0]?.startedAt).toBeInstanceOf(Date);
      expect(loaded[0]?.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('clear', () => {
    it('should delete the queue file', async () => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          priority: 5,
          status: 'pending',
          workflowInput: { owner: 'test', repo: 'repo1', issueNumber: 1 },
          createdAt: new Date(),
        },
      ];

      await store.save(tasks);
      expect(await store.load()).toHaveLength(1);

      await store.clear();
      expect(await store.load()).toEqual([]);
    });

    it('should not error when file does not exist', async () => {
      await expect(store.clear()).resolves.not.toThrow();
    });
  });

  describe('atomic writes', () => {
    it('should use temporary file for atomic writes', async () => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          priority: 5,
          status: 'pending',
          workflowInput: { owner: 'test', repo: 'repo1', issueNumber: 1 },
          createdAt: new Date(),
        },
      ];

      await store.save(tasks);

      // Verify temp file doesn't exist after save
      const tempPath = `${testFilePath}.tmp`;
      await expect(fs.access(tempPath)).rejects.toThrow();

      // Verify actual file exists
      await expect(fs.access(testFilePath)).resolves.not.toThrow();
    });
  });
});

describe('TaskScheduler', () => {
  let queue: TaskQueue;
  let store: QueueStore;
  const testDir = path.join(__dirname, '../../../test-scheduler');
  const testFilePath = path.join(testDir, 'scheduler-queue.json');

  beforeEach(async () => {
    queue = new TaskQueue();
    store = new QueueStore(testFilePath);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('start and stop', () => {
    it('should start and stop the scheduler', async (): Promise<void> => {
      const scheduler = new TaskScheduler({
        queue,
        queueStore: store,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
        createOrchestrator: () => null as any,
      });

      await scheduler.start();
      expect(scheduler.getStatus().isRunning).toBe(true);

      await scheduler.stop();
      expect(scheduler.getStatus().isRunning).toBe(false);
    });

    it('should load persisted queue on start', async (): Promise<void> => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          priority: 5,
          status: 'pending',
          workflowInput: { owner: 'test', repo: 'repo1', issueNumber: 1 },
          createdAt: new Date(),
        },
      ];

      await store.save(tasks);

      const scheduler = new TaskScheduler({
        queue,
        queueStore: store,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
        createOrchestrator: () => null as any,
      });

      await scheduler.start();

      expect(queue.getAll()).toHaveLength(1);

      await scheduler.stop();
    });

    it('should mark interrupted running tasks as pending', async (): Promise<void> => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          priority: 5,
          status: 'running', // Was running when scheduler stopped
          workflowInput: { owner: 'test', repo: 'repo1', issueNumber: 1 },
          createdAt: new Date(),
          startedAt: new Date(),
        },
      ];

      await store.save(tasks);

      const scheduler = new TaskScheduler({
        queue,
        queueStore: store,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
        createOrchestrator: () => null as any,
      });

      await scheduler.start();

      const recovered = queue.get('task-1');
      expect(recovered?.status).toBe('pending');

      await scheduler.stop();
    });
  });

  describe('pause and resume', () => {
    it('should pause and resume task processing', (): void => {
      const scheduler = new TaskScheduler({
        queue,
        queueStore: store,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
        createOrchestrator: () => null as any,
      });

      scheduler.pause();
      expect(scheduler.getStatus().isPaused).toBe(true);

      scheduler.resume();
      expect(scheduler.getStatus().isPaused).toBe(false);
    });
  });

  describe('concurrent execution limits', () => {
    it('should respect maxConcurrent limit', async () => {
      const executingTasks = new Set<string>();
      let maxConcurrent = 0;

      const scheduler = new TaskScheduler({
        queue,
        queueStore: store,
        maxConcurrent: 2,
        pollIntervalMs: 50,
        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-explicit-any
        createOrchestrator: (taskId) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return {
            // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
            async run(): Promise<WorkflowResult> {
              executingTasks.add(taskId);
              maxConcurrent = Math.max(maxConcurrent, executingTasks.size);

              // Simulate work
              await new Promise((resolve) => setTimeout(resolve, 100));

              executingTasks.delete(taskId);

              return {
                status: 'completed',
                runId: taskId,
                finalState: 'DONE',
                data: { input: { owner: 'test', repo: 'repo', issueNumber: 1 } },
                attempt: 1,
                durationMs: 100,
              } as WorkflowResult;
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any;
        },
      });

      // Add 5 tasks
      for (let i = 1; i <= 5; i++) {
        queue.add({ owner: 'test', repo: `repo${i}`, issueNumber: i }, 5);
      }

      await scheduler.start();

      // Wait for all tasks to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      await scheduler.stop();

      // Should never exceed maxConcurrent
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('should report accurate running count', (): void => {
      const scheduler = new TaskScheduler({
        queue,
        queueStore: store,
        maxConcurrent: 3,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
        createOrchestrator: () => null as any,
      });

      expect(scheduler.getRunningCount()).toBe(0);
      expect(scheduler.canAcceptNewTask()).toBe(true);
    });
  });

  describe('task execution', () => {
    it('should execute tasks and update status', async (): Promise<void> => {
      let executed = false;

      const scheduler = new TaskScheduler({
        queue,
        queueStore: store,
        pollIntervalMs: 50,
        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-explicit-any
        createOrchestrator: (taskId) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return {
            async run(): Promise<WorkflowResult> {
              executed = true;
              await Promise.resolve(); // Satisfy require-await
              return {
                status: 'completed',
                runId: taskId,
                finalState: 'DONE',
                data: { input: { owner: 'test', repo: 'repo', issueNumber: 1 } },
                attempt: 1,
                durationMs: 10,
              } as WorkflowResult;
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any;
        },
      });

      const taskId = queue.add({ owner: 'test', repo: 'repo', issueNumber: 1 });

      await scheduler.start();
      await new Promise((resolve) => setTimeout(resolve, 200));
      await scheduler.stop();

      expect(executed).toBe(true);

      const task = queue.get(taskId);
      expect(task?.status).toBe('completed');
      expect(task?.result).toBeDefined();
    });

    it('should handle task errors', async (): Promise<void> => {
      const scheduler = new TaskScheduler({
        queue,
        queueStore: store,
        pollIntervalMs: 50,
        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-explicit-any
        createOrchestrator: () => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return {
            async run(): Promise<WorkflowResult> {
              await Promise.resolve(); // Satisfy require-await
              throw new Error('Test error');
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any;
        },
      });

      const taskId = queue.add({ owner: 'test', repo: 'repo', issueNumber: 1 });

      await scheduler.start();
      await new Promise((resolve) => setTimeout(resolve, 200));
      await scheduler.stop();

      const task = queue.get(taskId);
      expect(task?.status).toBe('failed');
      expect(task?.error).toBe('Test error');
    });
  });
});
