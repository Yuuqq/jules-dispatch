import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import type { JulesConfig, CollectResult, JulesSession } from './types.js';
import { JulesClient, deriveStatus } from './client.js';
import { isJson, emit, info } from './output.js';

export interface CollectStatusOptions {
  sessionIds?: string[];
  output?: string;
  /** Cap how many recent sessions to scan when no IDs given. Default 100. */
  scanLimit?: number;
}

export async function collectStatus(
  client: JulesClient,
  _config: JulesConfig,
  options: CollectStatusOptions = {},
): Promise<CollectResult[]> {
  const targetIds = options.sessionIds;
  const sessionsToCheck: JulesSession[] = [];

  if (targetIds && targetIds.length > 0) {
    // Fetch each requested session directly so we don't depend on it
    // being in the first page of /sessions.
    for (const id of targetIds) {
      try {
        const s = await client.getSession(id);
        sessionsToCheck.push(s);
      } catch (err) {
        sessionsToCheck.push({
          id,
          name: `sessions/${id}`,
          title: `<not found: ${id}>`,
          prompt: '',
          url: '',
          sourceContext: { source: '', githubRepoContext: { startingBranch: '' } },
          state: 'FAILED',
        } as JulesSession);
        // Surface the error in text mode for visibility.
        if (!isJson()) console.error(chalk.red(`Failed to fetch session ${id}: ${(err as Error).message}`));
      }
    }
  } else {
    const scanLimit = options.scanLimit ?? 100;
    const page = await client.listSessions(scanLimit);
    sessionsToCheck.push(...page.sessions);
  }

  const results: CollectResult[] = [];

  for (const session of sessionsToCheck) {
    let lastActivity = '';
    let activityCount = 0;
    let status: CollectResult['status'] = 'running';

    try {
      const { activities } = await client.listActivities(session.id, 10);
      activityCount = activities.length;

      const failedAct = activities.find(a => a.sessionFailed);
      const completedAct = activities.find(a => a.sessionCompleted);
      const latestProgress = activities.filter(a => a.progressUpdated).pop();

      status = deriveStatus(session, activities);

      if (status === 'failed') {
        lastActivity = failedAct?.sessionFailed?.message ?? failedAct?.sessionFailed?.reason ?? 'Failed';
      } else if (status === 'completed') {
        lastActivity = 'Completed';
      } else if (status === 'awaiting_plan') {
        lastActivity = 'Awaiting plan approval';
      } else if (status === 'cancelled') {
        lastActivity = 'Cancelled';
      } else {
        lastActivity = latestProgress?.progressUpdated?.title ?? 'In progress';
      }
      // Suppress unused warnings in strict mode.
      void completedAct;
    } catch {
      lastActivity = 'Error fetching activities';
      status = deriveStatus(session, []);
    }

    const pr = session.outputs?.find(o => o.pullRequest);

    results.push({
      sessionId: session.id,
      title: session.title,
      status,
      prUrl: pr?.pullRequest?.url,
      prTitle: pr?.pullRequest?.title,
      lastActivity,
      activities: activityCount,
      state: session.state,
    });
  }

  emit(
    () => printStatusText(results),
    {
      summary: {
        total: results.length,
        completed: results.filter(r => r.status === 'completed').length,
        running: results.filter(r => r.status === 'running').length,
        failed: results.filter(r => r.status === 'failed').length,
        awaiting_plan: results.filter(r => r.status === 'awaiting_plan').length,
        cancelled: results.filter(r => r.status === 'cancelled').length,
      },
      results,
    },
  );

  if (options.output) {
    const outputDir = resolve(options.output, '..');
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    writeFileSync(options.output, JSON.stringify(results, null, 2));
    info(chalk.dim(`\nReport: ${options.output}`));
  }

  return results;
}

