import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/mcp.js';
import type { JulesConfig } from '../src/types.js';
import type { JulesClient } from '../src/client.js';

// Mock dispatcher so jules_dispatch doesn't make real API calls
vi.mock('../src/dispatcher.js', () => ({
  dispatchTaskDefinition: vi.fn().mockResolvedValue({
    taskFile: '<mcp>',
    taskTitle: 'Test',
    sessionId: 'sess-1',
    sessionUrl: 'https://jules.google/sess-1',
    title: 'Test',
    status: 'dispatched',
  }),
}));

import { dispatchTaskDefinition } from '../src/dispatcher.js';

async function createTestServer(mockClient: JulesClient) {
  const config: JulesConfig = {
    apiKey: 'test-key',
    defaultSource: 'sources/github/owner/repo',
    defaultBranch: 'main',
    autoMode: 'AUTO_CREATE_PR',
  };
  const server = createMcpServer(config, mockClient);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  // Server must connect first so it can handle the client's initialize request
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientTransport);
  return {
    client,
    server,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

function createMockClient(overrides: Partial<JulesClient> = {}): JulesClient {
  return {
    getSession: vi.fn().mockResolvedValue({
      id: 'sess-1',
      title: 'Test Session',
      url: 'https://jules.google/sess-1',
      state: 'RUNNING',
      sourceContext: { source: 'sources/github/owner/repo', githubRepoContext: { startingBranch: 'main' } },
      outputs: [],
    }),
    listActivities: vi.fn().mockResolvedValue({
      activities: [{ id: 'act-1', createTime: '2026-01-01T00:00:00Z', originator: 'agent', progressUpdated: { title: 'Working' } }],
    }),
    createSession: vi.fn().mockResolvedValue({
      id: 'sess-1',
      title: 'Test Session',
      url: 'https://jules.google/sess-1',
      state: 'RUNNING',
      prompt: 'do stuff',
      name: 'sessions/sess-1',
      sourceContext: { source: 'sources/github/owner/repo', githubRepoContext: { startingBranch: 'main' } },
    }),
    getLatestPlan: vi.fn().mockResolvedValue({
      id: 'plan-1',
      steps: [{ id: 'step-1', title: 'Step 1' }],
    }),
    listSessions: vi.fn().mockResolvedValue({
      sessions: [],
    }),
    ...overrides,
  } as unknown as JulesClient;
}

async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 30000 });
  const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
  return { isError: result.isError ?? false, data: JSON.parse(text) };
}

describe('jules_dispatch', () => {
  let server: { client: Client; cleanup: () => Promise<void> };
  let mockClient: JulesClient;

  beforeEach(async () => {
    vi.mocked(dispatchTaskDefinition).mockResolvedValue({
      taskFile: '<mcp>',
      taskTitle: 'Test',
      sessionId: 'sess-1',
      sessionUrl: 'https://jules.google/sess-1',
      title: 'Test',
      status: 'dispatched',
    });
    mockClient = createMockClient();
    server = await createTestServer(mockClient);
  });

  afterEach(async () => {
    await server.cleanup();
  });

  it('dispatches a single task and returns DispatchResult', async () => {
    const { isError, data } = await callTool(server.client, 'jules_dispatch', {
      tasks: { title: 'Fix bug', prompt: 'Fix the null pointer', source: 'sources/github/o/r' },
    });
    expect(isError).toBeFalsy();
    expect(data.success).toBe(true);
    expect(data.data.summary.total).toBe(1);
    expect(data.data.results[0].status).toBe('dispatched');
  });

  it('dispatches multiple tasks in parallel batches', async () => {
    const { isError, data } = await callTool(server.client, 'jules_dispatch', {
      tasks: [
        { title: 'T1', prompt: 'P1', source: 's' },
        { title: 'T2', prompt: 'P2', source: 's' },
      ],
    });
    expect(isError).toBeFalsy();
    expect(data.data.summary.total).toBe(2);
    expect(data.data.summary.dispatched).toBe(2);
  });

  it('parses YAML string and dispatches tasks', async () => {
    const yaml = 'title: T1\nprompt: P1\nsource: s/github/o/r\n---\ntitle: T2\nprompt: P2\nsource: s/github/o/r';
    const { isError, data } = await callTool(server.client, 'jules_dispatch', {
      tasks: yaml,
      format: 'yaml',
    });
    expect(isError).toBeFalsy();
    expect(data.data.summary.total).toBe(2);
  });

  it('returns failed result when task has no source', async () => {
    const emptyConfigClient = createMockClient();
    const emptyConfigServer = await createTestServer(emptyConfigClient);

    vi.mocked(dispatchTaskDefinition).mockResolvedValueOnce({
      taskFile: '<mcp>',
      taskTitle: 'T',
      sessionId: '',
      sessionUrl: '',
      title: 'T',
      status: 'failed',
      error: 'No source configured. Set JULES_DEFAULT_SOURCE in .env or add "source" to the task file.',
    });

    const { data } = await callTool(emptyConfigServer.client, 'jules_dispatch', {
      tasks: { title: 'T', prompt: 'P' },
    });
    expect(data.data.results[0].status).toBe('failed');
    await emptyConfigServer.cleanup();
  });

  it('returns error with recovery_hint for API auth error', async () => {
    vi.mocked(dispatchTaskDefinition).mockRejectedValueOnce(
      Object.assign(new Error('Unauthorized'), { status: 401 }),
    );

    const { isError, data } = await callTool(server.client, 'jules_dispatch', {
      tasks: { title: 'T', prompt: 'P', source: 's/github/o/r' },
    });
    expect(isError).toBe(true);
    expect(data.error.recovery_hint).toContain('JULES_API_KEY');
  });
});

