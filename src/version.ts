import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedVersion = '';

/**
 * Package version, read once from the package.json one level above this
 * module's directory — resolves in both src/ (dev) and dist/ (published).
 * Reading it dynamically keeps the MCP server registration and `--version`
 * output in lockstep with the npm version instead of a hardcoded literal.
 */
export function packageVersion(): string {
  if (!cachedVersion) {
    cachedVersion = (JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
    ) as { version: string }).version;
  }
  return cachedVersion;
}
