import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { JulesConfig, TaskDefinition } from './types.js';

export function loadConfig(projectDir: string): JulesConfig {
  const envPath = resolve(projectDir, '.env');
  if (!existsSync(envPath)) {
    console.error('No .env file found. Create one from .env.example');
    process.exit(1);
  }

  const envContent = readFileSync(envPath, 'utf8');
  const env: Record<string, string> = {};
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }

  const apiKey = env.JULES_API_KEY || process.env.JULES_API_KEY || '';
  if (!apiKey) {
    console.error('JULES_API_KEY is required in .env');
    process.exit(1);
  }

  return {
    apiKey,
    defaultSource: env.JULES_DEFAULT_SOURCE || '',
    defaultBranch: env.JULES_DEFAULT_BRANCH || 'main',
    autoMode: (env.JULES_AUTO_MODE as 'AUTO_CREATE_PR' | '') || 'AUTO_CREATE_PR',
  };
}

export function loadTask(filePath: string): TaskDefinition {
  const content = readFileSync(filePath, 'utf8');

  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    const parsed = parseYaml(content) as TaskDefinition;
    return validateTask(parsed, filePath);
  }

  const parsed = JSON.parse(content) as TaskDefinition;
  return validateTask(parsed, filePath);
}

export function loadTasksFromDir(dir: string): Array<{ file: string; task: TaskDefinition }> {
  const { readdirSync } = require('node:fs');
  const files = readdirSync(dir)
    .filter((f: string) => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json'))
    .sort();

  return files.map((f: string) => ({
    file: f,
    task: loadTask(resolve(dir, f)),
  }));
}

function validateTask(task: TaskDefinition, filePath: string): TaskDefinition {
  if (!task.title) throw new Error(`Missing "title" in ${filePath}`);
  if (!task.prompt) throw new Error(`Missing "prompt" in ${filePath}`);
  return task;
}
