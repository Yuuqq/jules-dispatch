import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, loadTasks, loadTasksFromDir, loadTasksFromString, validateTask } from '../src/config.js';

const envKeys = [
  'JULES_API_KEY',
  'JULES_DEFAULT_SOURCE',
  'JULES_DEFAULT_BRANCH',
  'JULES_AUTO_MODE',
] as const;

const originalEnv = new Map<string, string | undefined>();

for (const key of envKeys) {
  originalEnv.set(key, process.env[key]);
}

afterEach(() => {
  for (const key of envKeys) {
    const original = originalEnv.get(key);
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

function withEnvFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'jules-dispatch-config-'));
  writeFileSync(join(dir, '.env'), content);
  return dir;
}

describe('loadConfig .env parsing', () => {
  it('parses quoted values and export-prefixed assignments', () => {
    for (const key of envKeys) delete process.env[key];
    const dir = withEnvFile([
      'export JULES_API_KEY="test key"',
      'JULES_DEFAULT_SOURCE="sources/github/owner/repo"',
      "JULES_DEFAULT_BRANCH='feature/test'",
      'JULES_AUTO_MODE=NONE',
    ].join('\n'));

    try {
      const config = loadConfig(dir);

      expect(config.apiKey).toBe('test key');
      expect(config.defaultSource).toBe('sources/github/owner/repo');
      expect(config.defaultBranch).toBe('feature/test');
      expect(config.autoMode).toBe('NONE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not override existing environment variables from .env', () => {
    for (const key of envKeys) delete process.env[key];
    process.env.JULES_API_KEY = 'env-key';
    const dir = withEnvFile('JULES_API_KEY=file-key\nJULES_DEFAULT_BRANCH=develop\n');

    try {
      const config = loadConfig(dir);

      expect(config.apiKey).toBe('env-key');
      expect(config.defaultBranch).toBe('develop');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects unsupported JULES_AUTO_MODE values', () => {
    for (const key of envKeys) delete process.env[key];
    const dir = withEnvFile('JULES_API_KEY=test-key\nJULES_AUTO_MODE=automatic\n');

    try {
      expect(() => loadConfig(dir, { noExit: true })).toThrow(/JULES_AUTO_MODE/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects blank or whitespace-only API keys', () => {
    for (const key of envKeys) delete process.env[key];
    const dir = withEnvFile('JULES_API_KEY="   "\n');

    try {
      expect(() => loadConfig(dir, { noExit: true })).toThrow('JULES_API_KEY is required');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('trims source and falls back to main for a blank branch', () => {
    for (const key of envKeys) delete process.env[key];
    process.env.JULES_API_KEY = 'test-key';
    process.env.JULES_DEFAULT_SOURCE = '  sources/github/owner/repo  ';
    process.env.JULES_DEFAULT_BRANCH = '   ';
    const dir = withEnvFile('');

    try {
      const config = loadConfig(dir);

      expect(config.defaultSource).toBe('sources/github/owner/repo');
      expect(config.defaultBranch).toBe('main');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('task validation', () => {
  it('rejects an empty JSON task array', () => {
    expect(() => loadTasksFromString('[]', 'json')).toThrow('No tasks found in input');
  });

  it.each([
    [{ title: 42, prompt: 'Do work' }, 'title'],
    [{ title: 'Task', prompt: false }, 'prompt'],
    [{ title: 'Task', prompt: 'Do work', source: 42 }, 'source'],
    [{ title: 'Task', prompt: 'Do work', branch: false }, 'branch'],
    [{ title: 'Task', prompt: 'Do work', autoMode: 'AUTOMATIC' }, 'autoMode'],
    [{ title: 'Task', prompt: 'Do work', requirePlanApproval: 'yes' }, 'requirePlanApproval'],
  ])('rejects invalid field types or values for %s', (task, field) => {
    expect(() => validateTask(task as never, 'task.yaml')).toThrow(new RegExp(String(field)));
  });

  it.each([
    [{ title: '   ', prompt: 'Do work' }, 'title'],
    [{ title: 'Task', prompt: '\n\t' }, 'prompt'],
    [{ title: 'Task', prompt: 'Do work', source: '   ' }, 'source'],
    [{ title: 'Task', prompt: 'Do work', branch: '' }, 'branch'],
  ])('rejects blank values for %s', (task, field) => {
    expect(() => validateTask(task as never, 'task.yaml')).toThrow(new RegExp(String(field)));
  });

  it('returns normalized string fields', () => {
    expect(validateTask({
      title: '  Task  ',
      prompt: '\n  Do work  \n',
      source: '  sources/github/owner/repo  ',
      branch: '  main  ',
      autoMode: 'NONE',
      requirePlanApproval: true,
    }, 'task.yaml')).toEqual({
      title: 'Task',
      prompt: 'Do work',
      source: 'sources/github/owner/repo',
      branch: 'main',
      autoMode: 'NONE',
      requirePlanApproval: true,
    });
  });

  it('interprets repo owner/repo as sources/github/owner/repo', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(validateTask({
        title: 'Task',
        prompt: 'Do work',
        repo: 'acme/api',
      }, 'task.yaml')).toMatchObject({
        source: 'sources/github/acme/api',
      });
      expect(warn.mock.calls.some(call => String(call[0]).includes('"repo"'))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('warns about unknown fields without failing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const task = validateTask({
        title: 'Task',
        prompt: 'Do work',
        assignee: 'jules',
      }, 'task.yaml');
      expect(task.title).toBe('Task');
      expect(warn.mock.calls.some(call => String(call[0]).includes('assignee'))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('throws a clear error when the task file is missing', () => {
    expect(() => loadTasks(join(tmpdir(), 'jules-dispatch-missing-task.yaml'))).toThrow(/Task file not found/);
  });
});

describe('loadTasksFromDir', () => {
  it('skips nested files unless recursive is set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jules-tasks-'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mkdirSync(join(dir, 'nested'));
      writeFileSync(join(dir, 'root.yaml'), 'title: Root\nprompt: do root\n');
      writeFileSync(join(dir, 'nested', 'child.yaml'), 'title: Child\nprompt: do child\n');

      const top = loadTasksFromDir(dir);
      expect(top.map(entry => entry.file)).toEqual(['root.yaml']);
      expect(warn.mock.calls.some(call => String(call[0]).includes('--recursive'))).toBe(true);

      const all = loadTasksFromDir(dir, { recursive: true });
      expect(all.map(entry => entry.file).sort()).toEqual(['nested/child.yaml', 'root.yaml']);
    } finally {
      warn.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
