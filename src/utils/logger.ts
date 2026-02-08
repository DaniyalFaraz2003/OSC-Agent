import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
}

export class Logger {
  private level: LogLevel = LogLevel.INFO;
  private logFilePath: string | null = null;

  constructor(options?: { level?: LogLevel; logFile?: string }) {
    if (options?.level !== undefined) this.level = options.level;
    if (options?.logFile) {
      this.logFilePath = path.resolve(options.logFile);
      this.ensureLogDir();
    }

    // Check environment variable for debug mode
    if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
      this.level = LogLevel.DEBUG;
    }
  }

  private ensureLogDir(): void {
    if (this.logFilePath) {
      const dir = path.dirname(this.logFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private formatEntry(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      context,
    };
  }

  private write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (level < this.level) return;

    const entry = this.formatEntry(level, message, context);
    const logString = JSON.stringify(entry);

    // Console output
    const color = level === LogLevel.ERROR ? '\x1b[31m' : level === LogLevel.WARN ? '\x1b[33m' : '';
    console.log(`${color}[${entry.timestamp}] ${entry.level}: ${entry.message}\x1b[0m`, context || '');

    // File output
    if (this.logFilePath) {
      fs.appendFileSync(this.logFilePath, logString + '\n');
    }
  }

  debug(msg: string, ctx?: Record<string, unknown>): void {
    this.write(LogLevel.DEBUG, msg, ctx);
  }
  info(msg: string, ctx?: Record<string, unknown>): void {
    this.write(LogLevel.INFO, msg, ctx);
  }
  warn(msg: string, ctx?: Record<string, unknown>): void {
    this.write(LogLevel.WARN, msg, ctx);
  }
  error(msg: string, ctx?: Record<string, unknown>): void {
    this.write(LogLevel.ERROR, msg, ctx);
  }
}

export const logger = new Logger({ logFile: 'logs/orchestrator.log' });
