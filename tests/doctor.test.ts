import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkNodeVersion,
  checkNpm,
  checkApiKey,
  checkApiConnectivity,
  checkTaskFile,
  runDoctor,
} from '../src/doctor.js';
import { JulesClient } from '../src/client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function mockFetch() {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('checkNodeVersion', () => {
  it('returns pass for Node.js >= 22', () => {
    const check = checkNodeVersion('v22.0.0');
    expect(check.name).toBe('node_version');
    expect(check.status).toBe('pass');
    expect(check.message).toContain('22');
    expect(check.message).toContain('>= 20');
  });

  it('returns pass for Node.js >= 20', () => {
    const check = checkNodeVersion('v20.11.0');
    expect(check.status).toBe('pass');
    expect(check.message).toContain('20.11.0');
  });

  it('returns warn for Node.js < 20', () => {
    const check = checkNodeVersion('v18.17.0');
    expect(check.status).toBe('warn');
    expect(check.message).toContain('18');
    expect(check.message).toContain('>= 20 recommended');
  });
});

describe('checkNpm', () => {
  it('returns pass when npm is available', () => {
    const mockExec = vi.fn().mockReturnValue('10.2.0\n');
    const check = checkNpm(mockExec);
    expect(check.name).toBe('npm');
    expect(check.status).toBe('pass');
    expect(check.message).toContain('10.2.0');
  });

  it('returns fail when npm is not found', () => {
    const mockExec = vi.fn().mockImplementation(() => { throw new Error('not found'); });
    const check = checkNpm(mockExec);
    expect(check.status).toBe('fail');
    expect(check.message).toContain('not found');
  });
});

describe('checkApiKey', () => {
  it('returns pass when JULES_API_KEY is set', () => {
    const original = process.env.JULES_API_KEY;
    process.env.JULES_API_KEY = 'test-key';
    try {
      const check = checkApiKey('/fake/project');
      expect(check.name).toBe('api_key');
      expect(check.status).toBe('pass');
      expect(check.message).toContain('set');
    } finally {
      if (original === undefined) delete process.env.JULES_API_KEY;
      else process.env.JULES_API_KEY = original;
    }
  });

  it('returns fail when JULES_API_KEY is missing', () => {
    const original = process.env.JULES_API_KEY;
    delete process.env.JULES_API_KEY;
    try {
      const check = checkApiKey('/fake/project');
      expect(check.status).toBe('fail');
      expect(check.message).toContain('JULES_API_KEY');
    } finally {
      if (original === undefined) delete process.env.JULES_API_KEY;
      else process.env.JULES_API_KEY = original;
    }
  });
});

