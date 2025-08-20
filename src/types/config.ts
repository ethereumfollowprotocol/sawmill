export interface ServiceConfig {
  name: string;
  githubRepo?: {
    owner: string;
    repo: string;
    defaultAssignees?: string[];
    labels?: string[];
  };
}

export interface ProjectConfig {
  name: string;
  railwayToken: string;
  services?: ServiceConfig[];
  analysisPrompt?: string;
  logRetentionHours: number;
}

export interface AlertConfig {
  telegram?: {
    botToken: string;
    chatId: string;
    enabled: boolean;
  };
  email?: {
    smtpHost: string;
    smtpPort: number;
    username: string;
    password: string;
    to: string[];
    enabled: boolean;
  };
  github?: {
    token: string;
    enabled: boolean;
    createIssueThreshold: 'medium' | 'high';
    deduplicationWindow: number;
  };
  severityThreshold: 'low' | 'medium' | 'high';
}

export interface SawmillConfig {
  projects: ProjectConfig[];
  alerts: AlertConfig;
  anthropic: {
    apiKey: string;
    model?: string;
  };
  schedule?: {
    enabled: boolean;
    interval: string;
  };
}

export type Severity = 'low' | 'medium' | 'high';

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  service: string;
  projectName: string;
  metadata?: Record<string, any>;
}

export interface AnalysisResult {
  severity: Severity;
  summary: string;
  recommendations: string[];
  affectedServices: string[];
  errorPatterns: string[];
  shouldCreateIssue: boolean;
  issueTitle?: string;
  issueDescription?: string;
}