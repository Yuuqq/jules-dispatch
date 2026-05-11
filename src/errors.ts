export interface ErrorContext {
  hint?: string;
  docsUrl?: string;
}

export interface TranslatedError {
  problem: string;
  cause: string;
  fix: string;
  code: string;
  context?: ErrorContext;
}

function getHttpStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status?: unknown }).status;
    return typeof s === 'number' ? s : undefined;
  }
  return undefined;
}

function getMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}

export function translateError(err: unknown): TranslatedError {
  const status = getHttpStatus(err);
  const message = getMessage(err);

  if (status === 401 || status === 403) {
    return {
      problem: 'Authentication failed',
      cause: 'API key is invalid, expired, or missing',
      fix: 'Run `jules-dispatch init` or check `JULES_API_KEY` in `.env`',
      code: 'AUTH_FAILED',
      context: { docsUrl: 'https://github.com/nicholasgasior/jules-dispatch#authentication' },
    };
  }

  if (status === 404) {
    return {
      problem: 'Resource not found',
      cause: 'The session or source ID does not exist',
      fix: 'Check the ID and try again',
      code: 'NOT_FOUND',
    };
  }

  if (status === 429) {
    return {
      problem: 'Rate limited',
      cause: 'Too many requests to the Jules API',
      fix: 'Wait a moment and retry. Reduce `--parallel` for batch commands',
      code: 'RATE_LIMITED',
    };
  }

  if (status && status >= 500) {
    return {
      problem: 'Jules API server error',
      cause: 'The Jules service returned an internal error',
      fix: 'Retry in a few minutes. If persistent, check https://status.google.com for outages',
      code: 'SERVER_ERROR',
    };
  }

  if (err instanceof TypeError && /fetch|network|ECONNREFUSED|ENOTFOUND|socket/i.test(message)) {
    return {
      problem: 'Network error',
      cause: 'Cannot reach the Jules API server',
      fix: 'Check your internet connection. If behind a proxy, set `HTTPS_PROXY`',
      code: 'NETWORK_ERROR',
    };
  }

  if (/JULES_API_KEY/i.test(message)) {
    return {
      problem: 'API key not configured',
      cause: 'No Jules API key was found',
      fix: 'Set `JULES_API_KEY` in `.env` or pass `--api-key`',
      code: 'AUTH_MISSING',
      context: { docsUrl: 'https://github.com/nicholasgasior/jules-dispatch#setup' },
    };
  }

  if (/YAML|JSON|title|prompt|Invalid task|No (tasks|YAML|documents)/i.test(message)) {
    return {
      problem: 'Task file validation failed',
      cause: message,
      fix: 'Fix the task file. Run `jules-dispatch doctor --task-file <path>` to validate',
      code: 'VALIDATION',
    };
  }

  return {
    problem: message && message !== 'null' && message !== 'undefined' ? message : 'Unexpected error',
    cause: 'An unknown error occurred',
    fix: 'Run with `--verbose` for details. If persistent, file an issue at https://github.com/nicholasgasior/jules-dispatch/issues',
    code: 'UNKNOWN',
  };
}
