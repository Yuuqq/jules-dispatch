/**
 * Optional LLM-powered task planner.
 *
 * Talks to ANY OpenAI-compatible /chat/completions endpoint:
 *   - OpenAI            (https://api.openai.com/v1)
 *   - OpenRouter        (https://openrouter.ai/api/v1)
 *   - Ollama            (http://localhost:11434/v1)
 *   - vLLM / LiteLLM / Together / DeepInfra / Groq / Fireworks / Azure OpenAI
 *   - Any private inference server speaking the OpenAI Chat Completions schema
 *
 * This module is **entirely optional** — `dispatch`, `batch`, `wait`, `tail`,
 * `mcp`, etc. all work without any LLM key. Only the `plan-tasks` and `auto`
 * commands (and the `jules_plan_tasks` / `jules_auto` MCP tools) need it.
 */

import type { TaskDefinition } from './types.js';

export interface PlannerConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  defaultSource?: string;
  defaultBranch?: string;
  /** Optional title sent as `X-Title` (used for analytics/billing on some providers like OpenRouter). */
  appTitle?: string;
  /** Optional referer sent as `HTTP-Referer` (OpenRouter convention; ignored by others). */
  appReferer?: string;
  requestTimeoutMs?: number;
}

export interface PlannerOptions {
  apiKeyOverride?: string;
  modelOverride?: string;
  baseUrlOverride?: string;
}

/**
 * Resolve planner config from env / overrides.
 *
 * Resolution order for each field (first non-empty wins):
 *   apiKey:   override → LLM_API_KEY → OPENAI_API_KEY → OPENROUTER_API_KEY (legacy)
 *             → AI_INTEGRATIONS_OPENROUTER_API_KEY (Replit integration)
 *   baseUrl:  override → LLM_BASE_URL → OPENAI_BASE_URL → OPENROUTER_BASE_URL (legacy)
 *             → AI_INTEGRATIONS_OPENROUTER_BASE_URL → https://api.openai.com/v1
 *   model:    override → LLM_MODEL → OPENAI_MODEL → OPENROUTER_MODEL (legacy) → gpt-4o-mini
 *
 * Throws if no API key is found anywhere.
 */
export function loadPlannerConfig(opts: PlannerOptions = {}): PlannerConfig {
  const apiKey = firstNonEmpty(
    opts.apiKeyOverride,
    process.env.LLM_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.OPENROUTER_API_KEY,
    process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
  );

  if (!apiKey) {
    throw new Error(
      'No LLM API key found. The planner is OPTIONAL — only needed for `plan-tasks`, ' +
      '`auto`, and the `jules_plan_tasks` / `jules_auto` MCP tools.\n\n' +
      'To enable it, set ONE of these:\n' +
      '  LLM_API_KEY=...           (preferred, generic)\n' +
      '  OPENAI_API_KEY=...        (works automatically)\n' +
      '  OPENROUTER_API_KEY=...    (legacy alias)\n' +
      'or pass --llm-key <key> on the command line.\n\n' +
      'Then optionally set LLM_BASE_URL (default: https://api.openai.com/v1) ' +
      'and LLM_MODEL (default: gpt-4o-mini) to point at any OpenAI-compatible provider.',
    );
  }

  const baseUrl = firstNonEmpty(
    opts.baseUrlOverride,
    process.env.LLM_BASE_URL,
    process.env.OPENAI_BASE_URL,
    process.env.OPENROUTER_BASE_URL,
    process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
  ) ?? 'https://api.openai.com/v1';

  const model = firstNonEmpty(
    opts.modelOverride,
    process.env.LLM_MODEL,
    process.env.OPENAI_MODEL,
    process.env.OPENROUTER_MODEL,
  ) ?? 'gpt-4o-mini';

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model,
    defaultSource: process.env.JULES_DEFAULT_SOURCE,
    defaultBranch: process.env.JULES_DEFAULT_BRANCH,
    appTitle: process.env.LLM_APP_TITLE ?? 'jules-dispatch planner',
    appReferer: process.env.LLM_APP_REFERER ?? 'https://github.com/Yuuqq/jules-dispatch',
  };
}

/** Returns true if a planner-capable API key is present (without throwing). */
export function isPlannerConfigured(): boolean {
  return Boolean(firstNonEmpty(
    process.env.LLM_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.OPENROUTER_API_KEY,
    process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
  ));
}

