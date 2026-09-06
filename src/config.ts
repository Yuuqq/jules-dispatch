import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseAllDocuments } from 'yaml';
import { parse as parseDotenv } from 'dotenv';
import type { JulesConfig, TaskDefinition } from './types.js';

export interface LoadConfigOptions {
  apiKeyOverride?: string;
  /** When true, do not exit on missing API key; throw instead. Used by MCP server. */
  noExit?: boolean;
}

const TASK_FILE_EXT = /\.(ya?ml|json)$/i;
const KNOWN_TASK_FIELDS = new Set([
  'title',
  'prompt',
  'source',
  'branch',
  'autoMode',
  'requirePlanApproval',
]);

export function loadProjectEnv(projectDir: string): Record<string, string> {
  const envPath = resolve(projectDir, '.env');
  if (!existsSync(envPath)) return {};

  const parsed = parseDotenv(readFileSync(envPath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return parsed;
}

export function loadConfig(projectDir: string, options: LoadConfigOptions = {}): JulesConfig {
  loadProjectEnv(projectDir);

  const apiKey = (options.apiKeyOverride ?? process.env.JULES_API_KEY ?? '').trim();
  if (!apiKey) {
    const msg = 'JULES_API_KEY is required. Set it in .env, pass --api-key, or set the JULES_API_KEY environment variable.';
    if (options.noExit) throw new Error(msg);
    // Match the structured error formatting used everywhere else (✗ red,
    // followed by a Fix: hint) instead of a bare console.error line.
    console.error(msg);
    console.error('Fix: run `jules-dispatch init`, or set JULES_API_KEY in .env / the environment.');
    process.exit(2);
  }

  // Normalise empty string autoMode to a meaningful default, and uppercase so
  // users can write `JULES_AUTO_MODE=none` or `None` and still match the
  // 'AUTO_CREATE_PR' | 'NONE' union the API expects.
  const rawAuto = (process.env.JULES_AUTO_MODE ?? '').trim().toUpperCase();
  if (rawAuto !== '' && rawAuto !== 'AUTO_CREATE_PR' && rawAuto !== 'NONE') {
    throw new Error(
      'Invalid JULES_AUTO_MODE: expected AUTO_CREATE_PR or NONE',
    );
  }
  const autoMode: JulesConfig['autoMode'] = rawAuto === '' ? 'AUTO_CREATE_PR' : rawAuto;

  return {
    apiKey,
    defaultSource: (process.env.JULES_DEFAULT_SOURCE ?? '').trim(),
    defaultBranch: (process.env.JULES_DEFAULT_BRANCH ?? '').trim() || 'main',
    autoMode,
    projectDir,
  };
}

function readTaskFile(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(`Task file not found: ${filePath}`);
    }
    throw err;
  }
}

export function loadTasks(filePath: string): TaskDefinition[] {
  const content = readTaskFile(filePath);

  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    const docs = parseAllDocuments(content).filter(d => d.contents !== null);
    if (docs.length === 0) throw new Error(`No YAML documents found in ${filePath}`);
    return docs.map(doc => validateTask(doc.toJS() as TaskDefinition, filePath));
  }

  const parsed = JSON.parse(content) as TaskDefinition | TaskDefinition[];
  const tasks = Array.isArray(parsed) ? parsed : [parsed];
  if (tasks.length === 0) throw new Error(`No tasks found in ${filePath}`);
  return tasks.map(t => validateTask(t, filePath));
}

export function loadTask(filePath: string): TaskDefinition {
  const tasks = loadTasks(filePath);
  if (tasks.length === 0) throw new Error(`No tasks found in ${filePath}`);
  if (tasks.length > 1) {
    console.warn(
      `Warning: ${filePath} contains ${tasks.length} task documents. ` +
      `Only the first will be dispatched. Use "batch" to dispatch all.`,
    );
  }
  return tasks[0];
}

export function loadTasksFromString(content: string, format: 'yaml' | 'json' = 'yaml'): TaskDefinition[] {
  if (format === 'yaml') {
    const docs = parseAllDocuments(content).filter(d => d.contents !== null);
    if (docs.length === 0) throw new Error('No YAML documents found in input');
    return docs.map(doc => validateTask(doc.toJS() as TaskDefinition, '<stdin>'));
  }
  const parsed = JSON.parse(content) as TaskDefinition | TaskDefinition[];
  const tasks = Array.isArray(parsed) ? parsed : [parsed];
  if (tasks.length === 0) throw new Error('No tasks found in input');
  return tasks.map(t => validateTask(t, '<stdin>'));
}

export interface LoadTasksFromDirOptions {
  /** When true, include .yaml/.yml/.json files in subdirectories. Default: false. */
  recursive?: boolean;
}