describe('planner tool registration', () => {
  it('registers planner tools when an LLM API key override is provided', async () => {
    const config: JulesConfig = {
      apiKey: 'test-key',
      defaultSource: 'sources/github/owner/repo',
      defaultBranch: 'main',
      autoMode: 'AUTO_CREATE_PR',
    };
    const mockClient = createMockClient();
    const mcpServer = createMcpServer(config, mockClient, { llmApiKeyOverride: 'llm-key' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(clientTransport);

    try {
      const tools = await client.listTools();
      const names = tools.tools.map(tool => tool.name);
      expect(names).toContain('jules_plan_tasks');
      expect(names).toContain('jules_auto');
    } finally {
      await client.close();
      await mcpServer.close();
    }
  });
});

describe('jules_monitor', () => {
  let server: { client: Client; cleanup: () => Promise<void> };
  let mockClient: JulesClient;

  beforeEach(async () => {
    mockClient = createMockClient();
    server = await createTestServer(mockClient);
  });

  afterEach(async () => {
    await server.cleanup();
  });

  it('returns session status without waiting', async () => {
    const { isError, data } = await callTool(server.client, 'jules_monitor', {
      sessionIds: ['sess-1'],
      wait: false,
    });
    expect(isError).toBeFalsy();
    expect(data.data.sessions[0].sessionId).toBe('sess-1');
    expect(data.data.sessions[0].status).toBe('running');
  });

  it('returns completed sessions immediately when wait=true and already terminal', async () => {
    vi.mocked(mockClient.getSession).mockResolvedValue({
      id: 'sess-1',
      title: 'Test Session',
      url: 'https://jules.google/sess-1',
      state: 'COMPLETED',
      sourceContext: { source: 'sources/github/owner/repo', githubRepoContext: { startingBranch: 'main' } },
      outputs: [],
    } as Awaited<ReturnType<JulesClient['getSession']>>);

    const { data } = await callTool(server.client, 'jules_monitor', {
      sessionIds: ['sess-1'],
      wait: true,
      timeoutMs: 5000,
    });
    expect(data.data.wait.completed).toContain('sess-1');
  });

  it('returns timedOut=true when timeout expires before terminal state', async () => {
    vi.mocked(mockClient.getSession).mockResolvedValue({
      id: 'sess-1',
      title: 'Test Session',
      url: 'https://jules.google/sess-1',
      state: 'RUNNING',
      sourceContext: { source: 'sources/github/owner/repo', githubRepoContext: { startingBranch: 'main' } },
      outputs: [],
    } as Awaited<ReturnType<JulesClient['getSession']>>);

    const { data } = await callTool(server.client, 'jules_monitor', {
      sessionIds: ['sess-1'],
      wait: true,
      timeoutMs: 1000,
      intervalMs: 1000,
    });
    expect(data.data.wait.timedOut).toBe(true);
  });

  it('stops polling early when failFast=true and a session fails', async () => {
    vi.mocked(mockClient.getSession).mockImplementation(async (id: string) => {
      if (id === 'sess-1') {
        return {
          id: 'sess-1', title: 'Failed Session', url: 'https://jules.google/sess-1',
          state: 'FAILED',
          sourceContext: { source: 'sources/github/owner/repo', githubRepoContext: { startingBranch: 'main' } },
          outputs: [],
        } as Awaited<ReturnType<JulesClient['getSession']>>;
      }
      return {
        id: 'sess-2', title: 'Running Session', url: 'https://jules.google/sess-2',
        state: 'RUNNING',
        sourceContext: { source: 'sources/github/owner/repo', githubRepoContext: { startingBranch: 'main' } },
        outputs: [],
      } as Awaited<ReturnType<JulesClient['getSession']>>;
    });

    const { data } = await callTool(server.client, 'jules_monitor', {
      sessionIds: ['sess-1', 'sess-2'],
      wait: true,
      failFast: true,
      timeoutMs: 5000,
    });
    expect(data.data.wait.failed).toContain('sess-1');
    expect(data.data.wait.stillRunning).toContain('sess-2');
  });
});

describe('jules_interact', () => {
  let server: { client: Client; cleanup: () => Promise<void> };
  let mockClient: JulesClient;

  beforeEach(async () => {
    mockClient = createMockClient();
    server = await createTestServer(mockClient);
  });

  afterEach(async () => {
    await server.cleanup();
  });

  it('returns full session context including plan and activities', async () => {
    const { isError, data } = await callTool(server.client, 'jules_interact', {
      sessionId: 'sess-1',
    });
    expect(isError).toBeFalsy();
    expect(data.data.session.id).toBe('sess-1');
    expect(data.data.session.title).toBe('Test Session');
    expect(data.data.status).toBe('running');
    expect(data.data.plan.id).toBe('plan-1');
    expect(data.data.activities).toBeInstanceOf(Array);
  });

  it('handles missing plan gracefully (getLatestPlan rejects)', async () => {
    vi.mocked(mockClient.getLatestPlan).mockRejectedValue(new Error('Not found'));

    const { isError, data } = await callTool(server.client, 'jules_interact', {
      sessionId: 'sess-1',
    });
    expect(isError).toBeFalsy();
    expect(data.data.plan).toBeNull();
    expect(data.data.session.id).toBe('sess-1');
    expect(data.data.status).toBe('running');
  });

  it('returns error with recovery_hint when getSession fails', async () => {
    vi.mocked(mockClient.getSession).mockRejectedValue(
      Object.assign(new Error('Not found'), { status: 404 }),
    );

    const { isError, data } = await callTool(server.client, 'jules_interact', {
      sessionId: 'sess-1',
    });
    expect(isError).toBe(true);
    expect(data.error.recovery_hint).toContain('resource ID');
  });

  it('maps activities with sessionFailed and planGenerated correctly', async () => {
    vi.mocked(mockClient.listActivities).mockResolvedValue({
      activities: [
        {
          id: 'act-1',
          createTime: '2026-01-01T00:00:00Z',
          originator: 'agent',
          sessionFailed: { message: 'crash' },
        },
        {
          id: 'act-2',
          createTime: '2026-01-01T00:01:00Z',
          originator: 'agent',
          planGenerated: { plan: { id: 'p1', steps: [{ id: 's1' }, { id: 's2' }] } },
        },
      ],
    });

    const { isError, data } = await callTool(server.client, 'jules_interact', {
      sessionId: 'sess-1',
    });
    expect(isError).toBeFalsy();
    expect(data.data.activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ failed: 'crash' }),
        expect.objectContaining({ planGenerated: { steps: 2 } }),
      ]),
    );
  });
});

