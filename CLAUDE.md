# Sawmill - Claude Code Integration Guide

## Project Overview

**Sawmill** is an automated Railway log analysis tool that monitors Railway services, analyzes logs using Claude AI, and automatically creates GitHub issues while sending intelligent alerts via Telegram and email.

## Core Architecture

### Main Components
- **SawmillService** (`src/index.ts`): Main orchestrator that coordinates all components
- **RailwayAPICollector** (`src/services/railway-api.ts`): Collects logs via Railway GraphQL API
- **AIAnalyzer** (`src/services/ai-analyzer.ts`): Analyzes logs using Anthropic SDK
- **GitHubIssueManager** (`src/managers/github-issue-manager.ts`): Creates GitHub issues with deduplication
- **AlertManager** (`src/managers/alert-manager.ts`): Sends notifications via Telegram and email
- **ConfigManager** (`src/utils/config.ts`): Handles configuration and environment variables

### Key Technologies
- **TypeScript** with Node.js runtime
- **Railway GraphQL API** at `https://backboard.railway.com/graphql/v2`
- **Anthropic SDK** for Claude AI analysis
- **Octokit** for GitHub API integration
- **Grammy** for Telegram bot functionality
- **Nodemailer** for email alerts
- **Node-cron** for scheduled execution

## Development Commands

```bash
# Development
npm run dev [command]       # Run with tsx (supports: start, run, test)
npm run build              # Build TypeScript to dist/
npm run start              # Run built version from dist/
npm run typecheck          # TypeScript type checking
npm run lint               # ESLint code linting

# Sawmill Commands
npm run dev start          # Start scheduled monitoring (default)
npm run dev run           # One-time log analysis
npm run dev test          # Test all API connections

# Railway Deployment
npm run railway:deploy     # Build and deploy to Railway
npm run railway:logs       # View Railway deployment logs
npm run railway:shell      # Access Railway shell
```

## Configuration

### Environment Variables (Required)
```bash
# Core API Keys
ANTHROPIC_API_KEY=your_anthropic_api_key
RAILWAY_TOKEN_<PROJECT_NAME>=your_railway_account_token

# Optional Integrations  
GITHUB_TOKEN=your_github_token
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
EMAIL_PASSWORD=your_email_app_password

# Configuration
SAWMILL_CONFIG_PATH=./config.json
LOG_LEVEL=info  # debug, info, warn, error
```

### Configuration Files
- **config.json**: Main configuration with projects, alerts, scheduling
- **.env**: Environment variables (gitignored)
- **config.example.json**: Example configuration template

## Important Implementation Details

### Railway API Integration
- **Uses GraphQL API only** - Railway CLI was removed due to authentication issues
- **Account tokens required** - Project tokens don't work with GraphQL API
- **Token source**: https://railway.com/account/tokens (don't select team for account token)
- **Authentication issues**: See `RAILWAY_API_DEBUG.md` for troubleshooting

### Error Handling
- All API calls have comprehensive error handling with retries
- Failed projects/services don't stop the entire analysis cycle
- Enhanced debug logging available with `LOG_LEVEL=debug`

### Security
- All sensitive data uses environment variables
- No secrets stored in config files
- GitHub issue deduplication prevents spam

## File Structure

```
src/
├── index.ts                    # Main entry point & CLI
├── types/config.ts            # TypeScript interfaces
├── utils/
│   ├── config.ts              # Configuration management
│   └── logger.ts              # Logging utilities
├── services/
│   ├── railway-api.ts         # Railway GraphQL API client
│   └── ai-analyzer.ts         # Anthropic/Claude integration
└── managers/
    ├── github-issue-manager.ts # GitHub API integration
    └── alert-manager.ts        # Multi-channel alerting

config.json                    # Main configuration
.env                          # Environment variables (gitignored)
Dockerfile                    # Railway deployment config
RAILWAY_API_DEBUG.md          # Railway API troubleshooting guide
```

## Testing & Debugging

### Connection Testing
```bash
# Test all API connections
LOG_LEVEL=debug npm run dev test

# Manual Railway API test
curl --request POST \
  --url https://backboard.railway.com/graphql/v2 \
  --header "Authorization: Bearer YOUR_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"query":"query { me { name email } }"}'
```

### Common Issues

1. **Railway API Authentication**: 
   - Use Account tokens from https://railway.com/account/tokens
   - Don't use Project tokens with GraphQL API
   - Refer to `RAILWAY_API_DEBUG.md`

2. **TypeScript Compilation**:
   - Run `npm run typecheck` before building
   - ES modules require `.js` extensions in imports

3. **Environment Variables**:
   - Railway tokens use pattern: `RAILWAY_TOKEN_<PROJECT_NAME>`
   - Project names are normalized to uppercase

## Deployment

### Railway (Recommended)
- Self-hosting on Railway for monitoring Railway services
- Uses Dockerfile with Node.js 18 Alpine
- Railway CLI removed from container
- Environment variables configured in Railway dashboard

### Local Development
- Uses `tsx` for TypeScript execution without compilation
- Hot reloading supported for development
- Production builds to `dist/` directory

## AI Analysis Features

- **Log Pattern Recognition**: Identifies errors, warnings, and anomalies
- **Severity Assessment**: Categorizes issues as low/medium/high
- **Service Impact Analysis**: Determines affected services and components
- **Actionable Recommendations**: Provides specific debugging steps
- **GitHub Issue Generation**: Creates detailed issue descriptions with code snippets

## Integration Capabilities

- **Multi-project monitoring**: Simultaneous monitoring of multiple Railway projects
- **Smart alerting**: Configurable severity thresholds and channels
- **Issue deduplication**: Prevents duplicate GitHub issues within time windows
- **Scheduled execution**: Cron-based monitoring with customizable intervals
- **Graceful error handling**: Continues operation even if individual services fail

## Recent Changes

- **Removed Railway CLI entirely** due to authentication issues
- **Migrated to GraphQL API only** for better reliability
- **Enhanced error logging** for Railway API debugging
- **Updated Dockerfile** to remove CLI dependencies
- **Added comprehensive troubleshooting documentation**