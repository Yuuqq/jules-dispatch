import type { JulesConfig, JulesSession, JulesActivity } from './types.js';

const BASE_URL = 'https://jules.googleapis.com/v1alpha';

export class JulesClient {
  private apiKey: string;

  constructor(config: JulesConfig) {
    this.apiKey = config.apiKey;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const headers: Record<string, string> = {
      'X-Goog-Api-Key': this.apiKey,
    };
    if (options?.body) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Jules API ${res.status}: ${body.slice(0, 300)}`);
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
        ...(params.autoMode ? { automationMode: params.autoMode } : {}),
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