describe('jules_dispatch_task', () => {
  let server: { client: Client; cleanup: () => Promise<void> };
  let mockClient: JulesClient;

  beforeEach(async () => {
    vi.mocked(dispatchTaskDefinition).mockResolvedValue({
      taskFile: '<mcp>',
      taskTitle: 'Test',
      sessionId: 'sess-1',
      sessionUrl: 'https://jules.google/sess-1',
      title: 'Test',
      status: 'dispatched',
    });
    mockClient = createMockClient();
    server = await createTestServer(mockClient);
  });

  afterEach(async () => {
    await server.cleanup();
  });

  it('dispatches a single task and returns DispatchResult', async () => {
    const { isError, data } = await callTool(server.client, 'jules_dispatch_task', {
      title: 'Fix bug',
      prompt: 'Fix the null pointer',
      source: 'sources/github/o/r',
    });
    expect(isError).toBeFalsy();
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('dispatched');
    expect(data.data.sessionId).toBe('sess-1');
  });

  it('returns error with recovery_hint when dispatch fails', async () => {
    vi.mocked(dispatchTaskDefinition).mockRejectedValueOnce(
      Object.assign(new Error('Server Error'), { status: 500 }),
    );
    const { isError, data } = await callTool(server.client, 'jules_dispatch_task', {
      title: 'T',
      prompt: 'P',
      source: 's/github/o/r',
    });
    expect(isError).toBe(true);
    expect(data.error.recovery_hint).toBeTruthy();
  });
});

