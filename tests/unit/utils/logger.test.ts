import * as fs from 'fs';
import { Logger, LogLevel } from '../../../src/utils/logger';

// Mock fs to avoid actual file operations
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('Logger Utility', () => {
  let consoleSpy: jest.SpyInstance;
  const testLogFile = 'logs/test.log';

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console.log to suppress output and track calls
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // Mock fs.existsSync to simulate directory existence
    mockedFs.existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    delete process.env.DEBUG;
    delete process.env.NODE_ENV;
  });

  describe('Log Levels', () => {
    it('should not log messages below the configured level (INFO default)', () => {
      const logger = new Logger({ level: LogLevel.INFO });

      logger.debug('test debug');
      expect(consoleSpy).not.toHaveBeenCalled();

      logger.info('test info');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log messages at or above the configured level (WARN)', () => {
      const logger = new Logger({ level: LogLevel.WARN });

      logger.info('test info');
      expect(consoleSpy).not.toHaveBeenCalled();

      logger.warn('test warn');
      logger.error('test error');
      expect(consoleSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Environment Overrides', () => {
    it('should set level to DEBUG if process.env.DEBUG is "true"', () => {
      process.env.DEBUG = 'true';
      const logger = new Logger({ level: LogLevel.ERROR });

      logger.debug('force debug');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('DEBUG: force debug'), '');
    });

    it('should set level to DEBUG if NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';
      const logger = new Logger({ level: LogLevel.ERROR });

      logger.debug('dev debug');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('File Output', () => {
    it('should create directory if it does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      new Logger({ logFile: 'new-dir/test.log' });

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('new-dir'), { recursive: true });
    });

    it('should write structured JSON to the log file', () => {
      const logger = new Logger({ logFile: testLogFile, level: LogLevel.INFO });
      const context = { userId: '123' };

      logger.info('file log test', context);

      expect.stringMatching(/\{"timestamp":.*,"level":"INFO","message":"file log test","context":\{"userId":"123"\}\}\n/);
    });
  });

  describe('Console Output & Formatting', () => {
    it('should include color codes for ERROR level', () => {
      const logger = new Logger({ level: LogLevel.ERROR });
      logger.error('colored error');

      // \x1b[31m is Red
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('\x1b[31m'), '');
    });

    it('should include color codes for WARN level', () => {
      const logger = new Logger({ level: LogLevel.WARN });
      logger.warn('colored warn');

      // \x1b[33m is Yellow
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('\x1b[33m'), '');
    });

    it('should include context in console output', () => {
      const logger = new Logger();
      const ctx = { detail: 'extra' };
      logger.info('message', ctx);

      expect(consoleSpy).toHaveBeenCalledWith(expect.any(String), ctx);
    });
  });
});