export interface PlanRequest {
  description: string;
  source?: string;
  branch?: string;
  maxTasks?: number;
  context?: string;
  requirePlanApproval?: boolean;
  autoMode?: 'AUTO_CREATE_PR' | 'NONE';
}

export interface PlanResult {
  model: string;
  tasks: TaskDefinition[];
  rationale?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

const SYSTEM_PROMPT = `You are a task planner for **jules-dispatch**, a tool that fans out coding work to many parallel Google Jules agents.

Given a high-level intent, decompose it into a set of **independent, parallelizable** tasks. Each task becomes its own Jules coding session that runs concurrently and opens its own Pull Request.

Hard rules:
1. Tasks MUST be independent — no task may depend on another task's output.
2. Each task should touch a focused, non-overlapping area of the codebase if possible.
3. Each prompt must be self-contained, detailed, and actionable: spell out files/modules, behavior, acceptance criteria, and any constraints. A Jules agent reading the prompt alone should know exactly what to do.
4. Titles are short (≤ 60 chars), imperative ("Add X", "Refactor Y").
5. Prefer 3–10 tasks unless explicitly asked otherwise. If the intent is genuinely a single task, return one task.
6. Do NOT emit tasks that just say "review", "plan", or "investigate" — every task must produce a code change worth a PR.

Output **only** a JSON object matching this schema, no markdown, no prose:
{
  "rationale": "1–2 sentence explanation of how you split the work",
  "tasks": [
    { "title": "string", "prompt": "string (multi-line OK)" }
  ]
}`;

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string; code?: number | string };
}

export async function planTasks(
  cfg: PlannerConfig,
  req: PlanRequest,
): Promise<PlanResult> {
  const normalizedRequest = validatePlanRequest(req);
  const userPrompt = buildUserPrompt(normalizedRequest);

  // Try with response_format json_object first; fall back to a plain call if
  // the provider rejects the field (some Ollama / vLLM models do).
  const baseBody = {
    model: cfg.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.apiKey}`,
    'Content-Type': 'application/json',
  };
  // OpenRouter-specific (ignored by other providers).
  if (cfg.appReferer) headers['HTTP-Referer'] = cfg.appReferer;
  if (cfg.appTitle) headers['X-Title'] = cfg.appTitle;

  let resp = await requestCompletion(
    cfg,
    headers,
    JSON.stringify({ ...baseBody, response_format: { type: 'json_object' } }),
  );

  // Retry without response_format ONLY when the provider explicitly rejects
  // that field. Some Ollama / vLLM models 400 on it. Retrying on any other
  // 400 (bad model name, bad key, malformed request) would mask the real
  // error and confuse the user, so inspect the body before falling back.
  if (resp.status === 400) {
    const firstBody = await resp.text().catch(() => '');
    if (/response_format/i.test(firstBody)) {
      resp = await requestCompletion(cfg, headers, JSON.stringify(baseBody));
    } else {
      throw new Error(`LLM request failed (400) at ${cfg.baseUrl}: ${firstBody.slice(0, 500)}`);
    }
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`LLM request failed (${resp.status}) at ${cfg.baseUrl}: ${text.slice(0, 500)}`);
  }

  const data = (await resp.json()) as ChatCompletionResponse;
  if (data.error) throw new Error(`LLM error: ${data.error.message ?? JSON.stringify(data.error)}`);

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('LLM returned an empty completion');

  const parsed = parsePlanJson(content);
  const plannedTasks = normalizedRequest.maxTasks === undefined
    ? parsed.tasks
    : parsed.tasks.slice(0, normalizedRequest.maxTasks);
  const enriched = plannedTasks.map(t => ({
    title: t.title,
    prompt: t.prompt,
    source: normalizedRequest.source ?? cfg.defaultSource,
    branch: normalizedRequest.branch ?? cfg.defaultBranch,
    autoMode: normalizedRequest.autoMode,
    requirePlanApproval: normalizedRequest.requirePlanApproval,
  } as TaskDefinition));

  return {
    model: cfg.model,
    tasks: enriched,
    rationale: parsed.rationale,
    usage: {
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens,
    },
  };
}

async function requestCompletion(
  cfg: PlannerConfig,
  headers: Record<string, string>,
  body: string,
): Promise<Response> {
  const timeoutMs = Number.isFinite(cfg.requestTimeoutMs) && cfg.requestTimeoutMs! > 0
    ? Math.trunc(cfg.requestTimeoutMs!)
    : 60000;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    return await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body,
      signal,
    });
  } catch (err) {
    if (signal.aborted) {
      throw new Error(`LLM request timed out after ${timeoutMs}ms at ${cfg.baseUrl}`);
    }
    throw err;
  }
}

function buildUserPrompt(req: PlanRequest): string {
  const parts: string[] = [];
  parts.push(`# Intent\n${req.description.trim()}`);
  if (req.source) parts.push(`# Repo (Jules source)\n${req.source}`);
  if (req.branch) parts.push(`# Starting branch\n${req.branch}`);
  if (typeof req.maxTasks === 'number') {
    parts.push(`# Constraint\nReturn at most ${req.maxTasks} tasks.`);
  }
  if (req.context && req.context.trim()) {
    parts.push(`# Repository context (for grounding only — do not echo)\n${req.context.trim().slice(0, 8000)}`);
  }
  parts.push(
    '# Output\nReturn ONLY the JSON object specified in the system prompt. ' +
    'No markdown, no commentary, no code fences.',
  );
  return parts.join('\n\n');
}

