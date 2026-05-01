import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
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
    try {
      const activities = await client.listActivities(session.id, 5);
      activityCount = activities.activities.length;
      const completed = activities.activities.find(a => a.sessionCompleted);
      const progress = activities.activities.filter(a => a.progressUpdated).pop();
      lastActivity = completed ? 'Completed' : (progress?.progressUpdated?.title || 'Unknown');
    } catch {
      lastActivity = 'Error fetching activities';
    }

    const pr = session.outputs?.find(o => o.pullRequest);
    const isCompleted = lastActivity === 'Completed';

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

  // Print summary
  const completed = results.filter(r => r.status === 'completed');
  const running = results.filter(r => r.status === 'running');

  console.log(`\nStatus: ${completed.length} completed, ${running.length} running\n`);

  if (completed.length > 0) {
    console.log('Completed:');
    for (const r of completed) {
      console.log(`  ✓ ${r.title}`);
      if (r.prUrl) console.log(`    PR: ${r.prUrl}`);
    }
  }

  if (running.length > 0) {
    console.log('\nRunning:');
    for (const r of running) {
      console.log(`  ○ ${r.title} — ${r.lastActivity}`);
      console.log(`    ${`https://jules.google.com/session/${r.sessionId}`}`);
    }
  }

  // Write report if output specified
  const outputPath = options?.output || resolve('.dispatch-logs', `collect-${Date.now()}.json`);
  const outputDir = resolve(outputPath, '..');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nReport: ${outputPath}`);

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

  console.log(`Waiting for ${sessionIds.length} sessions to complete (timeout: ${timeout / 1000}s)...\n`);

  while (Date.now() - start < timeout) {
    const sessions = await client.listSessions(100);
    const targets = sessions.sessions.filter(s => sessionIds.includes(s.id));

    const pending = targets.filter(s => {
      // Check if session has completed output
      const completed = s.outputs?.some(o => o.pullRequest);
      return !completed;
    });

    if (pending.length === 0) {
      console.log('All sessions completed!');
      return;
    }

    for (const s of pending) {
      const pr = s.outputs?.find(o => o.pullRequest);
      const icon = pr ? '✓' : '○';
      console.log(`  ${icon} ${s.title}`);
    }
    console.log(`\n${pending.length} still running. Next check in ${interval / 1000}s...\n`);

    await new Promise(r => setTimeout(r, interval));
  }

  console.log('Timeout reached. Some sessions may still be running.');
}
