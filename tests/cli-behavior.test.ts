import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'jules-cli-test-'));
  tempDirs.push(dir);
  return dir;
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.JULES_API_KEY;
  delete env.JULES_DEFAULT_SOURCE;
  delete env.JULES_DEFAULT_BRANCH;
  delete env.JULES_AUTO_MODE;
  return env;
}

function runCli(args: string[], options: { env?: NodeJS.ProcessEnv; input?: string } = {}): Promise<CliResult> {
  const tsxCli = resolve('node_modules', 'tsx', 'dist', 'cli.mjs');
  const cli = resolve('src', 'cli.ts');

  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [tsxCli, cli, ...args], {
      cwd: process.cwd(),
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI timed out: ${args.join(' ')}`));
    }, 15000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', code => {
      clearTimeout(timer);
      resolveResult({ code, stdout, stderr });
    });
    child.stdin.end(options.input ?? '');
  });
}

function parseJsonLines(stdout: string): unknown[] {
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line) as unknown);
}

async function startPlannerServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            rationale: 'One independent task',
            tasks: [{ title: 'Planned task', prompt: 'Perform the planned task.' }],
          }),
        },
      }],
    }));
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Planner test server did not bind a TCP port');
  return { server, baseUrl: `http://127.0.0.1:${address.port}/v1` };
}

describe('CLI safety and structured failures', () => {
  it('allows auto --dry-run without a Jules API key', async () => {
    const dir = makeTempDir();
    const { server, baseUrl } = await startPlannerServer();
    const env = {
      ...cleanEnv(),
      LLM_API_KEY: 'planner-key',
      LLM_BASE_URL: baseUrl,
      LLM_MODEL: 'test-model',
    };

    try {
      const result = await runCli(
        ['--json', '--project', dir, 'auto', 'Plan a task', '--dry-run'],
        { env },
      );

      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(parseJsonLines(result.stdout)).toContainEqual(expect.objectContaining({
        dispatched: false,
        tasks: [expect.objectContaining({ title: 'Planned task' })],
      }));
    } finally {
      await new Promise<void>(resolveClose => server.close(() => resolveClose()));
    }
  });

  it('requires --yes before auto dispatches in JSON or non-TTY mode', async () => {
    const dir = makeTempDir();
    const { server, baseUrl } = await startPlannerServer();
    const env = {
      ...cleanEnv(),
      JULES_API_KEY: 'jules-key',
      LLM_API_KEY: 'planner-key',
      LLM_BASE_URL: baseUrl,
      LLM_MODEL: 'test-model',
    };

    try {
      const result = await runCli(
        ['--json', '--project', dir, 'auto', 'Plan and dispatch a task'],
        { env },
      );

      expect(result.code).toBe(3);
      expect(parseJsonLines(result.stdout)).toContainEqual({
        error: expect.objectContaining({ code: 'CONFIRMATION_REQUIRED' }),
      });
    } finally {
      await new Promise<void>(resolveClose => server.close(() => resolveClose()));
    }
  });

  it('reports missing Jules configuration as JSON with auth exit code 2', async () => {
    const dir = makeTempDir();
    const result = await runCli(
      ['--json', '--project', dir, 'sources'],
      { env: cleanEnv() },
    );

    expect(result.code).toBe(2);
    expect(result.stderr).toBe('');
    expect(parseJsonLines(result.stdout)).toEqual([{ error: expect.objectContaining({ code: 'AUTH_MISSING' }) }]);
  });

  it('maps invalid task files to validation exit code 3', async () => {
    const dir = makeTempDir();
    const taskFile = join(dir, 'empty.json');
    writeFileSync(taskFile, '[]');
    const env = { ...cleanEnv(), JULES_API_KEY: 'jules-key' };

    const result = await runCli(
      ['--json', '--project', dir, 'dispatch', taskFile],
      { env },
    );

    expect(result.code).toBe(3);
    expect(parseJsonLines(result.stdout)).toEqual([{ error: expect.objectContaining({ code: 'VALIDATION' }) }]);
  });

  it('rejects unsupported stdin formats before loading Jules configuration', async () => {
    const dir = makeTempDir();
    const result = await runCli(
      ['--json', '--project', dir, 'dispatch', '-', '--format', 'toml'],
      {
        env: cleanEnv(),
        input: JSON.stringify({ title: 'Task', prompt: 'Do work', source: 'source' }),
      },
    );

    expect(result.code).toBe(3);
    expect(parseJsonLines(result.stdout)).toEqual([{
      error: expect.objectContaining({ code: 'INVALID_FORMAT' }),
    }]);
  });
});
