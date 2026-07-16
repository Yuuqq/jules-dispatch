import { debug, timed, verbose } from './log.js';
import type {
  JulesConfig,
  JulesSession,
  JulesActivity,
  JulesPlan,
  JulesSessionStatus,
} from './types.js';

const BASE_URL = 'https://jules.googleapis.com/v1alpha';
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 500;
const MAX_PAGE_SIZE = 100;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

export interface JulesSource {
  name: string;
  id: string;
  githubRepo?: { owner: string; repo: string };
}

export class JulesClient {
  private apiKey: string;
  private requestTimeoutMs: number;

  constructor(config: JulesConfig) {
    this.apiKey = config.apiKey;
    this.requestTimeoutMs = normalizeRequestTimeout(config.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
  }

  private async request<T>(path: string, options?: RequestInit, retries = MAX_RETRIES): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const method = (options?.method ?? 'GET').toUpperCase();
    const canRetryAmbiguousFailure = isIdempotentMethod(method);
    const headers: Record<string, string> = { 'X-Goog-Api-Key': this.apiKey };
    if (options?.body) headers['Content-Type'] = 'application/json';

    verbose(`→ ${method} ${path}`);
    debug('request', {
      url,
      method,
      body: options?.body ? String(options.body).slice(0, 500) : undefined,
    });

    let res: Response;
    const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs);
    try {
      res = await timed(`${method} ${path}`, () => fetch(url, {
        ...options,
        headers,
        signal: timeoutSignal,
      }));
    } catch (err) {
      if (timeoutSignal.aborted) {
        throw new Error(`Jules API request timed out after ${this.requestTimeoutMs}ms at ${path}`);
      }
      if (retries > 0 && canRetryAmbiguousFailure && err instanceof TypeError) {
        debug('retrying network error', { retriesLeft: retries - 1 });
        const attempt = MAX_RETRIES - retries;
        const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 250;
        await sleep(delay);
        return this.request<T>(path, options, retries - 1);
      }
      throw err;
    }

    verbose(`← ${res.status} ${method} ${path}`);

    const retryableResponse = res.status === 429 || (
      res.status >= 500 && canRetryAmbiguousFailure
    );
    if (retryableResponse && retries > 0) {
      debug('retrying', { status: res.status, retriesLeft: retries - 1 });
      const retryAfter = res.headers.get('retry-after');
      const attempt = MAX_RETRIES - retries;
      const expBackoff = BASE_DELAY_MS * Math.pow(2, attempt);
      const jitter = Math.random() * 250;
      const retryAfterMs = parseRetryAfterMs(retryAfter);
      const delay = (retryAfterMs ?? expBackoff) + jitter;
      await sleep(delay);
      return this.request<T>(path, options, retries - 1);
    }

