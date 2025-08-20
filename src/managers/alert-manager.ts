import { Bot } from 'grammy';
import nodemailer from 'nodemailer';
import { AnalysisResult, AlertConfig, ProjectConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';

interface CreatedIssue {
  number: number;
  url: string;
  title: string;
  repository: string;
}

export class AlertManager {
  private telegramBot?: Bot;
  private emailTransporter?: nodemailer.Transporter;
  private config: AlertConfig;

  constructor(alertConfig: AlertConfig) {
    this.config = alertConfig;
    this.initializeTelegram();
    this.initializeEmail();
  }

  private initializeTelegram(): void {
    if (this.config.telegram?.enabled && this.config.telegram.botToken) {
      try {
        this.telegramBot = new Bot(this.config.telegram.botToken);
        logger.info('Telegram bot initialized');
      } catch (error) {
        logger.error('Failed to initialize Telegram bot', error);
      }
    }
  }

  private initializeEmail(): void {
    if (this.config.email?.enabled && this.config.email.password) {
      try {
        this.emailTransporter = nodemailer.createTransport({
          host: this.config.email.smtpHost,
          port: this.config.email.smtpPort,
          secure: this.config.email.smtpPort === 465,
          auth: {
            user: this.config.email.username,
            pass: this.config.email.password,
          },
        });
        logger.info('Email transporter initialized');
      } catch (error) {
        logger.error('Failed to initialize email transporter', error);
      }
    }
  }

  private shouldSendAlert(severity: string): boolean {
    const severityOrder = { low: 0, medium: 1, high: 2 };
    const analysisLevel = severityOrder[severity as keyof typeof severityOrder];
    const thresholdLevel = severityOrder[this.config.severityThreshold];
    
    return analysisLevel >= thresholdLevel;
  }

  private formatTelegramMessage(
    analysis: AnalysisResult,
    projectName: string,
    createdIssues?: CreatedIssue[]
  ): string {
    const severityEmoji = {
      low: '🔵',
      medium: '🟡',
      high: '🔴',
    };

    const emoji = severityEmoji[analysis.severity];
    
    let message = `${emoji} *Sawmill Alert*\n\n`;
    message += `*Project:* ${projectName}\n`;
    message += `*Severity:* ${analysis.severity.toUpperCase()}\n`;
    message += `*Summary:* ${analysis.summary}\n\n`;
    
    if (analysis.affectedServices.length > 0) {
      message += `*Affected Services:*\n`;
      for (const service of analysis.affectedServices) {
        message += `• ${service}\n`;
      }
      message += '\n';
    }

    if (analysis.recommendations.length > 0) {
      message += `*Recommendations:*\n`;
      for (const rec of analysis.recommendations.slice(0, 3)) { // Limit to first 3
        message += `• ${rec}\n`;
      }
      message += '\n';
    }

    if (createdIssues && createdIssues.length > 0) {
      message += `*GitHub Issues Created:*\n`;
      for (const issue of createdIssues) {
        message += `• [#${issue.number}](${issue.url}) - ${issue.repository}\n`;
      }
    }

    message += `\n_Generated at ${new Date().toISOString()}_`;

    return message;
  }

  private formatEmailSubject(analysis: AnalysisResult, projectName: string): string {
    const severityText = analysis.severity.toUpperCase();
    return `[Sawmill Alert - ${severityText}] Issues detected in ${projectName}`;
  }

  private formatEmailBody(
    analysis: AnalysisResult,
    projectName: string,
    createdIssues?: CreatedIssue[]
  ): string {
    const severityColor = {
      low: '#3498db',
      medium: '#f39c12', 
      high: '#e74c3c',
    };

    const color = severityColor[analysis.severity];
    
    let html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: ${color}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">🔍 Sawmill Alert</h1>
        <p style="margin: 5px 0 0 0; font-size: 16px;">Severity: ${analysis.severity.toUpperCase()}</p>
      </div>
      
      <div style="padding: 20px; border: 1px solid #ddd; border-radius: 0 0 8px 8px;">
        <h2 style="color: #333; margin-top: 0;">Summary</h2>
        <p style="color: #666; line-height: 1.6;">${analysis.summary}</p>
        
        <h3 style="color: #333;">Project Details</h3>
        <ul style="color: #666;">
          <li><strong>Project:</strong> ${projectName}</li>
          <li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
          <li><strong>Affected Services:</strong> ${analysis.affectedServices.join(', ')}</li>
        </ul>`;

    if (analysis.errorPatterns.length > 0) {
      html += `
        <h3 style="color: #333;">Error Patterns</h3>
        <ul style="color: #666;">`;
      for (const pattern of analysis.errorPatterns) {
        html += `<li><code style="background-color: #f8f8f8; padding: 2px 4px; border-radius: 3px;">${pattern}</code></li>`;
      }
      html += `</ul>`;
    }

    if (analysis.recommendations.length > 0) {
      html += `
        <h3 style="color: #333;">Recommendations</h3>
        <ul style="color: #666;">`;
      for (const rec of analysis.recommendations) {
        html += `<li>${rec}</li>`;
      }
      html += `</ul>`;
    }

    if (createdIssues && createdIssues.length > 0) {
      html += `
        <h3 style="color: #333;">GitHub Issues Created</h3>
        <ul style="color: #666;">`;
      for (const issue of createdIssues) {
        html += `<li><a href="${issue.url}" style="color: #0366d6;">#${issue.number}</a> - ${issue.repository}</li>`;
      }
      html += `</ul>`;
    }

    html += `
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 12px; text-align: center;">
          This alert was generated by Sawmill log analysis system
        </p>
      </div>
    </div>`;

    return html;
  }

  public async sendTelegramAlert(
    analysis: AnalysisResult,
    projectName: string,
    createdIssues?: CreatedIssue[]
  ): Promise<void> {
    if (!this.telegramBot || !this.config.telegram?.enabled) {
      logger.debug('Telegram alerts are disabled or bot not initialized');
      return;
    }

    if (!this.shouldSendAlert(analysis.severity)) {
      logger.debug(`Skipping Telegram alert - severity ${analysis.severity} below threshold`);
      return;
    }

    try {
      const message = this.formatTelegramMessage(analysis, projectName, createdIssues);
      
      await this.telegramBot.api.sendMessage(
        this.config.telegram.chatId,
        message,
        { 
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true }
        }
      );

      logger.info('Telegram alert sent successfully');
    } catch (error) {
      logger.error('Failed to send Telegram alert', error);
      throw error;
    }
  }

  public async sendEmailAlert(
    analysis: AnalysisResult,
    projectName: string,
    createdIssues?: CreatedIssue[]
  ): Promise<void> {
    if (!this.emailTransporter || !this.config.email?.enabled) {
      logger.debug('Email alerts are disabled or transporter not initialized');
      return;
    }

    if (!this.shouldSendAlert(analysis.severity)) {
      logger.debug(`Skipping email alert - severity ${analysis.severity} below threshold`);
      return;
    }

    try {
      const subject = this.formatEmailSubject(analysis, projectName);
      const html = this.formatEmailBody(analysis, projectName, createdIssues);

      await this.emailTransporter.sendMail({
        from: this.config.email.username,
        to: this.config.email.to,
        subject,
        html,
      });

      logger.info('Email alert sent successfully');
    } catch (error) {
      logger.error('Failed to send email alert', error);
      throw error;
    }
  }

  public async sendAllAlerts(
    analysis: AnalysisResult,
    projectName: string,
    createdIssues?: CreatedIssue[]
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.config.telegram?.enabled) {
      promises.push(this.sendTelegramAlert(analysis, projectName, createdIssues));
    }

    if (this.config.email?.enabled) {
      promises.push(this.sendEmailAlert(analysis, projectName, createdIssues));
    }

    if (promises.length === 0) {
      logger.debug('No alert channels are enabled');
      return;
    }

    try {
      await Promise.allSettled(promises);
      logger.info('All alerts processed');
    } catch (error) {
      logger.error('Some alerts failed to send', error);
    }
  }

  public async testTelegramConnection(): Promise<boolean> {
    if (!this.telegramBot || !this.config.telegram?.enabled) {
      return false;
    }

    try {
      const me = await this.telegramBot.api.getMe();
      logger.info(`Telegram bot connection test successful: @${me.username}`);
      return true;
    } catch (error) {
      logger.error('Telegram bot connection test failed', error);
      return false;
    }
  }

  public async testEmailConnection(): Promise<boolean> {
    if (!this.emailTransporter || !this.config.email?.enabled) {
      return false;
    }

    try {
      await this.emailTransporter.verify();
      logger.info('Email transporter connection test successful');
      return true;
    } catch (error) {
      logger.error('Email transporter connection test failed', error);
      return false;
    }
  }
}