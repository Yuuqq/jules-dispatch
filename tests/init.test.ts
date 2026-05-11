import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseEnv, runInit } from '../src/init.js';

describe('parseEnv', () => {
  it('returns empty object for non-existent file', () => {
    expect(parseEnv('/nonexistent/.env')).toEqual({});
  });

  it('parses key=value pairs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'init-test-'));
    const envPath = join(dir, '.env');
    writeFileSync(envPath, 'JULES_API_KEY=sk-1234\nJULES_DEFAULT_SOURCE=src\n');
    const result = parseEnv(envPath);
    expect(result.JULES_API_KEY).toBe('sk-1234');
    expect(result.JULES_DEFAULT_SOURCE).toBe('src');
    rmSync(dir, { recursive: true });
  });

  it('handles quoted values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'init-test-'));
    const envPath = join(dir, '.env');
    writeFileSync(envPath, 'KEY="value with spaces"\n');
    const result = parseEnv(envPath);
    expect(result.KEY).toBe('value with spaces');
    rmSync(dir, { recursive: true });
  });

  it('skips comments and empty lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'init-test-'));
    const envPath = join(dir, '.env');
    writeFileSync(envPath, '# comment\n\nKEY=val\n');
    const result = parseEnv(envPath);
    expect(result).toEqual({ KEY: 'val' });
    rmSync(dir, { recursive: true });
  });
});

describe('runInit (non-interactive)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'init-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it('writes .env with provided values', async () => {
    const result = await runInit({
      apiKey: 'sk-test-key',
      source: 'sources/github/owner/repo',
      branch: 'develop',
      interactive: false,
      projectDir: dir,
    });

    expect(result.created).toBe(true);
    expect(result.backed).toBe(false);
    expect(result.values.apiKey).toBe('sk-test-key');
    expect(result.values.source).toBe('sources/github/owner/repo');
    expect(result.values.branch).toBe('develop');

    const envPath = join(dir, '.env');
    expect(existsSync(envPath)).toBe(true);
    const content = readFileSync(envPath, 'utf8');
    expect(content).toContain('JULES_API_KEY=sk-test-key');
    expect(content).toContain('JULES_DEFAULT_SOURCE=sources/github/owner/repo');
    expect(content).toContain('JULES_DEFAULT_BRANCH=develop');
  });

  it('throws when no api-key provided in non-interactive mode', async () => {
    await expect(
      runInit({ interactive: false, projectDir: dir }),
    ).rejects.toThrow('Non-interactive mode requires --api-key');
  });

  it('defaults branch to main when not provided', async () => {
    const result = await runInit({
      apiKey: 'sk-key',
      interactive: false,
      projectDir: dir,
    });
    expect(result.values.branch).toBe('main');
  });

  it('backs up existing .env before overwriting', async () => {
    const envPath = join(dir, '.env');
    writeFileSync(envPath, 'JULES_API_KEY=old-key\n');

    const result = await runInit({
      apiKey: 'sk-new-key',
      interactive: false,
      projectDir: dir,
    });

    expect(result.backed).toBe(true);
    const backupPath = join(dir, '.env.backup');
    expect(existsSync(backupPath)).toBe(true);
    const backup = readFileSync(backupPath, 'utf8');
    expect(backup).toContain('old-key');
  });

  it('new .env contains correct content', async () => {
    await runInit({
      apiKey: 'sk-abc',
      source: 'my-source',
      branch: 'dev',
      interactive: false,
      projectDir: dir,
    });

    const content = readFileSync(join(dir, '.env'), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('JULES_API_KEY=sk-abc');
    expect(lines[1]).toBe('JULES_DEFAULT_SOURCE=my-source');
    expect(lines[2]).toBe('JULES_DEFAULT_BRANCH=dev');
  });
});

describe('init CLI command', () => {
  it('non-interactive without --api-key shows error', () => {
    const { execSync } = require('node:child_process');
    try {
      execSync('npx tsx src/cli.ts init', {
        encoding: 'utf8',
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      expect.unreachable('Should have exited');
    } catch (err: unknown) {
      const e = err as { stderr?: string; stdout?: string };
      const output = (e.stderr ?? '') + (e.stdout ?? '');
      expect(output.length).toBeGreaterThan(0);
    }
  });

  it('non-interactive with --api-key writes config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'init-test-'));
    const { execSync } = require('node:child_process');
    execSync(`npx tsx src/cli.ts --api-key sk-test -p ${dir} init --source src`, {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const envPath = join(dir, '.env');
    expect(existsSync(envPath)).toBe(true);
    const content = readFileSync(envPath, 'utf8');
    expect(content).toContain('JULES_API_KEY=sk-test');
    rmSync(dir, { recursive: true });
  });
});
