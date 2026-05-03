import type { TaskDefinition } from './types.js';

export interface PlannerConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  defaultSource?: string;
  defaultBranch?: string;
}

export interface PlannerOptions {
  apiKeyOverride?: string;
  modelOverride?: string;
  baseUrlOverride?: string;
}

export function loadPlannerConfig(opts: PlannerOptions = {}): PlannerConfig {
  const apiKey =
    opts.apiKeyOverride ??
    process.env.OPENROUTER_API_KEY ??
    process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY ??
    '';
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is required for the planner. Set it in .env, pass --openrouter-key, ' +
      'or set OPENROUTER_API_KEY in your environment. Get a key at https://openrouter.ai/keys',
    );
  }
  const baseUrl =
    opts.baseUrlOverride ??
    process.env.OPENROUTER_BASE_URL ??
    process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL ??
    'https://openrouter.ai/api/v1';
  const model =
    opts.modelOverride ??
    process.env.OPENROUTER_MODEL ??
    'openrouter/auto';
  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ''),
    model,
    defaultSource: process.env.JULES_DEFAULT_SOURCE,
    defaultBranch: process.env.JULES_DEFAULT_BRANCH,
  };
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

interface OpenRouterChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string; code?: number | string };
}

export async function planTasks(
  cfg: PlannerConfig,
  req: PlanRequest,
): Promise<PlanResult> {
  const userPrompt = buildUserPrompt(req);

  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' as const },
    temperature: 0.2,
  };

  const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/Yuuqq/jules-dispatch',
      'X-Title': 'jules-dispatch planner',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`OpenRouter ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = (await resp.json()) as OpenRouterChatResponse;
  if (data.error) throw new Error(`OpenRouter error: ${data.error.message ?? JSON.stringify(data.error)}`);

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('OpenRouter returned an empty completion');

  const parsed = parsePlanJson(content);
  const enriched = parsed.tasks.map(t => ({
    title: t.title,
    prompt: t.prompt,
    source: req.source ?? cfg.defaultSource,
    branch: req.branch ?? cfg.defaultBranch,
    autoMode: req.autoMode,
    requirePlanApproval: req.requirePlanApproval,
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
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

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
  for (const [i, t] of (obj.tasks as Array<Record<string, unknown>>).entries()) {
    const title = typeof t.title === 'string' ? t.title.trim() : '';
    const prompt = typeof t.prompt === 'string' ? t.prompt.trim() : '';
    if (!title || !prompt) {
      throw new Error(`Planner task #${i + 1} missing title or prompt`);
    }
    tasks.push({ title, prompt });
  }
  if (tasks.length === 0) throw new Error('Planner returned zero tasks');
  return { rationale: typeof obj.rationale === 'string' ? obj.rationale : undefined, tasks };
}
