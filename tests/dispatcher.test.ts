import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchBatch, dispatchTaskDefinition } from '../src/dispatcher.js';
import type { JulesClient } from '../src/client.js';
import * as taskConfig from '../src/config.js';
import type { JulesConfig, TaskDefinition } from '../src/types.js';

vi.mock('../src/config.js', () => ({
  loadTask: vi.fn(),
  loadTasksFromDir: vi.fn(),
}));

vi.mock('../src/output.js', () => ({
  isJson: () => true,
  emit: (_text: unknown, json: unknown) => json,
  info: () => undefined,
}));

const baseConfig: JulesConfig = {
  apiKey: 'test',
  defaultSource: 'repos/test',
  defaultBranch: 'main',
  autoMode: 'AUTO_CREATE_PR',
};

function makeTask(title: string, overrides: Partial<TaskDefinition> = {}): { file: string; tasks: TaskDefinition[] } {
  return {
    file: `${title}.yaml`,
    tasks: [{ title, prompt: `Do ${title}`, ...overrides }],
  };
}

function mockClient(createSessionResult: (params: any) => any) {
  return { createSession: vi.fn(createSessionResult) } as unknown as JulesClient;
}

function successfulSession(title: string) {
  return {
    id: `session-${title}`,
    url: `https://jules.example/sessions/${title}`,
  };
}

function loadTasks(...entries: Array<{ file: string; tasks: TaskDefinition[] }>) {
  vi.mocked(taskConfig.loadTasksFromDir).mockReturnValue(entries);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('batch chunking', () => {
  it('rejects invalid parallel values before dispatching', async () => {
    loadTasks(makeTask('one'));
    const client = mockClient(() => successfulSession('unused'));

    await expect(
      dispatchBatch(client, baseConfig, 'task-dir', { parallel: 0, logDir: false }),
    ).rejects.toThrow('Invalid parallel value');

    expect(client.createSession).not.toHaveBeenCalled();
  });

  it('dispatches 7 tasks with parallel=3', async () => {
    loadTasks(...Array.from({ length: 7 }, (_, i) => makeTask(`task-${i + 1}`)));
    let inFlight = 0;
    let maxInFlight = 0;
    const client = mockClient(async params => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 0));
      inFlight -= 1;
      return successfulSession(params.title);
    });

    const results = await dispatchBatch(client, baseConfig, 'task-dir', { parallel: 3, logDir: false });

    expect(results).toHaveLength(7);
    expect(results.every(result => result.status === 'dispatched')).toBe(true);
    expect(client.createSession).toHaveBeenCalledTimes(7);
    expect(maxInFlight).toBe(3);
  });

  it('returns [] for an empty task dir', async () => {
    loadTasks();
    const client = mockClient(() => successfulSession('unused'));

    const results = await dispatchBatch(client, baseConfig, 'task-dir', { logDir: false });

    expect(results).toEqual([]);
    expect(client.createSession).not.toHaveBeenCalled();
  });

  it('dispatches sequentially with parallel=1', async () => {
    loadTasks(makeTask('one'), makeTask('two'), makeTask('three'));
    let inFlight = 0;
    let maxInFlight = 0;
    const client = mockClient(async params => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 0));
      inFlight -= 1;
      return successfulSession(params.title);
    });

    const results = await dispatchBatch(client, baseConfig, 'task-dir', { parallel: 1, logDir: false });

    expect(results).toHaveLength(3);
    expect(results.map(result => result.taskTitle)).toEqual(['one', 'two', 'three']);
    expect(results.every(result => result.status === 'dispatched')).toBe(true);
    expect(client.createSession).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(1);
  });
});

describe('partial failure', () => {
  it('returns mixed success and failure results', async () => {
    loadTasks(
      makeTask('one', { source: 'repos/test' }),
      makeTask('two', { source: 'repos/test' }),
      makeTask('three', { source: 'repos/test' }),
      makeTask('four'),
    );
    const client = mockClient(vi.fn()
      .mockResolvedValueOnce({ id: 's1', url: 'https://jules.example/s1' })
      .mockResolvedValueOnce({ id: 's2', url: 'https://jules.example/s2' })
      .mockRejectedValueOnce(new Error('API error')));

    const results = await dispatchBatch(
      client,
      { ...baseConfig, defaultSource: '' },
      'task-dir',
      { parallel: 4, logDir: false },
    );

    expect(results.filter(result => result.status === 'dispatched')).toHaveLength(2);
    expect(results.filter(result => result.status === 'failed')).toHaveLength(2);
    expect(results.map(result => result.status)).toEqual(['dispatched', 'dispatched', 'failed', 'failed']);
    expect(results[2]).toMatchObject({ taskTitle: 'three', error: 'API error' });
    expect(results[3].error).toContain('No source');
    expect(client.createSession).toHaveBeenCalledTimes(3);
  });

  it('returns failed results when all API calls fail', async () => {
    loadTasks(makeTask('one'), makeTask('two'), makeTask('three'));
    const client = mockClient(() => {
      throw new Error('API down');
    });

    const results = await dispatchBatch(client, baseConfig, 'task-dir', { parallel: 3, logDir: false });

    expect(results.filter(result => result.status === 'dispatched')).toHaveLength(0);
    expect(results.filter(result => result.status === 'failed')).toHaveLength(3);
    expect(client.createSession).toHaveBeenCalledTimes(3);
  });

  it('returns dispatched results when all API calls succeed', async () => {
    loadTasks(makeTask('one'), makeTask('two'), makeTask('three'));
    const client = mockClient(params => successfulSession(params.title));

    const results = await dispatchBatch(client, baseConfig, 'task-dir', { parallel: 3, logDir: false });

    expect(results.filter(result => result.status === 'dispatched')).toHaveLength(3);
    expect(results.filter(result => result.status === 'failed')).toHaveLength(0);
    expect(client.createSession).toHaveBeenCalledTimes(3);
  });
});

describe('error aggregation', () => {
  it('preserves per-task failure context', async () => {
    loadTasks(makeTask('one'), makeTask('two'));
    const client = mockClient(vi.fn()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('second failure')));

    const results = await dispatchBatch(client, baseConfig, 'task-dir', { parallel: 2, logDir: false });

    expect(results).toMatchObject([
      { taskTitle: 'one', title: 'one', status: 'failed', error: 'first failure' },
      { taskTitle: 'two', title: 'two', status: 'failed', error: 'second failure' },
    ]);
  });

  it('returns failed for missing source without calling the API', async () => {
    const client = mockClient(() => successfulSession('unused'));

    const result = await dispatchTaskDefinition(
      client,
      { ...baseConfig, defaultSource: '' },
      { title: 'missing-source', prompt: 'Do missing-source' },
      'missing-source.yaml',
    );

    expect(result).toMatchObject({
      taskFile: 'missing-source.yaml',
      taskTitle: 'missing-source',
      title: 'missing-source',
      sessionId: '',
      sessionUrl: '',
      status: 'failed',
    });
    expect(result.error).toContain('No source');
    expect(client.createSession).not.toHaveBeenCalled();
  });
});