describe('checkApiConnectivity', () => {
  it('returns pass when API responds successfully', async () => {
    const fetchMock = mockFetch().mockResolvedValue(
      jsonResponse({ sources: [], nextPageToken: undefined }),
    );
    const config = { apiKey: 'test-key', defaultSource: '', defaultBranch: 'main', autoMode: 'AUTO_CREATE_PR' as const };

    const check = await checkApiConnectivity(config);

    expect(check.name).toBe('api_connectivity');
    expect(check.status).toBe('pass');
    expect(check.message).toContain('reachable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns fail with auth message when API returns 401', async () => {
    mockFetch().mockResolvedValue(jsonResponse({}, 401));
    const config = { apiKey: 'bad-key', defaultSource: '', defaultBranch: 'main', autoMode: 'AUTO_CREATE_PR' as const };

    const check = await checkApiConnectivity(config);

    expect(check.status).toBe('fail');
    expect(check.message).toContain('auth');
  });

  it('returns fail with unreachable message on network error', async () => {
    // Use a non-TypeError to avoid triggering JulesClient's retry logic
    mockFetch().mockRejectedValue(new Error('ENOTFOUND'));
    const config = { apiKey: 'test-key', defaultSource: '', defaultBranch: 'main', autoMode: 'AUTO_CREATE_PR' as const };

    const check = await checkApiConnectivity(config);

    expect(check.status).toBe('fail');
    expect(check.message).toContain('unreachable');
  });
});

describe('checkTaskFile', () => {
  it('returns pass for a valid YAML task file', async () => {
    const { writeFileSync, unlinkSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const tmpDir = join(process.cwd(), '.tmp-doctor-test');
    mkdirSync(tmpDir, { recursive: true });
    const tmpFile = join(tmpDir, 'valid-task.yaml');
    writeFileSync(tmpFile, 'title: Test Task\nprompt: Do something\n');

    try {
      const check = checkTaskFile(tmpFile);
      expect(check.name).toBe('task_file');
      expect(check.status).toBe('pass');
      expect(check.message).toContain('valid');
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it('returns fail when task file is missing prompt', async () => {
    const { writeFileSync, unlinkSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const tmpDir = join(process.cwd(), '.tmp-doctor-test');
    mkdirSync(tmpDir, { recursive: true });
    const tmpFile = join(tmpDir, 'invalid-task.yaml');
    writeFileSync(tmpFile, 'title: Missing Prompt\n');

    try {
      const check = checkTaskFile(tmpFile);
      expect(check.status).toBe('fail');
      expect(check.message).toContain('prompt');
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it('returns fail when task file does not exist', () => {
    const check = checkTaskFile('/nonexistent/file.yaml');
    expect(check.status).toBe('fail');
    expect(check.message).toContain('not found');
  });
});

describe('runDoctor', () => {
  it('returns all passing checks when env is valid and API responds', async () => {
    mockFetch().mockResolvedValue(
      jsonResponse({ sources: [], nextPageToken: undefined }),
    );
    const original = process.env.JULES_API_KEY;
    process.env.JULES_API_KEY = 'test-key';
    try {
      const result = await runDoctor('/fake/project');
      const names = result.checks.map(c => c.name);
      expect(names).toContain('node_version');
      expect(names).toContain('npm');
      expect(names).toContain('api_key');
      expect(names).toContain('api_connectivity');

      const apiKeyCheck = result.checks.find(c => c.name === 'api_key');
      expect(apiKeyCheck?.status).toBe('pass');

      const connectivityCheck = result.checks.find(c => c.name === 'api_connectivity');
      expect(connectivityCheck?.status).toBe('pass');

      expect(result.exitCode).toBe(0);
    } finally {
      if (original === undefined) delete process.env.JULES_API_KEY;
      else process.env.JULES_API_KEY = original;
    }
  });

  it('skips connectivity check when API key is missing', async () => {
    const original = process.env.JULES_API_KEY;
    delete process.env.JULES_API_KEY;
    try {
      const result = await runDoctor('/fake/project');
      const apiKeyCheck = result.checks.find(c => c.name === 'api_key');
      expect(apiKeyCheck?.status).toBe('fail');

      const connectivityCheck = result.checks.find(c => c.name === 'api_connectivity');
      expect(connectivityCheck).toBeUndefined();

      expect(result.exitCode).toBe(2);
    } finally {
      if (original === undefined) delete process.env.JULES_API_KEY;
      else process.env.JULES_API_KEY = original;
    }
  });

  it('includes task_file check when taskFile option is provided', async () => {
    mockFetch().mockResolvedValue(
      jsonResponse({ sources: [], nextPageToken: undefined }),
    );
    const original = process.env.JULES_API_KEY;
    process.env.JULES_API_KEY = 'test-key';
    try {
      const { writeFileSync, unlinkSync, mkdirSync } = await import('node:fs');
      const { join } = await import('node:path');
      const tmpDir = join(process.cwd(), '.tmp-doctor-test');
      mkdirSync(tmpDir, { recursive: true });
      const tmpFile = join(tmpDir, 'run-doctor-task.yaml');
      writeFileSync(tmpFile, 'title: Test\nprompt: Hello\n');

      try {
        const result = await runDoctor('/fake/project', { taskFile: tmpFile });
        const taskCheck = result.checks.find(c => c.name === 'task_file');
        expect(taskCheck?.status).toBe('pass');
      } finally {
        unlinkSync(tmpFile);
      }
    } finally {
      if (original === undefined) delete process.env.JULES_API_KEY;
      else process.env.JULES_API_KEY = original;
    }
  });
});