interface RawPlan {
  rationale?: string;
  tasks: Array<{ title: string; prompt: string }>;
}

function parsePlanJson(raw: string): RawPlan {
  // Strip code fences defensively in case the model returns ```json ... ```
  let cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  // Some models prepend prose before the JSON; try to grab the outermost { ... } block.
  if (!cleaned.startsWith('{')) {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Planner returned invalid JSON: ${(err as Error).message}\n--- raw ---\n${raw.slice(0, 800)}`);
  }

  const obj = parsed as { rationale?: string; tasks?: unknown };
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.tasks)) {
    throw new Error(`Planner JSON missing "tasks" array. Got: ${JSON.stringify(parsed).slice(0, 400)}`);
  }
  const tasks: Array<{ title: string; prompt: string }> = [];
  for (const [i, task] of obj.tasks.entries()) {
    const t = task && typeof task === 'object' && !Array.isArray(task)
      ? task as Record<string, unknown>
      : undefined;
    const title = typeof t?.title === 'string' ? t.title.trim() : '';
    const prompt = typeof t?.prompt === 'string' ? t.prompt.trim() : '';
    if (!title || !prompt) {
      throw new Error(`Planner task #${i + 1} missing title or prompt`);
    }
    tasks.push({ title, prompt });
  }
  if (tasks.length === 0) throw new Error('Planner returned zero tasks');
  return { rationale: typeof obj.rationale === 'string' ? obj.rationale : undefined, tasks };
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function validatePlanRequest(req: PlanRequest): PlanRequest {
  if (!req || typeof req !== 'object') {
    throw new Error('Planner request must be an object');
  }

  const description = requiredPlanString(req.description, 'description');
  const source = optionalPlanString(req.source, 'source');
  const branch = optionalPlanString(req.branch, 'branch');
  const context = optionalPlanString(req.context, 'context');

  let maxTasks: number | undefined;
  if (req.maxTasks !== undefined) {
    if (!Number.isInteger(req.maxTasks) || req.maxTasks < 1 || req.maxTasks > 50) {
      throw new Error('Planner maxTasks must be an integer between 1 and 50');
    }
    maxTasks = req.maxTasks;
  }

  if (req.autoMode !== undefined && req.autoMode !== 'AUTO_CREATE_PR' && req.autoMode !== 'NONE') {
    throw new Error('Planner autoMode must be "AUTO_CREATE_PR" or "NONE"');
  }
  if (req.requirePlanApproval !== undefined && typeof req.requirePlanApproval !== 'boolean') {
    throw new Error('Planner requirePlanApproval must be a boolean');
  }

  return {
    description,
    ...(source !== undefined ? { source } : {}),
    ...(branch !== undefined ? { branch } : {}),
    ...(maxTasks !== undefined ? { maxTasks } : {}),
    ...(context !== undefined ? { context } : {}),
    ...(req.autoMode !== undefined ? { autoMode: req.autoMode } : {}),
    ...(req.requirePlanApproval !== undefined
      ? { requirePlanApproval: req.requirePlanApproval }
      : {}),
  };
}

function requiredPlanString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Planner ${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalPlanString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredPlanString(value, field);
}
