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
  values: { apiKey: string; source: string; branch: string };
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const envPath = resolve(options.projectDir, '.env');
  const existingValues = parseEnv(envPath);
  let apiKey = options.apiKey ?? '';
  let source = options.source ?? '';
  let branch = options.branch ?? '';

  if (!options.interactive && !apiKey) {
    throw new Error('Non-interactive mode requires --api-key. Use --api-key and optionally --source.');
  }

  if (options.interactive) {
    apiKey = await promptFor('Jules API key', existingValues.JULES_API_KEY ?? apiKey);
    source = await promptFor('Default source (e.g. sources/github/owner/repo)', existingValues.JULES_DEFAULT_SOURCE ?? source);
    branch = await promptFor('Default branch', existingValues.JULES_DEFAULT_BRANCH ?? (branch || 'main'));
  }

  let backed = false;
  if (existsSync(envPath)) {
    const backupPath = resolve(options.projectDir, '.env.backup');
    copyFileSync(envPath, backupPath);
    backed = true;
  }

  const lines = [
    `JULES_API_KEY=${apiKey}`,
    `JULES_DEFAULT_SOURCE=${source}`,
    `JULES_DEFAULT_BRANCH=${branch || 'main'}`,
  ];
  writeFileSync(envPath, lines.join('\n') + '\n');

  return {
    envPath,
    created: true,
    backed,
    values: { apiKey, source, branch: branch || 'main' },
  };
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
