import { LogEntry, ProjectConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';

interface RailwayProject {
  id: string;
  name: string;
  services: {
    edges: Array<{
      node: {
        id: string;
        name: string;
      };
    }>;
  };
}

interface RailwayDeployment {
  id: string;
  status: string;
  createdAt: string;
  service: {
    id: string;
    name: string;
  };
}

interface RailwayLogLine {
  timestamp: string;
  message: string;
  severity?: string;
  attributes?: Record<string, any>;
}

export class RailwayAPICollector {
  private readonly apiEndpoint = 'https://backboard.railway.com/graphql/v2';

  private async makeGraphQLRequest(query: string, variables: any, apiToken: string): Promise<any> {
    try {
      logger.debug(`Making Railway GraphQL request to: ${this.apiEndpoint}`);
      logger.debug(`Token length: ${apiToken.length}`);
      logger.debug(`Query: ${query.substring(0, 100)}...`);

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      });

      logger.debug(`Response status: ${response.status} ${response.statusText}`);

      const responseText = await response.text();
      logger.debug(`Response body: ${responseText.substring(0, 500)}...`);

      if (!response.ok) {
        throw new Error(`Railway API request failed: ${response.status} ${response.statusText}. Body: ${responseText}`);
      }

      const data = JSON.parse(responseText) as any;
      console.log('Parsed response data:', data.data);
      if (data.errors) {
        throw new Error(`Railway API errors: ${JSON.stringify(data.errors)}`);
      }

      return data.data;
    } catch (error) {
      logger.error('Railway GraphQL request failed', error);
      throw error;
    }
  }

  private async getProjects(apiToken: string): Promise<RailwayProject[]> {
    const query = `
      query GetProjects {
        projects {
          edges {
            node {
              id
              name
              services {
                edges {
                  node {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    `;

    const data = await this.makeGraphQLRequest(query, {}, apiToken);
    return data.projects.edges.map((edge: any) => edge.node);
  }

  private async getProjectByName(projectName: string, apiToken: string): Promise<RailwayProject | null> {
    const projects = await this.getProjects(apiToken);
    return projects.find(project => project.name === projectName) || null;
  }

  private async getLatestDeployment(projectId: string, serviceId: string, apiToken: string): Promise<RailwayDeployment | null> {
    const query = `
      query GetDeployments($projectId: String!, $serviceId: String!) {
        deployments(
          first: 1
          input: {
            projectId: $projectId
            serviceId: $serviceId
          }
        ) {
          edges {
            node {
              id
              status
              createdAt
              service {
                id
                name
              }
            }
          }
        }
      }
    `;

    const variables = { projectId, serviceId };
    const data = await this.makeGraphQLRequest(query, variables, apiToken);
    
    return data.deployments.edges.length > 0 ? data.deployments.edges[0].node : null;
  }

  private async getDeploymentLogs(deploymentId: string, apiToken: string): Promise<RailwayLogLine[]> {
    const query = `
      query GetDeploymentLogs($deploymentId: String!) {
        deploymentLogs(
          deploymentId: $deploymentId, 
          filter: "error"
        ) {
          timestamp
          message
          severity
        }
      }
    `;

    const variables = { deploymentId };
    const data = await this.makeGraphQLRequest(query, variables, apiToken);
    
    return data.deploymentLogs || [];
  }

  private parseLogLine(log: RailwayLogLine, serviceName: string, projectName: string): LogEntry {
    // Normalize timestamp
    let timestamp = log.timestamp;
    if (timestamp && !timestamp.endsWith('Z') && !timestamp.includes('+')) {
      timestamp += 'Z';
    }

    // Normalize severity/level
    let level = (log.severity || 'info').toLowerCase();
    if (level === 'warning') level = 'warn';
    if (level === 'fatal') level = 'error';
    if (level === 'trace') level = 'debug';

    return {
      timestamp: timestamp || new Date().toISOString(),
      level,
      message: log.message || '',
      service: serviceName,
      projectName,
      metadata: log.attributes,
    };
  }

  public async collectLogs(projectConfig: ProjectConfig): Promise<LogEntry[]> {
    logger.info(`Collecting logs via Railway API for project: ${projectConfig.name}`);
    
    try {
      const apiToken = projectConfig.railwayToken;
      
      // Get the project
      const project = await this.getProjectByName(projectConfig.name, apiToken);
      if (!project) {
        logger.warn(`Project not found: ${projectConfig.name}`);
        return [];
      }

      logger.debug(`Found project: ${project.name} (${project.id})`);

      const allLogs: LogEntry[] = [];
      const retentionCutoff = new Date(Date.now() - projectConfig.logRetentionHours * 60 * 60 * 1000);

      // Get services to monitor
      const servicesToMonitor = projectConfig.services?.map(s => s.name) || 
                               project.services.edges.map(edge => edge.node.name);

      for (const serviceName of servicesToMonitor) {
        try {
          logger.debug(`Collecting logs for service: ${serviceName}`);

          // Find the service in the project
          const service = project.services.edges.find(edge => edge.node.name === serviceName);
          if (!service) {
            logger.warn(`Service not found: ${serviceName} in project ${projectConfig.name}`);
            continue;
          }

          // Get the latest deployment for this service
          const deployment = await this.getLatestDeployment(project.id, service.node.id, apiToken);
          if (!deployment) {
            logger.warn(`No deployments found for service: ${serviceName}`);
            continue;
          }

          logger.debug(`Found deployment: ${deployment.id} for service: ${serviceName}`);

          // Get logs for this deployment
          const rawLogs = await this.getDeploymentLogs(deployment.id, apiToken);
          
          // Parse and filter logs
          const serviceLogs = rawLogs
            .map(log => this.parseLogLine(log, serviceName, projectConfig.name))
            .filter(log => {
              const logTime = new Date(log.timestamp);
              return logTime >= retentionCutoff;
            });

          allLogs.push(...serviceLogs);

          logger.debug(`Collected ${serviceLogs.length} logs for service: ${serviceName} (filtered from ${rawLogs.length} total)`);
        } catch (error) {
          logger.error(`Failed to collect logs for service: ${serviceName}`, error);
          continue;
        }
      }

      logger.info(`Collected total of ${allLogs.length} logs for project: ${projectConfig.name}`);
      return allLogs;
    } catch (error) {
      logger.error(`Failed to collect logs for project: ${projectConfig.name}`, error);
      throw error;
    }
  }

  public async collectAllLogs(projects: ProjectConfig[]): Promise<LogEntry[]> {
    logger.info(`Collecting logs via Railway API for ${projects.length} projects`);
    const allLogs: LogEntry[] = [];
    
    for (const project of projects) {
      try {
        const projectLogs = await this.collectLogs(project);
        allLogs.push(...projectLogs);
      } catch (error) {
        logger.error(`Failed to collect logs for project: ${project.name}`, error);
        continue;
      }
    }

    logger.info(`Collected total of ${allLogs.length} logs across all projects`);
    return allLogs;
  }

  public async validateAPIConnection(apiToken: string): Promise<boolean> {
    try {
      logger.info('Testing Railway API connection...');
      
      const query = `
        query TestConnection {
          projects {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      `;

      const result = await this.makeGraphQLRequest(query, {}, apiToken);
      console.log('Test connection result:', result.projects.edges);
      logger.info(`Railway API connection validated successfully `);
      return true;
    } catch (error) {
      logger.error('Railway API connection validation failed', error);
      logger.error('This might be due to:');
      logger.error('1. Invalid API token');
      logger.error('2. Using project token instead of account/team token');
      logger.error('3. Network connectivity issues');
      logger.error('Please ensure you have created an Account token from https://railway.com/account/tokens');
      return false;
    }
  }

  public async validateProjectAccess(projectConfig: ProjectConfig): Promise<boolean> {
    try {
      const project = await this.getProjectByName(projectConfig.name, projectConfig.railwayToken);
      if (!project) {
        logger.error(`Project not found or no access: ${projectConfig.name}`);
        return false;
      }

      logger.info(`Railway API access validated for project: ${projectConfig.name}`);
      return true;
    } catch (error) {
      logger.error(`Railway API access validation failed for project: ${projectConfig.name}`, error);
      return false;
    }
  }
}