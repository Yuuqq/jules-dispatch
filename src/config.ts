import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAllDocuments } from 'yaml';
import { parse as parseDotenv } from 'dotenv';
import type { JulesConfig, TaskDefinition } from './types.js';

export interface LoadConfigOptions {
  apiKeyOverride?: string;
  /** When true, do not exit on missing API key; throw instead. Used by MCP server. */
  noExit?: boolean;
}

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
    defaultSource: process.env.JULES_DEFAULT_SOURCE ?? '',
    defaultBranch: process.env.JULES_DEFAULT_BRANCH ?? 'main',
    autoMode,
    projectDir,
  };
}

export function loadTasks(filePath: string): TaskDefinition[] {
  const content = readFileSync(filePath, 'utf8');

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

export function loadTasksFromDir(dir: string): Array<{ file: string; tasks: TaskDefinition[] }> {
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json'))
      .sort();
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

  return files.map(f => ({
    file: f,
    tasks: loadTasks(resolve(dir, f)),
  }));
}

export function validateTask(task: unknown, filePath: string): TaskDefinition {
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    throw new Error(`Invalid task definition in ${filePath}: expected an object`);
  }

  const input = task as Record<string, unknown>;
  const title = requiredTaskString(input.title, 'title', filePath);
  const prompt = requiredTaskString(input.prompt, 'prompt', filePath);
  const source = optionalTaskString(input.source, 'source', filePath);
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
