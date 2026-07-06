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

export function loadConfig(projectDir: string, options: LoadConfigOptions = {}): JulesConfig {
  const envPath = resolve(projectDir, '.env');

  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    const parsed = parseDotenv(envContent);
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) process.env[key] = value;
    }
  }

  const apiKey = options.apiKeyOverride ?? process.env.JULES_API_KEY ?? '';
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
  const autoMode = (rawAuto === '' ? 'AUTO_CREATE_PR' : rawAuto) as JulesConfig['autoMode'];

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

export function validateTask(task: TaskDefinition, filePath: string): TaskDefinition {
  if (!task || typeof task !== 'object') throw new Error(`Invalid task definition in ${filePath}`);
  if (!task.title) throw new Error(`Missing "title" in ${filePath}`);
  if (!task.prompt) throw new Error(`Missing "prompt" in ${filePath}`);
  return task;
}
