import chalk from 'chalk';

export type OutputMode = 'text' | 'json';

let mode: OutputMode = 'text';

export function setOutputMode(m: OutputMode): void {
  mode = m;
  if (m === 'json') {
    chalk.level = 0;
  }
}

export function isJson(): boolean {
  return mode === 'json';
}

export function emit(textFn: () => void, jsonObj: unknown): void {
  if (mode === 'json') {
    process.stdout.write(JSON.stringify(jsonObj) + '\n');
  } else {
    textFn();
  }
}

export function emitError(message: string, code?: string, details?: unknown): void {
  if (mode === 'json') {
    process.stdout.write(
      JSON.stringify({ error: { code: code ?? 'ERROR', message, details } }) + '\n',
    );
  } else {
    console.error(chalk.red(`✗ ${message}`));
    if (details) console.error(chalk.dim(typeof details === 'string' ? details : JSON.stringify(details)));
  }
}

export function info(text: string): void {
  if (mode === 'text') console.log(text);
}

/**
 * Exit codes:
 *   0 — success
 *   1 — generic error
 *   2 — auth / config error
 *   3 — validation error (bad task file, bad args)
 *   4 — partial failure (some tasks in batch failed)
 *   5 — timeout (wait command)
 */
export const ExitCode = {
  OK: 0,
  GENERIC: 1,
  AUTH: 2,
  VALIDATION: 3,
  PARTIAL: 4,
  TIMEOUT: 5,
} as const;
