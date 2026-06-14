/**
 * Regression tests for the bugs fixed in the review pass.
 * Each test pins a specific previously-broken behavior so it cannot silently
 * regress again.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInit } from '../src/init.js';
import { pollSessions } from '../src/polling.js';
import { JulesClient, parseRetryAfterMs } from '../src/client.js';
import type { JulesSession, JulesActivity } from '../src/types.js';

// ---------- Fix #2: non-interactive init preserves existing .env values ----------

describe('Fix #2: non-interactive init preserves existing source/branch', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'init-regression-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps existing JULES_DEFAULT_SOURCE / JULES_DEFAULT_BRANCH when not re-specified', async () => {
    // Pre-existing .env with non-default source and branch.
    writeFileSync(
      join(dir, '.env'),
      'JULES_API_KEY=old-key\nJULES_DEFAULT_SOURCE=sources/github/owner/repo\nJULES_DEFAULT_BRANCH=develop\n',
    );

    // Non-interactive re-init providing only a new API key.
    const result = await runInit({
      apiKey: 'new-key',
      interactive: false,
      projectDir: dir,
    });

    expect(result.values.source).toBe('sources/github/owner/repo');
    expect(result.values.branch).toBe('develop');

    const content = readFileSync(join(dir, '.env'), 'utf8');
    expect(content).toContain('JULES_DEFAULT_SOURCE=sources/github/owner/repo');
    expect(content).toContain('JULES_DEFAULT_BRANCH=develop');
    expect(content).toContain('JULES_API_KEY=new-key');
  });

  it('lets an explicit --source override the existing value', async () => {
    writeFileSync(
      join(dir, '.env'),
      'JULES_API_KEY=old\nJULES_DEFAULT_SOURCE=old/source\nJULES_DEFAULT_BRANCH=main\n',
    );

    const result = await runInit({
      apiKey: 'k',
      source: 'new/source',
      interactive: false,
      projectDir: dir,
    });

    expect(result.values.source).toBe('new/source');
  });
});

// ---------- Fix #8: polling is concurrent, not serial ----------

describe('Fix #8: pollSessions issues requests concurrently', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function completedSession(id: string): JulesSession {
    return {
      id,
      name: `sessions/${id}`,
      title: `Session ${id}`,
      prompt: '',
      url: '',
      sourceContext: { source: 'test', githubRepoContext: { startingBranch: 'main' } },
      state: 'COMPLETED',
    };
  }

  it('fires getSession for all remaining sessions within the same tick', async () => {
    // If polling were serial, getSession for s2 would only be called after s1
    // resolved. By resolving all of them via the same microtask flush we prove
    // they were dispatched concurrently.
    let inFlight = 0;
    let maxInFlight = 0;
    const client = {
      getSession: vi.fn(async (id: string) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return completedSession(id);
      }),
      listActivities: vi.fn(async () => ({ activities: [] as JulesActivity[] })),
    };

    const resultPromise = pollSessions(
      client as unknown as Parameters<typeof pollSessions>[0],
      ['s1', 's2', 's3', 's4'],
      { interval: 100, timeout: 5000 },
    );

    await vi.advanceTimersByTimeAsync(200);
    const result = await resultPromise;

    expect(result.completed).toHaveLength(4);
    // With serial polling maxInFlight would be 1; concurrency means > 1.
    expect(maxInFlight).toBeGreaterThan(1);
  });
});

// ---------- Fix #9: parseRetryAfterMs handles whitespace-only headers ----------

describe('Fix #9: parseRetryAfterMs rejects whitespace-only values', () => {
  it('returns undefined for an empty string', () => {
    expect(parseRetryAfterMs('')).toBeUndefined();
  });

  it('returns undefined for a whitespace-only string', () => {
    // Number('  ') === 0 (finite), so without trimming this used to return 0
    // — i.e. "retry immediately" — which is wrong.
    expect(parseRetryAfterMs('   ')).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(parseRetryAfterMs(null)).toBeUndefined();
  });

  it('still parses a numeric value', () => {
    expect(parseRetryAfterMs('2')).toBe(2000);
  });

  it('still parses a numeric value with surrounding whitespace', () => {
    expect(parseRetryAfterMs('  2 ')).toBe(2000);
  });
});

// ---------- Fix #3: getLatestPlan stable ordering for equal timestamps ----------

describe('Fix #3: getLatestPlan returns a deterministic plan for equal timestamps', () => {
  const fixedTime = '2026-01-01T00:00:00Z';

  function plan(id: string): JulesActivity {
    return {
      name: `activities/${id}`,
      id,
      createTime: fixedTime, // identical timestamps -> exercises the comparator
      originator: 'agent',
      planGenerated: { plan: { id, steps: [{ id: 's1', title: 'step' }] } },
    };
  }

  it('returns the first plan without throwing under equal createTime', async () => {
    const activities = [plan('p1'), plan('p2'), plan('p3')];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ activities })),
    );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const client = new JulesClient({ apiKey: 'test-key' });
      const plan = await client.getLatestPlan('sess-1');
      expect(plan).not.toBeNull();
      expect(plan!.steps).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
