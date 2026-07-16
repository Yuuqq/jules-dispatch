export interface JulesConfig {
  apiKey: string;
  defaultSource: string;
  defaultBranch: string;
  autoMode: 'AUTO_CREATE_PR' | 'NONE';
  projectDir?: string;
  requestTimeoutMs?: number;
}

export interface TaskDefinition {
  title: string;
  prompt: string;
  source?: string;
  branch?: string;
  autoMode?: 'AUTO_CREATE_PR' | 'NONE';
  requirePlanApproval?: boolean;
}

export interface JulesSession {
  name: string;
  id: string;
  title: string;
  prompt: string;
  url: string;
  sourceContext?: {
    source: string;
    githubRepoContext: {
      startingBranch: string;
    };
  };
  automationMode?: string;
  outputs?: Array<{
    pullRequest?: {
      url: string;
      title: string;
      description: string;
    };
  }>;
  createTime?: string;
  state?:
    | 'STATE_UNSPECIFIED'
    | 'QUEUED'
    | 'PLANNING'
    | 'AWAITING_PLAN_APPROVAL'
    | 'AWAITING_USER_FEEDBACK'
    | 'IN_PROGRESS'
    | 'PAUSED'
    | 'COMPLETED'
    | 'FAILED'
    // Legacy values retained for compatibility with older API responses.
    | 'PENDING'
    | 'RUNNING'
    | 'AWAITING_USER_INPUT'
    | 'CANCELLED'
    | 'CANCELED'
    | string;
}

export type JulesSessionStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'awaiting_plan'
  | 'awaiting_user_feedback'
  | 'paused'
  | 'cancelled';

export interface JulesPlanStep {
  id: string;
  title: string;
  description?: string;
  index?: number;
}

export interface JulesPlan {
  id: string;
  steps: JulesPlanStep[];
}

export interface JulesActivity {
  name: string;
  id: string;
  createTime: string;
  originator: 'user' | 'agent' | 'system';
  description?: string;
  planGenerated?: { plan: JulesPlan };
  progressUpdated?: { title: string; description?: string };
  sessionCompleted?: Record<string, unknown>;
  sessionFailed?: { reason?: string; message?: string };
  artifacts?: Array<Record<string, unknown>>;
  agentMessaged?: { agentMessage?: string };
  userMessaged?: { userMessage?: string };
  /** Legacy activity shape retained for older API responses. */
  message?: { text?: string };
}

export interface DispatchResult {
  taskFile: string;
  taskTitle: string;
  sessionId: string;
  sessionUrl: string;
  title: string;
  status: 'dispatched' | 'failed';
  error?: string;
}

export interface CollectResult {
  sessionId: string;
  title: string;
  status: JulesSessionStatus;
  prUrl?: string;
  prTitle?: string;
  lastActivity?: string;
  activities: number;
  state?: string;
  createTime?: string;
}
