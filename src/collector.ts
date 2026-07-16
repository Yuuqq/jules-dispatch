import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import Table from 'cli-table3';
import type { JulesConfig, CollectResult, JulesSession } from './types.js';
import { JulesClient, deriveStatus } from './client.js';
import { debug } from './log.js';
import { isJson, emit, info } from './output.js';
import { pollSessions, type PollResult } from './polling.js';
import { runBatches } from './batch.js';
import { getLastActivity } from './session-summary.js';
import { fetchActivityHistory } from './activity-history.js';

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
  let results: CollectResult[];

  if (targetIds && targetIds.length > 0) {
    // Fetch requested sessions directly so status does not depend on the
    // recent-session listing. Lookup failures remain explicit error results.
    results = await runBatches(
      targetIds,
      10,
      id => summarizeCollectSessionId(client, id),
    );
  } else {
    // Paginate until we hit scanLimit. A single listSessions() call only
    // returns one server page (capped well below our scanLimit for large
    // fleets), so we walk forward through pages and stop once we have enough.
    const scanLimit = options.scanLimit ?? 100;
    let fetched = 0;
    for await (const s of client.iterateSessions(Math.min(scanLimit, 100))) {
      sessionsToCheck.push(s);
      fetched += 1;
      if (fetched >= scanLimit) break;
    }

    results = await runBatches(
      sessionsToCheck,
      10,
      session => summarizeCollectResult(client, session),
    );
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
        awaiting_user_feedback: results.filter(r => r.status === 'awaiting_user_feedback').length,
        paused: results.filter(r => r.status === 'paused').length,
        cancelled: results.filter(r => r.status === 'cancelled').length,
        errors: results.filter(r => r.status === 'error').length,
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

async function summarizeCollectSessionId(
  client: JulesClient,
  id: string,
): Promise<CollectResult> {
  try {
    const session = await client.getSession(id);
    return summarizeCollectResult(client, session);
  } catch (err) {
    const message = (err as Error).message;
    if (!isJson()) console.error(chalk.red(`Failed to fetch session ${id}: ${message}`));
    return {
      sessionId: id,
      title: `<error: ${id}>`,
      status: 'error',
      lastActivity: message,
      activities: 0,
      error: message,
    };
  }
}

async function summarizeCollectResult(client: JulesClient, session: JulesSession): Promise<CollectResult> {
  let lastActivity = '';
  let activityCount = 0;
  let status: CollectResult['status'] = 'running';
  let activityError: string | undefined;

  try {
    const history = await fetchActivityHistory(client, session.id, { initialLimit: 10 });
    activityCount = history.totalActivities ?? history.activities.length;

    status = deriveStatus(session, history.activities, history.cursor);
    lastActivity = getLastActivity(status, history.activities);
  } catch (err) {
    activityError = (err as Error).message;
    debug('activity fetch error', { sessionId: session.id, error: activityError });
    lastActivity = activityError;
    status = 'error';
  }

  const pr = session.outputs?.find(o => o.pullRequest);

  return {
    sessionId: session.id,
    title: session.title,
    status,
    prUrl: pr?.pullRequest?.url,
    prTitle: pr?.pullRequest?.title,
    lastActivity,
    activities: activityCount,
    state: session.state,
    createTime: session.createTime,
    ...(activityError ? { error: activityError } : {}),
  };
}

function printStatusText(results: CollectResult[]): void {
  if (results.length === 0) {
    console.log(chalk.dim('No sessions found.'));
    return;
  }

  const groupOrder = [
    'running',
    'pending',
    'awaiting_plan',
    'awaiting_user_feedback',
    'paused',
    'completed',
    'failed',
    'cancelled',
    'error',
  ];
  const sorted = [...results].sort((a, b) => {
    const ai = groupOrder.indexOf(a.status);
    const bi = groupOrder.indexOf(b.status);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.title.localeCompare(b.title);
  });

  const stateFormat: Record<string, { icon: string; label: string; color: (s: string) => string }> = {
    running: { icon: '●', label: 'Running', color: chalk.green },
    pending: { icon: '●', label: 'Pending', color: chalk.yellow },
    awaiting_plan: { icon: '⏸', label: 'Await Plan', color: chalk.magenta },
    awaiting_user_feedback: { icon: '!', label: 'Needs Input', color: chalk.yellow },
    paused: { icon: '⏸', label: 'Paused', color: chalk.yellow },
    completed: { icon: '✓', label: 'Done', color: chalk.blue },
    failed: { icon: '✗', label: 'Failed', color: chalk.red },
    cancelled: { icon: '⊘', label: 'Cancelled', color: chalk.gray },
    error: { icon: '!', label: 'Error', color: chalk.red },
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

  info(chalk.bold(`\nMonitoring ${sessionIds.length} session(s) until resolved or action is required (timeout: ${timeout / 1000}s)...\n`));

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
      if (result.actionRequired.length > 0) {
        console.log(chalk.yellow.bold(`Action required for ${result.actionRequired.length} session(s).`));
      } else if (result.timedOut) {
        console.log(chalk.yellow(`Timeout reached. ${result.stillRunning.length} session(s) may still be running.`));
      } else if (result.stillRunning.length > 0 && result.failed.length > 0) {
        console.log(chalk.red(`Stopped after failure. ${result.stillRunning.length} session(s) still running.`));
      } else if (result.stillRunning.length > 0) {
        console.log(chalk.yellow(`Stopped with ${result.stillRunning.length} session(s) still running.`));
      } else {
        console.log(chalk.green.bold(`✓ All sessions resolved.`));
      }
      console.log(
        `  ${chalk.green(`completed: ${result.completed.length}`)}` +
        (result.failed.length > 0 ? `, ${chalk.red(`failed: ${result.failed.length}`)}` : '') +
        (result.cancelled.length > 0 ? `, ${chalk.dim(`cancelled: ${result.cancelled.length}`)}` : '') +
        (result.awaitingPlan.length > 0 ? `, ${chalk.yellow(`awaiting plan: ${result.awaitingPlan.length}`)}` : '') +
        (result.awaitingUserFeedback.length > 0 ? `, ${chalk.yellow(`needs input: ${result.awaitingUserFeedback.length}`)}` : '') +
        (result.paused.length > 0 ? `, ${chalk.yellow(`paused: ${result.paused.length}`)}` : ''),
      );
    },
    { event: 'final', ...result },
  );

  return result;
}
