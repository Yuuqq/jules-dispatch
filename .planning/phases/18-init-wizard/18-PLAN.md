# Phase 18: Init Wizard

## Requirements
- ONB-01: `jules-dispatch init` wizard prompts for API key and default source, writes `.env` file
- ONB-02: Non-interactive mode via `--api-key` and `--source` flags for CI/scripting
- ONB-03: Safe config handling — detect existing `.env`, show current values as defaults, backup before overwrite

## Plan 18-01: Init command with interactive and non-interactive modes

### New file: src/init.ts

```typescript
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { JulesClient } from './client.js';
import chalk from 'chalk';
import { emit, info } from './output.js';

export interface InitOptions {
  apiKey?: string;
  source?: string;
  branch?: string;
  interactive: boolean;
  projectDir: string;
}

export interface InitResult {
  envPath: string;
  created: boolean;
  backed: boolean;
  values: { apiKey: string; source: string; branch: string };
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const envPath = resolve(options.projectDir, '.env');
  const existingValues = parseEnv(envPath);
  let apiKey = options.apiKey ?? '';
  let source = options.source ?? '';
  let branch = options.branch ?? '';

  if (!options.interactive && !apiKey) {
    throw new Error('Non-interactive mode requires --api-key. Use --api-key and optionally --source.');
  }

  if (options.interactive) {
    apiKey = await prompt('Jules API key', existingValues.JULES_API_KEY ?? apiKey);
    source = await prompt('Default source (e.g. sources/github/owner/repo)', existingValues.JULES_DEFAULT_SOURCE ?? source);
    branch = await prompt('Default branch', existingValues.JULES_DEFAULT_BRANCH ?? branch || 'main');
  }

  // Backup existing .env
  let backed = false;
  if (existsSync(envPath)) {
    const backupPath = resolve(options.projectDir, '.env.backup');
    copyFileSync(envPath, backupPath);
    backed = true;
  }

  // Write .env
  const lines = [
    `JULES_API_KEY=${apiKey}`,
    `JULES_DEFAULT_SOURCE=${source}`,
    `JULES_DEFAULT_BRANCH=${branch || 'main'}`,
  ];
  writeFileSync(envPath, lines.join('\n') + '\n');

  return {
    envPath,
    created: true,
    backed,
    values: { apiKey, source, branch: branch || 'main' },
  };
}

async function prompt(label: string, defaultVal: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const suffix = defaultVal ? ` [${defaultVal}]` : '';
    rl.question(`${label}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal);
    });
  });
}

function parseEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const content = readFileSync(path, 'utf8');
  const result: Record<string, string> = {};
  for (const rawLine of content.split('\n')) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}
```

### Changes to src/cli.ts

Add `init` command after the doctor command:

```typescript
program
  .command('init')
  .description('Set up API key and defaults for first-run (interactive wizard)')
  .option('--api-key <key>', 'Jules API key (non-interactive mode)')
  .option('-s, --source <source>', 'default source (non-interactive mode)')
  .option('-b, --branch <branch>', 'default branch (default: main)')
  .addHelpText('after', `
Examples:
  $ jules-dispatch init
  $ jules-dispatch init --api-key sk-xxx --source sources/github/owner/repo
  $ jules-dispatch init --api-key sk-xxx --source sources/github/owner/repo --branch main`)
  .action(async (opts: { apiKey?: string; source?: string; branch?: string }) => {
    const optsGlobal = program.opts() as { project: string };
    const projectDir = resolve(optsGlobal.project);
    const interactive = !opts.apiKey && process.stdin.isTTY;

    if (!interactive && !opts.apiKey) {
      const msg = 'Non-interactive mode requires --api-key. Use --api-key and optionally --source.';
      emitError(msg, 'NON_INTERACTIVE');
      process.exit(ExitCode.VALIDATION);
    }

    const { runInit } = await import('./init.js');
    try {
      const result = await runInit({
        apiKey: opts.apiKey,
        source: opts.source,
        branch: opts.branch,
        interactive,
        projectDir,
      });

      emit(
        () => {
          if (result.backed) {
            console.log(chalk.yellow('Backed up existing .env to .env.backup'));
          }
          console.log(chalk.green(`✓ Configuration written to ${result.envPath}`));
          console.log(chalk.dim(`  API key: ${'*'.repeat(8)}${result.values.apiKey.slice(-4)}`));
          console.log(chalk.dim(`  Source:  ${result.values.source || '(none)'}`));
          console.log(chalk.dim(`  Branch:  ${result.values.branch}`));
          console.log(chalk.dim('\nNext: jules-dispatch dispatch task.yaml'));
        },
        result,
      );
    } catch (err) {
      fail(err);
    }
  });
```

### New test file: tests/init.test.ts

Test scenarios:
1. Non-interactive mode writes .env with provided values
2. Non-interactive mode without --api-key throws
3. Interactive mode (mocked stdin) prompts for values
4. Existing .env gets backed up to .env.backup
5. Existing .env values shown as defaults
6. .env file contains correct format
