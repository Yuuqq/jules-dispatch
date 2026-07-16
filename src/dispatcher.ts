import { resolve } from 'node:path';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import chalk from 'chalk';
import type { JulesConfig, DispatchResult, TaskDefinition } from './types.js';
import { JulesClient } from './client.js';
import { loadTask, loadTasksFromDir } from './config.js';
import { isJson, emit, info } from './output.js';
import { translateError } from './errors.js';
import { validateBatchSize } from './batch.js';

export async function dispatchTask(
  client: JulesClient,
  config: JulesConfig,
  taskFile: string,
  options?: { source?: string; branch?: string },
): Promise<DispatchResult> {
  const absPath = resolve(taskFile);
  const task = loadTask(absPath);
  return dispatchTaskDefinition(client, config, task, absPath, options);
}

export async function dispatchTaskDefinition(
  client: JulesClient,
  config: JulesConfig,
  task: TaskDefinition,
  taskFile: string,
  options?: { source?: string; branch?: string },
): Promise<DispatchResult> {
  const source = options?.source ?? task.source ?? config.defaultSource;
  const branch = options?.branch ?? task.branch ?? config.defaultBranch;
  const autoMode = task.autoMode ?? config.autoMode;

  if (!source) {
    return {
      taskFile,
      taskTitle: task.title,
      sessionId: '',
      sessionUrl: '',
      title: task.title,
      status: 'failed',
      error: 'No source configured. Set JULES_DEFAULT_SOURCE in .env or add "source" to the task file.',
    };
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
      taskTitle: task.title,
      sessionId: session.id,
      sessionUrl: session.url,
      title: task.title,
      status: 'dispatched',
    };
  } catch (err) {
    return {
      taskFile,
      taskTitle: task.title,
      sessionId: '',
      sessionUrl: '',
      title: task.title,
      status: 'failed',
      error: translateError(err).problem,
    };
  }
}

export interface DispatchBatchOptions {
  source?: string;
  branch?: string;
  parallel?: number;
  /** Where to write the dispatch log JSON. Default: `<projectDir>/.dispatch-logs`. Pass `false` to disable. */
  logDir?: string | false;
}

export async function dispatchBatch(
  client: JulesClient,
  config: JulesConfig,
  taskDir: string,
  options: DispatchBatchOptions = {},
): Promise<DispatchResult[]> {
  const taskFiles = loadTasksFromDir(taskDir);

  if (taskFiles.length === 0) {
    info(chalk.yellow('No task files found in ') + taskDir);
    return [];
  }

  const allTasks: Array<{ file: string; task: TaskDefinition }> = [];
  for (const { file, tasks } of taskFiles) {
    for (const task of tasks) {
      allTasks.push({ file: resolve(taskDir, file), task });
    }
  }

  info(chalk.bold(`Dispatching ${allTasks.length} task(s) from ${taskFiles.length} file(s)...\n`));

  const parallel = options.parallel ?? 10;
  validateBatchSize(parallel);
  const results: DispatchResult[] = [];

  for (let i = 0; i < allTasks.length; i += parallel) {
    const batch = allTasks.slice(i, i + parallel);

    const batchResults = await Promise.all(
      batch.map(({ file, task }) =>
        dispatchTaskDefinition(client, config, task, file, options),
      ),
    );
    results.push(...batchResults);

    if (!isJson()) {
      // Pair each prompt line with its own result so the per-task status
      // aligns under its title (previously all prompts were written without
      // newlines first, then all results were logged, scrambling alignment).
      for (let j = 0; j < batch.length; j++) {
        const idx = i + j + 1;
        const r = batchResults[j];
        const tail = r.status === 'dispatched'
          ? chalk.green('dispatched')
          : chalk.red(`failed (${r.error ?? 'unknown'})`);
        console.log(`[${idx}/${allTasks.length}] ${batch[j].task.title}... ${tail}`);
      }

      const done = results.filter(r => r.status === 'dispatched').length;
      const failed = results.filter(r => r.status === 'failed').length;
      const pending = allTasks.length - results.length;
      const parts = [chalk.green(`DONE ${done}`)];
      if (failed > 0) parts.push(chalk.red(`FAILED ${failed}`));
      if (pending > 0) parts.push(chalk.dim(`PENDING ${pending}`));
      console.log(`  ${parts.join(' | ')}`);
    }
  }

  // Write dispatch log under the project dir, not next to taskDir.
  let logFile: string | null = null;
  let logWarning: string | undefined;
  if (options.logDir !== false) {
    try {
      const projectRoot = config.projectDir ?? process.cwd();
      const logDir = options.logDir ?? resolve(projectRoot, '.dispatch-logs');
      if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      logFile = resolve(logDir, `dispatch-${timestamp}.json`);
      writeFileSync(logFile, JSON.stringify(results, null, 2));
    } catch (err) {
      logFile = null;
      logWarning = `Dispatch succeeded, but the log could not be written: ${(err as Error).message}`;
    }
  }

  const dispatched = results.filter(r => r.status === 'dispatched');
  const failed = results.filter(r => r.status === 'failed');

  emit(
    () => {
      console.log(`\n${chalk.dim('━'.repeat(36))}`);
      console.log(
        ` ${chalk.green.bold(`Dispatched: ${dispatched.length}`)}, ${
          failed.length > 0 ? chalk.red.bold(`Failed: ${failed.length}`) : `Failed: 0`
        }`,
      );
      console.log(`${chalk.dim('━'.repeat(36))}`);
      if (logFile) console.log(chalk.dim(`\nDispatch log: ${logFile}`));
      if (logWarning) console.warn(chalk.yellow(`\nWarning: ${logWarning}`));
    },
    {
      summary: { total: results.length, dispatched: dispatched.length, failed: failed.length },
      results,
      logFile,
      ...(logWarning ? { warning: logWarning } : {}),
    },
  );

  return results;
}
