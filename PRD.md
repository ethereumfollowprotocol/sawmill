# Product Requirements Document: Railway Log Analysis Tool

## 1. Executive Summary

**Product Name:** Sawmill  
**Version:** 1.0  
**Last Updated:** August 16, 2025

Sawmill is an automated log analysis tool that monitors Railway services, analyzes logs using Claude AI, and sends intelligent alerts via Telegram and email. When critical errors are detected, the tool can automatically create GitHub issues in the appropriate repositories. The tool runs as a scheduled service, periodically collecting logs from multiple Railway projects, processing them through Anthropic's language models for anomaly detection and insights, then delivering actionable notifications and creating trackable issues.

## 2. Product Overview

### 2.1 Purpose
Provide proactive monitoring and intelligent analysis of Railway application logs to help developers identify issues, track deployment health, and receive contextual alerts without manual log inspection.

### 2.2 Target Users
- DevOps engineers managing Railway deployments
- Development teams using Railway for production services
- Platform engineers responsible for service reliability

### 2.3 Core Value Proposition
- **Automated Intelligence**: Transform raw logs into actionable insights using AI
- **Multi-Project Support**: Monitor multiple Railway projects from a single tool
- **Proactive Alerting**: Get notified of issues before they become critical
- **Contextual Analysis**: Receive summaries and recommendations, not just raw alerts
- **Automated Issue Tracking**: Automatically create GitHub issues for detected problems

## 3. Technical Architecture

### 3.1 Technology Stack
- **Runtime**: Node.js with TypeScript
- **AI Integration**: Anthropic SDK for Claude/Sonnet models
- **Railway Integration**: Railway CLI + Railway MCP Server
- **Notifications**: Grammy (Telegram Bot Framework)
- **Scheduling**: Cron jobs or similar scheduling mechanism
- **Email**: SMTP integration for email alerts
- **GitHub Integration**: Octokit SDK for automated issue creation

### 3.2 Core Components
1. **Log Collector**: Interfaces with Railway CLI/MCP to fetch logs
2. **AI Analyzer**: Processes logs through Claude for insights
3. **Alert Manager**: Handles notification routing and formatting
4. **GitHub Issue Manager**: Creates and manages GitHub issues for detected problems
5. **Configuration Manager**: Manages multi-project settings
6. **Scheduler**: Manages periodic execution

## 4. Functional Requirements

### 4.1 Log Collection (Priority: High)
- **FR-1.1**: Connect to multiple Railway projects using project tokens
- **FR-1.2**: Retrieve logs from specified time intervals (configurable)
- **FR-1.3**: Support filtering by service within projects
- **FR-1.4**: Handle authentication via RAILWAY_TOKEN environment variable
- **FR-1.5**: Cache and deduplicate logs to avoid reprocessing

### 4.2 AI Analysis (Priority: High)
- **FR-2.1**: Send collected logs to Claude/Sonnet models via Anthropic SDK
- **FR-2.2**: Implement configurable analysis prompts for different log types
- **FR-2.3**: Identify error patterns, anomalies, and performance issues
- **FR-2.4**: Generate human-readable summaries and recommendations
- **FR-2.5**: Support different analysis depths (quick scan vs. deep analysis)

### 4.3 Alert Management (Priority: High)
- **FR-3.1**: Send alerts via Telegram using Grammy framework
- **FR-3.2**: Send alerts via email (SMTP)
- **FR-3.3**: Support different alert severity levels
- **FR-3.4**: Include log excerpts and AI analysis in alerts
- **FR-3.5**: Support alert throttling to prevent spam

### 4.4 GitHub Issue Management (Priority: High)
- **FR-4.1**: Automatically create GitHub issues when critical errors are detected
- **FR-4.2**: Map Railway services to their corresponding GitHub repositories
- **FR-4.3**: Include AI analysis, log excerpts, and suggested fixes in issue descriptions
- **FR-4.4**: Support issue deduplication to prevent spam
- **FR-4.5**: Add appropriate labels and assign issues based on configuration
- **FR-4.6**: Link created issues in Telegram/email notifications

### 4.5 Configuration Management (Priority: Medium)
- **FR-4.1**: Support configuration file for multiple projects
- **FR-4.2**: Per-project customizable analysis prompts
- **FR-4.3**: Configurable alert thresholds and routing
- **FR-4.4**: Environment-based configuration (dev/staging/prod)

### 4.6 Scheduling & Execution (Priority: Medium)
- **FR-5.1**: Run as scheduled cron job with configurable intervals
- **FR-5.2**: Support manual execution for testing
- **FR-5.3**: Graceful error handling and recovery
- **FR-5.4**: Logging and monitoring of tool execution

## 5. Non-Functional Requirements

### 5.1 Performance
- **NFR-1.1**: Process logs for up to 10 Railway projects within 5 minutes
- **NFR-1.2**: Handle log volumes up to 100MB per execution cycle
- **NFR-1.3**: Minimize API calls to Anthropic to control costs

### 5.2 Reliability
- **NFR-2.1**: 99% uptime for scheduled executions
- **NFR-2.2**: Graceful degradation when Railway or Anthropic APIs are unavailable
- **NFR-2.3**: Retry mechanisms for transient failures

### 5.3 Security
- **NFR-3.1**: Secure storage of API tokens and credentials
- **NFR-3.2**: No logging of sensitive information
- **NFR-3.3**: Support for environment variable-based configuration

