import fs from 'fs/promises';
import path from 'path';
import type { Task } from './queue';

/**
 * Persisted queue format
 */
export interface PersistedQueue {
  tasks: Task[];
  updatedAt: string;
}

/**
 * Handles queue persistence to filesystem
 */
export class QueueStore {
  private filePath: string;

  constructor(filePath = '.osc-agent/queue.json') {
    this.filePath = filePath;
  }

  /**
   * Save tasks to disk (atomic write)
   * @param tasks Array of tasks to persist
   */
  async save(tasks: Task[]): Promise<void> {
    const data: PersistedQueue = {
      tasks: tasks.map((task) => ({
        ...task,
        // Ensure dates are serialized as ISO strings
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
      })),
      updatedAt: new Date().toISOString(),
    };

    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }

    // Atomic write: write to temp file, then rename
    const tempPath = `${this.filePath}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tempPath, this.filePath);
    } catch (error) {
      // Clean up temp file if rename fails
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      // If directory was deleted mid-save, just skip (common in tests)
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  /**
   * Load tasks from disk
   * @returns Array of tasks, or empty array if file doesn't exist
   */
  async load(): Promise<Task[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(content) as PersistedQueue;

      // Convert date strings back to Date objects
      return data.tasks.map((task) => ({
        ...task,
        createdAt: new Date(task.createdAt),
        startedAt: task.startedAt ? new Date(task.startedAt) : undefined,
        completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
      }));
    } catch (error) {
      // File doesn't exist or is invalid - return empty array
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Clear the queue file
   */
  async clear(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Get the file path being used for storage
   */
  getFilePath(): string {
    return this.filePath;
  }
}
