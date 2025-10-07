import type { ReadinessIssue, RepoFile } from '../types';
import { calculatePortabilityScore } from '../services/portabilityChecker';

export const checkAzureReadiness = (repoFiles: RepoFile[]): ReadinessIssue[] => {
  const issues: ReadinessIssue[] = [];

  // ========================================
  // STEP 1: PORTABILITY CHECK (HIGHEST PRIORITY)
  // ========================================
  const portability = calculatePortabilityScore(repoFiles);

  // Helper function to add portability issues
  const addPortabilityIssues = (filterBlockers: boolean) => {
    portability.issues.forEach(issue => {
      if (filterBlockers ? issue.blocker : true) {
        issues.push({
          category: 'runtime',
          severity: 'error',
          message: `[${issue.blocker ? 'BLOCKER' : 'CRITICAL'}] ${issue.description}`,
          suggestion: `Impact: -${issue.impact} points. ${
            issue.blocker
              ? 'This is a fundamental incompatibility that cannot be automatically fixed.'
              : 'Requires significant manual work.'
          }`
        });
      }
    });
  };

  // If app cannot be ported (score < 30), add CRITICAL blocking issue
  if (portability.score < 30) {
    issues.push({
      category: 'runtime',
      severity: 'error',
      message: `❌ CANNOT PORT: Portability Score ${portability.score}/100 - ${portability.severity}`,
      suggestion: portability.recommendation
    });

    addPortabilityIssues(true); // Only add blocker issues
    return issues;
  }

  // If low portability score (30-50), recommend rebuilding
  if (portability.score < 50) {
    issues.push({
      category: 'runtime',
      severity: 'error',
      message: `❌ NOT RECOMMENDED TO PORT: Portability Score ${portability.score}/100`,
      suggestion: `🚨 RECOMMENDATION: REBUILD FROM SCRATCH\n\n` +
        `This application has a portability score below 50, meaning:\n` +
        `• Porting will require extensive manual work (${portability.estimatedEffort})\n` +
        `• Rebuilding as Azure-native will be FASTER and result in better architecture\n` +
        `• The automated porter cannot adequately handle these issues\n\n` +
        `${portability.recommendation}\n\n` +
        `❌ The Platform Readiness tool STRONGLY RECOMMENDS rebuilding this application from scratch for Azure.\n` +
        `✅ Building Azure-native from the start will save time and produce superior results.`
    });

    addPortabilityIssues(false); // Add all portability issues
    return issues;
  }

  // ========================================
  // STEP 2: CONTINUE WITH STANDARD CHECKS (only if score >= 50)
  // ========================================

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
