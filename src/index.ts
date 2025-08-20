#!/usr/bin/env node

import cron from 'node-cron';
import { ConfigManager } from './utils/config.js';
import { logger } from './utils/logger.js';
import { RailwayAPICollector } from './services/railway-api.js';
import { AIAnalyzer } from './services/ai-analyzer.js';
import { GitHubIssueManager } from './managers/github-issue-manager.js';
import { AlertManager } from './managers/alert-manager.js';
import { DeduplicationManager } from './utils/deduplication.js';

class SawmillService {
  private config: ConfigManager;
  private logCollector: RailwayAPICollector;
  private aiAnalyzer: AIAnalyzer;
  private githubManager?: GitHubIssueManager;
  private alertManager: AlertManager;
  private deduplicationManager: DeduplicationManager;

  constructor(configPath?: string) {
    this.config = new ConfigManager(configPath);
    this.logCollector = new RailwayAPICollector();
    this.deduplicationManager = new DeduplicationManager();
    
    const anthropicConfig = this.config.getAnthropicConfig();
    this.aiAnalyzer = new AIAnalyzer(anthropicConfig.apiKey, anthropicConfig.model);
    
    const alertConfig = this.config.getAlertConfig();
    this.alertManager = new AlertManager(alertConfig);
    
    if (alertConfig.github?.enabled) {
      this.githubManager = new GitHubIssueManager(alertConfig.github, this.deduplicationManager);
    }
  }

  public async validateConnections(): Promise<boolean> {
    logger.info('Validating all service connections...');
    
    let allValid = true;

    // Connect to Redis for deduplication
    try {
      await this.deduplicationManager.connect();
      const redisValid = await this.deduplicationManager.testConnection();
      if (!redisValid) {
        logger.warn('Redis connection failed - deduplication will be disabled');
      } else {
        logger.info('Redis connection validated successfully');
      }
    } catch (error) {
      logger.warn('Redis connection failed - deduplication will be disabled', error);
    }

    // Validate Railway API for each project
    const projects = this.config.getConfig().projects;
    for (const project of projects) {
      const apiValid = await this.logCollector.validateAPIConnection(project.railwayToken);
      if (!apiValid) {
        logger.error(`Railway API connection failed for project: ${project.name}`);
        allValid = false;
        continue;
      }

      const projectValid = await this.logCollector.validateProjectAccess(project);
      if (!projectValid) {
        logger.error(`Railway project access failed for project: ${project.name}`);
        allValid = false;
      }
    }

    // Validate Anthropic API
    const aiValid = await this.aiAnalyzer.testConnection();
    if (!aiValid) {
      logger.error('Anthropic API validation failed');
      allValid = false;
    }

    // Validate GitHub API (if enabled)
    if (this.githubManager) {
      const githubValid = await this.githubManager.testConnection();
      if (!githubValid) {
        logger.error('GitHub API validation failed');
        allValid = false;
      }
    }

    // Validate Telegram (if enabled)
    const telegramValid = await this.alertManager.testTelegramConnection();
    if (this.config.getAlertConfig().telegram?.enabled && !telegramValid) {
      logger.error('Telegram API validation failed');
      allValid = false;
    }

    // Validate Email (if enabled)
    const emailValid = await this.alertManager.testEmailConnection();
    if (this.config.getAlertConfig().email?.enabled && !emailValid) {
      logger.error('Email SMTP validation failed');
      allValid = false;
    }

    if (allValid) {
      logger.info('All service connections validated successfully');
    } else {
      logger.error('Some service connections failed validation');
    }

    return allValid;
  }

