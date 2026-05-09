/**
 * Minimal verbose-aware logger. Two channels gated on a global flag:
 *
 *   verbose(...)  — one-liner messages (request method/path, response status)
 *   debug(label, obj) — structured data with timestamp (HTTP bodies, stacks)
 *   timed(label, fn)  — wrap a call, emit elapsed ms on completion
 *
 * All output goes to stderr so piped stdout stays clean.
 */

let _verbose =
  process.env.JULES_DISPATCH_VERBOSE === '1' || process.env.JULES_DISPATCH_VERBOSE === 'true';

/** Set verbose mode programmatically (the CLI calls this when --verbose is parsed). */
export function setVerbose(on: boolean): void {
  _verbose = on;
}

export function isVerbose(): boolean {
  return _verbose;
}

/** Print a verbose-only message to stderr. Prefixed with "[verbose]". */
export function verbose(...args: unknown[]): void {
  if (!_verbose) return;
  process.stderr.write(`[verbose] ${args.map(formatArg).join(' ')}\n`);
}

/**
 * Print structured debug info under a labeled header. Multi-line bodies
 * are indented two spaces. Pass plain objects, errors, or strings.
 */
export function debug(label: string, body?: unknown): void {
  if (!_verbose) return;
  const ts = new Date().toISOString().slice(11, 23);
  process.stderr.write(`[verbose ${ts}] ${label}\n`);
  if (body !== undefined) {
    const text = formatBody(body);
    for (const line of text.split('\n')) {
      process.stderr.write(`  ${line}\n`);
    }
  }
}

/**
 * Time a synchronous or async operation and emit a debug line with the
 * elapsed milliseconds when verbose is on. Returns the wrapped result.
 */
export async function timed<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
  if (!_verbose) return await fn();
  const start = Date.now();
  try {
    const result = await fn();
    debug(`${label} ok`, { ms: Date.now() - start });
    return result;
  } catch (err) {
    debug(`${label} threw`, { ms: Date.now() - start, error: (err as Error).message });
    throw err;
  }
}

function formatArg(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function formatBody(body: unknown): string {
  if (body instanceof Error) {
    return body.stack ?? `${body.name}: ${body.message}`;
  }
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}
