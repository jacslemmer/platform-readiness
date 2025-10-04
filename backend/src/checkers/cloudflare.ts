import type { ReadinessIssue, RepoFile } from '../types';

export const checkCloudflareReadiness = (repoFiles: RepoFile[]): ReadinessIssue[] => {
  const issues: ReadinessIssue[] = [];

  const hasWranglerConfig = repoFiles.some(f => f.path === 'wrangler.toml');
  const hasPackageJson = repoFiles.find(f => f.path === 'package.json');
  const hasExpress = hasPackageJson && hasPackageJson.content.includes('"express"');
  const hasSQLite = hasPackageJson && (
    hasPackageJson.content.includes('"sqlite3"') ||
    hasPackageJson.content.includes('"sqlite"')
  );
  const hasLocalStorage = repoFiles.some(f =>
    f.content.includes('fs.') || f.content.includes('multer')
  );

  if (!hasWranglerConfig) {
    issues.push({
      category: 'config',
      severity: 'error',
      message: 'Missing wrangler.toml configuration file',
      suggestion: 'Create wrangler.toml with Workers configuration'
    });
  }

  if (hasExpress) {
    issues.push({
      category: 'runtime',
      severity: 'error',
      message: 'Express.js is not compatible with Cloudflare Workers',
      suggestion: 'Migrate to Hono or other Workers-compatible framework'
    });
  }

  if (hasSQLite) {
    issues.push({
      category: 'database',
      severity: 'error',
      message: 'SQLite is not compatible with Cloudflare Workers',
      suggestion: 'Migrate to D1 database'
    });
  }

  if (hasLocalStorage) {
    issues.push({
      category: 'storage',
      severity: 'error',
      message: 'Local file system storage is not available in Cloudflare Workers',
      suggestion: 'Migrate to R2 object storage'
    });
  }

  const hasPortBinding = repoFiles.some(f =>
    f.content.includes('app.listen(') || f.content.includes('.listen(')
  );

  if (hasPortBinding) {
    issues.push({
      category: 'runtime',
      severity: 'error',
      message: 'Port binding is not compatible with Cloudflare Workers',
      suggestion: 'Remove port binding and export Workers handler'
    });
  }

  return issues;
};
