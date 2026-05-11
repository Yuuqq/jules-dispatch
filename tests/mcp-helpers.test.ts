import { describe, expect, it } from 'vitest';
import { ok, fail, computeRecoveryHint } from '../src/mcp-helpers.js';

describe('ok', () => {
  it('returns success with data and no meta key when meta is omitted', () => {
    const result = ok({ id: '1' });
    expect(result).toEqual({ success: true, data: { id: '1' } });
    expect(result).not.toHaveProperty('meta');
  });

  it('returns success with data and meta when meta is provided', () => {
    const result = ok({ id: '1' }, { total: 5 });
    expect(result).toEqual({ success: true, data: { id: '1' }, meta: { total: 5 } });
    expect(result).toHaveProperty('meta');
  });

  it('handles scalar data values', () => {
    const result = ok('scalar');
    expect(result).toEqual({ success: true, data: 'scalar' });
  });
});

describe('fail', () => {
  it('returns failure with message and recovery_hint, no code key when code is omitted', () => {
    const result = fail('not found', 'Check the resource ID and try again.');
    expect(result).toEqual({
      success: false,
      error: { message: 'not found', recovery_hint: 'Check the resource ID and try again.' },
    });
    expect(result.error).not.toHaveProperty('code');
  });

  it('returns failure with message, recovery_hint, and code when code is provided', () => {
    const result = fail('denied', 'Verify JULES_API_KEY is set and valid.', 'AUTH_REQUIRED');
    expect(result).toEqual({
      success: false,
      error: {
        message: 'denied',
        recovery_hint: 'Verify JULES_API_KEY is set and valid.',
        code: 'AUTH_REQUIRED',
      },
    });
    expect(result.error).toHaveProperty('code');
  });
});

describe('computeRecoveryHint', () => {
  it('returns auth message for 401', () => {
    expect(computeRecoveryHint(401)).toBe('Verify JULES_API_KEY is set and valid.');
  });

  it('returns auth message for 403', () => {
    expect(computeRecoveryHint(403)).toBe('Verify JULES_API_KEY is set and valid.');
  });

  it('returns not-found message for 404', () => {
    expect(computeRecoveryHint(404)).toBe('Check the resource ID and try again.');
  });

  it('returns generic message for 500', () => {
    expect(computeRecoveryHint(500)).toBe(
      'Check network connectivity and try again. If the problem persists, verify your API key.',
    );
  });

  it('returns generic message for undefined status', () => {
    expect(computeRecoveryHint(undefined)).toBe(
      'Check network connectivity and try again. If the problem persists, verify your API key.',
    );
  });

  it('returns generic message for unrecognized status code', () => {
    expect(computeRecoveryHint(0)).toBe(
      'Check network connectivity and try again. If the problem persists, verify your API key.',
    );
  });
});