describe('jules_dispatch_batch', () => {
  let server: { client: Client; cleanup: () => Promise<void> };
  let mockClient: JulesClient;

  beforeEach(async () => {
    vi.mocked(dispatchTaskDefinition).mockResolvedValue({
      taskFile: '<mcp>',
      taskTitle: 'Test',
      sessionId: 'sess-1',
      sessionUrl: 'https://jules.google/sess-1',
      title: 'Test',
      status: 'dispatched',
    });
    mockClient = createMockClient();
    server = await createTestServer(mockClient);
  });

  afterEach(async () => {
    await server.cleanup();
  });

  it('dispatches multiple tasks and returns summary', async () => {
    const { isError, data } = await callTool(server.client, 'jules_dispatch_batch', {
      tasks: [
        { title: 'T1', prompt: 'P1', source: 's' },
        { title: 'T2', prompt: 'P2', source: 's' },
      ],
    });
    expect(isError).toBeFalsy();
    expect(data.data.summary.total).toBe(2);
    expect(data.data.summary.dispatched).toBe(2);
  });

  it('parses YAML string input', async () => {
    const yaml = 'title: T1\nprompt: P1\nsource: s/github/o/r\n---\ntitle: T2\nprompt: P2\nsource: s/github/o/r';
    const { isError, data } = await callTool(server.client, 'jules_dispatch_batch', {
      tasks: yaml,
      format: 'yaml',
    });
    expect(isError).toBeFalsy();
    expect(data.data.summary.total).toBe(2);
  });

  it('returns error with recovery_hint when batch dispatch fails', async () => {
    vi.mocked(dispatchTaskDefinition).mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { status: 403 }),
    );
    const { isError, data } = await callTool(server.client, 'jules_dispatch_batch', {
      tasks: [{ title: 'T', prompt: 'P', source: 's' }],
    });
    expect(isError).toBe(true);
    expect(data.error.recovery_hint).toBeTruthy();
  });
});

describe('jules_get_session', () => {
  let server: { client: Client; cleanup: () => Promise<void> };
  let mockClient: JulesClient;

  beforeEach(async () => {
    mockClient = createMockClient();
    server = await createTestServer(mockClient);
  });

  afterEach(async () => {
    await server.cleanup();
  });

  it('returns session details', async () => {
    const { isError, data } = await callTool(server.client, 'jules_get_session', {
      sessionId: 'sess-1',
    });
    expect(isError).toBeFalsy();
    expect(data.data.id).toBe('sess-1');
    expect(data.data.title).toBe('Test Session');
  });

  it('returns error when session not found', async () => {
    vi.mocked(mockClient.getSession).mockRejectedValueOnce(
      Object.assign(new Error('Not found'), { status: 404 }),
    );
    const { isError, data } = await callTool(server.client, 'jules_get_session', {
      sessionId: 'bad-id',
    });
    expect(isError).toBe(true);
    expect(data.error.recovery_hint).toBeTruthy();
  });
});

