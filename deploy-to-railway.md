# Deploying Sawmill to Railway

This guide shows how to deploy Sawmill as a service on Railway itself, allowing it to monitor other Railway projects from within the Railway ecosystem.

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **Railway CLI**: Install locally for initial setup
   ```bash
   npm install -g @railway/cli
   railway login
   ```

## Deployment Methods

### Method 1: Deploy from GitHub (Recommended)

1. **Push code to GitHub repository**

2. **Create new Railway project**:
   ```bash
   railway login
   railway init
   ```

3. **Connect GitHub repository**:
   - Go to Railway dashboard
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your Sawmill repository

4. **Railway will automatically**:
   - Detect the `Dockerfile`
   - Build the container with Railway CLI included
   - Deploy the service

### Method 2: Deploy via CLI

1. **Build the project locally**:
   ```bash
   npm run build
   ```

2. **Deploy to Railway**:
   ```bash
   railway login
   railway init
   railway up
   ```

3. **Set environment variables** (see configuration section below)

## Configuration for Railway Deployment

### Environment Variables

Set these in Railway's environment variables section:

**Required:**
```bash
ANTHROPIC_API_KEY=your_anthropic_api_key
RAILWAY_TOKEN_PROJECT1=project_token_for_first_project
RAILWAY_TOKEN_PROJECT2=project_token_for_second_project
# Add more RAILWAY_TOKEN_* variables for each project you want to monitor
```

**Optional:**
```bash
GITHUB_TOKEN=your_github_token
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
EMAIL_PASSWORD=your_email_password
SAWMILL_CONFIG_PATH=./config.railway.json
LOG_LEVEL=info
PORT=3000
```

### Configuration File

Use `config.railway.json` as your configuration file for Railway deployment:

1. **Copy the example**:
   ```bash
   cp config.railway.json config.json
   ```

2. **Update project configurations** with your actual project names and repositories

3. **Set the config path**:
   ```bash
   # In Railway environment variables
   SAWMILL_CONFIG_PATH=./config.railway.json
   ```

## Railway API Authentication

The deployed Sawmill service uses Railway's GraphQL API directly:

1. **No CLI required** - uses Railway's public API at `backboard.railway.com/graphql/v2`
2. **API tokens** - uses Railway API tokens from account settings
3. **Direct GraphQL queries** - fetches logs, projects, and deployments via API

## Railway API Token Setup

For monitoring Railway projects:

1. **Generate API token**:
   - Go to https://railway.com/account/tokens
   - Click "Create Token"
   - Copy the API token (provides access to all your projects)

2. **Add to environment variables**:
   ```bash
   # Use the same API token for all projects
   RAILWAY_TOKEN_MY_WEB_APP=your_railway_api_token
   RAILWAY_TOKEN_DATA_PIPELINE=your_railway_api_token
   ```

3. **Update config.json** with your project names:
   ```json
   {
     "projects": [
       {
         "name": "my-web-app",  // Must match actual Railway project name
         "railwayToken": "env_var_will_override_this"
       }
     ]
   }
   ```

## Self-Monitoring Setup

**Interestingly, Sawmill can monitor itself!** To monitor the Sawmill service running on Railway:

1. **Get Sawmill's project token** from its Railway project settings
2. **Add to environment variables**:
   ```bash
   RAILWAY_TOKEN_SAWMILL=sawmill_project_token
   ```
3. **Add to config**:
   ```json
   {
     "projects": [
       {
         "name": "sawmill",
         "railwayToken": "env_var",
         "logRetentionHours": 12,
         "analysisPrompt": "Monitor for log analysis failures, API issues, and scheduling problems.",
         "services": [
           {
             "name": "sawmill",
             "githubRepo": {
               "owner": "your-org",
               "repo": "sawmill",
               "labels": ["bug", "meta", "monitoring"]
             }
           }
         ]
       }
     ]
   }
   ```

## Scheduling Considerations

Since Railway services run continuously:

1. **Enable scheduling** in config:
   ```json
   {
     "schedule": {
       "enabled": true,
       "interval": "*/15 * * * *"
     }
   }
   ```

2. **Monitor resource usage** - Railway charges based on resource consumption

3. **Consider longer intervals** for cost optimization:
   ```json
   {
     "schedule": {
       "interval": "0 */2 * * *"  // Every 2 hours instead of 15 minutes
     }
   }
   ```

## Deployment Steps Summary

1. **Prepare repository**:
   ```bash
   git add .
   git commit -m "Add Railway deployment configuration"
   git push origin main
   ```

2. **Create Railway project**:
   - Connect GitHub repo in Railway dashboard
   - Or use `railway init && railway up`

3. **Configure environment variables**:
   - Set all required API keys and tokens
   - Configure project tokens for monitoring

4. **Deploy**:
   - Railway auto-deploys on git push
   - Monitor logs in Railway dashboard

5. **Test**:
   ```bash
   # Check if service is running
   railway logs
   
   # Test connections
   railway run node dist/index.js test
   ```

## Benefits of Railway Deployment

✅ **Always On**: Continuous monitoring without local machine dependency  
✅ **Integrated**: Uses Railway CLI natively within Railway environment  
✅ **Scalable**: Easy to adjust resources based on monitoring needs  
✅ **Cost Effective**: Pay only for actual resource usage  
✅ **Self-Monitoring**: Can monitor its own Railway project  
✅ **Zero Ops**: No server management required  

## Monitoring and Logs

- **View logs**: Railway dashboard or `railway logs`
- **Monitor performance**: Railway metrics dashboard
- **Debug issues**: `railway shell` to access container
- **Scale resources**: Adjust in Railway project settings

## Cost Optimization Tips

1. **Adjust monitoring frequency** based on criticality
2. **Use severity thresholds** to reduce noise
3. **Monitor Railway usage** in billing dashboard
4. **Consider pausing** during maintenance windows
5. **Optimize log retention hours** per project

This setup gives you a fully managed, cloud-native log monitoring solution that runs within Railway itself!