# Sawmill

**Automated Railway Log Analysis Tool with AI Insights and GitHub Issue Creation**

Sawmill monitors your Railway services, analyzes logs using Claude AI, and automatically creates GitHub issues while sending intelligent alerts via Telegram and email.

## Features

- 🤖 **AI-Powered Analysis**: Uses Claude/Sonnet to analyze logs and identify issues
- 🚂 **Railway Integration**: Automatically collects logs from multiple Railway projects
- 📋 **GitHub Issues**: Creates detailed issues in the correct repositories 
- 📱 **Smart Alerts**: Sends notifications via Telegram and email
- ⏰ **Scheduled Monitoring**: Runs on configurable cron schedules
- 🔧 **Multi-Project Support**: Monitor multiple Railway projects simultaneously

## Quick Start

### Prerequisites

- Node.js 18+
- Railway API token (from https://railway.com/account/tokens)
- Anthropic API key
- (Optional) GitHub token for issue creation
- (Optional) Telegram bot for notifications

### Installation

```bash
# Clone and install
git clone <repository-url>
cd sawmill
npm install

# Copy configuration examples
cp config.example.json config.json
cp .env.example .env

# Edit configuration files
nano config.json
nano .env
```

### Configuration

1. **Edit `config.json`** with your Railway projects and notification settings
2. **Edit `.env`** with your API keys and tokens
3. **Test connections**:
   ```bash
   npm run dev test
   ```

### Basic Usage

```bash
# Run one-time analysis
npm run dev run

# Start scheduled monitoring
npm run dev start

# Test all connections
npm run dev test
```

## Configuration

### Project Configuration

Configure each Railway project in `config.json`:

```json
{
  "projects": [
    {
      "name": "my-app",
      "railwayToken": "token_or_env_var",
      "logRetentionHours": 6,
      "analysisPrompt": "Focus on HTTP errors and database issues",
      "services": [
        {
          "name": "api",
          "githubRepo": {
            "owner": "your-org",
            "repo": "my-app",
            "defaultAssignees": ["dev-lead"],
            "labels": ["bug", "production"]
          }
        }
      ]
    }
  ]
}
```

### Alert Configuration

```json
{
  "alerts": {
    "severityThreshold": "medium",
    "telegram": {
      "botToken": "env_var_or_token",
      "chatId": "your_chat_id",
      "enabled": true
    },
    "email": {
      "smtpHost": "smtp.gmail.com",
      "smtpPort": 587,
      "username": "your-email@gmail.com", 
      "password": "app_password",
      "to": ["team@company.com"],
      "enabled": true
    },
    "github": {
      "token": "github_token",
      "enabled": true,
      "createIssueThreshold": "medium",
      "deduplicationWindow": 24
    }
  }
}
```

## Environment Variables

Set these in your `.env` file:

```bash
# Required
ANTHROPIC_API_KEY=your_anthropic_api_key

# Railway tokens (one per project)
RAILWAY_TOKEN_PROJECT_NAME=your_railway_token

# Optional integrations
GITHUB_TOKEN=your_github_token
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
EMAIL_PASSWORD=your_email_password

# Configuration
SAWMILL_CONFIG_PATH=./config.json
LOG_LEVEL=info
```

## Railway Setup

1. **Get Railway API Token**:
   - Go to https://railway.com/account/tokens
   - Click "Create Token"
   - Copy the API token
   - This token provides access to all your Railway projects

2. **Set Environment Variables**:
   ```bash
   # Use the same API token for all projects
   RAILWAY_TOKEN_PROJECT_NAME=your_railway_api_token
   ```

## Telegram Bot Setup

1. **Create Bot**:
   - Message @BotFather on Telegram
   - Run `/newbot` and follow instructions
   - Copy the bot token

2. **Get Chat ID**:
   - Add bot to your group/channel
   - Send a message to the bot
   - Visit: `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - Find your chat ID in the response

## GitHub Integration

1. **Create Personal Access Token**:
   - Go to GitHub Settings > Developer settings > Personal access tokens
   - Create token with `issues:write` permission
   - Add to `GITHUB_TOKEN` environment variable

2. **Repository Configuration**:
   - Configure each service's GitHub repository in config.json
   - Issues will be created in the specified repositories
   - Automatic deduplication prevents spam

## Email Setup

For Gmail:
1. Enable 2-factor authentication
2. Generate an app password
3. Use app password in `EMAIL_PASSWORD`

## Scheduling

Configure monitoring intervals using cron syntax:

```json
{
  "schedule": {
    "enabled": true,
    "interval": "*/15 * * * *"  // Every 15 minutes
  }
}
```

Common intervals:
- `*/15 * * * *` - Every 15 minutes
- `0 */2 * * *` - Every 2 hours  
- `0 9 * * 1-5` - Weekdays at 9 AM
- `0 0 * * *` - Daily at midnight

## AI Analysis

Sawmill uses Claude to analyze logs and:
- Identify error patterns and anomalies
- Determine severity levels (low/medium/high)
- Generate human-readable summaries
- Provide actionable recommendations
- Create detailed GitHub issue descriptions

Customize analysis behavior with project-specific prompts in your configuration.

## CLI Commands

```bash
# Development
npm run dev [command]       # Run with tsx
npm run build              # Build TypeScript
npm run start              # Run built version

# Commands
sawmill start              # Start scheduled monitoring (default)
sawmill run               # One-time analysis  
sawmill test              # Test all connections
sawmill --config=path     # Use custom config file
```

## Production Deployment

### Deploy to Railway (Recommended)

The easiest way to deploy Sawmill is on Railway itself! See [deploy-to-railway.md](./deploy-to-railway.md) for detailed instructions.

**Quick Railway deployment:**
```bash
# Build and deploy
npm run railway:deploy

# Monitor logs
npm run railway:logs

# Access shell
npm run railway:shell
```

**Benefits of Railway deployment:**
- ✅ Railway CLI pre-installed
- ✅ Always-on monitoring 
- ✅ Can monitor itself
- ✅ Zero server management
- ✅ Integrated with Railway ecosystem

### Using PM2

```bash
# Build the project
npm run build

# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start dist/index.js --name sawmill

# Save PM2 configuration
pm2 save
pm2 startup
```

### Using Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY config.json ./
CMD ["node", "dist/index.js"]
```

### Using systemd

```ini
[Unit]
Description=Sawmill Log Analysis Service
After=network.target

[Service]
Type=simple
User=sawmill
WorkingDirectory=/opt/sawmill
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Troubleshooting

### Railway API Issues
```bash
# Test API token manually
curl -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { me { name email } }"}'

# Test with Sawmill
npm run dev test
```

### Connection Testing
```bash
# Test all connections
npm run dev test

# Run one-time analysis to test log collection
npm run dev run
```

### Common Issues

1. **Railway API token not working**:
   - Ensure token is from https://railway.com/account/tokens
   - Check token has access to your projects
   - Verify environment variable names match config

2. **Telegram notifications not sending**:
   - Verify bot token and chat ID
   - Ensure bot is added to the group/channel

3. **GitHub issues not creating**:
   - Check token permissions (`issues:write`)
   - Verify repository access

4. **Email alerts failing**:
   - Use app passwords for Gmail
   - Check SMTP settings

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes and add tests
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- 📖 Documentation: See this README
- 🐛 Issues: GitHub Issues
- 💬 Discussions: GitHub Discussions
