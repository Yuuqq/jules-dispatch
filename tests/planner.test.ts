import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPlannerConfigured, loadPlannerConfig, planTasks } from '../src/planner.js';

const plannerEnvKeys = [
  'LLM_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'AI_INTEGRATIONS_OPENROUTER_API_KEY',
  'LLM_BASE_URL',
  'OPENAI_BASE_URL',
  'OPENROUTER_BASE_URL',
  'AI_INTEGRATIONS_OPENROUTER_BASE_URL',
  'LLM_MODEL',
  'OPENAI_MODEL',
  'OPENROUTER_MODEL',
] as const;

const originalEnv = new Map(plannerEnvKeys.map(key => [key, process.env[key]]));

function completion(content: unknown): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(content) } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  for (const key of plannerEnvKeys) delete process.env[key];
});

afterEach(() => {
  for (const key of plannerEnvKeys) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadPlannerConfig', () => {
  it('uses the first non-empty trimmed value for planner settings', () => {
    process.env.LLM_API_KEY = '   ';
    process.env.OPENAI_API_KEY = '  openai-key  ';
    process.env.LLM_BASE_URL = '';
    process.env.OPENAI_BASE_URL = '  https://planner.example/v1///  ';
    process.env.LLM_MODEL = '\t';
    process.env.OPENAI_MODEL = '  test-model  ';

    const config = loadPlannerConfig({ apiKeyOverride: '  ' });

    expect(config.apiKey).toBe('openai-key');
    expect(config.baseUrl).toBe('https://planner.example/v1');
    expect(config.model).toBe('test-model');
  });

  it('does not report whitespace-only API keys as configured', () => {
    process.env.LLM_API_KEY = '   ';
    process.env.OPENAI_API_KEY = '\t';

    expect(isPlannerConfigured()).toBe(false);
    expect(() => loadPlannerConfig()).toThrow('No LLM API key found');
  });
});

describe('planTasks contract', () => {
  const config = {
    apiKey: 'planner-key',
    baseUrl: 'https://planner.example/v1',
    model: 'test-model',
  };

  it('enforces maxTasks even when the model returns too many tasks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion({
      tasks: [
        { title: 'One', prompt: 'Do one.' },
        { title: 'Two', prompt: 'Do two.' },
        { title: 'Three', prompt: 'Do three.' },
      ],
    })));

    const result = await planTasks(config, { description: 'Split the work', maxTasks: 2 });

    expect(result.tasks.map(task => task.title)).toEqual(['One', 'Two']);
  });

  it('rejects malformed task entries without leaking a TypeError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion({ tasks: [null] })));

    await expect(planTasks(config, { description: 'Plan work' }))
      .rejects.toThrow('Planner task #1 missing title or prompt');
  });

  it('validates direct request inputs before making a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(planTasks(config, { description: '   ' })).rejects.toThrow(/description/i);
    await expect(planTasks(config, { description: 'Plan work', maxTasks: 0 })).rejects.toThrow(/maxTasks/i);
    await expect(planTasks(config, {
      description: 'Plan work',
      source: null as unknown as string,
    })).rejects.toThrow(/source/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