  public async runAnalysis(): Promise<void> {
    const startTime = Date.now();
    logger.info('Starting Sawmill log analysis cycle...');

    try {
      const projects = this.config.getConfig().projects;
      
      // Collect logs from all projects
      logger.info(`Collecting logs from ${projects.length} projects`);
      const allLogs = await this.logCollector.collectAllLogs(projects);
      
      if (allLogs.length === 0) {
        logger.info('No logs found to analyze');
        return;
      }

      // Check if these logs have already been processed
      const hasProcessed = await this.deduplicationManager.hasProcessedLogEvent(allLogs);
      if (hasProcessed) {
        logger.info('These logs have already been processed recently, skipping analysis');
        return;
      }

      // Group logs by project for analysis
      const logsByProject = new Map<string, typeof allLogs>();
      for (const log of allLogs) {
        if (!logsByProject.has(log.projectName)) {
          logsByProject.set(log.projectName, []);
        }
        logsByProject.get(log.projectName)!.push(log);
      }

      // Analyze each project's logs
      for (const [projectName, projectLogs] of logsByProject) {
        try {
          logger.info(`Analyzing ${projectLogs.length} logs for project: ${projectName}`);
          
          const projectConfig = this.config.getProjectConfig(projectName);
          if (!projectConfig) {
            logger.warn(`No configuration found for project: ${projectName}`);
            continue;
          }

          // Perform AI analysis
          const analysis = await this.aiAnalyzer.analyzeLogs(projectLogs, projectConfig);
          
          if (analysis.severity === 'low' && analysis.affectedServices.length === 0) {
            logger.info(`No significant issues found for project: ${projectName}`);
            continue;
          }

          logger.info(`Analysis completed for ${projectName}: ${analysis.severity} severity, ${analysis.affectedServices.length} services affected`);

          // Create GitHub issues if needed
          let createdIssues: any[] = [];
          if (this.githubManager && analysis.shouldCreateIssue) {
            try {
              createdIssues = await this.githubManager.createIssue(analysis, projectConfig);
              if (createdIssues.length > 0) {
                logger.info(`Created ${createdIssues.length} GitHub issues for project: ${projectName}`);
              }
            } catch (error) {
              logger.error(`Failed to create GitHub issues for project: ${projectName}`, error);
            }
          }

          // Send alerts only if GitHub issues were created
          if (createdIssues.length > 0) {
            try {
              await this.alertManager.sendAllAlerts(analysis, projectName, createdIssues);
              logger.info(`Alerts sent for project: ${projectName} (${createdIssues.length} issues created)`);
            } catch (error) {
              logger.error(`Failed to send alerts for project: ${projectName}`, error);
            }
          } else {
            logger.debug(`No alerts sent for project: ${projectName} - no new GitHub issues created`);
          }

        } catch (error) {
          logger.error(`Failed to analyze project: ${projectName}`, error);
          continue;
        }
      }

      // Mark logs as processed after successful analysis
      await this.deduplicationManager.markLogEventProcessed(allLogs);

      const duration = (Date.now() - startTime) / 1000;
      logger.info(`Sawmill analysis cycle completed in ${duration}s`);

    } catch (error) {
      logger.error('Sawmill analysis cycle failed', error);
      throw error;
    }
  }

  public startScheduled(): void {
    const scheduleConfig = this.config.getScheduleConfig();
    
    if (!scheduleConfig?.enabled) {
      logger.info('Scheduled execution is disabled');
      return;
    }

    const interval = scheduleConfig.interval || '*/15 * * * *'; // Default: every 15 minutes
    
    logger.info(`Starting scheduled execution with interval: ${interval}`);
    
    cron.schedule(interval, async () => {
      try {
        await this.runAnalysis();
      } catch (error) {
        logger.error('Scheduled analysis failed', error);
      }
    });

    logger.info('Sawmill scheduler started successfully');
  }

  public async stop(): Promise<void> {
    logger.info('Stopping Sawmill service...');
    
    try {
      await this.deduplicationManager.disconnect();
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
    }
    
    // Note: node-cron doesn't have a global destroy method
    // Individual scheduled tasks are cleaned up by process exit
    logger.info('Sawmill service stopped');
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const configPath = args.find(arg => arg.startsWith('--config='))?.split('=')[1];

  try {
    const sawmill = new SawmillService(configPath);

    switch (command) {
      case 'test':
        logger.info('Running connection tests...');
        const isValid = await sawmill.validateConnections();
        process.exit(isValid ? 0 : 1);
        break;

      case 'run':
        logger.info('Running one-time analysis...');
        await sawmill.runAnalysis();
        process.exit(0);
        break;

      case 'start':
      case undefined:
        logger.info('Starting Sawmill service...');
        
        // Validate connections first
        const connectionsValid = await sawmill.validateConnections();
        if (!connectionsValid) {
          logger.error('Connection validation failed. Please check your configuration.');
          process.exit(1);
        }

        // Start scheduled execution
        sawmill.startScheduled();
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
          logger.info('Received SIGINT, shutting down gracefully...');
          await sawmill.stop();
          process.exit(0);
        });

        process.on('SIGTERM', async () => {
          logger.info('Received SIGTERM, shutting down gracefully...');
          await sawmill.stop();
          process.exit(0);
        });
        
        break;

      default:
        logger.info(`
Sawmill - Railway Log Analysis Tool

Usage:
  sawmill [command] [options]

Commands:
  start     Start the scheduled service (default)
  run       Run one-time analysis
  test      Test all connections

Options:
  --config=<path>   Path to configuration file (default: ./config.json)

Environment Variables:
  ANTHROPIC_API_KEY      Your Anthropic API key
  TELEGRAM_BOT_TOKEN     Telegram bot token
  GITHUB_TOKEN           GitHub personal access token
  EMAIL_PASSWORD         Email account password
  RAILWAY_TOKEN_<NAME>   Railway project tokens (replace <NAME> with project name in uppercase)
  REDIS_URL              Redis connection string (default: redis://localhost:6379)
  LOG_LEVEL              Log level (debug, info, warn, error)

Examples:
  sawmill start                    # Start with default config
  sawmill run --config=prod.json  # One-time run with custom config
  sawmill test                     # Test all API connections
        `);
        process.exit(0);
    }
  } catch (error) {
    logger.error('Sawmill failed to start', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Check if this file is being run directly
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() || '');
if (isMainModule) {
  main();
}