import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

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
});
