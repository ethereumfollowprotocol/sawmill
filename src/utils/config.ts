import { readFileSync } from 'fs';
import { SawmillConfig } from '../types/config.js';
import dotenv from 'dotenv';

dotenv.config();

export class ConfigManager {
  private config: SawmillConfig;

  constructor(configPath?: string) {
    this.config = this.loadConfig(configPath);
    console.log('Configuration loaded:', this.config);
    this.validateConfig();
  }

  private loadConfig(configPath?: string): SawmillConfig {
    const path = configPath || process.env.SAWMILL_CONFIG_PATH || './config.json';
    
    try {
      const configFile = readFileSync(path, 'utf-8');
      const config = JSON.parse(configFile) as SawmillConfig;
      
      // Override with environment variables
      return {
        ...config,
        anthropic: {
          ...config.anthropic,
          apiKey: process.env.ANTHROPIC_API_KEY || config.anthropic.apiKey,
        },
        alerts: {
          ...config.alerts,
          telegram: config.alerts.telegram ? {
            ...config.alerts.telegram,
            botToken: process.env.TELEGRAM_BOT_TOKEN || config.alerts.telegram.botToken,
            chatId: process.env.TELEGRAM_CHAT_ID || config.alerts.telegram.chatId,
          } : undefined,
          email: config.alerts.email ? {
            ...config.alerts.email,
            username: process.env.EMAIL_USERNAME || config.alerts.email.username,
            password: process.env.EMAIL_PASSWORD || config.alerts.email.password,
          } : undefined,
          github: config.alerts.github ? {
            ...config.alerts.github,
            token: process.env.GITHUB_TOKEN || config.alerts.github.token,
          } : undefined,
        },
        projects: config.projects.map(project => ({
          ...project,
          railwayToken: process.env.RAILWAY_TOKEN || project.railwayToken,
        })),
      };
    } catch (error) {
      throw new Error(`Failed to load config from ${path}: ${error}`);
    }
  }

  private validateConfig(): void {
    if (!this.config.anthropic?.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    if (!this.config.projects || this.config.projects.length === 0) {
      throw new Error('At least one project configuration is required');
    }

    for (const project of this.config.projects) {
      if (!project.railwayToken) {
        throw new Error(`Railway token is required for project: ${project.name}`);
      }
      if (!project.logRetentionHours || project.logRetentionHours <= 0) {
        throw new Error(`Valid logRetentionHours is required for project: ${project.name}`);
      }
    }

    if (this.config.alerts.telegram?.enabled && !this.config.alerts.telegram.botToken) {
      throw new Error('Telegram bot token is required when Telegram alerts are enabled');
    }

    if (this.config.alerts.email?.enabled && !this.config.alerts.email.password) {
      throw new Error('Email password is required when email alerts are enabled');
    }

    if (this.config.alerts.github?.enabled && !this.config.alerts.github.token) {
      throw new Error('GitHub token is required when GitHub integration is enabled');
    }
  }

  public getConfig(): SawmillConfig {
    return this.config;
  }

  public getProjectConfig(projectName: string) {
    return this.config.projects.find(p => p.name === projectName);
  }

  public getAlertConfig() {
    return this.config.alerts;
  }

  public getAnthropicConfig() {
    return this.config.anthropic;
  }

  public getScheduleConfig() {
    return this.config.schedule;
  }
}