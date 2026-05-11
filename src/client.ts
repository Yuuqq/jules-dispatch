import { debug, timed, verbose } from './log.js';
import type { JulesConfig, JulesSession, JulesActivity, JulesPlan } from './types.js';

const BASE_URL = 'https://jules.googleapis.com/v1alpha';
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 500;

export interface JulesSource {
  name: string;
  id: string;
  githubRepo?: { owner: string; repo: string };
}

export class JulesClient {
  private apiKey: string;

  constructor(config: JulesConfig) {
    this.apiKey = config.apiKey;
  }

  private async request<T>(path: string, options?: RequestInit, retries = MAX_RETRIES): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const method = options?.method ?? 'GET';
    const headers: Record<string, string> = { 'X-Goog-Api-Key': this.apiKey };
    if (options?.body) headers['Content-Type'] = 'application/json';

    verbose(`→ ${method} ${path}`);
    debug('request', {
      url,
      method,
      body: options?.body ? String(options.body).slice(0, 500) : undefined,
    });

    let res: Response;
    try {
      res = await timed(`${method} ${path}`, () => fetch(url, { ...options, headers }));
    } catch (err) {
      if (retries > 0 && err instanceof TypeError) {
        debug('retrying network error', { retriesLeft: retries - 1 });
        const attempt = MAX_RETRIES - retries;
        const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 250;
        await sleep(delay);
        return this.request<T>(path, options, retries - 1);
      }
      throw err;
    }

    verbose(`← ${res.status} ${method} ${path}`);

    if ((res.status === 429 || res.status >= 500) && retries > 0) {
      debug('retrying', { status: res.status, retriesLeft: retries - 1 });
      const retryAfter = res.headers.get('retry-after');
      const attempt = MAX_RETRIES - retries;
      const expBackoff = BASE_DELAY_MS * Math.pow(2, attempt);
      const jitter = Math.random() * 250;
      const delay = retryAfter
        ? Math.max(Number(retryAfter) * 1000, 0) + jitter
        : expBackoff + jitter;
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
    return (text ? JSON.parse(text) : undefined) as T;
  }

  // ---------- sources ----------

  async listSources(pageToken?: string): Promise<{ sources: JulesSource[]; nextPageToken?: string }> {
    const q = new URLSearchParams({ pageSize: '200' });
    if (pageToken) q.set('pageToken', pageToken);
    return this.request(`/sources?${q.toString()}`);
  }

  async *iterateSources(): AsyncGenerator<JulesSource> {
    let token: string | undefined;
    do {
      const page = await this.listSources(token);
      for (const s of page.sources ?? []) yield s;
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
    const q = new URLSearchParams({ pageSize: String(pageSize) });
    if (pageToken) q.set('pageToken', pageToken);
    return this.request(`/sessions?${q.toString()}`);
  }

  async *iterateSessions(pageSize = 50): AsyncGenerator<JulesSession> {
    let token: string | undefined;
    do {
      const page = await this.listSessions(pageSize, token);
      for (const s of page.sessions ?? []) yield s;
      token = page.nextPageToken;
    } while (token);
  }

  async getSession(sessionId: string): Promise<JulesSession> {
    return this.request(`/sessions/${encodeURIComponent(sessionId)}`);
  }

  async cancelSession(sessionId: string): Promise<void> {
    await this.request(`/sessions/${encodeURIComponent(sessionId)}:cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // ---------- activities ----------

  async listActivities(sessionId: string, pageSize = 30, pageToken?: string): Promise<{ activities: JulesActivity[]; nextPageToken?: string }> {
    const q = new URLSearchParams({ pageSize: String(pageSize) });
    if (pageToken) q.set('pageToken', pageToken);
    return this.request(`/sessions/${encodeURIComponent(sessionId)}/activities?${q.toString()}`);
  }

  async *iterateActivities(sessionId: string, pageSize = 30): AsyncGenerator<JulesActivity> {
    let token: string | undefined;
    do {
      const page = await this.listActivities(sessionId, pageSize, token);
      for (const a of page.activities ?? []) yield a;
      token = page.nextPageToken;
    } while (token);
  }

  /** Returns the most recent generated plan, or null if none exists yet. */
  async getLatestPlan(sessionId: string): Promise<JulesPlan | null> {
    const { activities } = await this.listActivities(sessionId, 50);
    const planActs = activities.filter(a => a.planGenerated?.plan);
    if (planActs.length === 0) return null;
    // Activities returned newest-first per Google API conventions, but be defensive.
    const sorted = planActs.slice().sort((a, b) => (a.createTime > b.createTime ? -1 : 1));
    return sorted[0].planGenerated!.plan;
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

/** Derive normalized status from a session + its recent activities. */
export function deriveStatus(
  session: Pick<JulesSession, 'state' | 'outputs'>,
  activities: JulesActivity[] = [],
): 'running' | 'completed' | 'failed' | 'awaiting_plan' | 'cancelled' {
  // Prefer explicit state field.
  const s = (session.state ?? '').toUpperCase();
  if (s === 'COMPLETED') return 'completed';
  if (s === 'FAILED') return 'failed';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'cancelled';
  if (s === 'AWAITING_PLAN_APPROVAL') return 'awaiting_plan';
  if (s === 'RUNNING' || s === 'PENDING' || s === 'AWAITING_USER_INPUT') return 'running';

  // Fallback: scan activities.
  if (activities.some(a => a.sessionFailed)) return 'failed';
  if (activities.some(a => a.sessionCompleted)) return 'completed';
  return 'running';
}
