import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import chalk from 'chalk';

describe('output module', () => {
  let originalChalkLevel: number;
  let originalEnv: NodeJS.ProcessEnv;
  let stdoutWriteSpy: MockInstance;
  let consoleLogSpy: MockInstance;
  let consoleErrorSpy: MockInstance;
  let outputModule: typeof import('../src/output.js');

  beforeEach(async () => {
    originalChalkLevel = chalk.level;
    originalEnv = { ...process.env };

    delete process.env.NO_COLOR;
    process.env.TERM = 'xterm-256color';
    chalk.level = 3;

    vi.doMock('node:tty', () => ({
      isatty: () => true
    }));

    vi.resetModules();

    outputModule = await import('../src/output.js');

    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    chalk.level = originalChalkLevel;
    process.env = originalEnv;
    vi.doUnmock('node:tty');
    vi.restoreAllMocks();
  });

  describe('setOutputMode', () => {
    it('should switch between modes and restore chalk level', () => {
      expect(outputModule.isJson()).toBe(false);

      const initialLevel = chalk.level;
      expect(initialLevel).toBe(3);

      // Switch to JSON
      outputModule.setOutputMode('json');
      expect(outputModule.isJson()).toBe(true);
      expect(chalk.level).toBe(0);

      // Switch back to text
      outputModule.setOutputMode('text');
      expect(outputModule.isJson()).toBe(false);
      expect(chalk.level).toBe(initialLevel);
    });
  });

  describe('emit', () => {
    it('should call textFn in text mode', () => {
      const textFn = vi.fn();
      outputModule.emit(textFn, { foo: 'bar' });
      expect(textFn).toHaveBeenCalled();
      expect(stdoutWriteSpy).not.toHaveBeenCalled();
    });

    it('should write json to stdout in json mode', () => {
      outputModule.setOutputMode('json');
      const textFn = vi.fn();
      const jsonObj = { foo: 'bar' };
      outputModule.emit(textFn, jsonObj);
      expect(textFn).not.toHaveBeenCalled();
      expect(stdoutWriteSpy).toHaveBeenCalledWith(JSON.stringify(jsonObj) + '\n');
    });
  });

  describe('emitError', () => {
    it('should write to console.error in text mode', () => {
      outputModule.emitError('Something went wrong', 'ERR_CODE', { detail: 1 }, { hint: 'Do this', docsUrl: 'http://example.com' });
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(stdoutWriteSpy).not.toHaveBeenCalled();
    });

    it('should write json to stdout in json mode preserving shapes', () => {
      outputModule.setOutputMode('json');
      outputModule.emitError('Something went wrong', 'ERR_CODE', { detail: 1 }, { hint: 'Do this', docsUrl: 'http://example.com' });
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      const expectedPayload = {
        error: {
          code: 'ERR_CODE',
          message: 'Something went wrong',
          details: { detail: 1 },
          hint: 'Do this',
          docsUrl: 'http://example.com'
        }
      };
      expect(stdoutWriteSpy).toHaveBeenCalledWith(JSON.stringify(expectedPayload) + '\n');
    });
  });

  describe('info', () => {
    it('should log to console in text mode', () => {
      outputModule.info('Hello');
      expect(consoleLogSpy).toHaveBeenCalledWith('Hello');
    });

    it('should not log in json mode', () => {
      outputModule.setOutputMode('json');
      outputModule.info('Hello');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});
