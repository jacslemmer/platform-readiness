import type { ReadinessIssue, RepoFile } from '../types';

export const checkAzureReadiness = (repoFiles: RepoFile[]): ReadinessIssue[] => {
  const issues: ReadinessIssue[] = [];

  const hasAzureConfig = repoFiles.some(f => f.path === 'azure.yaml' || f.path === '.azure/config');
  const hasPackageJson = repoFiles.find(f => f.path === 'package.json');
  const hasSQLite = hasPackageJson && (
    hasPackageJson.content.includes('"sqlite3"') ||
    hasPackageJson.content.includes('"sqlite"')
  );
  const hasLocalStorage = repoFiles.some(f =>
    f.content.includes('fs.writeFile') || f.content.includes('multer')
  );
  const hasDotEnv = repoFiles.some(f => f.path === '.env');

  if (!hasAzureConfig) {
    issues.push({
      category: 'config',
      severity: 'error',
      message: 'Missing Azure deployment configuration',
      suggestion: 'Create azure.yaml with App Service configuration'
    });
  }

  if (hasSQLite) {
    issues.push({
      category: 'database',
      severity: 'error',
      message: 'SQLite database will not persist in Azure App Service (ephemeral file system)',
      suggestion: 'Choose a cloud database when porting:\n' +
        '✅ Azure SQL Free Tier (FREE FOREVER - 32GB, 100K vCore seconds/month) - RECOMMENDED\n' +
        '✅ Cosmos DB Free Tier (FREE FOREVER - 25GB, 1000 RU/s) - For NoSQL/MongoDB apps\n' +
        '💰 Azure SQL Paid (~$5+/month) - For enterprise needs (>10 DBs, >32GB)\n' +
        '⏰ PostgreSQL (~$15-30/month after 12 months free)\n' +
        '⏰ MySQL (~$15-30/month after 12 months free)'
    });
  }

  if (hasLocalStorage) {
    issues.push({
      category: 'storage',
      severity: 'error',
      message: 'Local file storage will not persist in Azure App Service (ephemeral file system)',
      suggestion: 'Migrate to Azure Blob Storage for persistent file storage'
    });
  }

  if (hasDotEnv) {
    issues.push({
      category: 'config',
      severity: 'warning',
      message: '.env file will not be deployed to Azure',
      suggestion: 'Configure environment variables in Azure App Service settings'
    });
  }

  const hasStartScript = hasPackageJson && JSON.parse(hasPackageJson.content).scripts?.start;

  if (!hasStartScript) {
    issues.push({
      category: 'config',
      severity: 'error',
      message: 'Missing start script in package.json',
      suggestion: 'Add "start" script for Azure App Service'
    });
  }

  return issues;
};
