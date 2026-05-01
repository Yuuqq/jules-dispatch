import { resolve } from 'node:path';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import type { JulesConfig, DispatchResult, TaskDefinition } from './types.js';
import { JulesClient } from './client.js';
import { loadTask } from './config.js';

export async function dispatchTask(
  client: JulesClient,
  config: JulesConfig,
  taskFile: string,
  options?: { source?: string; branch?: string },
): Promise<DispatchResult> {
  const absPath = resolve(taskFile);
  const task = loadTask(absPath);

  const source = options?.source || task.source || config.defaultSource;
  const branch = options?.branch || task.branch || config.defaultBranch;
  const autoMode = task.autoMode ?? config.autoMode;

  if (!source) {
    return { taskFile, sessionId: '', sessionUrl: '', title: task.title, status: 'failed', error: 'No source configured. Set JULES_DEFAULT_SOURCE or add source to task.' };
  }

  try {
    const session = await client.createSession({
      prompt: task.prompt,
      source,
      branch,
      title: task.title,
      autoMode,
      requirePlanApproval: task.requirePlanApproval,
    });

    return {
      taskFile,
      sessionId: session.id,
      sessionUrl: session.url,
      title: task.title,
      status: 'dispatched',
    };
  } catch (err) {
    return {
      taskFile,
      sessionId: '',
      sessionUrl: '',
      title: task.title,
      status: 'failed',
      error: (err as Error).message,
    };
  }
}

export async function dispatchBatch(
  client: JulesClient,
  config: JulesConfig,
  taskDir: string,
  options?: { source?: string; branch?: string; parallel?: number },
): Promise<DispatchResult[]> {
  const { readdirSync } = require('node:fs');
  const files = readdirSync(taskDir)
    .filter((f: string) => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.log('No task files found in', taskDir);
    return [];
  }

  console.log(`Dispatching ${files.length} tasks...\n`);

  const parallel = options?.parallel ?? 10;
  const results: DispatchResult[] = [];

  // Dispatch in batches to respect parallelism limit
  for (let i = 0; i < files.length; i += parallel) {
    const batch = files.slice(i, i + parallel);
    const batchResults = await Promise.all(
      batch.map((f: string) =>
        dispatchTask(client, config, resolve(taskDir, f), options),
      ),
    );
    results.push(...batchResults);

    for (const r of batchResults) {
      const icon = r.status === 'dispatched' ? '✓' : '✗';
      console.log(`  ${icon} ${r.title}`);
      if (r.sessionUrl) console.log(`    ${r.sessionUrl}`);
      if (r.error) console.log(`    Error: ${r.error}`);
    }
  }

  // Write dispatch log
  const logDir = resolve(taskDir, '..', '.dispatch-logs');
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = resolve(logDir, `dispatch-${timestamp}.json`);
  writeFileSync(logFile, JSON.stringify(results, null, 2));
  console.log(`\nDispatch log: ${logFile}`);

  return results;
}