### 5.4 Maintainability
- **NFR-4.1**: Comprehensive TypeScript typing
- **NFR-4.2**: Modular architecture for easy testing
- **NFR-4.3**: Clear configuration documentation

## 6. API Dependencies

### 6.1 Railway Integration
- **Railway CLI**: Required for authentication and log access
- **Railway MCP Server**: Provides structured interface to Railway services
- **Authentication**: Project tokens via RAILWAY_TOKEN environment variable

### 6.2 Anthropic API
- **Models**: Claude Sonnet 4 (primary), fallback to other Claude models
- **Authentication**: API key via ANTHROPIC_API_KEY environment variable
- **Rate Limits**: Must respect Anthropic's API rate limits

### 6.3 Telegram Integration
- **Grammy Framework**: TypeScript-first Telegram bot framework
- **Bot Token**: Required from @BotFather
- **Message Limits**: Respect Telegram's message size and rate limits

### 6.4 GitHub Integration
- **Octokit SDK**: Official TypeScript SDK for GitHub API
- **Authentication**: Personal Access Token or GitHub App credentials
- **Rate Limits**: Must respect GitHub's API rate limits (5000 requests/hour for authenticated users)
- **Permissions**: Requires 'issues:write' scope for creating issues

## 7. Configuration Schema

### 7.1 Project Configuration
```typescript
interface ProjectConfig {
  name: string;
  railwayToken: string;
  services?: ServiceConfig[]; // Optional service filtering with GitHub mapping
  analysisPrompt?: string; // Custom analysis instructions
  logRetentionHours: number; // How far back to look
}

interface ServiceConfig {
  name: string;
  githubRepo?: {
    owner: string;
    repo: string;
    defaultAssignees?: string[];
    labels?: string[];
  };
}
```

### 7.2 Alert Configuration
```typescript
interface AlertConfig {
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
    createIssueThreshold: 'medium' | 'high'; // Only create issues for these severity levels
    deduplicationWindow: number; // Hours to check for similar issues
  };
  severityThreshold: 'low' | 'medium' | 'high';
}
```

## 8. User Stories

### 8.1 As a DevOps Engineer
- **US-1**: I want to receive Telegram notifications when errors spike in my Railway services
- **US-2**: I want to get AI-generated summaries of deployment issues across multiple projects
- **US-3**: I want to configure different alert thresholds for different environments

### 8.2 As a Development Team Lead
- **US-4**: I want to receive weekly summaries of application health across all projects
- **US-5**: I want to identify performance degradation patterns before they impact users
- **US-6**: I want to understand the context around errors, not just that they occurred
- **US-7**: I want GitHub issues automatically created for critical errors with AI-generated descriptions and suggested fixes
- **US-8**: I want issues to be created in the correct repository based on which service had the error

## 9. Success Metrics

### 9.1 Technical Metrics
- **TM-1**: Time to detect critical issues < 5 minutes after occurrence
- **TM-2**: False positive rate < 10%
- **TM-3**: Tool execution success rate > 95%

### 9.2 User Experience Metrics
- **UEM-1**: Alert relevance score (user feedback) > 80%
- **UEM-2**: Time to resolution improvement of 25% for alerted issues
- **UEM-3**: User adoption across > 50% of Railway projects in organization

## 10. Implementation Phases

### Phase 1: Core Functionality (Weeks 1-2)
- Basic log collection from single Railway project
- Simple AI analysis with fixed prompts
- Telegram notifications
- Basic error handling

### Phase 2: Multi-Project Support (Week 3)
- Configuration system for multiple projects
- Enhanced authentication handling
- Email notification support
- GitHub issue creation functionality

### Phase 3: Intelligence & Optimization (Week 4)
- Advanced AI prompts and analysis
- Alert throttling and severity levels
- Performance optimizations
- Comprehensive testing

### Phase 4: Production Readiness (Week 5)
- Monitoring and logging
- Documentation
- Deployment automation
- Security review

## 11. Risks & Mitigation

### 11.1 Technical Risks
- **Risk**: Railway MCP Server instability (marked as "experimental")
  - **Mitigation**: Implement fallbacks to direct Railway CLI calls
- **Risk**: Anthropic API rate limits or costs
  - **Mitigation**: Implement intelligent batching and cost monitoring
- **Risk**: Telegram API limitations
  - **Mitigation**: Implement message queuing and rate limiting
- **Risk**: GitHub API rate limits
  - **Mitigation**: Implement intelligent issue deduplication and rate limiting

### 11.2 Operational Risks
- **Risk**: High false positive rate leading to alert fatigue
  - **Mitigation**: Iterative prompt engineering and threshold tuning
- **Risk**: Missing critical issues due to AI hallucination
  - **Mitigation**: Always include raw log excerpts with AI analysis
- **Risk**: Creating duplicate or spam GitHub issues
  - **Mitigation**: Implement issue deduplication based on error patterns and time windows

## 12. Future Enhancements

### 12.1 Advanced Features
- Web dashboard for historical analysis
- Integration with incident management tools
- Custom AI model fine-tuning
- Log pattern learning and adaptation

### 12.2 Integrations
- Slack notifications
- Discord webhooks
- PagerDuty integration
- Advanced GitHub integration (issue assignment, project boards)
- GitHub Actions integration for automated responses

---

**Document Prepared By**: Claude Code Assistant  
**Review Status**: Draft  
**Next Review Date**: Upon implementation start