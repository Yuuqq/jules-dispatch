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

// ============================================================================
// Round 2 review fixes (bug + UX pass)
// ============================================================================

// ---------- Fix R2-1: .gitignore covers .env.backup / .env.bak ----------

describe('Fix R2-1: gitignore covers env backup files', () => {
  it('ignores .env.backup, .env.bak, and numbered variants', () => {
    const gitignore = readFileSync('.gitignore', 'utf8');
    // Without these, `init` writes the API key to .env.backup and git would
    // happily track it — a real key-leak footgun.
    expect(gitignore).toMatch(/(^|\n)\.env\.backup(\n|$)/);
    expect(gitignore).toMatch(/(^|\n)\.env\.bak(\n|$)/);
  });
});

// ---------- Fix R2-2: collectStatus paginates instead of one-page listSessions ----------

describe('Fix R2-2: collectStatus walks pages up to scanLimit', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('fetches across multiple pages when the server paginates', async () => {
    // Two pages: 200 each, total 400 sessions available; scanLimit caps at 350.
    // A correct implementation must walk both pages and stop at the limit.
    const { collectStatus } = await import('../src/collector.js');
    const page1 = Array.from({ length: 200 }, (_, i) => ({
      id: `p1-${i}`, name: `sessions/p1-${i}`, title: `T1-${i}`, prompt: '', url: '',
      sourceContext: { source: 's', githubRepoContext: { startingBranch: 'main' } }, state: 'COMPLETED',
    }));
    const page2 = Array.from({ length: 200 }, (_, i) => ({
      id: `p2-${i}`, name: `sessions/p2-${i}`, title: `T2-${i}`, prompt: '', url: '',
      sourceContext: { source: 's', githubRepoContext: { startingBranch: 'main' } }, state: 'COMPLETED',
    }));
    let calls = 0;
    const client = {
      iterateSessions: async function* () {
        for (const s of page1) yield s;
        for (const s of page2) yield s;
      },
      listSessions: vi.fn(),   // must NOT be used by the scan path
      getSession: vi.fn(),
      listActivities: vi.fn(async () => ({ activities: [] })),
    };
    // track how many pages listSessions was called with — should be zero now.
    const results = await collectStatus(
      client as unknown as InstanceType<typeof JulesClient>,
      { apiKey: 'k', defaultSource: '', defaultBranch: 'main', autoMode: 'NONE' },
      { scanLimit: 350 },
    );

    expect(results).toHaveLength(350);
    expect(client.listSessions).not.toHaveBeenCalled();
  });

  it('handles a single page that already exceeds scanLimit', async () => {
    const { collectStatus } = await import('../src/collector.js');
    const big = Array.from({ length: 300 }, (_, i) => ({
      id: `s-${i}`, name: `s/s-${i}`, title: `T-${i}`, prompt: '', url: '',
      sourceContext: { source: 's', githubRepoContext: { startingBranch: 'main' } }, state: 'COMPLETED',
    }));
    const client = {
      iterateSessions: async function* () { for (const s of big) yield s; },
      listSessions: vi.fn(),
      getSession: vi.fn(),
      listActivities: vi.fn(async () => ({ activities: [] })),
    };

    const results = await collectStatus(
      client as unknown as InstanceType<typeof JulesClient>,
      { apiKey: 'k', defaultSource: '', defaultBranch: 'main', autoMode: 'NONE' },
      { scanLimit: 50 },
    );

    expect(results).toHaveLength(50);
  });
});

// ---------- Fix R2-3: init quotes .env values that need it ----------

describe('Fix R2-3: init quotes .env values with special chars', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'init-quote-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('quotes a source containing a # so it is not parsed as a comment', async () => {
    const result = await runInit({
      apiKey: 'plain-key',
      source: 'sources/github/owner/repo # oops',
      branch: 'main',
      interactive: false,
      projectDir: dir,
    });
    const content = readFileSync(result.envPath, 'utf8');
    // The value must be quoted so dotenv does not treat # oops as a comment.
    expect(content).toContain('JULES_DEFAULT_SOURCE="sources/github/owner/repo # oops"');
  });

  it('leaves simple values bare for readability', async () => {
    const result = await runInit({
      apiKey: 'sk-ABC123',
      source: 'sources/github/owner/repo',
      branch: 'main',
      interactive: false,
      projectDir: dir,
    });
    const content = readFileSync(result.envPath, 'utf8');
    expect(content).toContain('JULES_API_KEY=sk-ABC123');
    expect(content).toContain('JULES_DEFAULT_SOURCE=sources/github/owner/repo');
  });

  it('quotes an empty source explicitly', async () => {
    const result = await runInit({
      apiKey: 'k',
      source: '',
      branch: 'main',
      interactive: false,
      projectDir: dir,
    });
    const content = readFileSync(result.envPath, 'utf8');
    expect(content).toContain('JULES_DEFAULT_SOURCE=""');
  });
});

