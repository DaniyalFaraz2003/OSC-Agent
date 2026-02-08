import crypto from 'crypto';
import type { WorkflowInput } from './data-flow';
import type { WorkflowResult } from './data-flow';

/**
 * Task status lifecycle:
 * pending → running → completed
 *                   ↘ failed
 *                   ↘ paused
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused';

/**
 * Represents a single task in the queue
 */
export interface Task {
  /** Unique task identifier */
  id: string;
  /** Priority (higher = more urgent, range: 1-10) */
  priority: number;
  /** Current task status */
  status: TaskStatus;
  /** Input for the workflow execution */
  workflowInput: WorkflowInput;
  /** Timestamp when task was created */
  createdAt: Date;
  /** Timestamp when task started executing */
  startedAt?: Date;
  /** Timestamp when task completed */
  completedAt?: Date;
  /** Error message if task failed */
  error?: string;
  /** Workflow result when task completes */
  result?: WorkflowResult;
}

/**
 * Priority-based task queue for managing multiple workflow executions
 */
export class TaskQueue {
  private tasks: Map<string, Task> = new Map();
  private priorityQueue: Task[] = [];

  /**
   * Add a new task to the queue
   * @param input Workflow input (owner, repo, issueNumber)
   * @param priority Priority level (1-10, default: 5)
   * @returns Task ID
   */
  add(input: WorkflowInput, priority = 5): string {
    const task: Task = {
      id: crypto.randomUUID(),
      priority: Math.max(1, Math.min(10, priority)), // Clamp to 1-10
      status: 'pending',
      workflowInput: input,
      createdAt: new Date(),
    };

    this.tasks.set(task.id, task);
    this.priorityQueue.push(task);
    this.reorderQueue();

    return task.id;
  }

  /**
   * Remove a task from the queue
   * @param taskId Task ID to remove
   * @returns true if task was removed, false if not found
   */
  remove(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    this.tasks.delete(taskId);
    this.priorityQueue = this.priorityQueue.filter((t) => t.id !== taskId);
    return true;
  }

  /**
   * Get a task by ID
   * @param taskId Task ID
   * @returns Task or undefined if not found
   */
  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   * @returns Array of all tasks
   */
  getAll(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get tasks filtered by status
   * @param status Task status to filter
   * @returns Array of tasks with matching status
   */
  getByStatus(status: TaskStatus): Task[] {
    return Array.from(this.tasks.values()).filter((task) => task.status === status);
  }

  /**
   * Peek at the highest priority pending task without removing it
   * @returns Highest priority pending task or undefined if queue is empty
   */
  peek(): Task | undefined {
    return this.priorityQueue.find((task) => task.status === 'pending');
  }

  /**
   * Dequeue the highest priority pending task
   * @returns Highest priority pending task or undefined if queue is empty
   */
  dequeue(): Task | undefined {
    const index = this.priorityQueue.findIndex((task) => task.status === 'pending');
    if (index === -1) {
      return undefined;
    }

    const task = this.priorityQueue[index];
    // Don't remove from maps, just mark as dequeued by caller
    return task;
  }

  /**
   * Update task status
   * @param taskId Task ID
   * @param status New status
   */
  updateStatus(taskId: string, status: TaskStatus): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.status = status;

    // Update timestamps
    if (status === 'running' && !task.startedAt) {
      task.startedAt = new Date();
    }
    if ((status === 'completed' || status === 'failed') && !task.completedAt) {
      task.completedAt = new Date();
    }
  }

  /**
   * Update task result
   * @param taskId Task ID
   * @param result Workflow result
   */
  updateResult(taskId: string, result: WorkflowResult): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.result = result;
    task.status = result.status === 'completed' ? 'completed' : 'failed';
    task.completedAt = new Date();

    if (result.error) {
      task.error = result.error.message;
    }
  }

  /**
   * Get queue statistics
   * @returns Object with task counts by status
   */
  getStats(): { total: number; pending: number; running: number; completed: number; failed: number; paused: number } {
    const stats = {
      total: this.tasks.size,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      paused: 0,
    };

    for (const task of this.tasks.values()) {
      stats[task.status]++;
    }

    return stats;
  }

  /**
   * Clear all tasks from the queue
   */
  clear(): void {
    this.tasks.clear();
    this.priorityQueue = [];
  }

  /**
   * Reorder the priority queue
   * Higher priority first, then earlier createdAt for ties
   */
  private reorderQueue(): void {
    this.priorityQueue.sort((a, b) => {
      // Higher priority first
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Earlier timestamp first for tie-breaking
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }
}
