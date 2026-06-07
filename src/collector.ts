import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import Table from 'cli-table3';
import type { JulesConfig, CollectResult, JulesSession } from './types.js';
import { JulesClient, deriveStatus } from './client.js';
import { debug } from './log.js';
import { isJson, emit, info } from './output.js';
import { pollSessions, type PollResult } from './polling.js';

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
      const latestProgress = activities
        .filter(a => a.progressUpdated)
        .sort((a, b) => (a.createTime > b.createTime ? -1 : 1))[0];

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
    } catch (err) {
      debug('activity fetch error', { sessionId: session.id, error: (err as Error).message });
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
      createTime: session.createTime,
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
  if (results.length === 0) {
    console.log(chalk.dim('No sessions found.'));
    return;
  }

  const groupOrder = ['running', 'pending', 'awaiting_plan', 'completed', 'failed', 'cancelled'];
  const sorted = [...results].sort((a, b) => {
    const ai = groupOrder.indexOf(a.status);
    const bi = groupOrder.indexOf(b.status);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.title.localeCompare(b.title);
  });

  const stateFormat: Record<string, { icon: string; label: string; color: (s: string) => string }> = {
    running: { icon: '●', label: 'Running', color: chalk.green },
    pending: { icon: '●', label: 'Pending', color: chalk.yellow },
    awaiting_plan: { icon: '⏸', label: 'Await Plan', color: chalk.magenta },
    completed: { icon: '✓', label: 'Done', color: chalk.blue },
    failed: { icon: '✗', label: 'Failed', color: chalk.red },
    cancelled: { icon: '⊘', label: 'Cancelled', color: chalk.gray },
  };

  const table = new Table({
    head: ['ID', 'Title', 'State', 'Elapsed', 'PR'],
    colWidths: [10, 25, 14, 9, 30],
    style: { compact: true },
    chars: {
      top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
      bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
      left: '', 'left-mid': '', mid: '', 'mid-mid': '',
      right: '', 'right-mid': '', middle: ' ',
    },
  });

  for (const r of sorted) {
    const fmt = stateFormat[r.status] ?? { icon: '?', label: r.status, color: chalk.white };
    const stateCell = fmt.color(`${fmt.icon} ${fmt.label}`);
    const idCell = chalk.dim(r.sessionId.slice(0, 8));
    const titleCell = r.title.length > 23 ? r.title.slice(0, 22) + '…' : r.title;
    const elapsed = r.createTime ? formatElapsed(r.createTime) : '—';
    const prCell = r.prUrl ? r.prUrl.replace('https://github.com/', 'gh:') : '';
    const prTruncated = prCell.length > 28 ? prCell.slice(0, 27) + '…' : prCell;

    table.push([idCell, titleCell, stateCell, elapsed, prTruncated]);
  }

  console.log(table.toString());

  const counts = groupOrder
    .filter(g => results.some(r => r.status === g))
    .map(g => {
      const n = results.filter(r => r.status === g).length;
      const fmt = stateFormat[g];
      return fmt ? fmt.color(`${n} ${fmt.label.toLowerCase()}`) : `${n} ${g}`;
    });
  console.log(chalk.bold(`\n${counts.join(chalk.dim(' · '))}`));
}

function formatElapsed(createTime: string): string {
  const ms = Date.now() - new Date(createTime).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) return `${hours}h${remMin > 0 ? ` ${remMin}m` : ''}`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export interface WaitOptions {
  interval?: number;
  timeout?: number;
  /** Stop on first failure rather than waiting for all sessions. */
  failFast?: boolean;
}

/** @deprecated Use PollResult from polling.ts directly. */
export type WaitResult = PollResult;

export async function waitForCompletion(
  client: JulesClient,
  _config: JulesConfig,
  sessionIds: string[],
  options: WaitOptions = {},
): Promise<PollResult> {
  const timeout = options.timeout ?? 600000;

  info(chalk.bold(`\nWaiting for ${sessionIds.length} session(s) to complete (timeout: ${timeout / 1000}s)...\n`));

  const result = await pollSessions(client, sessionIds, {
    interval: options.interval ?? 30000,
    timeout,
    failFast: options.failFast,
  }, {
    onError: (sessionId, err) => {
      debug('wait poll error', { sessionId, error: err.message });
    },
    onPoll: ({ failed, remaining }) => {
      if (!isJson()) {
        console.log(
          chalk.dim(`  ${remaining} session(s) still running`) +
          (failed > 0 ? chalk.red(` [${failed} failed]`) : ''),
        );
      }
    },
  });

  emit(
    () => {
      if (!result.timedOut) console.log(chalk.green.bold(`✓ All sessions resolved.`));
      else console.log(chalk.yellow(`Timeout reached. ${result.stillRunning.length} session(s) may still be running.`));
      console.log(
        `  ${chalk.green(`completed: ${result.completed.length}`)}` +
        (result.failed.length > 0 ? `, ${chalk.red(`failed: ${result.failed.length}`)}` : '') +
        (result.cancelled.length > 0 ? `, ${chalk.dim(`cancelled: ${result.cancelled.length}`)}` : ''),
      );
    },
    { event: 'final', ...result },
  );

  return result;
}
