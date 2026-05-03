export interface JulesConfig {
  apiKey: string;
  defaultSource: string;
  defaultBranch: string;
  autoMode: 'AUTO_CREATE_PR' | 'NONE' | '';
}

export interface TaskDefinition {
  title: string;
  prompt: string;
  source?: string;
  branch?: string;
  autoMode?: 'AUTO_CREATE_PR' | 'NONE' | '';
  requirePlanApproval?: boolean;
}

export interface JulesSession {
  name: string;
  id: string;
  title: string;
  prompt: string;
  url: string;
  sourceContext: {
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
  state?: string;
}

export interface JulesActivity {
  name: string;
  id: string;
  createTime: string;
  originator: 'user' | 'agent';
  planGenerated?: { plan: { id: string; steps: Array<{ id: string; title: string; index?: number }> } };
  progressUpdated?: { title: string; description?: string };
  sessionCompleted?: Record<string, unknown>;
  artifacts?: Array<Record<string, unknown>>;
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
  status: 'running' | 'completed' | 'failed';
  prUrl?: string;
  prTitle?: string;
  lastActivity?: string;
  activities: number;
}
