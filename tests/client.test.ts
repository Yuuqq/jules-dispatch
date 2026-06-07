import { afterEach, describe, expect, it, vi } from 'vitest';
import { JulesClient, deriveStatus } from '../src/client.js';
import type { JulesActivity } from '../src/types.js';

function activity(overrides: Partial<JulesActivity> = {}): JulesActivity {
  return {
    name: 'activities/1',
    id: '1',
    createTime: '2026-01-01T00:00:00Z',
    originator: 'agent',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function textResponse(body: string, status = 200, headers?: HeadersInit): Response {
  return new Response(body, { status, headers });
}

function mockFetch() {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HTTP retry logic', () => {
  it('retries 429 with Retry-After and succeeds on the second call', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fetchMock = mockFetch()
      .mockResolvedValueOnce(jsonResponse({}, 429, { 'retry-after': '1' }))
      .mockResolvedValueOnce(jsonResponse({ sources: [], nextPageToken: undefined }));
    const client = new JulesClient({ apiKey: 'test-key' });

    const resultPromise = client.listSources();
    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result).toEqual({ sources: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('supports HTTP-date Retry-After values', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fetchMock = mockFetch()
      .mockResolvedValueOnce(jsonResponse({}, 429, { 'retry-after': 'Thu, 01 Jan 2026 00:00:02 GMT' }))
      .mockResolvedValueOnce(jsonResponse({ sources: [], nextPageToken: undefined }));
    const client = new JulesClient({ apiKey: 'test-key' });

    const resultPromise = client.listSources();
    await vi.advanceTimersByTimeAsync(2000);
    const result = await resultPromise;

    expect(result).toEqual({ sources: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries 500 and succeeds on the second call', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fetchMock = mockFetch()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ sources: [], nextPageToken: undefined }));
    const client = new JulesClient({ apiKey: 'test-key' });

    const resultPromise = client.listSources();
    await vi.advanceTimersByTimeAsync(500);
    const result = await resultPromise;

    expect(result).toEqual({ sources: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws status 429 after retries are exhausted', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fetchMock = mockFetch().mockResolvedValue(jsonResponse({}, 429));
    const client = new JulesClient({ apiKey: 'test-key' });

    const resultPromise = client.listSources();
    resultPromise.catch(() => {});
    const resultExpectation = expect(resultPromise).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(7500);

    await resultExpectation;
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('does not retry a non-retryable 404', async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetch().mockResolvedValue(jsonResponse({}, 404));
    const client = new JulesClient({ apiKey: 'test-key' });

    await expect(client.listSources()).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns data for a 200 success without retrying', async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetch().mockResolvedValue(jsonResponse({ sources: [], nextPageToken: undefined }));
    const client = new JulesClient({ apiKey: 'test-key' });

    await expect(client.listSources()).resolves.toEqual({ sources: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a contextual error when a successful response is not JSON', async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetch().mockResolvedValue(textResponse('not json'));
    const client = new JulesClient({ apiKey: 'test-key' });

    await expect(client.listSources()).rejects.toThrow('Jules API returned invalid JSON at /sources');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('network error retry', () => {
  it('retries a DNS failure and succeeds on the second call', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fetchMock = mockFetch()
      .mockRejectedValueOnce(new TypeError('DNS failure'))
      .mockResolvedValueOnce(jsonResponse({ sources: [], nextPageToken: undefined }));
    const client = new JulesClient({ apiKey: 'test-key' });

    const resultPromise = client.listSources();
    await vi.advanceTimersByTimeAsync(500);
    const result = await resultPromise;

    expect(result).toEqual({ sources: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws TypeError after network retries are exhausted', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const error = new TypeError('DNS failure');
    const fetchMock = mockFetch().mockRejectedValue(error);
    const client = new JulesClient({ apiKey: 'test-key' });

    const resultPromise = client.listSources();
    resultPromise.catch(() => {});
    const resultExpectation = expect(resultPromise).rejects.toThrow(TypeError);
    await vi.advanceTimersByTimeAsync(7500);

    await resultExpectation;
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('does not retry a non-TypeError exception', async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetch().mockRejectedValue(new RangeError('bad range'));
    const client = new JulesClient({ apiKey: 'test-key' });

    await expect(client.listSources()).rejects.toThrow(RangeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('explicit state mapping', () => {
  it('maps COMPLETED to completed', () => {
    expect(deriveStatus({ state: 'COMPLETED' })).toBe('completed');
  });

  it('maps FAILED to failed', () => {
    expect(deriveStatus({ state: 'FAILED' })).toBe('failed');
  });

  it('maps CANCELLED to cancelled', () => {
    expect(deriveStatus({ state: 'CANCELLED' })).toBe('cancelled');
  });

  it('maps CANCELED to cancelled', () => {
    expect(deriveStatus({ state: 'CANCELED' })).toBe('cancelled');
  });

  it('maps AWAITING_PLAN_APPROVAL to awaiting_plan', () => {
    expect(deriveStatus({ state: 'AWAITING_PLAN_APPROVAL' })).toBe('awaiting_plan');
  });

  it('maps RUNNING to running', () => {
    expect(deriveStatus({ state: 'RUNNING' })).toBe('running');
  });

  it('maps PENDING to running', () => {
    expect(deriveStatus({ state: 'PENDING' })).toBe('running');
  });

  it('maps AWAITING_USER_INPUT to running', () => {
    expect(deriveStatus({ state: 'AWAITING_USER_INPUT' })).toBe('running');
  });
});

describe('case insensitivity', () => {
  it('maps lowercase completed to completed', () => {
    expect(deriveStatus({ state: 'completed' })).toBe('completed');
  });

  it('maps mixed-case Running to running', () => {
    expect(deriveStatus({ state: 'Running' })).toBe('running');
  });
});

describe('state priority over activities', () => {
  it('keeps completed when state is COMPLETED with a failed activity', () => {
    expect(deriveStatus({ state: 'COMPLETED' }, [activity({ sessionFailed: { reason: 'error' } })])).toBe('completed');
  });

  it('keeps failed when state is FAILED with a completed activity', () => {
    expect(deriveStatus({ state: 'FAILED' }, [activity({ sessionCompleted: {} })])).toBe('failed');
  });

  it('keeps running when state is RUNNING with a failed activity', () => {
    expect(deriveStatus({ state: 'RUNNING' }, [activity({ sessionFailed: { message: 'error' } })])).toBe('running');
  });
});

describe('activity fallback', () => {
  it('maps empty state with failed activity to failed', () => {
    expect(deriveStatus({ state: '' }, [activity({ sessionFailed: { reason: 'error' } })])).toBe('failed');
  });

  it('maps empty state with completed activity to completed', () => {
    expect(deriveStatus({ state: '' }, [activity({ sessionCompleted: {} })])).toBe('completed');
  });

  it('maps empty state with failed and completed activities to failed', () => {
    expect(
      deriveStatus({ state: '' }, [
        activity({ sessionCompleted: {} }),
        activity({ id: '2', sessionFailed: { reason: 'error' } }),
      ]),
    ).toBe('failed');
  });

  it('maps empty state with no activities to running', () => {
    expect(deriveStatus({ state: '' })).toBe('running');
  });

  it('maps STATE_UNSPECIFIED with no activities to running', () => {
    expect(deriveStatus({ state: 'STATE_UNSPECIFIED' })).toBe('running');
  });

  it('maps unknown state with no activities to running', () => {
    expect(deriveStatus({ state: 'SOMETHING_ELSE' })).toBe('running');
  });
});

describe('edge cases', () => {
  it('maps undefined state to running', () => {
    expect(deriveStatus({ state: undefined } as any)).toBe('running');
  });

  it('maps missing state field to running', () => {
    expect(deriveStatus({})).toBe('running');
  });

  it('maps null state to running', () => {
    expect(deriveStatus({ state: null } as any)).toBe('running');
  });
});
