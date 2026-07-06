import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

export interface InitOptions {
  apiKey?: string;
  source?: string;
  branch?: string;
  interactive: boolean;
  projectDir: string;
}

export interface InitResult {
  envPath: string;
  created: boolean;
  backed: boolean;
  /** Absolute path of the backup written for this run, if any. */
  backupPath?: string;
  values: { apiKey: string; source: string; branch: string };
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const envPath = resolve(options.projectDir, '.env');
  const existingValues = parseEnv(envPath);
  let apiKey = options.apiKey ?? '';
  // Fall back to existing .env values when not explicitly provided, so a
  // re-run of `init` in non-interactive mode does not wipe previously
  // configured defaults.
  let source = options.source ?? existingValues.JULES_DEFAULT_SOURCE ?? '';
  let branch = options.branch ?? existingValues.JULES_DEFAULT_BRANCH ?? '';

  if (!options.interactive && !apiKey) {
    throw new Error('Non-interactive mode requires --api-key. Use --api-key and optionally --source.');
  }

  if (options.interactive) {
    apiKey = await promptFor('Jules API key', existingValues.JULES_API_KEY ?? apiKey);
    source = await promptFor('Default source (e.g. sources/github/owner/repo)', source);
    branch = await promptFor('Default branch', branch || 'main');
  }

  let backed = false;
  let backupPath = '';
  if (existsSync(envPath)) {
    backupPath = nextAvailableBackupPath(options.projectDir);
    copyFileSync(envPath, backupPath);
    backed = true;
  }

  const lines = [
    `JULES_API_KEY=${formatEnvValue(apiKey)}`,
    `JULES_DEFAULT_SOURCE=${formatEnvValue(source)}`,
    `JULES_DEFAULT_BRANCH=${formatEnvValue(branch || 'main')}`,
  ];
  writeFileSync(envPath, lines.join('\n') + '\n');

  return {
    envPath,
    created: true,
    backed,
    backupPath: backed ? backupPath : undefined,
    values: { apiKey, source, branch: branch || 'main' },
  };
}

/**
 * Pick a backup path that doesn't clobber an existing backup. The first
 * re-run produces `.env.backup`; a second produces `.env.backup.1`, then
 * `.env.backup.2`, and so on — so re-running `init` never destroys the
 * previous backup.
 */
function nextAvailableBackupPath(projectDir: string): string {
  const base = resolve(projectDir, '.env.backup');
  if (!existsSync(base)) return base;
  for (let i = 1; ; i++) {
    const candidate = resolve(projectDir, `.env.backup.${i}`);
    if (!existsSync(candidate)) return candidate;
  }
}

/**
 * Quote a .env value when it contains characters that dotenv would
 * misinterpret: whitespace, `#` (comment), `=` (key/value boundary), or
 * quote characters. Simple values (typical branches / source ids / keys
 * without spaces) are emitted bare for readability.
 */
function formatEnvValue(value: string): string {
  if (value === '') return '""';
  // Quote if: leading/trailing whitespace, or any of #, =, ", ', or newline.
  if (/[#="'\n\r]/.test(value) || /^\s|\s$/.test(value)) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}

export async function promptFor(label: string, defaultVal: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const suffix = defaultVal ? ` [${defaultVal}]` : '';
    rl.question(`${label}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal);
    });
  });
}

export function parseEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const content = readFileSync(path, 'utf8');
  const result: Record<string, string> = {};
  for (const rawLine of content.split('\n')) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}
