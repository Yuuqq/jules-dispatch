import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml, parseAllDocuments } from 'yaml';
import type { JulesConfig, TaskDefinition } from './types.js';

export function loadConfig(projectDir: string): JulesConfig {
  const envPath = resolve(projectDir, '.env');

  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }

  const apiKey = process.env.JULES_API_KEY ?? '';
  if (!apiKey) {
    console.error('JULES_API_KEY is required. Set it in .env or as an environment variable.');
    process.exit(1);
  }

  return {
    apiKey,
    defaultSource: process.env.JULES_DEFAULT_SOURCE ?? '',
    defaultBranch: process.env.JULES_DEFAULT_BRANCH ?? 'main',
    autoMode: (process.env.JULES_AUTO_MODE as JulesConfig['autoMode']) ?? 'AUTO_CREATE_PR',
  };
}

export function loadTasks(filePath: string): TaskDefinition[] {
  const content = readFileSync(filePath, 'utf8');

  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    const docs = parseAllDocuments(content);
    if (docs.length === 0) throw new Error(`No YAML documents found in ${filePath}`);
    return docs.map(doc => validateTask(doc.toJS() as TaskDefinition, filePath));
  }

  const parsed = JSON.parse(content) as TaskDefinition | TaskDefinition[];
  const tasks = Array.isArray(parsed) ? parsed : [parsed];
  return tasks.map(t => validateTask(t, filePath));
}

export function loadTask(filePath: string): TaskDefinition {
  const tasks = loadTasks(filePath);
  if (tasks.length > 1) {
    console.warn(
      `Warning: ${filePath} contains ${tasks.length} task documents. ` +
      `Only the first will be dispatched. Use "batch" to dispatch all.`,
    );
  }
  return tasks[0];
}

export function loadTasksFromDir(dir: string): Array<{ file: string; tasks: TaskDefinition[] }> {
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json'))
    .sort();

  return files.map(f => ({
    file: f,
    tasks: loadTasks(resolve(dir, f)),
  }));
}

function validateTask(task: TaskDefinition, filePath: string): TaskDefinition {
  if (!task || typeof task !== 'object') throw new Error(`Invalid task definition in ${filePath}`);
  if (!task.title) throw new Error(`Missing "title" in ${filePath}`);
  if (!task.prompt) throw new Error(`Missing "prompt" in ${filePath}`);
  return task;
}
