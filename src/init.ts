import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parse as parseDotenv } from 'dotenv';

const MANAGED_ENV_KEYS = [
  'JULES_API_KEY',
  'JULES_DEFAULT_SOURCE',
  'JULES_DEFAULT_BRANCH',
] as const;

type ManagedEnvKey = typeof MANAGED_ENV_KEYS[number];

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
    apiKey = await promptFor('Jules API key', existingValues.JULES_API_KEY ?? apiKey, false);
    source = await promptFor('Default source (e.g. sources/github/owner/repo)', source);
    branch = await promptFor('Default branch', branch || 'main');
  }

  apiKey = apiKey.trim();
  if (!apiKey) {
    throw new Error('Jules API key cannot be blank. Enter a key or pass --api-key.');
  }

  let backed = false;
  let backupPath = '';
  if (existsSync(envPath)) {
    backupPath = nextAvailableBackupPath(options.projectDir);
    copyFileSync(envPath, backupPath);
    backed = true;
  }

  const managedValues: Record<ManagedEnvKey, string> = {
    JULES_API_KEY: apiKey,
    JULES_DEFAULT_SOURCE: source,
    JULES_DEFAULT_BRANCH: branch || 'main',
  };
  const existingContent = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  writeFileSync(envPath, updateManagedEnv(existingContent, managedValues));

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
  if (!/[#="'`\s\n\r]/.test(value)) return value;
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error('Environment values cannot contain newline characters');
  }
  // Dotenv does not unescape an embedded quote delimiter, so choose one that
  // is absent from the value. Prefer double quotes for conventional .env
  // output, then fall back to the literal single-quote/backtick forms.
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('`')) return `\`${value}\``;
  throw new Error('Environment value cannot contain single, double, and backtick quotes together');
}

function updateManagedEnv(
  existingContent: string,
  values: Record<ManagedEnvKey, string>,
): string {
  if (!existingContent) {
    return MANAGED_ENV_KEYS
      .map(key => `${key}=${formatEnvValue(values[key])}`)
      .join('\n') + '\n';
  }

  const eol = existingContent.includes('\r\n') ? '\r\n' : '\n';
  const lines = existingContent.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  const written = new Set<ManagedEnvKey>();
  const output: string[] = [];

  for (const line of lines) {
    const match = /^\s*(?:export\s+)?(JULES_API_KEY|JULES_DEFAULT_SOURCE|JULES_DEFAULT_BRANCH)\s*=/.exec(line);
    if (!match) {
      output.push(line);
      continue;
    }

    const key = match[1] as ManagedEnvKey;
    if (written.has(key)) continue;
    output.push(`${key}=${formatEnvValue(values[key])}`);
    written.add(key);
  }

  for (const key of MANAGED_ENV_KEYS) {
    if (!written.has(key)) output.push(`${key}=${formatEnvValue(values[key])}`);
  }
  return output.join(eol) + eol;
}

export function buildPromptText(label: string, defaultVal: string, revealDefault = true): string {
  if (!defaultVal) return `${label}: `;
  return `${label} [${revealDefault ? defaultVal : 'keep existing'}]: `;
}

export async function promptFor(
  label: string,
  defaultVal: string,
  revealDefault = true,
): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(buildPromptText(label, defaultVal, revealDefault), (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal);
    });
  });
}

export function parseEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return parseDotenv(readFileSync(path, 'utf8'));
}
