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

  it('does not retry ambiguous 5xx responses for session-creating POST requests', async () => {
    const fetchMock = mockFetch().mockResolvedValue(jsonResponse({}, 500));
    const client = new JulesClient({ apiKey: 'test-key' });

    await expect(client.createSession({
      prompt: 'Do work',
      source: 'sources/github/owner/repo',
      branch: 'main',
      title: 'Task',
    })).rejects.toMatchObject({ status: 500 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still retries throttled POST requests because a 429 is not an ambiguous success', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fetchMock = mockFetch()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse({ id: 'sess-1' }));
    const client = new JulesClient({ apiKey: 'test-key' });

    const resultPromise = client.createSession({
      prompt: 'Do work',
      source: 'sources/github/owner/repo',
      branch: 'main',
      title: 'Task',
    });
    await vi.advanceTimersByTimeAsync(500);

    await expect(resultPromise).resolves.toMatchObject({ id: 'sess-1' });
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
  it('aborts a Jules request after the configured timeout', async () => {
    const fetchMock = mockFetch().mockImplementation((_url, init: RequestInit) => (
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      })
    ));
    const client = new JulesClient({ apiKey: 'test-key', requestTimeoutMs: 5 });

    await expect(client.listSources()).rejects.toThrow('timed out after 5ms');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

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

  it('does not retry ambiguous transport failures for message POST requests', async () => {
    const fetchMock = mockFetch().mockRejectedValue(new TypeError('connection reset'));
    const client = new JulesClient({ apiKey: 'test-key' });

    await expect(client.sendMessage('sess-1', 'Continue')).rejects.toThrow('connection reset');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('current Jules REST contract', () => {
  it('uses the documented maximum page size when listing sources', async () => {
    const fetchMock = mockFetch().mockResolvedValue(jsonResponse({ sources: [] }));
    const client = new JulesClient({ apiKey: 'test-key' });

    await client.listSources();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sources?pageSize=100'),
      expect.any(Object),
    );
  });

  it('caps session page size at the documented maximum', async () => {
    const fetchMock = mockFetch().mockResolvedValue(jsonResponse({ sessions: [] }));
    const client = new JulesClient({ apiKey: 'test-key' });

    await client.listSessions(200);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sessions?pageSize=100'),
      expect.any(Object),
    );
  });

  it('uses only supported activity pagination query parameters', async () => {
    const fetchMock = mockFetch().mockResolvedValue(jsonResponse({ activities: [] }));
    const client = new JulesClient({ apiKey: 'test-key' });

    await client.listActivities('session-1', 30, 'page-2');

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('pageSize=30');
    expect(url).toContain('pageToken=page-2');
    expect(url).not.toContain('createTime=');
  });

  it('normalizes omitted list arrays to empty arrays', async () => {
    const fetchMock = mockFetch()
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));
    const client = new JulesClient({ apiKey: 'test-key' });

    await expect(client.listSources()).resolves.toEqual({ sources: [] });
    await expect(client.listSessions()).resolves.toEqual({ sessions: [] });
    await expect(client.listActivities('sess-1')).resolves.toEqual({ activities: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejects a repeated source page token instead of looping forever', async () => {
    const fetchMock = mockFetch()
      .mockResolvedValueOnce(jsonResponse({
        sources: [{ id: 'source-1', name: 'sources/1' }],
        nextPageToken: 'repeat-token',
      }))
      .mockResolvedValueOnce(jsonResponse({
        sources: [{ id: 'source-2', name: 'sources/2' }],
        nextPageToken: 'repeat-token',
      }));
    const client = new JulesClient({ apiKey: 'test-key' });

    const collect = async () => {
      const sources = [];
      for await (const source of client.iterateSources()) sources.push(source);
      return sources;
    };

    await expect(collect()).rejects.toThrow(/repeated page token/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects repeated session and activity page tokens', async () => {
    const client = new JulesClient({ apiKey: 'test-key' });
    const fetchMock = mockFetch()
      .mockResolvedValueOnce(jsonResponse({ sessions: [], nextPageToken: 'same' }))
      .mockResolvedValueOnce(jsonResponse({ sessions: [], nextPageToken: 'same' }));

    const collectSessions = async () => {
      for await (const _session of client.iterateSessions()) {
        // Consume the iterator to exercise pagination.
      }
    };
    await expect(collectSessions()).rejects.toThrow(/repeated page token/i);

    fetchMock.mockReset()
      .mockResolvedValueOnce(jsonResponse({ activities: [], nextPageToken: 'same' }))
      .mockResolvedValueOnce(jsonResponse({ activities: [], nextPageToken: 'same' }));
    const collectActivities = async () => {
      for await (const _activity of client.iterateActivities('sess-1')) {
        // Consume the iterator to exercise pagination.
      }
    };
    await expect(collectActivities()).rejects.toThrow(/repeated page token/i);
  });

  it('passes server page tokens through the activity iterator', async () => {
    const fetchMock = mockFetch()
      .mockResolvedValueOnce(jsonResponse({ activities: [], nextPageToken: 'page-2' }))
      .mockResolvedValueOnce(jsonResponse({ activities: [] }));
    const client = new JulesClient({ apiKey: 'test-key' });

    for await (const _activity of client.iterateActivities('sess-1', 100)) {
      // No activities are needed; only the generated requests matter.
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('pageToken=');
    expect(String(fetchMock.mock.calls[1][0])).toContain('pageToken=page-2');
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('createTime=');
  });

  it('finds a generated plan on a later activity page', async () => {
    const fetchMock = mockFetch()
      .mockResolvedValueOnce(jsonResponse({
        activities: [activity({ id: 'newer-progress', progressUpdated: { title: 'Working' } })],
        nextPageToken: 'older-page',
      }))
      .mockResolvedValueOnce(jsonResponse({
        activities: [activity({
          id: 'older-plan',
          createTime: '2025-12-31T23:00:00Z',
          planGenerated: { plan: { id: 'plan-1', steps: [] } },
        })],
      }));
    const client = new JulesClient({ apiKey: 'test-key' });

    await expect(client.getLatestPlan('sess-1')).resolves.toMatchObject({ id: 'plan-1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deletes a session using DELETE /sessions/{id}', async () => {
    const fetchMock = mockFetch().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new JulesClient({ apiKey: 'test-key' });

    await client.cancelSession('session/with spaces');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sessions/session%2Fwith%20spaces'),
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(fetchMock.mock.calls[0][0]).not.toContain(':cancel');
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body');
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

  it('maps AWAITING_USER_FEEDBACK to awaiting_user_feedback', () => {
    expect(deriveStatus({ state: 'AWAITING_USER_FEEDBACK' })).toBe('awaiting_user_feedback');
  });

  it('maps PAUSED to paused', () => {
    expect(deriveStatus({ state: 'PAUSED' })).toBe('paused');
  });

  it.each(['QUEUED', 'PLANNING', 'IN_PROGRESS'])('maps %s to running', (state) => {
    expect(deriveStatus({ state })).toBe('running');
  });

  it('maps RUNNING to running', () => {
    expect(deriveStatus({ state: 'RUNNING' })).toBe('running');
  });

  it('maps PENDING to running', () => {
    expect(deriveStatus({ state: 'PENDING' })).toBe('running');
  });

  it('maps legacy AWAITING_USER_INPUT to awaiting_user_feedback', () => {
    expect(deriveStatus({ state: 'AWAITING_USER_INPUT' })).toBe('awaiting_user_feedback');
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

  it('treats COMPLETED as stale after a newer user message resumes work', () => {
    expect(deriveStatus({ state: 'COMPLETED' }, [
      activity({
        id: 'completed-1',
        createTime: '2026-01-01T00:01:00Z',
        sessionCompleted: {},
      }),
      activity({
        id: 'feedback-1',
        createTime: '2026-01-01T00:02:00Z',
        originator: 'user',
        userMessaged: { userMessage: 'Please revise it.' },
      }),
    ])).toBe('running');
  });

  it('returns COMPLETED again after resumed work emits a newer terminal event', () => {
    expect(deriveStatus({ state: 'COMPLETED' }, [
      activity({
        id: 'completed-1',
        createTime: '2026-01-01T00:01:00Z',
        sessionCompleted: {},
      }),
      activity({
        id: 'feedback-1',
        createTime: '2026-01-01T00:02:00Z',
        originator: 'user',
        userMessaged: { userMessage: 'Please revise it.' },
      }),
      activity({
        id: 'completed-2',
        createTime: '2026-01-01T00:03:00Z',
        sessionCompleted: {},
      }),
    ])).toBe('completed');
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
