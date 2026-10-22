import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

interface PackageJson {
  version: string;
  mcpName: string;
}

interface ServerJson {
  name: string;
  version: string;
  packages: Array<{ identifier: string; version: string }>;
}

describe('release metadata stays in sync', () => {
  const pkg = readJson<PackageJson>('package.json');
  const server = readJson<ServerJson>('server.json');

  it('server.json version matches package.json', () => {
    expect(server.version).toBe(pkg.version);
  });

  it('every published package entry matches package.json', () => {
    expect(server.packages.length).toBeGreaterThan(0);
    for (const entry of server.packages) {
      expect(entry.version).toBe(pkg.version);
      expect(entry.identifier).toBe('@yuuqq/jules-dispatch');
    }
  });

  it('server.json registry name matches package.json mcpName', () => {
    expect(server.name).toBe(pkg.mcpName);
  });

  it('CHANGELOG documents the current version', () => {
    const changelog = readFileSync('CHANGELOG.md', 'utf8');
    expect(changelog).toContain(`## [${pkg.version}]`);
  });
});
