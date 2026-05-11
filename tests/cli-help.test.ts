import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

const run = (args: string, env?: Record<string, string>) =>
  execSync(`npx tsx src/cli.ts ${args}`, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

describe('CLI-01: Command examples', () => {
  it('dispatch help includes examples', () => {
    const out = run('dispatch --help');
    expect(out).toContain('Examples:');
    expect(out).toContain('jules-dispatch dispatch task.yaml');
    expect(out).toContain('--source');
  });

  it('batch help includes examples', () => {
    const out = run('batch --help');
    expect(out).toContain('Examples:');
    expect(out).toContain('--parallel');
  });

  it('status help includes examples', () => {
    const out = run('status --help');
    expect(out).toContain('Examples:');
    expect(out).toContain('--watch');
  });

  it('get help includes examples', () => {
    const out = run('get --help');
    expect(out).toContain('Examples:');
    expect(out).toContain('jules-dispatch get');
  });

  it('wait help includes examples', () => {
    const out = run('wait --help');
    expect(out).toContain('Examples:');
    expect(out).toContain('--fail-fast');
  });

  it('message help includes examples', () => {
    const out = run('message --help');
    expect(out).toContain('Examples:');
  });

  it('plan help includes examples', () => {
    const out = run('plan --help');
    expect(out).toContain('Examples:');
  });

  it('approve help includes examples', () => {
    const out = run('approve --help');
    expect(out).toContain('Examples:');
  });

  it('cancel help includes examples', () => {
    const out = run('cancel --help');
    expect(out).toContain('Examples:');
  });

  it('doctor help includes examples', () => {
    const out = run('doctor --help');
    expect(out).toContain('Examples:');
    expect(out).toContain('--task-file');
  });

  it('tail help includes examples', () => {
    const out = run('tail --help');
    expect(out).toContain('Examples:');
  });

  it('plan-tasks help includes examples', () => {
    const out = run('plan-tasks --help');
    expect(out).toContain('Examples:');
    expect(out).toContain('--output');
  });

  it('auto help includes examples', () => {
    const out = run('auto --help');
    expect(out).toContain('Examples:');
    expect(out).toContain('--dry-run');
  });

  it('mcp help includes examples', () => {
    const out = run('mcp --help');
    expect(out).toContain('Examples:');
  });
});

describe('CLI-02: Root help footer', () => {
  it('root help includes getting-started section', () => {
    const out = run('--help');
    expect(out).toContain('Getting started:');
    expect(out).toContain('dispatch task.yaml');
    expect(out).toContain('doctor');
  });

  it('root help includes docs link', () => {
    const out = run('--help');
    expect(out).toContain('Docs:');
  });
});

describe('CLI-03: Color detection', () => {
  it('NO_COLOR=1 produces no ANSI escape codes', () => {
    const out = run('--help', { NO_COLOR: '1' });
    const ansiCount = (out.match(/\x1b\[/g) || []).length;
    expect(ansiCount).toBe(0);
  });

  it('TERM=dumb produces no ANSI escape codes', () => {
    const out = run('--help', { TERM: 'dumb' });
    const ansiCount = (out.match(/\x1b\[/g) || []).length;
    expect(ansiCount).toBe(0);
  });
});