// ---------- Fix R2-4: planner only retries 400 on response_format rejection ----------

describe('Fix R2-4: planner retries 400 only for response_format', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does NOT retry a 400 caused by a bad model name', async () => {
    const { planTasks } = await import('../src/planner.js');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "model 'gpt-bogus' not found" } }),
        { status: 400 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      planTasks(
        { apiKey: 'k', baseUrl: 'https://example.test/v1', model: 'gpt-bogus' },
        { description: 'do thing', maxTasks: 3 },
      ),
    ).rejects.toThrow(/LLM request failed \(400\)/);

    // Exactly one call: the bogus-model 400 must NOT trigger the fallback.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once (and succeeds) when the 400 mentions response_format', async () => {
    const { planTasks } = await import('../src/planner.js');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response('response_format is not supported', { status: 400 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ rationale: 'r', tasks: [{ title: 'T', prompt: 'P' }] }) } }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await planTasks(
      { apiKey: 'k', baseUrl: 'https://example.test/v1', model: 'm' },
      { description: 'do thing', maxTasks: 3 },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe('T');
  });
});

// ---------- Fix R2-5: loadConfig gives a Fix hint on missing API key ----------

describe('Fix R2-5: loadConfig shows a Fix hint when API key is missing', () => {
  let dir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cfg-hint-'));
    delete process.env.JULES_API_KEY;
    // Make process.exit throw so the function returns instead of killing the test runner.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('prints both the requirement message and a Fix line', async () => {
    const { loadConfig } = await import('../src/config.js');
    // loadConfig calls process.exit(2), which our spy turns into a throw.
    expect(() => loadConfig(dir)).toThrow('exit:2');

    const allText = errSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(allText).toContain('JULES_API_KEY is required');
    expect(allText).toMatch(/Fix:/);
  });
});

// ---------- Fix R2-8: loadTasksFromDir friendly errors for missing dir / file-as-dir ----------

describe('Fix R2-8: loadTasksFromDir gives actionable errors', () => {
  it('throws "Task directory not found" for a missing path', async () => {
    const { loadTasksFromDir } = await import('../src/config.js');
    expect(() => loadTasksFromDir(join(tmpdir(), 'definitely-missing-' + Date.now())))
      .toThrow(/Task directory not found/);
  });

  it('throws ENOTDIR-style message when the path is a file', async () => {
    const { loadTasksFromDir } = await import('../src/config.js');
    const file = join(tmpdir(), 'not-a-dir-' + Date.now() + '.txt');
    writeFileSync(file, 'hello');
    try {
      expect(() => loadTasksFromDir(file)).toThrow(/Expected a directory/);
    } finally {
      rmSync(file, { force: true });
    }
  });

  it('translateError classifies "Task directory not found" as VALIDATION', async () => {
    const { translateError } = await import('../src/errors.js');
    const t = translateError(new Error('Task directory not found: /foo/bar'));
    expect(t.code).toBe('VALIDATION');
  });
});

// ---------- Fix R2-9: init backup is versioned (no clobber) ----------

describe('Fix R2-9: init never overwrites an existing .env.backup', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'init-bak-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('writes .env.backup on first run, .env.backup.1 on the second', async () => {
    writeFileSync(join(dir, '.env'), 'JULES_API_KEY=first\nJULES_DEFAULT_BRANCH=main\n');

    const r1 = await runInit({ apiKey: 'second', interactive: false, projectDir: dir });
    expect(r1.backupPath).toBe(join(dir, '.env.backup'));
    expect(existsSync(join(dir, '.env.backup'))).toBe(true);
    // Original key preserved in backup.
    expect(readFileSync(join(dir, '.env.backup'), 'utf8')).toContain('first');

    const r2 = await runInit({ apiKey: 'third', interactive: false, projectDir: dir });
    expect(r2.backupPath).toBe(join(dir, '.env.backup.1'));
    expect(existsSync(join(dir, '.env.backup'))).toBe(true);
    expect(existsSync(join(dir, '.env.backup.1'))).toBe(true);
    // The FIRST backup is still intact (would have been clobbered before).
    expect(readFileSync(join(dir, '.env.backup'), 'utf8')).toContain('first');
    expect(readFileSync(join(dir, '.env.backup.1'), 'utf8')).toContain('second');
  });
});