describe('jules_list_sessions', () => {
  let server: { client: Client; cleanup: () => Promise<void> };
  let mockClient: JulesClient;

  beforeEach(async () => {
    mockClient = createMockClient({
      listSessions: vi.fn().mockResolvedValue({
        sessions: [{ id: 's1', title: 'S1', url: 'https://jules.google/s1' }],
      }),
    });
    server = await createTestServer(mockClient);
  });

  afterEach(async () => {
    await server.cleanup();
  });

  it('returns paginated session list', async () => {
    const { isError, data } = await callTool(server.client, 'jules_list_sessions', {
      pageSize: 10,
    });
    expect(isError).toBeFalsy();
    expect(data.data.sessions).toBeInstanceOf(Array);
    expect(data.data.sessions[0].id).toBe('s1');
  });
});

describe('jules_status', () => {
  let server: { client: Client; cleanup: () => Promise<void> };
  let mockClient: JulesClient;

  beforeEach(async () => {
    mockClient = createMockClient();
    server = await createTestServer(mockClient);
  });

  afterEach(async () => {
    await server.cleanup();
  });

  it('returns legacy summary with prTitle and activities count', async () => {
    const { isError, data } = await callTool(server.client, 'jules_status', {
      sessionIds: ['sess-1'],
    });
    expect(isError).toBeFalsy();
    expect(data.data.results).toBeInstanceOf(Array);
    expect(data.data.results).toHaveLength(1);
    expect(data.data.results[0].sessionId).toBe('sess-1');
    expect(data.data.results[0].status).toBe('running');
    expect(data.data.results[0].activities).toEqual(expect.any(Number));
  });

  it('returns error status when session lookup fails', async () => {
    vi.mocked(mockClient.getSession).mockRejectedValueOnce(new Error('Not found'));
    const { isError, data } = await callTool(server.client, 'jules_status', {
      sessionIds: ['bad-id'],
    });
    expect(isError).toBeFalsy();
    expect(data.data.results[0].status).toBe('error');
    expect(data.data.results[0].error).toBe('Not found');
  });
});

describe('jules_list_activities', () => {
  let server: { client: Client; cleanup: () => Promise<void> };
  let mockClient: JulesClient;

  beforeEach(async () => {
    mockClient = createMockClient();
    server = await createTestServer(mockClient);
  });

  afterEach(async () => {
    await server.cleanup();
  });

  it('returns activities for a session', async () => {
    const { isError, data } = await callTool(server.client, 'jules_list_activities', {
      sessionId: 'sess-1',
    });
    expect(isError).toBeFalsy();
    expect(data.data.activities).toBeInstanceOf(Array);
    expect(data.data.activities).toHaveLength(1);
    expect(data.data.activities[0].id).toBe('act-1');
  });
});

describe('jules_get_plan', () => {
  let server: { client: Client; cleanup: () => Promise<void> };
  let mockClient: JulesClient;

  beforeEach(async () => {
    mockClient = createMockClient();
    server = await createTestServer(mockClient);
  });

  afterEach(async () => {
    await server.cleanup();
  });

  it('returns the latest plan for a session', async () => {
    const { isError, data } = await callTool(server.client, 'jules_get_plan', {
      sessionId: 'sess-1',
    });
    expect(isError).toBeFalsy();
    expect(data.data.plan.id).toBe('plan-1');
    expect(data.data.plan.steps).toBeInstanceOf(Array);
  });

  it('returns error with recovery_hint when getLatestPlan fails', async () => {
    vi.mocked(mockClient.getLatestPlan).mockRejectedValueOnce(
      Object.assign(new Error('Not found'), { status: 404 }),
    );
    const { isError, data } = await callTool(server.client, 'jules_get_plan', {
      sessionId: 'sess-1',
    });
    expect(isError).toBe(true);
    expect(data.error.recovery_hint).toBeTruthy();
  });
});
