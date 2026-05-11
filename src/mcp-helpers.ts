/**
 * MCP response helpers — extracted from runMcpServer() for testability.
 */

export function ok<T>(data: T, meta?: Record<string, unknown>): { success: true; data: T; meta?: Record<string, unknown> } {
  return { success: true as const, data, ...(meta ? { meta } : {}) };
}

export function fail(message: string, recovery_hint: string, code?: string): { success: false; error: { message: string; recovery_hint: string; code?: string } } {
  return { success: false as const, error: { message, recovery_hint, ...((code ? { code } : {})) } };
}

export function computeRecoveryHint(status?: number): string {
  if (status === 401 || status === 403) return 'Verify JULES_API_KEY is set and valid.';
  if (status === 404) return 'Check the resource ID and try again.';
  return 'Check network connectivity and try again. If the problem persists, verify your API key.';
}
