import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadConfig, loadProjectEnv, loadTasks } from './config.js';
import { JulesClient } from './client.js';
import type { JulesConfig } from './types.js';

export interface DoctorCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface DoctorResult {
  checks: DoctorCheck[];
  exitCode: number;
}

export function checkNodeVersion(version: string = process.version): DoctorCheck {
  const match = version.match(/^v(\d+)/);
  const major = match ? parseInt(match[1], 10) : 0;
  if (major >= 20) {
    return { name: 'node_version', status: 'pass', message: `Node.js ${version} (meets >= 20 requirement)` };
  }
  return { name: 'node_version', status: 'warn', message: `Node.js ${version} (>= 20 recommended)` };
}

import type { ExecSyncOptionsWithStringEncoding } from 'node:child_process';

export function checkNpm(execFn: (cmd: string, opts: ExecSyncOptionsWithStringEncoding) => string = (cmd, opts) => execSync(cmd, opts)): DoctorCheck {
  try {
    const version = execFn('npm --version', { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return { name: 'npm', status: 'pass', message: `npm v${version}` };
  } catch {
    return { name: 'npm', status: 'fail', message: 'npm not found in PATH' };
  }
}

export function checkApiKey(projectDir: string, apiKeyOverride?: string): DoctorCheck {
  try {
    loadProjectEnv(projectDir);
    const apiKey = (apiKeyOverride ?? process.env.JULES_API_KEY ?? '').trim();
    if (!apiKey) throw new Error('missing API key');
    return { name: 'api_key', status: 'pass', message: 'JULES_API_KEY is set' };
  } catch {
    return { name: 'api_key', status: 'fail', message: 'JULES_API_KEY not set (set in .env, environment, or pass --api-key)' };
  }
}

export function checkConfiguration(projectDir: string, apiKeyOverride?: string): DoctorCheck {
  try {
    loadConfig(projectDir, { apiKeyOverride, noExit: true });
    return { name: 'configuration', status: 'pass', message: 'Jules configuration is valid' };
  } catch (err) {
    return { name: 'configuration', status: 'fail', message: (err as Error).message };
  }
}

export async function checkApiConnectivity(config: JulesConfig): Promise<DoctorCheck> {
  try {
    const client = new JulesClient(config);
    await client.listSources();
    return { name: 'api_connectivity', status: 'pass', message: 'Jules API reachable' };
  } catch (err) {
    const error = err as Error & { status?: number };
    if (error.status === 401 || error.status === 403) {
      return { name: 'api_connectivity', status: 'fail', message: 'Jules API auth failed -- check JULES_API_KEY' };
    }
    return { name: 'api_connectivity', status: 'fail', message: `Jules API unreachable: ${error.message}` };
  }
}

export function checkTaskFile(filePath: string): DoctorCheck {
  if (!existsSync(filePath)) {
    return { name: 'task_file', status: 'fail', message: `File not found: ${filePath}` };
  }
  try {
    const tasks = loadTasks(filePath);
    return { name: 'task_file', status: 'pass', message: `Task file valid (${tasks.length} task(s))` };
  } catch (err) {
    return { name: 'task_file', status: 'fail', message: `Task file invalid: ${(err as Error).message}` };
  }
}

export async function runDoctor(
  projectDir: string,
  options?: { apiKeyOverride?: string; taskFile?: string },
): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];

  checks.push(checkNodeVersion());
  checks.push(checkNpm());

  const apiKeyCheck = checkApiKey(projectDir, options?.apiKeyOverride);
  checks.push(apiKeyCheck);

  if (apiKeyCheck.status === 'pass') {
    const configurationCheck = checkConfiguration(projectDir, options?.apiKeyOverride);
    checks.push(configurationCheck);
    if (configurationCheck.status === 'pass') {
      const config = loadConfig(projectDir, { apiKeyOverride: options?.apiKeyOverride });
      checks.push(await checkApiConnectivity(config));
    }
  }

  if (options?.taskFile) {
    checks.push(checkTaskFile(options.taskFile));
  }

  const hasAuthFail = checks.some(c => c.status === 'fail' && (c.name === 'api_key' || c.name === 'api_connectivity'));
  const hasValidationFail = checks.some(c => (
    c.status === 'fail' && (c.name === 'configuration' || c.name === 'task_file')
  ));
  const hasAnyFail = checks.some(c => c.status === 'fail');

  let exitCode = 0;
  if (hasAuthFail) exitCode = 2;
  else if (hasValidationFail) exitCode = 3;
  else if (hasAnyFail) exitCode = 1;

  return { checks, exitCode };
}
