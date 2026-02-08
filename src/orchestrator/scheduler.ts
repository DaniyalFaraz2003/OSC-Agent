import type { TaskQueue, Task } from './queue';
import type { QueueStore } from './queue-store';
import type { WorkflowOrchestrator } from './workflow';
import type { WorkflowResult } from './data-flow';

/**
 * Scheduler configuration options
 */
export interface SchedulerOptions {
  /** Task queue instance */
  queue: TaskQueue;
  /** Queue persistence store */
  queueStore: QueueStore;
  /** Maximum concurrent workflow executions (default: 3) */
  maxConcurrent?: number;
  /** Queue polling interval in milliseconds (default: 1000) */
  pollIntervalMs?: number;
  /** Factory function to create WorkflowOrchestrator for each task */
  createOrchestrator: (taskId: string, input: Task['workflowInput']) => WorkflowOrchestrator;
}

/**
 * Task scheduler that manages concurrent workflow execution
 */
export class TaskScheduler {
  private queue: TaskQueue;
  private queueStore: QueueStore;
  private runningTasks: Map<string, WorkflowOrchestrator> = new Map();
  private maxConcurrent: number;
  private pollIntervalMs: number;
  private createOrchestrator: SchedulerOptions['createOrchestrator'];

  private isRunning = false;
  private isPaused = false;
  private pollTimer?: NodeJS.Timeout;

  constructor(options: SchedulerOptions) {
    this.queue = options.queue;
    this.queueStore = options.queueStore;
    this.maxConcurrent = options.maxConcurrent ?? 3;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.createOrchestrator = options.createOrchestrator;
  }

  /**
   * Start the scheduler
   * Loads persisted queue and begins processing tasks
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.isPaused = false;

    // Load persisted queue and restore interrupted tasks
    await this.loadAndRecoverQueue();

    // Immediately trigger first poll
    this.scheduleNextPoll(0);
  }

  /**
   * Stop the scheduler
   * Waits for running tasks to complete before stopping
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop polling
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }

    // Wait for running tasks to complete
    await this.waitForRunningTasks();

    // Persist final queue state
    await this.persistQueue();
  }

  /**
   * Pause task processing
   * Running tasks continue, but no new tasks will start
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume task processing
   */
  resume(): void {
    this.isPaused = false;
    // Trigger immediate poll
    if (this.isRunning) {
      this.scheduleNextPoll(0);
    }
  }

  /**
   * Get count of currently running tasks
   */
  getRunningCount(): number {
    return this.runningTasks.size;
  }

  /**
   * Check if scheduler can accept a new task
   */
  canAcceptNewTask(): boolean {
    return this.runningTasks.size < this.maxConcurrent;
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    isPaused: boolean;
    runningCount: number;
    maxConcurrent: number;
  } {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      runningCount: this.runningTasks.size,
      maxConcurrent: this.maxConcurrent,
    };
  }

  // ── Private Methods ─────────────────────────────────────────────────────

  /**
   * Load persisted queue and mark interrupted tasks as pending
   */
  private async loadAndRecoverQueue(): Promise<void> {
    const tasks = await this.queueStore.load();

    // Only clear and restore if there are persisted tasks
    if (tasks.length === 0) {
      return;
    }

    // Clear current queue
    this.queue.clear();

    // Restore tasks without using add() to preserve original IDs
    for (const task of tasks) {
      const restoredTask: Task = {
        ...task,
        // If task was running when scheduler stopped, mark as pending
        status: task.status === 'running' ? 'pending' : task.status,
      };

      // Manually add to queue internals to preserve ID
      this.queue['tasks'].set(restoredTask.id, restoredTask);
      this.queue['priorityQueue'].push(restoredTask);
    }

    // Reorder queue to maintain priority
    this.queue['reorderQueue']();
  }

  /**
   * Schedule next poll iteration
   */
  private scheduleNextPoll(delayMs?: number): void {
    if (!this.isRunning) {
      return;
    }

    const delay = delayMs ?? this.pollIntervalMs;

    this.pollTimer = setTimeout(() => {
      void this.processQueue();
    }, delay);
  }

  /**
   * Main queue processing loop
   */
  private processQueue(): void {
    if (!this.isRunning || this.isPaused) {
      this.scheduleNextPoll();
      return;
    }

    // Start new tasks if slots available
    while (this.canAcceptNewTask()) {
      const task = this.queue.dequeue();
      if (!task) {
        break; // No pending tasks
      }

      // Reserve slot immediately (synchronous) before async work begins
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      this.runningTasks.set(task.id, null as any);

      // Execute task asynchronously
      void this.executeTask(task);
    }

    // Schedule next poll
    this.scheduleNextPoll();
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: Task): Promise<void> {
    this.queue.updateStatus(task.id, 'running');
    await this.persistQueue();

    try {
      // Create orchestrator for this task
      const orchestrator = this.createOrchestrator(task.id, task.workflowInput);
      this.runningTasks.set(task.id, orchestrator);

      // Execute workflow
      const result = await orchestrator.run(task.workflowInput);

      // Handle completion
      this.onTaskComplete(task.id, result);
    } catch (error) {
      // Handle error
      this.onTaskError(task.id, error as Error);
    } finally {
      // Remove from running tasks
      this.runningTasks.delete(task.id);
    }
  }

  /**
   * Handle task completion
   */
  private onTaskComplete(taskId: string, result: WorkflowResult): void {
    this.queue.updateResult(taskId, result);
    void this.persistQueue();
  }

  /**
   * Handle task error
   */
  private onTaskError(taskId: string, error: Error): void {
    this.queue.updateStatus(taskId, 'failed');
    const task = this.queue.get(taskId);
    if (task) {
      task.error = error.message;
    }
    void this.persistQueue();
  }

  /**
   * Persist queue to storage
   */
  private async persistQueue(): Promise<void> {
    const tasks = this.queue.getAll();
    await this.queueStore.save(tasks);
  }

  /**
   * Wait for all running tasks to complete
   */
  private async waitForRunningTasks(): Promise<void> {
    // Poll until all tasks complete
    while (this.runningTasks.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