function printStatusText(results: CollectResult[]): void {
  const completed = results.filter(r => r.status === 'completed');
  const running = results.filter(r => r.status === 'running');
  const failed = results.filter(r => r.status === 'failed');
  const awaiting = results.filter(r => r.status === 'awaiting_plan');

  const parts = [
    chalk.green(`${completed.length} completed`),
    chalk.yellow(`${running.length} running`),
  ];
  if (failed.length > 0) parts.push(chalk.red(`${failed.length} failed`));
  if (awaiting.length > 0) parts.push(chalk.magenta(`${awaiting.length} awaiting plan`));

  console.log(`\n${chalk.bold(`Status: ${parts.join(', ')}`)}\n`);

  if (completed.length > 0) {
    console.log(chalk.bold('Completed:'));
    for (const r of completed) {
      console.log(`  ${chalk.green('✓')} ${r.title}`);
      if (r.prUrl) console.log(`    ${chalk.cyan('PR:')} ${r.prUrl}`);
    }
  }

  if (awaiting.length > 0) {
    console.log(`\n${chalk.bold('Awaiting plan approval:')}`);
    for (const r of awaiting) {
      console.log(`  ${chalk.magenta('⏸')} ${r.title}`);
      console.log(`    ${chalk.dim(`Run: jules-dispatch approve ${r.sessionId}`)}`);
    }
  }

  if (running.length > 0) {
    console.log(`\n${chalk.bold('Running:')}`);
    for (const r of running) {
      console.log(`  ${chalk.yellow('○')} ${r.title} ${chalk.dim(`— ${r.lastActivity}`)}`);
      console.log(`    ${chalk.dim(`https://jules.google.com/session/${r.sessionId}`)}`);
    }
  }

  if (failed.length > 0) {
    console.log(`\n${chalk.bold(chalk.red('Failed:'))}`);
    for (const r of failed) {
      console.log(`  ${chalk.red('✗')} ${r.title} ${chalk.dim(`— ${r.lastActivity}`)}`);
    }
  }
}

export interface WaitOptions {
  interval?: number;
  timeout?: number;
  /** Stop on first failure rather than waiting for all sessions. */
  failFast?: boolean;
}

export interface WaitResult {
  completed: string[];
  failed: string[];
  cancelled: string[];
  stillRunning: string[];
  timedOut: boolean;
}

export async function waitForCompletion(
  client: JulesClient,
  _config: JulesConfig,
  sessionIds: string[],
  options: WaitOptions = {},
): Promise<WaitResult> {
  const interval = options.interval ?? 30000;
  const timeout = options.timeout ?? 600000;
  const start = Date.now();

  info(chalk.bold(`\nWaiting for ${sessionIds.length} session(s) to complete (timeout: ${timeout / 1000}s)...\n`));

  const completed = new Set<string>();
  const failed = new Set<string>();
  const cancelled = new Set<string>();

  while (Date.now() - start < timeout) {
    const remaining = sessionIds.filter(id => !completed.has(id) && !failed.has(id) && !cancelled.has(id));
    if (remaining.length === 0) break;

    for (const sessionId of remaining) {
      try {
        const session = await client.getSession(sessionId);
        const { activities } = await client.listActivities(sessionId, 10);
        const status = deriveStatus(session, activities);

        if (status === 'completed') completed.add(sessionId);
        else if (status === 'failed') {
          failed.add(sessionId);
          if (options.failFast) {
            info(chalk.red(`✗ Session ${sessionId} failed (failFast)`));
            return finalize();
          }
        }
        else if (status === 'cancelled') cancelled.add(sessionId);
      } catch {
        // Transient — keep polling.
      }
    }

    const stillRunning = sessionIds.filter(id => !completed.has(id) && !failed.has(id) && !cancelled.has(id));
    if (stillRunning.length === 0) break;

    if (!isJson()) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(
        chalk.dim(`  ${stillRunning.length} session(s) still running`) +
        ` (${elapsed}s elapsed, next check in ${interval / 1000}s)` +
        (failed.size > 0 ? chalk.red(` [${failed.size} failed]`) : ''),
      );
    } else {
      // Stream NDJSON progress.
      process.stdout.write(JSON.stringify({
        event: 'poll',
        elapsedSec: Math.round((Date.now() - start) / 1000),
        completed: completed.size,
        failed: failed.size,
        cancelled: cancelled.size,
        stillRunning: stillRunning.length,
      }) + '\n');
    }

    await sleep(interval);
  }

  return finalize();

  function finalize(): WaitResult {
    const stillRunning = sessionIds.filter(id => !completed.has(id) && !failed.has(id) && !cancelled.has(id));
    const timedOut = stillRunning.length > 0;
    const result: WaitResult = {
      completed: [...completed],
      failed: [...failed],
      cancelled: [...cancelled],
      stillRunning,
      timedOut,
    };

    emit(
      () => {
        if (!timedOut) console.log(chalk.green.bold(`✓ All sessions resolved.`));
        else console.log(chalk.yellow(`Timeout reached. ${stillRunning.length} session(s) may still be running.`));
        console.log(
          `  ${chalk.green(`completed: ${completed.size}`)}` +
          (failed.size > 0 ? `, ${chalk.red(`failed: ${failed.size}`)}` : '') +
          (cancelled.size > 0 ? `, ${chalk.dim(`cancelled: ${cancelled.size}`)}` : ''),
        );
      },
      { event: 'final', ...result },
    );

    return result;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
