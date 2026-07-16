import { describe, expect, it } from 'vitest';
import { translateError } from '../src/errors.js';

function httpError(status: number, message = `Jules API ${status}`) {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

describe('translateError', () => {
  describe('HTTP status codes', () => {
    it('translates 401 to AUTH_FAILED', () => {
      const result = translateError(httpError(401));
      expect(result.code).toBe('AUTH_FAILED');
      expect(result.problem).toBe('Authentication failed');
      expect(result.cause).toContain('API key');
      expect(result.fix).toContain('jules-dispatch init');
      expect(result.context?.docsUrl).toBeDefined();
    });

    it('translates 403 to AUTH_FAILED', () => {
      const result = translateError(httpError(403));
      expect(result.code).toBe('AUTH_FAILED');
      expect(result.problem).toBe('Authentication failed');
    });

    it('translates 404 to NOT_FOUND', () => {
      const result = translateError(httpError(404, 'Jules API 404 at /sessions/xxx'));
      expect(result.code).toBe('NOT_FOUND');
      expect(result.problem).toBe('Resource not found');
      expect(result.fix).toContain('Check the ID');
    });

    it('translates 429 to RATE_LIMITED', () => {
      const result = translateError(httpError(429));
      expect(result.code).toBe('RATE_LIMITED');
      expect(result.problem).toBe('Rate limited');
      expect(result.fix).toContain('--parallel');
    });

    it('translates 500 to SERVER_ERROR', () => {
      const result = translateError(httpError(500));
      expect(result.code).toBe('SERVER_ERROR');
      expect(result.problem).toBe('Jules API server error');
    });

    it('translates 502/503 to SERVER_ERROR', () => {
      expect(translateError(httpError(502)).code).toBe('SERVER_ERROR');
      expect(translateError(httpError(503)).code).toBe('SERVER_ERROR');
    });
  });

  describe('network errors', () => {
    it('translates TypeError with fetch to NETWORK_ERROR', () => {
      const result = translateError(new TypeError('fetch failed'));
      expect(result.code).toBe('NETWORK_ERROR');
      expect(result.problem).toBe('Network error');
      expect(result.fix).toContain('internet connection');
    });

    it('translates TypeError with ECONNREFUSED to NETWORK_ERROR', () => {
      const result = translateError(new TypeError('connect ECONNREFUSED 1.2.3.4:443'));
      expect(result.code).toBe('NETWORK_ERROR');
    });
  });

  describe('config errors', () => {
    it('translates JULES_API_KEY message to AUTH_MISSING', () => {
      const result = translateError(new Error('JULES_API_KEY is required. Set it in .env'));
      expect(result.code).toBe('AUTH_MISSING');
      expect(result.problem).toBe('API key not configured');
      expect(result.context?.docsUrl).toBeDefined();
    });
  });

  describe('validation errors', () => {
    it('translates missing title to VALIDATION', () => {
      const result = translateError(new Error('Missing "title" in tasks/foo.yaml'));
      expect(result.code).toBe('VALIDATION');
      expect(result.problem).toBe('Task file validation failed');
      expect(result.fix).toContain('doctor --task-file');
    });

    it('translates YAML parse error to VALIDATION', () => {
      const result = translateError(new Error('No YAML documents found in input'));
      expect(result.code).toBe('VALIDATION');
    });

    it('translates "No tasks found" to VALIDATION', () => {
      const result = translateError(new Error('No tasks found in file.yaml'));
      expect(result.code).toBe('VALIDATION');
    });

    it('preserves original message as cause for validation errors', () => {
      const msg = 'Missing "prompt" in tasks/bar.yaml';
      const result = translateError(new Error(msg));
      expect(result.cause).toBe(msg);
    });
  });

  describe('unknown errors', () => {
    it('does not mistake words containing "source" for task validation failures', () => {
      const result = translateError(new Error('Remote resource is temporarily unavailable'));

      expect(result.code).toBe('UNKNOWN');
    });

    it('falls back to UNKNOWN for unrecognized errors', () => {
      const result = translateError(new Error('something unexpected'));
      expect(result.code).toBe('UNKNOWN');
      expect(result.problem).toBe('something unexpected');
      expect(result.fix).toContain('--verbose');
    });

    it('handles non-Error throws', () => {
      const result = translateError('string error');
      expect(result.code).toBe('UNKNOWN');
      expect(result.problem).toBe('string error');
    });

    it('handles null/undefined', () => {
      const result = translateError(null);
      expect(result.code).toBe('UNKNOWN');
      expect(result.problem).toBe('Unexpected error');
    });
  });
});
