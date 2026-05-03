import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resolve } from 'node:path';
import { loadConfig, loadTasksFromString } from './config.js';
import { JulesClient, deriveStatus } from './client.js';
import { dispatchTaskDefinition } from './dispatcher.js';
import type { TaskDefinition, DispatchResult } from './types.js';

export interface McpServerOptions {
  projectDir: string;
  apiKeyOverride?: string;
}

export async function runMcpServer(options: McpServerOptions): Promise<void> {
  // Load config eagerly so the user sees a clear error at startup if no API key.
  const config = loadConfig(options.projectDir, {
    apiKeyOverride: options.apiKeyOverride,
    noExit: true,
  });
  const client = new JulesClient(config);

  const server = new McpServer({
    name: 'jules-dispatch',
    version: '1.1.0',
  });

  // Helper: wrap any handler so thrown errors become MCP isError responses
  // instead of crashing the server. We cast the handler at the SDK boundary
  // because the SDK's generic inference doesn't compose well with our wrapper.
  const tool = <S extends z.ZodRawShape>(
    name: string,
    description: string,
    inputSchema: S,
    handler: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
  ): void => {
    const wrapped = async (args: unknown) => {
      try {
        const result = await handler(args as z.infer<z.ZodObject<S>>);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const e = err as Error & { status?: number };
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: { message: e.message, status: e.status, name: e.name },
            }),
          }],
        };
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.registerTool(name, { description, inputSchema }, wrapped as any);
  };

  // ---------- Sources ----------

  tool('jules_list_sources', 'List all GitHub repositories connected to Jules.', {}, async () => {
    const sources = [];
    for await (const s of client.iterateSources()) sources.push(s);
    return { sources };
  });

  // ---------- Sessions: create / dispatch ----------

  tool(
    'jules_dispatch_task',
    'Dispatch a single task to Jules. Returns sessionId, URL, and dispatch status. Source/branch fall back to .env defaults if omitted.',
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
      return dispatchTaskDefinition(client, config, task, '<mcp>');
    },
  );

  tool(
    'jules_dispatch_batch',
    'Dispatch multiple tasks in parallel. Accepts an array of task definitions or a YAML/JSON string.',
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
      return {
        summary: { total: results.length, dispatched, failed: results.length - dispatched },
        results,
      };
    },
  );

  // ---------- Sessions: read ----------

  tool(
    'jules_get_session',
    'Get full details of a single Jules session including state and any created PR.',
    { sessionId: z.string() },
    async (args) => client.getSession(args.sessionId),
  );

  tool(
    'jules_list_sessions',
    'List recent Jules sessions (paginated).',
    {
      pageSize: z.number().int().min(1).max(200).optional().default(50),
      pageToken: z.string().optional(),
    },
    async (args) => client.listSessions(args.pageSize, args.pageToken),
  );

  tool(
    'jules_status',
    'Get a summarized status (state, lastActivity, PR) for one or more sessions. Resolves each by ID directly so it works even for sessions outside the recent page.',
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
      return { results: out };
    },
  );

  // ---------- Activities ----------

  tool(
    'jules_list_activities',
    'List the activity log of a Jules session (plan generation, progress, messages, completion).',
    {
      sessionId: z.string(),
      pageSize: z.number().int().min(1).max(100).optional().default(30),
      pageToken: z.string().optional(),
    },
    async (args) => client.listActivities(args.sessionId, args.pageSize, args.pageToken),
  );

  // ---------- Plan ----------

  tool(
    'jules_get_plan',
    'Get the most recently generated plan for a session, or null if no plan exists yet.',
    { sessionId: z.string() },
    async (args) => ({ plan: await client.getLatestPlan(args.sessionId) }),
  );

  tool(
    'jules_approve_plan',
    'Approve the current plan for a session that requires approval before executing.',
    { sessionId: z.string() },
    async (args) => {
      await client.approvePlan(args.sessionId);
      return { ok: true, sessionId: args.sessionId };
    },
  );

  // ---------- Messaging / control ----------

  tool(
    'jules_send_message',
    'Send a follow-up message to a running Jules session.',
    { sessionId: z.string(), text: z.string() },
    async (args) => {
      await client.sendMessage(args.sessionId, args.text);
      return { ok: true, sessionId: args.sessionId };
    },
  );

  tool(
    'jules_cancel_session',
    'Cancel a running Jules session.',
    { sessionId: z.string() },
    async (args) => {
      await client.cancelSession(args.sessionId);
      return { ok: true, sessionId: args.sessionId };
    },
  );

  // ---------- Wait ----------

  tool(
    'jules_wait_for_completion',
    'Poll one or more sessions until they all reach a terminal state (completed/failed/cancelled) or timeout.',
    {
      sessionIds: z.array(z.string()).min(1),
      intervalMs: z.number().int().min(1000).optional().default(10000),
      timeoutMs: z.number().int().min(1000).optional().default(600000),
      failFast: z.boolean().optional().default(false),
    },
    async (args) => {
      const start = Date.now();
      const completed = new Set<string>();
      const failed = new Set<string>();
      const cancelled = new Set<string>();

      while (Date.now() - start < args.timeoutMs) {
        const remaining = (args.sessionIds as string[]).filter((id: string) =>
          !completed.has(id) && !failed.has(id) && !cancelled.has(id),
        );
        if (remaining.length === 0) break;

        for (const id of remaining) {
          try {
            const session = await client.getSession(id);
            const { activities } = await client.listActivities(id, 10);
            const status = deriveStatus(session, activities);
            if (status === 'completed') completed.add(id);
            else if (status === 'failed') {
              failed.add(id);
              if (args.failFast) break;
            }
            else if (status === 'cancelled') cancelled.add(id);
          } catch {
            /* transient */
          }
        }

        if (args.failFast && failed.size > 0) break;
        await new Promise(r => setTimeout(r, args.intervalMs));
      }

      const stillRunning = (args.sessionIds as string[]).filter((id: string) =>
        !completed.has(id) && !failed.has(id) && !cancelled.has(id),
      );
      return {
        completed: [...completed],
        failed: [...failed],
        cancelled: [...cancelled],
        stillRunning,
        timedOut: stillRunning.length > 0,
      };
    },
  );

  await server.connect(new StdioServerTransport());

  // Server runs until stdio closes; do not return.
}

void resolve;  // keep import for potential future use
