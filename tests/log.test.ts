import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { debug, isVerbose, setVerbose, timed, verbose } from '../src/log.js';

let stderrOutput: string[];
let originalWrite: typeof process.stderr.write;

beforeEach(() => {
  stderrOutput = [];
  originalWrite = process.stderr.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrOutput.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stderr.write;
  setVerbose(false);
});

afterEach(() => {
  process.stderr.write = originalWrite;
});

describe('setVerbose / isVerbose', () => {
  it('defaults to false (unless env var is set)', () => {
    expect(isVerbose()).toBe(false);
  });

  it('toggles on and off', () => {
    setVerbose(true);
    expect(isVerbose()).toBe(true);
    setVerbose(false);
    expect(isVerbose()).toBe(false);
  });
});

describe('verbose()', () => {
  it('emits nothing when verbose is off', () => {
    verbose('hello');
    expect(stderrOutput).toHaveLength(0);
  });

  it('emits prefixed output when verbose is on', () => {
    setVerbose(true);
    verbose('hello', 'world');
    expect(stderrOutput).toHaveLength(1);
    expect(stderrOutput[0]).toContain('[verbose]');
    expect(stderrOutput[0]).toContain('hello');
    expect(stderrOutput[0]).toContain('world');
  });

  it('formats Error arguments as name: message', () => {
    setVerbose(true);
    verbose(new TypeError('bad type'));
    expect(stderrOutput[0]).toContain('TypeError');
    expect(stderrOutput[0]).toContain('bad type');
  });

  it('stringifies plain objects', () => {
    setVerbose(true);
    verbose({ key: 'value' });
    expect(stderrOutput[0]).toContain('"key"');
    expect(stderrOutput[0]).toContain('"value"');
  });
});

describe('debug()', () => {
  it('emits nothing when verbose is off', () => {
    debug('label', { x: 1 });
    expect(stderrOutput).toHaveLength(0);
  });

  it('prints labeled output with timestamp', () => {
    setVerbose(true);
    debug('my-label', 'body text');
    const out = stderrOutput.join('');
    expect(out).toContain('[verbose');
    expect(out).toContain('my-label');
    expect(out).toContain('body text');
  });

  it('indents multiline body', () => {
    setVerbose(true);
    debug('label', 'line1\nline2\nline3');
    const out = stderrOutput.join('');
    expect(out).toContain('  line1');
    expect(out).toContain('  line2');
    expect(out).toContain('  line3');
  });

  it('pretty-prints objects as indented JSON', () => {
    setVerbose(true);
    debug('label', { nested: { a: 1 } });
    const out = stderrOutput.join('');
    expect(out).toContain('"nested"');
    expect(out).toContain('"a": 1');
  });

  it('prints Error stack traces', () => {
    setVerbose(true);
    const err = new Error('boom');
    debug('failure', err);
    const out = stderrOutput.join('');
    expect(out).toContain('boom');
    expect(out).toContain('Error');
  });

  it('omits body when undefined', () => {
    setVerbose(true);
    debug('no-body');
    const out = stderrOutput.join('');
    expect(out).toContain('no-body');
    expect(stderrOutput).toHaveLength(1);
  });
});

describe('timed()', () => {
  it('returns the result without logging when verbose is off', async () => {
    const result = await timed('op', () => 42);
    expect(result).toBe(42);
    expect(stderrOutput).toHaveLength(0);
  });

  it('logs ok timing when verbose is on', async () => {
    setVerbose(true);
    const result = await timed('fetch', () => Promise.resolve('data'));
    expect(result).toBe('data');
    const out = stderrOutput.join('');
    expect(out).toContain('fetch ok');
    expect(out).toContain('ms');
  });

  it('logs throw timing and re-throws when verbose is on', async () => {
    setVerbose(true);
    await expect(timed('fail-op', () => Promise.reject(new Error('nope')))).rejects.toThrow('nope');
    const out = stderrOutput.join('');
    expect(out).toContain('fail-op threw');
    expect(out).toContain('ms');
  });

  it('works with sync functions', async () => {
    setVerbose(true);
    const result = await timed('sync', () => 99);
    expect(result).toBe(99);
    const out = stderrOutput.join('');
    expect(out).toContain('sync ok');
  });
});
