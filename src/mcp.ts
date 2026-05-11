import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolve } from 'node:path';
import { loadConfig, loadTasksFromString } from './config.js';
import { JulesClient, deriveStatus } from './client.js';
import { pollSessions } from './polling.js';
import { dispatchTaskDefinition } from './dispatcher.js';
import { planTasks, loadPlannerConfig, isPlannerConfigured } from './planner.js';
import type { JulesConfig, TaskDefinition, DispatchResult } from './types.js';
import { ok, fail, computeRecoveryHint } from './mcp-helpers.js';

export interface McpServerOptions {
  projectDir: string;
  apiKeyOverride?: string;
}

type ToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export function createMcpServer(config: JulesConfig, client: JulesClient): McpServer {
  const server = new McpServer({
    name: 'jules-dispatch',
    version: '1.2.0',
  });

  // Helper: wrap any handler so thrown errors become MCP isError responses
  // instead of crashing the server. We cast the handler at the SDK boundary
  // because the SDK's generic inference doesn't compose well with our wrapper.
  const tool = <S extends z.ZodRawShape>(
    name: string,
    description: string,
    inputSchema: S,
    handler: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
    annotations?: ToolAnnotations,
  ): void => {
    const wrapped = async (args: unknown) => {
      try {
        const result = await handler(args as z.infer<z.ZodObject<S>>);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const e = err as Error & { status?: number };
        const recovery_hint = computeRecoveryHint(e.status);
        const failure = fail(e.message, recovery_hint);
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: failure.success,
              error: {
                message: failure.error.message,
                status: e.status,
                name: e.name,
                recovery_hint: failure.error.recovery_hint,
              },
            }),
          }],
        };
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.registerTool(name, { description, inputSchema, annotations }, wrapped as any);
  };

  const readOnlyAnnotations: ToolAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  const mutationAnnotations: ToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  };
  const cancelAnnotations: ToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  };
  const plannerAnnotations: ToolAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  };

  // ---------- Sources ----------

  tool(
    'jules_list_sources',
    'List all GitHub repositories connected to Jules.\n\nUse this to discover available source identifiers before dispatching or planning Jules work.\n\nReturns: { success: true, data: { sources: [{ id, name, githubRepo? }] } }\n\nSee also: jules_dispatch_task (uses source identifiers), jules_dispatch_batch, jules_plan_tasks',
    {},
    async () => {
      const sources = [];
      for await (const s of client.iterateSources()) sources.push(s);
      return ok({ sources });
    },
    readOnlyAnnotations,
  );

  // ---------- Sessions: create / dispatch ----------

  tool(
    'jules_dispatch_task',
    '[DEPRECATED: Use jules_dispatch instead.] Dispatch a single self-contained task to Jules and create one session.\n\nUse this when an AI agent has one concrete coding task and can rely on explicit source/branch values or configured defaults.\n\nReturns: { success: true, data: { taskFile, taskTitle, sessionId, sessionUrl, title, status, error? } }\n\nSee also: jules_list_sources (find source identifiers), jules_get_session, jules_wait_for_completion, jules_dispatch_batch',
    {
      title: z.string().describe('Human-readable task title'),
      prompt: z.string().describe('Detailed instructions for the Jules agent'),
      source: z.string().optional().describe('e.g. sources/github/owner/repo (overrides .env default)'),
      branch: z.string().optional().describe('Starting branch (overrides .env default)'),
      autoMode: z.enum(['AUTO_CREATE_PR', 'NONE']).optional(),
      requirePlanApproval: z.boolean().optional(),
    },
    async (args) => {
      const task: TaskDefinition = {
        title: args.title,
        prompt: args.prompt,
        source: args.source,
        branch: args.branch,
        autoMode: args.autoMode,
        requirePlanApproval: args.requirePlanApproval,
      };
      return ok(await dispatchTaskDefinition(client, config, task, '<mcp>'));
    },
    mutationAnnotations,
  );

  tool(
    'jules_dispatch_batch',
    '[DEPRECATED: Use jules_dispatch instead.] Dispatch multiple independent tasks to Jules in bounded parallel batches.\n\nUse this when an AI agent has decomposed work into separate task definitions or has a YAML/JSON task payload ready to fan out.\n\nReturns: { success: true, data: { summary: { total, dispatched, failed }, results: [{ taskFile, taskTitle, sessionId, sessionUrl, title, status, error? }] } }\n\nSee also: jules_list_sources (find source identifiers), jules_dispatch_task, jules_wait_for_completion, jules_plan_tasks',
    {
      tasks: z.union([
        z.array(z.object({
          title: z.string(),
          prompt: z.string(),
          source: z.string().optional(),
          branch: z.string().optional(),
          autoMode: z.enum(['AUTO_CREATE_PR', 'NONE']).optional(),
          requirePlanApproval: z.boolean().optional(),
        })),
        z.string().describe('YAML or JSON string containing task(s)'),
      ]),
      format: z.enum(['yaml', 'json']).optional().describe('Format if `tasks` is a string'),
      parallel: z.number().int().min(1).max(50).optional().default(10),
    },
    async (args) => {
      const taskList: TaskDefinition[] = typeof args.tasks === 'string'
        ? loadTasksFromString(args.tasks, args.format ?? 'yaml')
        : args.tasks as TaskDefinition[];

      const parallel = args.parallel ?? 10;
      const results: DispatchResult[] = [];
      for (let i = 0; i < taskList.length; i += parallel) {
        const slice = taskList.slice(i, i + parallel);
        const batchResults = await Promise.all(
          slice.map(t => dispatchTaskDefinition(client, config, t, '<mcp>')),
        );
        results.push(...batchResults);
      }
      const dispatched = results.filter(r => r.status === 'dispatched').length;
      return ok({
        summary: { total: results.length, dispatched, failed: results.length - dispatched },
        results,
      });
    },
    mutationAnnotations,
  );

  // ---------- Sessions: read ----------

  tool(
    'jules_get_session',
    '[DEPRECATED: Use jules_interact instead.] Fetch full details for a single Jules session, including state, source context, and created PR output.\n\nUse this when an AI agent needs the authoritative session record instead of a compact status summary.\n\nReturns: { success: true, data: { name, id, title, prompt, url, sourceContext, automationMode?, outputs?, createTime?, state? } }\n\nSee also: jules_status (compact summary), jules_list_activities, jules_get_plan, jules_list_sessions',
    { sessionId: z.string() },
    async (args) => ok(await client.getSession(args.sessionId)),
    readOnlyAnnotations,
  );

  tool(
    'jules_list_sessions',
    'List recent Jules sessions with optional pagination.\n\nUse this when an AI agent needs to discover recent sessions before selecting IDs for inspection or status checks.\n\nReturns: { success: true, data: { sessions: [{ name, id, title, url, state?, createTime? }], nextPageToken? } }\n\nSee also: jules_get_session, jules_status, jules_wait_for_completion',
    {
      pageSize: z.number().int().min(1).max(200).optional().default(50),
      pageToken: z.string().optional(),
    },
    async (args) => ok(await client.listSessions(args.pageSize, args.pageToken)),
    readOnlyAnnotations,
  );

  tool(
    'jules_status',
    '[DEPRECATED: Use jules_monitor instead.] Summarize the state, derived status, activity count, and PR metadata for one or more sessions.\n\nUse this when an AI agent needs a compact progress view for known session IDs, including sessions outside the recent page.\n\nReturns: { success: true, data: { results: [{ sessionId, title?, state?, status?, prUrl?, prTitle?, activities?, error? }] } }\n\nSee also: jules_get_session (full record), jules_list_activities, jules_wait_for_completion',
    { sessionIds: z.array(z.string()).min(1) },
    async (args) => {
      const out = [];
      for (const id of args.sessionIds) {
        try {
          const session = await client.getSession(id);
          const { activities } = await client.listActivities(id, 10);
          const status = deriveStatus(session, activities);
          const pr = session.outputs?.find(o => o.pullRequest)?.pullRequest;
          out.push({
            sessionId: id,
            title: session.title,
            state: session.state,
            status,
            prUrl: pr?.url,
            prTitle: pr?.title,
            activities: activities.length,
          });
        } catch (err) {
          out.push({ sessionId: id, error: (err as Error).message });
        }
      }
      return ok({ results: out });
    },
    readOnlyAnnotations,
  );

  // ---------- Activities ----------

  tool(
    'jules_list_activities',
    '[DEPRECATED: Use jules_interact instead.] List the activity log for a Jules session, including plans, progress updates, messages, and terminal events.\n\nUse this when an AI agent needs detailed execution history or must inspect why a session is waiting, failed, or completed.\n\nReturns: { success: true, data: { activities: [{ id, createTime, originator, planGenerated?, progressUpdated?, message?, sessionCompleted?, sessionFailed? }], nextPageToken? } }\n\nSee also: jules_get_session, jules_status, jules_get_plan',
    {
      sessionId: z.string(),
      pageSize: z.number().int().min(1).max(100).optional().default(30),
      pageToken: z.string().optional(),
    },
    async (args) => ok(await client.listActivities(args.sessionId, args.pageSize, args.pageToken)),
    readOnlyAnnotations,
  );

  // ---------- Plan ----------

  tool(
    'jules_get_plan',
    '[DEPRECATED: Use jules_interact instead.] Get the most recently generated plan for a Jules session, or null if no plan exists yet.\n\nUse this before approving a plan-gated session or when an AI agent needs to review planned steps without scanning all activities.\n\nReturns: { success: true, data: { plan: { id, steps: [{ id, title, description?, index? }] } | null } }\n\nSee also: jules_approve_plan, jules_list_activities, jules_get_session',
    { sessionId: z.string() },
    async (args) => ok({ plan: await client.getLatestPlan(args.sessionId) }),
    readOnlyAnnotations,
  );

  tool(
    'jules_approve_plan',
    'Approve the current plan for a Jules session that is awaiting plan approval.\n\nUse this only after an AI agent has reviewed the latest plan and decided the session should continue executing.\n\nReturns: { success: true, data: { sessionId } }\n\nSee also: jules_get_plan (review before approving), jules_get_session, jules_wait_for_completion',
    { sessionId: z.string() },
    async (args) => {
      await client.approvePlan(args.sessionId);
      return ok({ sessionId: args.sessionId });
    },
    mutationAnnotations,
  );

  // ---------- Messaging / control ----------

  tool(
    'jules_send_message',
    'Send a follow-up message to a running Jules session.\n\nUse this when an AI agent needs to unblock a session, answer a question, clarify requirements, or provide revised instructions.\n\nReturns: { success: true, data: { sessionId } }\n\nSee also: jules_get_session, jules_list_activities, jules_cancel_session',
    { sessionId: z.string(), text: z.string() },
    async (args) => {
      await client.sendMessage(args.sessionId, args.text);
      return ok({ sessionId: args.sessionId });
    },
    mutationAnnotations,
  );

  tool(
    'jules_cancel_session',
    'Cancel a running Jules session.\n\nUse this when an AI agent determines a session is no longer wanted, is blocked beyond recovery, or should be stopped before it makes further changes.\n\nReturns: { success: true, data: { sessionId } }\n\nSee also: jules_status, jules_get_session, jules_dispatch_task',
    { sessionId: z.string() },
    async (args) => {
      await client.cancelSession(args.sessionId);
      return ok({ sessionId: args.sessionId });
    },
    cancelAnnotations,
  );

  // ---------- Wait ----------

  tool(
    'jules_wait_for_completion',
    '[DEPRECATED: Use jules_monitor instead.] Poll one or more Jules sessions until every session reaches a terminal status or the timeout expires.\n\nUse this after dispatching work when an AI agent needs to coordinate follow-up actions around completed, failed, cancelled, or still-running sessions.\n\nReturns: { success: true, data: { completed: string[], failed: string[], cancelled: string[], stillRunning: string[], timedOut: boolean } }\n\nSee also: jules_dispatch_task, jules_dispatch_batch, jules_status, jules_list_activities',
    {
      sessionIds: z.array(z.string()).min(1),
      intervalMs: z.number().int().min(1000).optional().default(10000),
      timeoutMs: z.number().int().min(1000).optional().default(600000),
      failFast: z.boolean().optional().default(false),
    },
    async (args) => {
      const result = await pollSessions(
        client,
        args.sessionIds as string[],
        { interval: args.intervalMs, timeout: args.timeoutMs, failFast: args.failFast },
      );
      return ok(result);
    },
    mutationAnnotations,
  );

  const consolidatedTaskSchema = z.object({
    title: z.string(),
    prompt: z.string(),
    source: z.string().optional(),
    branch: z.string().optional(),
    autoMode: z.enum(['AUTO_CREATE_PR', 'NONE']).optional(),
    requirePlanApproval: z.boolean().optional(),
  });

  async function dispatchConsolidatedTasks(
    tasks: TaskDefinition[],
    parallel: number,
    taskFile: string,
  ): Promise<{ summary: { total: number; dispatched: number; failed: number }; results: DispatchResult[] }> {
    const results: DispatchResult[] = [];
    for (let i = 0; i < tasks.length; i += parallel) {
      const slice = tasks.slice(i, i + parallel);
      const batchResults = await Promise.all(
        slice.map(t => dispatchTaskDefinition(client, config, t, taskFile)),
      );
      results.push(...batchResults);
    }

    const dispatched = results.filter(r => r.status === 'dispatched').length;
    return {
      summary: { total: tasks.length, dispatched, failed: results.length - dispatched },
      results,
    };
  }

  async function summarizeSession(sessionId: string): Promise<{
    sessionId: string;
    title?: string;
    state?: string;
    status: ReturnType<typeof deriveStatus> | 'error';
    prUrl?: string;
    lastActivity?: string;
  }> {
    try {
      const session = await client.getSession(sessionId);
      const { activities } = await client.listActivities(sessionId, 10);
      const status = deriveStatus(session, activities);
      const pr = session.outputs?.find(o => o.pullRequest)?.pullRequest;
      const failedAct = activities.find(a => a.sessionFailed);
      const latestProgress = activities
        .filter(a => a.progressUpdated)
        .sort((a, b) => (a.createTime > b.createTime ? -1 : 1))[0];

      let lastActivity: string;
      if (status === 'failed') {
        lastActivity = failedAct?.sessionFailed?.message ?? 'Failed';
      } else if (status === 'completed') {
        lastActivity = 'Completed';
      } else if (status === 'awaiting_plan') {
        lastActivity = 'Awaiting plan approval';
      } else if (status === 'cancelled') {
        lastActivity = 'Cancelled';
      } else {
        lastActivity = latestProgress?.progressUpdated?.title ?? 'In progress';
      }

      return {
        sessionId,
        title: session.title,
        state: session.state,
        status,
        prUrl: pr?.url,
        lastActivity,
      };
    } catch (err) {
      return {
        sessionId,
        status: 'error',
        lastActivity: (err as Error).message,
      };
    }
  }

  // ---------- Consolidated orchestration ----------

  tool(
    'jules_dispatch',
    'Dispatch one or more Jules tasks through a single consolidated orchestration call.\n\nUse this when an AI agent has a single task object, an array of task objects, or a YAML/JSON task payload and wants bounded parallel dispatch without choosing between single-task and batch tools.\n\nReturns: { success: true, data: { summary: { total, dispatched, failed }, results: [{ taskFile, taskTitle, sessionId, sessionUrl, title, status, error? }] } }\n\nSee also: jules_monitor (track dispatched sessions), jules_interact (inspect one session in context), jules_list_sources (find source identifiers)',
    {
      tasks: z.union([
        consolidatedTaskSchema,
        z.array(consolidatedTaskSchema),
        z.string().describe('YAML or JSON string containing one or more task definitions'),
      ]),
      format: z.enum(['yaml', 'json']).optional().describe('Format if `tasks` is a string'),
      parallel: z.number().int().min(1).max(50).optional().default(10),
    },
    async (args) => {
      const taskList: TaskDefinition[] = typeof args.tasks === 'string'
        ? loadTasksFromString(args.tasks, args.format ?? 'yaml')
        : Array.isArray(args.tasks)
          ? args.tasks as TaskDefinition[]
          : [args.tasks as TaskDefinition];

      return ok(await dispatchConsolidatedTasks(taskList, args.parallel ?? 10, '<mcp>'));
    },
    mutationAnnotations,
  );

  tool(
    'jules_monitor',
    'Monitor one or more Jules sessions with optional waiting until terminal state.\n\nUse this for consolidated status checks, or set wait=true after dispatching when an AI agent needs completed/failed/cancelled/still-running buckets before the next orchestration step.\n\nReturns without wait: { success: true, data: { sessions: [{ sessionId, title, state, status, prUrl?, lastActivity? }] } }\n\nReturns with wait: { success: true, data: { sessions, wait: { completed, failed, cancelled, stillRunning, timedOut } } }\n\nSee also: jules_dispatch (create sessions), jules_interact (inspect one session in full context), jules_wait_for_completion (wait-only legacy helper)',
    {
      sessionIds: z.array(z.string()).min(1),
      wait: z.boolean().optional().default(false),
      intervalMs: z.number().int().min(1000).optional().default(10000),
      timeoutMs: z.number().int().min(1000).optional().default(600000),
      failFast: z.boolean().optional().default(false),
    },
    async (args) => {
      let sessions = await Promise.all((args.sessionIds as string[]).map(id => summarizeSession(id)));
      if (!(args.wait ?? false)) return ok({ sessions });

      const waitResult = await pollSessions(
        client,
        args.sessionIds as string[],
        { interval: args.intervalMs, timeout: args.timeoutMs, failFast: args.failFast },
      );

      // Re-summarize all sessions after wait completes.
      sessions = await Promise.all((args.sessionIds as string[]).map(id => summarizeSession(id)));

      return ok({
        sessions,
        wait: waitResult,
      });
    },
    readOnlyAnnotations,
  );

  tool(
    'jules_interact',
    'Fetch full Jules session interaction context in one call.\n\nUse this when an AI agent needs the session record, derived status, latest plan, compact activity timeline, and PR output together before deciding whether to approve, message, monitor, or collect results.\n\nReturns: { success: true, data: { session: { id, title, state, url, source, branch }, status, plan, activities: [{ id, time, originator, title?, planGenerated?, failed? }], pr? } }\n\nSee also: jules_dispatch (create sessions), jules_monitor (status/wait across sessions), jules_send_message (reply to a session), jules_approve_plan (continue plan-gated work)',
    {
      sessionId: z.string(),
      activityCount: z.number().int().min(1).max(100).optional().default(10),
    },
    async (args) => {
      const [session, plan, activityPage] = await Promise.all([
        client.getSession(args.sessionId),
        client.getLatestPlan(args.sessionId).catch(() => null),
        client.listActivities(args.sessionId, args.activityCount),
      ]);
      const activities = activityPage.activities ?? [];
      const status = deriveStatus(session, activities);
      const pr = session.outputs?.find(o => o.pullRequest)?.pullRequest;

      return ok({
        session: {
          id: session.id,
          title: session.title,
          state: session.state,
          url: session.url,
          source: session.sourceContext.source,
          branch: session.sourceContext.githubRepoContext.startingBranch,
        },
        status,
        plan,
        activities: activities.map(a => ({
          id: a.id,
          time: a.createTime,
          originator: a.originator,
          ...(a.progressUpdated?.title ? { title: a.progressUpdated.title } : {}),
          ...(a.planGenerated ? { planGenerated: { steps: a.planGenerated.plan.steps.length } } : {}),
          ...(a.sessionFailed ? { failed: a.sessionFailed.message ?? a.sessionFailed.reason ?? 'Failed' } : {}),
        })),
        ...(pr ? { pr } : {}),
      });
    },
    readOnlyAnnotations,
  );

  // ---------- Planner (OPTIONAL -- any OpenAI-compatible LLM) ----------
  // Only registered if a planner-capable API key is present at startup.
  // This keeps the tool list clean for users who only want raw dispatch.

  if (isPlannerConfigured()) {
    registerPlannerTools();
  }

  function registerPlannerTools(): void {
    tool(
      'jules_plan_tasks',
      'Expand a high-level intent into independent, parallelizable Jules task definitions without dispatching them.\n\nUse this optional planner when an AI agent needs an LLM-assisted task breakdown to review or pass into jules_dispatch_batch later.\n\nReturns: { success: true, data: { model, rationale?, tasks: [{ title, prompt, source?, branch?, autoMode?, requirePlanApproval? }], usage? } }\n\nSee also: jules_dispatch_batch (dispatch planned tasks), jules_auto, jules_list_sources',
      {
        description: z.string().describe('High-level intent, e.g. "migrate all Express routes to Fastify and add tests"'),
        maxTasks: z.number().int().min(1).max(50).optional().default(8),
        source: z.string().optional().describe('Jules source (defaults to JULES_DEFAULT_SOURCE)'),
        branch: z.string().optional().describe('Starting branch (defaults to JULES_DEFAULT_BRANCH)'),
        context: z.string().optional().describe('Extra repo context for grounding (file tree, conventions, etc.)'),
        model: z.string().optional().describe('LLM model id (defaults to LLM_MODEL or gpt-4o-mini)'),
        baseUrl: z.string().optional().describe('OpenAI-compatible base URL (defaults to LLM_BASE_URL or https://api.openai.com/v1)'),
      },
      async (args) => {
        const cfg = loadPlannerConfig({ modelOverride: args.model, baseUrlOverride: args.baseUrl });
        return ok(await planTasks(cfg, {
          description: args.description,
          source: args.source ?? config.defaultSource,
          branch: args.branch ?? config.defaultBranch,
          maxTasks: args.maxTasks,
          context: args.context,
        }));
      },
      plannerAnnotations,
    );

    tool(
      'jules_auto',
      'Plan a high-level intent with an OpenAI-compatible LLM and dispatch the resulting Jules tasks in one call.\n\nUse this optional one-shot fan-out tool when an AI agent is ready to create sessions immediately instead of reviewing planned tasks first.\n\nReturns: { success: true, data: { plan: { model, rationale?, tasks, usage? }, summary: { total, dispatched, failed }, results: [{ taskFile, taskTitle, sessionId, sessionUrl, title, status, error? }] } }\n\nSee also: jules_plan_tasks (plan without dispatch), jules_dispatch_batch, jules_wait_for_completion',
      {
        description: z.string(),
        maxTasks: z.number().int().min(1).max(50).optional().default(8),
        source: z.string().optional(),
        branch: z.string().optional(),
        context: z.string().optional(),
        model: z.string().optional(),
        baseUrl: z.string().optional(),
        parallel: z.number().int().min(1).max(50).optional().default(10),
      },
      async (args) => {
        const cfg = loadPlannerConfig({ modelOverride: args.model, baseUrlOverride: args.baseUrl });
        const plan = await planTasks(cfg, {
          description: args.description,
          source: args.source ?? config.defaultSource,
          branch: args.branch ?? config.defaultBranch,
          maxTasks: args.maxTasks,
          context: args.context,
        });

        const parallel = args.parallel ?? 10;
        const results: DispatchResult[] = [];
        for (let i = 0; i < plan.tasks.length; i += parallel) {
          const slice = plan.tasks.slice(i, i + parallel);
          const r = await Promise.all(
            slice.map(t => dispatchTaskDefinition(client, config, t, '<mcp-auto>')),
          );
          results.push(...r);
        }
        const dispatched = results.filter(r => r.status === 'dispatched').length;
        return ok({
          plan: { model: plan.model, rationale: plan.rationale, tasks: plan.tasks, usage: plan.usage },
          summary: { total: results.length, dispatched, failed: results.length - dispatched },
          results,
        });
      },
      mutationAnnotations,
    );
  } // end registerPlannerTools

  return server;
}

export async function runMcpServer(options: McpServerOptions): Promise<void> {
  const config = loadConfig(options.projectDir, {
    apiKeyOverride: options.apiKeyOverride,
    noExit: true,
  });
  const client = new JulesClient(config);
  const server = createMcpServer(config, client);
  await server.connect(new StdioServerTransport());
}

void resolve;  // keep import for potential future use
