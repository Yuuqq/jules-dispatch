import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import type { JulesConfig, CollectResult } from './types.js';
import { JulesClient } from './client.js';

export async function collectStatus(
  client: JulesClient,
  config: JulesConfig,
  options?: { sessionIds?: string[]; output?: string },
): Promise<CollectResult[]> {
  const sessions = await client.listSessions(100);
  const results: CollectResult[] = [];

  const targetIds = options?.sessionIds;
  const filtered = targetIds
    ? sessions.sessions.filter(s => targetIds.includes(s.id))
    : sessions.sessions;

  for (const session of filtered) {
    let lastActivity = '';
    let activityCount = 0;
    let isCompleted = false;

    try {
      const { activities } = await client.listActivities(session.id, 10);
      activityCount = activities.length;

      const completedActivity = activities.find(a => a.sessionCompleted !== undefined);
      const latestProgress = activities.filter(a => a.progressUpdated).pop();

      isCompleted = completedActivity !== undefined;
      lastActivity = isCompleted
        ? 'Completed'
        : latestProgress?.progressUpdated?.title ?? 'In progress';
    } catch {
      lastActivity = 'Error fetching activities';
    }

    const pr = session.outputs?.find(o => o.pullRequest);

    results.push({
      sessionId: session.id,
      title: session.title,
      status: isCompleted ? 'completed' : 'running',
      prUrl: pr?.pullRequest?.url,
      prTitle: pr?.pullRequest?.title,
      lastActivity,
      activities: activityCount,
    });
  }

  const completed = results.filter(r => r.status === 'completed');
  const running = results.filter(r => r.status === 'running');

  console.log(`\n${chalk.bold(`Status: ${chalk.green(`${completed.length} completed`)}, ${chalk.yellow(`${running.length} running`)}`)}\n`);

  if (completed.length > 0) {
    console.log(chalk.bold('Completed:'));
    for (const r of completed) {
      console.log(`  ${chalk.green('✓')} ${r.title}`);
      if (r.prUrl) console.log(`    ${chalk.cyan('PR:')} ${r.prUrl}`);
    }
  }

  if (running.length > 0) {
    console.log(`\n${chalk.bold('Running:')}`);
    for (const r of running) {
      console.log(`  ${chalk.yellow('○')} ${r.title} ${chalk.dim(`— ${r.lastActivity}`)}`);
      console.log(`    ${chalk.dim(`https://jules.google.com/session/${r.sessionId}`)}`);
    }
  }

  if (options?.output) {
    const outputDir = resolve(options.output, '..');
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    writeFileSync(options.output, JSON.stringify(results, null, 2));
    console.log(chalk.dim(`\nReport: ${options.output}`));
  }

  return results;
}

export async function waitForCompletion(
  client: JulesClient,
  config: JulesConfig,
  sessionIds: string[],
  options?: { interval?: number; timeout?: number },
): Promise<void> {
  const interval = options?.interval ?? 30000;
  const timeout = options?.timeout ?? 600000;
  const start = Date.now();

  console.log(chalk.bold(`\nWaiting for ${sessionIds.length} session(s) to complete (timeout: ${timeout / 1000}s)...\n`));

  while (Date.now() - start < timeout) {
    const remaining: string[] = [];

    for (const sessionId of sessionIds) {
      try {
        const { activities } = await client.listActivities(sessionId, 10);
        const isCompleted = activities.some(a => a.sessionCompleted !== undefined);
        if (!isCompleted) remaining.push(sessionId);
      } catch {
        remaining.push(sessionId);
      }
    }

    if (remaining.length === 0) {
      console.log(chalk.green.bold('✓ All sessions completed!'));
      return;
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(
      chalk.dim(`  ${remaining.length} session(s) still running`) +
      ` (${elapsed}s elapsed, next check in ${interval / 1000}s)`,
    );

    await sleep(interval);
  }

  console.log(chalk.yellow('Timeout reached. Some sessions may still be running.'));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
