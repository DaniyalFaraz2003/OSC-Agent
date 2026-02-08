import chalk from 'chalk';
import { QueueStats } from '../orchestrator/queue';

/**
 * Real-time dashboard for autonomous mode
 * Displays queue statistics and current task
 */
export class Dashboard {
  private queueSize: number = 0;
  private completed: number = 0;
  private failed: number = 0;
  private currentTask: string = 'Idle';
  private startTime: Date = new Date();
  private interval?: NodeJS.Timeout;

  /**
   * Start dashboard with auto-refresh
   */
  start(): void {
    this.render();
    this.interval = setInterval(() => this.render(), 1000);
  }

  /**
   * Stop dashboard
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  /**
   * Update queue size
   */
  updateQueueSize(size: number): void {
    this.queueSize = size;
  }

  /**
   * Update statistics from queue
   */
  updateStats(stats: QueueStats): void {
    this.queueSize = stats.pending + stats.running;
    this.completed = stats.completed;
    this.failed = stats.failed;
  }

  /**
   * Increment completed count
   */
  incrementCompleted(): void {
    this.completed++;
  }

  /**
   * Increment failed count
   */
  incrementFailed(): void {
    this.failed++;
  }

  /**
   * Update current task
   */
  updateCurrent(task: string): void {
    this.currentTask = task;
  }

  /**
   * Render dashboard UI
   */
  render(): void {
    console.clear();

    const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const uptimeStr = `${Math.floor(uptime / 60)}m ${uptime % 60}s`;
    const throughput = uptime > 0 ? ((this.completed / uptime) * 60).toFixed(2) : '0.00';

    console.log(chalk.bold.cyan('╔════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║') + chalk.bold('        OSC-Agent Autonomous Mode Dashboard        ') + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('╠════════════════════════════════════════════════════════╣'));
    console.log(chalk.bold.cyan('║') + '                                                        ' + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('║') + '  ' + chalk.bold('Queue:        ') + chalk.yellow(String(this.queueSize).padEnd(38)) + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('║') + '  ' + chalk.bold('Completed:    ') + chalk.green(String(this.completed).padEnd(38)) + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('║') + '  ' + chalk.bold('Failed:       ') + chalk.red(String(this.failed).padEnd(38)) + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('║') + '                                                        ' + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('║') + '  ' + chalk.bold('Uptime:       ') + chalk.white(uptimeStr.padEnd(38)) + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('║') + '  ' + chalk.bold('Throughput:   ') + chalk.white(`${throughput} tasks/min`.padEnd(38)) + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('║') + '                                                        ' + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('║') + '  ' + chalk.bold('Current:      ') + chalk.cyan(this.currentTask.substring(0, 38).padEnd(38)) + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('║') + '                                                        ' + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════╝'));
    console.log();
    console.log(chalk.gray('Press Ctrl+C to stop gracefully'));
  }
}
