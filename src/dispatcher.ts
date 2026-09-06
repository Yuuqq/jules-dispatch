import { resolve } from 'node:path';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import chalk from 'chalk';
import type { JulesConfig, DispatchResult, TaskDefinition } from './types.js';
import { JulesClient } from './client.js';
import { loadTask, loadTasksFromDir } from './config.js';
import { isJson, emit, info } from './output.js';
import { translateError } from './errors.js';
import { runBatches, validateBatchSize, validatePaceMs } from './batch.js';

const AUTH_STOP_CODES = new Set(['AUTH_FAILED', 'AUTH_MISSING']);

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
      errorCode: 'VALIDATION',
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
    const translated = translateError(err);
    return {
      taskFile,
      taskTitle: task.title,
      sessionId: '',
      sessionUrl: '',
      title: task.title,
      status: 'failed',
      error: translated.problem,
      errorCode: translated.code,
    };
  }
}

export interface DispatchBatchOptions {
  source?: string;
  branch?: string;
  parallel?: number;
  /** Minimum delay between Jules session creation starts. Default: 0. */
  paceMs?: number;
  /** Where to write the dispatch log JSON. Default: `<projectDir>/.dispatch-logs`. Pass `false` to disable. */
  logDir?: string | false;
  /** Include task files in subdirectories. Default: false. */
  recursive?: boolean;
}

export async function dispatchBatch(
  client: JulesClient,
  config: JulesConfig,
  taskDir: string,
  options: DispatchBatchOptions = {},
): Promise<DispatchResult[]> {
  const taskFiles = loadTasksFromDir(taskDir, { recursive: options.recursive });

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
  const paceMs = options.paceMs ?? 0;
  validateBatchSize(parallel);
  validatePaceMs(paceMs);
  let completedCount = 0;
  let dispatchedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let stopLaunching = false;
  let authStopMessage: string | undefined;

  const results = await runBatches(
    allTasks,
    parallel,
    async ({ file, task }, index) => {
      const result = await dispatchTaskDefinition(client, config, task, file, options);
      completedCount += 1;
      if (result.status === 'dispatched') dispatchedCount += 1;
      else failedCount += 1;

      if (result.errorCode && AUTH_STOP_CODES.has(result.errorCode)) {
        stopLaunching = true;
        authStopMessage ??= result.error;
      }

      if (!isJson()) {
        const tail = result.status === 'dispatched'
          ? chalk.green('dispatched')
          : chalk.red(`failed (${result.error ?? 'unknown'})`);
        console.log(`[${index + 1}/${allTasks.length}] ${task.title}... ${tail}`);

        const pending = allTasks.length - completedCount;
        const parts = [chalk.green(`DONE ${dispatchedCount}`)];
        if (failedCount > 0) parts.push(chalk.red(`FAILED ${failedCount}`));
        if (skippedCount > 0) parts.push(chalk.dim(`SKIPPED ${skippedCount}`));
        if (pending > 0) parts.push(chalk.dim(`PENDING ${pending}`));
        console.log(`  ${parts.join(' | ')}`);
      }

      return result;
    },
    { paceMs, shouldStop: () => stopLaunching },
  );

  for (let i = 0; i < results.length; i++) {
    if (results[i] !== undefined) continue;
    const { file, task } = allTasks[i];
    skippedCount += 1;
    results[i] = {
      taskFile: file,
      taskTitle: task.title,
      sessionId: '',
      sessionUrl: '',
      title: task.title,
      status: 'skipped',
      error: `Skipped after authentication failure${authStopMessage ? ` (${authStopMessage})` : ''}. Fix JULES_API_KEY and retry.`,
      errorCode: 'AUTH_FAILED',
    };
  }

  if (authStopMessage && !isJson()) {
    console.error(chalk.red(
      `\nStopped launching more tasks after authentication failure. ${skippedCount} remaining task(s) were skipped.`,
    ));
    console.error(chalk.dim('Fix: run `jules-dispatch init` or check `JULES_API_KEY`, then retry.'));
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
  const skipped = results.filter(r => r.status === 'skipped');

  emit(
    () => {
      console.log(`\n${chalk.dim('━'.repeat(36))}`);
      console.log(
        ` ${chalk.green.bold(`Dispatched: ${dispatched.length}`)}, ${
          failed.length > 0 ? chalk.red.bold(`Failed: ${failed.length}`) : `Failed: 0`
        }${skipped.length > 0 ? `, ${chalk.yellow.bold(`Skipped: ${skipped.length}`)}` : ''}`,
      );
      console.log(`${chalk.dim('━'.repeat(36))}`);
      if (logFile) console.log(chalk.dim(`\nDispatch log: ${logFile}`));
      if (logWarning) console.warn(chalk.yellow(`\nWarning: ${logWarning}`));
    },
    {
      summary: {
        total: results.length,
        dispatched: dispatched.length,
        failed: failed.length,
        skipped: skipped.length,
      },
      results,
      logFile,
      ...(logWarning ? { warning: logWarning } : {}),
      ...(authStopMessage ? { stoppedForAuth: true } : {}),
    },
  );

  return results;
}