    if (!res.ok) {
      const body = await res.text();
      debug('error response', { status: res.status, body: body.slice(0, 300) });
      const err = new Error(`Jules API ${res.status} at ${path}: ${body.slice(0, 400)}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new Error(`Jules API returned invalid JSON at ${path}: ${(err as Error).message}`);
    }
  }

  // ---------- sources ----------

  async listSources(pageToken?: string): Promise<{ sources: JulesSource[]; nextPageToken?: string }> {
    const q = new URLSearchParams({ pageSize: String(MAX_PAGE_SIZE) });
    if (pageToken) q.set('pageToken', pageToken);
    const page = await this.request<{ sources?: JulesSource[]; nextPageToken?: string }>(
      `/sources?${q.toString()}`,
    );
    return {
      ...page,
      sources: Array.isArray(page?.sources) ? page.sources : [],
    };
  }

  async *iterateSources(): AsyncGenerator<JulesSource> {
    let token: string | undefined;
    const seenTokens = new Set<string>();
    do {
      guardPageToken(token, seenTokens, 'sources');
      const page = await this.listSources(token);
      for (const s of page.sources) yield s;
      token = page.nextPageToken;
    } while (token);
  }

  // ---------- sessions ----------

  async createSession(params: {
    prompt: string;
    source: string;
    branch: string;
    title: string;
    autoMode?: string;
    requirePlanApproval?: boolean;
  }): Promise<JulesSession> {
    return this.request('/sessions', {
      method: 'POST',
      body: JSON.stringify({
        prompt: params.prompt,
        sourceContext: {
          source: params.source,
          githubRepoContext: { startingBranch: params.branch },
        },
        ...(params.autoMode && params.autoMode !== 'NONE' ? { automationMode: params.autoMode } : {}),
        ...(params.requirePlanApproval ? { requirePlanApproval: true } : {}),
        title: params.title,
      }),
    });
  }

  async listSessions(pageSize = 50, pageToken?: string): Promise<{ sessions: JulesSession[]; nextPageToken?: string }> {
    const q = new URLSearchParams({ pageSize: String(normalizePageSize(pageSize)) });
    if (pageToken) q.set('pageToken', pageToken);
    const page = await this.request<{ sessions?: JulesSession[]; nextPageToken?: string }>(
      `/sessions?${q.toString()}`,
    );
    return {
      ...page,
      sessions: Array.isArray(page?.sessions) ? page.sessions : [],
    };
  }

  async *iterateSessions(pageSize = 50): AsyncGenerator<JulesSession> {
    let token: string | undefined;
    const seenTokens = new Set<string>();
    do {
      guardPageToken(token, seenTokens, 'sessions');
      const page = await this.listSessions(pageSize, token);
      for (const s of page.sessions) yield s;
      token = page.nextPageToken;
    } while (token);
  }

  async getSession(sessionId: string): Promise<JulesSession> {
    return this.request(`/sessions/${encodeURIComponent(sessionId)}`);
  }

  async cancelSession(sessionId: string): Promise<void> {
    await this.request(`/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  }

  // ---------- activities ----------

  async listActivities(
    sessionId: string,
    pageSize = 30,
    pageToken?: string,
    createTime?: string,
  ): Promise<{ activities: JulesActivity[]; nextPageToken?: string }> {
    const q = new URLSearchParams({ pageSize: String(normalizePageSize(pageSize)) });
    if (pageToken) q.set('pageToken', pageToken);
    if (createTime) q.set('createTime', createTime);
    const page = await this.request<{ activities?: JulesActivity[]; nextPageToken?: string }>(
      `/sessions/${encodeURIComponent(sessionId)}/activities?${q.toString()}`,
    );
    return {
      ...page,
      activities: Array.isArray(page?.activities) ? page.activities : [],
    };
  }

  async *iterateActivities(
    sessionId: string,
    pageSize = 30,
    createTime?: string,
  ): AsyncGenerator<JulesActivity> {
    let token: string | undefined;
    const seenTokens = new Set<string>();
    do {
      guardPageToken(token, seenTokens, `activities for session ${sessionId}`);
      const page = await this.listActivities(sessionId, pageSize, token, createTime);
      for (const a of page.activities) yield a;
      token = page.nextPageToken;
    } while (token);
  }

  /** Returns the most recent generated plan, or null if none exists yet. */
  async getLatestPlan(sessionId: string): Promise<JulesPlan | null> {
    let latest: JulesActivity | undefined;
    for await (const activity of this.iterateActivities(sessionId, MAX_PAGE_SIZE)) {
      if (!activity.planGenerated?.plan) continue;
      if (!latest || activity.createTime > latest.createTime) latest = activity;
    }
    return latest?.planGenerated?.plan ?? null;
  }

  // ---------- messaging / approval ----------

  async sendMessage(sessionId: string, prompt: string): Promise<void> {
    await this.request(`/sessions/${encodeURIComponent(sessionId)}:sendMessage`, {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    });
  }

  async approvePlan(sessionId: string): Promise<void> {
    await this.request(`/sessions/${encodeURIComponent(sessionId)}:approvePlan`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizePageSize(pageSize: number): number {
  if (!Number.isFinite(pageSize)) return MAX_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(pageSize), 1), MAX_PAGE_SIZE);
}

function normalizeRequestTimeout(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? Math.trunc(value!) : fallback;
}

function isIdempotentMethod(method: string): boolean {
  return ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(method);
}

function guardPageToken(token: string | undefined, seen: Set<string>, resource: string): void {
  if (!token) return;
  if (seen.has(token)) {
    throw new Error(`Jules API repeated page token while listing ${resource}: ${token}`);
  }
  seen.add(token);
}

export function getLatestPlanFromActivities(activities: JulesActivity[]): JulesPlan | null {
  const planActs = activities.filter(a => a.planGenerated?.plan);
  if (planActs.length === 0) return null;
  const sorted = planActs.slice().sort((a, b) =>
    a.createTime > b.createTime ? -1 : a.createTime < b.createTime ? 1 : 0,
  );
  return sorted[0].planGenerated!.plan;
}

export function parseRetryAfterMs(value: string | null): number | undefined {
  // Treat blank/whitespace-only values as absent. Note that Number('') and
  // Number('  ') both coerce to 0 (a finite number), so without trimming we
  // would wrongly treat a blank Retry-After header as "retry immediately".
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return Math.max(seconds * 1000, 0);

  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return undefined;
  return Math.max(dateMs - Date.now(), 0);
}

/** Derive normalized status from a session + its recent activities. */
export function deriveStatus(
  session: Pick<JulesSession, 'state' | 'outputs'>,
  activities: JulesActivity[] = [],
): JulesSessionStatus {
  // Prefer explicit state field.
  const s = (session.state ?? '').toUpperCase();
  if (s === 'COMPLETED') return 'completed';
  if (s === 'FAILED') return 'failed';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'cancelled';
  if (s === 'AWAITING_PLAN_APPROVAL') return 'awaiting_plan';
  if (s === 'AWAITING_USER_FEEDBACK' || s === 'AWAITING_USER_INPUT') return 'awaiting_user_feedback';
  if (s === 'PAUSED') return 'paused';
  if (
    s === 'QUEUED' ||
    s === 'PLANNING' ||
    s === 'IN_PROGRESS' ||
    s === 'RUNNING' ||
    s === 'PENDING'
  ) return 'running';

  // Fallback: scan activities.
  if (activities.some(a => a.sessionFailed)) return 'failed';
  if (activities.some(a => a.sessionCompleted)) return 'completed';
  return 'running';
}