export function loadTasksFromDir(
  dir: string,
  options: LoadTasksFromDirOptions = {},
): Array<{ file: string; tasks: TaskDefinition[] }> {
  let files: string[];
  try {
    files = listTaskFiles(dir, Boolean(options.recursive));
  } catch (err) {
    // readdirSync throws ENOENT for a missing dir and ENOTDIR when `dir` is a
    // file. Surface a clear, actionable message instead of a raw syscall.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(`Task directory not found: ${dir}`);
    }
    if (code === 'ENOTDIR') {
      throw new Error(`Expected a directory but found a file: ${dir}`);
    }
    throw err;
  }

  if (!options.recursive) {
    const nested = countNestedTaskFiles(dir);
    if (nested > 0) {
      console.warn(
        `Warning: ${nested} task file(s) in subdirectories of ${dir} were skipped. ` +
        `Pass --recursive to include them.`,
      );
    }
  }

  return files.map(f => ({
    file: f,
    tasks: loadTasks(resolve(dir, f)),
  }));
}

/** Count task files in subdirectories (not the directory itself). */
export function countNestedTaskFiles(dir: string): number {
  return listTaskFiles(dir, true).filter(f => f.includes('/')).length;
}

function listTaskFiles(dir: string, recursive: boolean): string[] {
  const out: string[] = [];
  const walk = (current: string, prefix: string): void => {
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (recursive) walk(join(current, entry.name), rel);
        continue;
      }
      if (TASK_FILE_EXT.test(entry.name)) out.push(rel);
    }
  };
  walk(dir, '');
  return out.sort();
}

export function validateTask(task: unknown, filePath: string): TaskDefinition {
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    throw new Error(`Invalid task definition in ${filePath}: expected an object`);
  }

  const input = task as Record<string, unknown>;
  warnUnknownTaskFields(input, filePath);

  const title = requiredTaskString(input.title, 'title', filePath);
  const prompt = requiredTaskString(input.prompt, 'prompt', filePath);
  const source = resolveTaskSource(input, filePath);
  const branch = optionalTaskString(input.branch, 'branch', filePath);

  let autoMode: TaskDefinition['autoMode'];
  if (input.autoMode !== undefined) {
    if (input.autoMode !== 'AUTO_CREATE_PR' && input.autoMode !== 'NONE') {
      throw new Error(
        `Invalid "autoMode" in ${filePath}: expected "AUTO_CREATE_PR" or "NONE"`,
      );
    }
    autoMode = input.autoMode;
  }

  let requirePlanApproval: boolean | undefined;
  if (input.requirePlanApproval !== undefined) {
    if (typeof input.requirePlanApproval !== 'boolean') {
      throw new Error(`Invalid "requirePlanApproval" in ${filePath}: expected a boolean`);
    }
    requirePlanApproval = input.requirePlanApproval;
  }

  return {
    title,
    prompt,
    ...(source !== undefined ? { source } : {}),
    ...(branch !== undefined ? { branch } : {}),
    ...(autoMode !== undefined ? { autoMode } : {}),
    ...(requirePlanApproval !== undefined ? { requirePlanApproval } : {}),
  };
}

/**
 * Accept the documented `source` field, and recover from the common first-user
 * mistake of writing `repo: owner/repo` (as used on some older docs pages).
 */
export function resolveTaskSource(
  input: Record<string, unknown>,
  filePath: string,
): string | undefined {
  const source = optionalTaskString(input.source, 'source', filePath);
  if (source !== undefined) {
    if (input.repo !== undefined) {
      console.warn(
        `Warning: ${filePath} has both "source" and "repo". Using "source" and ignoring "repo". ` +
        `Task files use source: sources/github/owner/repo.`,
      );
    }
    return source;
  }

  if (input.repo === undefined) return undefined;
  if (typeof input.repo !== 'string' || !input.repo.trim()) {
    throw new Error(`Invalid "repo" in ${filePath}: expected a string like owner/repo`);
  }

  const raw = input.repo.trim();
  const interpreted = raw.startsWith('sources/')
    ? raw
    : `sources/github/${raw.replace(/^github\//, '')}`;
  console.warn(
    `Warning: ${filePath} uses "repo" which is not a task field. ` +
    `Interpreted as source "${interpreted}". Use "source: sources/github/owner/repo" instead.`,
  );
  return interpreted;
}

function warnUnknownTaskFields(input: Record<string, unknown>, filePath: string): void {
  const extra = Object.keys(input).filter(key => !KNOWN_TASK_FIELDS.has(key) && key !== 'repo');
  if (extra.length === 0) return;
  console.warn(
    `Warning: ${filePath} has unknown field(s) ${extra.map(k => `"${k}"`).join(', ')} which will be ignored.`,
  );
}

function requiredTaskString(value: unknown, field: string, filePath: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid "${field}" in ${filePath}: expected a string`);
  }
  const normalized = value.trim();
  if (!normalized) throw new Error(`Invalid "${field}" in ${filePath}: value cannot be blank`);
  return normalized;
}

function optionalTaskString(
  value: unknown,
  field: string,
  filePath: string,
): string | undefined {
  if (value === undefined) return undefined;
  return requiredTaskString(value, field, filePath);
}
