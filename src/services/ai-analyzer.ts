import Anthropic from '@anthropic-ai/sdk';
import { LogEntry, AnalysisResult, Severity, ProjectConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';

export class AIAnalyzer {
  private anthropic: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-3-5-sonnet-20241022') {
    this.anthropic = new Anthropic({ apiKey });
    this.model = model;
  }

  private buildAnalysisPrompt(logs: LogEntry[], projectConfig?: ProjectConfig): string {
    const customPrompt = projectConfig?.analysisPrompt || '';
    
    const basePrompt = `You are a log analysis expert. Analyze the following application logs and provide insights about potential issues, errors, and recommendations.

CRITICAL SECURITY REQUIREMENT: Since this analysis may be posted in public GitHub repositories, you MUST:
- NEVER include actual host addresses, IP addresses, ports, or URLs
- NEVER include sample log lines or raw log content in your response
- NEVER reveal internal system paths, database connection strings, or API endpoints
- Use generic placeholders like "[HOST]", "[PORT]", "[ENDPOINT]" when referencing infrastructure
- Focus on error patterns and recommendations without exposing sensitive details

Please analyze these logs and respond with a JSON object containing:
- severity: "low", "medium", or "high" 
- summary: Brief description of what you found (no sensitive details)
- recommendations: Array of actionable recommendations (use generic terms)
- affectedServices: Array of service names that have issues
- errorPatterns: Array of error patterns you identified (no actual log content)
- shouldCreateIssue: Boolean indicating if a GitHub issue should be created
- issueTitle: If shouldCreateIssue is true, provide a concise issue title (no sensitive info)
- issueDescription: If shouldCreateIssue is true, provide a detailed issue description with generic steps to reproduce (no sensitive details)

Consider these factors when determining severity:
- HIGH: Critical errors, service failures, security issues, data corruption
- MEDIUM: Performance degradation, non-critical errors, warnings that could lead to issues
- LOW: Minor warnings, info messages, successful operations

Example of SAFE recommendations:
- "Check database connection configuration"
- "Review error handling in [SERVICE] module"
- "Investigate timeout issues in external API calls"

Example of UNSAFE content to avoid:
- "Error connecting to database at mysql://user:pass@host:3306"
- "API call failed to https://api.internal.company.com/endpoint"
- "Check logs: [2024-01-01] ERROR: connection failed"

${customPrompt ? `Additional context: ${customPrompt}` : ''}

Here are the logs to analyze:`;

    return basePrompt;
  }

  private formatLogsForAnalysis(logs: LogEntry[]): string {
    // Group logs by service and time
    const formatted = logs
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map(log => {
        const timestamp = new Date(log.timestamp).toISOString();
        const metadata = log.metadata ? ` | ${JSON.stringify(log.metadata)}` : '';
        return `[${timestamp}] ${log.service} ${log.level.toUpperCase()}: ${log.message}${metadata}`;
      })
      .join('\n');

    return formatted;
  }

  private determineSeverity(logs: LogEntry[]): Severity {
    const errorLogs = logs.filter(log => 
      log.level.toLowerCase() === 'error' || 
      log.level.toLowerCase() === 'fatal' ||
      log.message.toLowerCase().includes('error') ||
      log.message.toLowerCase().includes('exception') ||
      log.message.toLowerCase().includes('failed')
    );

    const warnLogs = logs.filter(log => 
      log.level.toLowerCase() === 'warn' ||
      log.message.toLowerCase().includes('warning')
    );

    if (errorLogs.length > 10) return 'high';
    if (errorLogs.length > 3) return 'medium';
    if (warnLogs.length > 20) return 'medium';
    if (errorLogs.length > 0 || warnLogs.length > 0) return 'low';
    
    return 'low';
  }

  public async analyzeLogs(
    logs: LogEntry[], 
    projectConfig?: ProjectConfig
  ): Promise<AnalysisResult> {
    if (logs.length === 0) {
      return {
        severity: 'low',
        summary: 'No logs to analyze',
        recommendations: [],
        affectedServices: [],
        errorPatterns: [],
        shouldCreateIssue: false,
      };
    }

    logger.info(`Analyzing ${logs.length} logs for potential issues`);

    try {
      const prompt = this.buildAnalysisPrompt(logs, projectConfig);
      const formattedLogs = this.formatLogsForAnalysis(logs);
      
      // Limit log size to avoid token limits
      const maxLogLength = 50000; // Approximate token limit
      const truncatedLogs = formattedLogs.length > maxLogLength 
        ? formattedLogs.substring(0, maxLogLength) + '\n\n... (logs truncated)'
        : formattedLogs;

      const message = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `${prompt}\n\n${truncatedLogs}`
        }],
      });

      const responseText = message.content[0].type === 'text' 
        ? message.content[0].text 
        : '';

      // Try to parse JSON response
      let analysis: Partial<AnalysisResult>;
      try {
        // Extract JSON from response if it's wrapped in markdown or other text
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
        analysis = JSON.parse(jsonStr);
      } catch (parseError) {
        logger.warn('Failed to parse AI response as JSON, creating fallback analysis', parseError);
        
        // Fallback analysis
        const fallbackSeverity = this.determineSeverity(logs);
        analysis = {
          severity: fallbackSeverity,
          summary: `Analysis of ${logs.length} logs (AI response parsing failed)`,
          recommendations: ['Review logs manually for detailed analysis'],
          affectedServices: [...new Set(logs.map(log => log.service))],
          errorPatterns: ['Failed to extract patterns due to parsing error'],
          shouldCreateIssue: fallbackSeverity === 'high',
        };
      }

      // Validate and fill in missing fields
      const result: AnalysisResult = {
        severity: analysis.severity || this.determineSeverity(logs),
        summary: analysis.summary || `Analysis of ${logs.length} logs`,
        recommendations: analysis.recommendations || [],
        affectedServices: analysis.affectedServices || [...new Set(logs.map(log => log.service))],
        errorPatterns: analysis.errorPatterns || [],
        shouldCreateIssue: analysis.shouldCreateIssue || false,
        issueTitle: analysis.issueTitle,
        issueDescription: analysis.issueDescription,
      };

      logger.info(`Analysis completed: ${result.severity} severity, ${result.affectedServices.length} services affected`);
      
      return result;
    } catch (error) {
      logger.error('Failed to analyze logs with AI', error);
      
      // Return fallback analysis
      const fallbackSeverity = this.determineSeverity(logs);
      return {
        severity: fallbackSeverity,
        summary: `Fallback analysis of ${logs.length} logs (AI analysis failed)`,
        recommendations: ['AI analysis failed, manual review recommended'],
        affectedServices: [...new Set(logs.map(log => log.service))],
        errorPatterns: ['Could not extract patterns due to AI analysis failure'],
        shouldCreateIssue: fallbackSeverity === 'high',
        issueTitle: fallbackSeverity === 'high' ? `Critical issues detected in ${logs[0]?.projectName}` : undefined,
        issueDescription: fallbackSeverity === 'high' ? 'AI analysis failed but critical severity detected. Manual investigation required.' : undefined,
      };
    }
  }

  public async testConnection(): Promise<boolean> {
    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: 'Hello'
        }],
      });
      
      logger.info('Anthropic API connection test successful');
      return true;
    } catch (error) {
      logger.error('Anthropic API connection test failed', error);
      return false;
    }
  }
}