import { createClient, RedisClientType } from 'redis';
import { createHash } from 'crypto';
import { LogEntry } from '../types/config.js';
import { logger } from './logger.js';

export class DeduplicationManager {
  private client: RedisClientType;
  private isConnected: boolean = false;
  private readonly keyPrefix: string = 'sawmill:';
  private readonly logEventTTL: number = 24 * 60 * 60; // 24 hours in seconds
  private readonly issueTTL: number = 7 * 24 * 60 * 60; // 7 days in seconds

  constructor(redisUrl?: string) {
    this.client = createClient({
      url: redisUrl || process.env.REDIS_URL || 'redis://localhost:6379'
    });

    this.client.on('error', (err: any) => {
      logger.error('Redis Client Error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      logger.info('Connected to Redis');
      this.isConnected = true;
    });
  }

  public async connect(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.client.connect();
        this.isConnected = true;
        logger.info('Redis connection established');
      }
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.disconnect();
        this.isConnected = false;
        logger.info('Redis connection closed');
      }
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
    }
  }

  private generateLogEventHash(logs: LogEntry[]): string {
    // Create a consistent hash based on log content, service, and time window
    const sortedLogs = logs
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map(log => ({
        service: log.service,
        level: log.level,
        message: log.message.substring(0, 100), // First 100 chars to avoid minor variations
        timeWindow: this.getTimeWindow(log.timestamp, 5) // 5-minute window
      }));

    const hashInput = JSON.stringify(sortedLogs);
    return createHash('sha256').update(hashInput).digest('hex');
  }

  private generateIssueHash(projectName: string, serviceName: string, errorPattern: string): string {
    // Create hash for issue deduplication based on project, service, and error pattern
    const hashInput = `${projectName}:${serviceName}:${errorPattern}`;
    return createHash('sha256').update(hashInput).digest('hex');
  }

  private getTimeWindow(timestamp: string, windowMinutes: number): string {
    // Round timestamp to the nearest time window for grouping similar events
    const date = new Date(timestamp);
    const windowMs = windowMinutes * 60 * 1000;
    const roundedTime = Math.floor(date.getTime() / windowMs) * windowMs;
    return new Date(roundedTime).toISOString();
  }

  public async hasProcessedLogEvent(logs: LogEntry[]): Promise<boolean> {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping log event deduplication');
      return false;
    }

    try {
      const hash = this.generateLogEventHash(logs);
      const key = `${this.keyPrefix}log_event:${hash}`;
      
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Error checking log event deduplication:', error);
      return false; // If Redis fails, don't block processing
    }
  }

  public async markLogEventProcessed(logs: LogEntry[]): Promise<void> {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping log event marking');
      return;
    }

    try {
      const hash = this.generateLogEventHash(logs);
      const key = `${this.keyPrefix}log_event:${hash}`;
      
      await this.client.setEx(key, this.logEventTTL, new Date().toISOString());
      logger.debug(`Marked log event as processed: ${hash}`);
    } catch (error) {
      logger.error('Error marking log event as processed:', error);
    }
  }

  public async hasRecentIssue(
    projectName: string, 
    serviceName: string, 
    errorPattern: string
  ): Promise<boolean> {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping issue deduplication');
      return false;
    }

    try {
      const hash = this.generateIssueHash(projectName, serviceName, errorPattern);
      const key = `${this.keyPrefix}issue:${hash}`;
      
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Error checking issue deduplication:', error);
      return false; // If Redis fails, don't block issue creation
    }
  }

  public async markIssueCreated(
    projectName: string, 
    serviceName: string, 
    errorPattern: string,
    issueUrl?: string
  ): Promise<void> {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping issue marking');
      return;
    }

    try {
      const hash = this.generateIssueHash(projectName, serviceName, errorPattern);
      const key = `${this.keyPrefix}issue:${hash}`;
      
      const value = JSON.stringify({
        projectName,
        serviceName,
        errorPattern,
        issueUrl,
        createdAt: new Date().toISOString()
      });
      
      await this.client.setEx(key, this.issueTTL, value);
      logger.debug(`Marked issue as created: ${hash} - ${issueUrl || 'no URL'}`);
    } catch (error) {
      logger.error('Error marking issue as created:', error);
    }
  }

  public async getIssueDetails(
    projectName: string, 
    serviceName: string, 
    errorPattern: string
  ): Promise<any | null> {
    if (!this.isConnected) {
      return null;
    }

    try {
      const hash = this.generateIssueHash(projectName, serviceName, errorPattern);
      const key = `${this.keyPrefix}issue:${hash}`;
      
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Error getting issue details:', error);
      return null;
    }
  }

  public async testConnection(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      await this.client.ping();
      logger.info('Redis connection test successful');
      return true;
    } catch (error) {
      logger.error('Redis connection test failed:', error);
      return false;
    }
  }

  public async cleanup(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      // Clean up expired keys (Redis should handle this automatically with TTL, but this is for manual cleanup)
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.client.keys(pattern);
      
      let cleanedCount = 0;
      for (const key of keys) {
        const ttl = await this.client.ttl(key);
        if (ttl === -1) { // Key without expiration
          await this.client.del(key);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} Redis keys without TTL`);
      }
    } catch (error) {
      logger.error('Error during Redis cleanup:', error);
    }
  }
}