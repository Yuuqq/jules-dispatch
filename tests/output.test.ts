import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import chalk from 'chalk';
import { setOutputMode, isJson, emit, emitError, info } from '../src/output.js';

describe('output module', () => {
  let originalChalkLevel: number;
  let stdoutWriteSpy: any;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Save original state
    originalChalkLevel = chalk.level;

    // Spy on output methods
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore global/module state
    chalk.level = originalChalkLevel;
    setOutputMode('text');
    vi.restoreAllMocks();
  });

  describe('setOutputMode', () => {
    it('should switch between modes and restore chalk level', () => {
      expect(isJson()).toBe(false);

      const initialLevel = chalk.level;

      // Switch to JSON
      setOutputMode('json');
      expect(isJson()).toBe(true);
      expect(chalk.level).toBe(0);

      // Switch back to text
      setOutputMode('text');
      expect(isJson()).toBe(false);
      expect(chalk.level).toBe(initialLevel);
    });
  });

  describe('emit', () => {
    it('should call textFn in text mode', () => {
      const textFn = vi.fn();
      emit(textFn, { foo: 'bar' });
      expect(textFn).toHaveBeenCalled();
      expect(stdoutWriteSpy).not.toHaveBeenCalled();
    });

    it('should write json to stdout in json mode', () => {
      setOutputMode('json');
      const textFn = vi.fn();
      const jsonObj = { foo: 'bar' };
      emit(textFn, jsonObj);
      expect(textFn).not.toHaveBeenCalled();
      expect(stdoutWriteSpy).toHaveBeenCalledWith(JSON.stringify(jsonObj) + '\n');
    });
  });

  describe('emitError', () => {
    it('should write to console.error in text mode', () => {
      emitError('Something went wrong', 'ERR_CODE', { detail: 1 }, { hint: 'Do this', docsUrl: 'http://example.com' });
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(stdoutWriteSpy).not.toHaveBeenCalled();
    });

    it('should write json to stdout in json mode preserving shapes', () => {
      setOutputMode('json');
      emitError('Something went wrong', 'ERR_CODE', { detail: 1 }, { hint: 'Do this', docsUrl: 'http://example.com' });
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
      info('Hello');
      expect(consoleLogSpy).toHaveBeenCalledWith('Hello');
    });

    it('should not log in json mode', () => {
      setOutputMode('json');
      info('Hello');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});