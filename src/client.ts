import type { JulesConfig, JulesSession, JulesActivity } from './types.js';

const BASE_URL = 'https://jules.googleapis.com/v1alpha';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class JulesClient {
  private apiKey: string;

  constructor(config: JulesConfig) {
    this.apiKey = config.apiKey;
  }

  private async request<T>(path: string, options?: RequestInit, retries = MAX_RETRIES): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const headers: Record<string, string> = {
      'X-Goog-Api-Key': this.apiKey,
    };
    if (options?.body) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, { ...options, headers });

    if (res.status === 429 || res.status >= 500) {
      if (retries > 0) {
        const delay = RETRY_DELAY_MS * (MAX_RETRIES - retries + 1);
        await sleep(delay);
        return this.request<T>(path, options, retries - 1);
      }
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Jules API ${res.status} at ${path}: ${body.slice(0, 300)}`);
    }

    return res.json() as Promise<T>;
  }

  async listSources(): Promise<{ sources: Array<{ name: string; id: string; githubRepo?: { owner: string; repo: string } }> }> {
    return this.request('/sources?pageSize=200');
  }

  async createSession(params: {
    prompt: string;
    source: string;
    branch: string;
    title: string;
    autoMode: string;
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

  async listSessions(pageSize = 50): Promise<{ sessions: JulesSession[]; nextPageToken?: string }> {
    return this.request(`/sessions?pageSize=${pageSize}`);
  }

  async getSession(sessionId: string): Promise<JulesSession> {
    return this.request(`/sessions/${sessionId}`);
  }

  async listActivities(sessionId: string, pageSize = 30): Promise<{ activities: JulesActivity[] }> {
    return this.request(`/sessions/${sessionId}/activities?pageSize=${pageSize}`);
  }

  async sendMessage(sessionId: string, prompt: string): Promise<void> {
    await this.request(`/sessions/${sessionId}:sendMessage`, {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    });
  }

  async approvePlan(sessionId: string): Promise<void> {
    await this.request(`/sessions/${sessionId}:approvePlan`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
