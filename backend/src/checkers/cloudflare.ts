import type { ReadinessIssue, RepoFile } from '../types';

export const checkCloudflareReadiness = (repoFiles: RepoFile[]): ReadinessIssue[] => {
  const issues: ReadinessIssue[] = [];

  // Get common files
  const hasWranglerConfig = repoFiles.find(f => f.path === 'wrangler.toml');
  const packageJsonFile = repoFiles.find(f => f.path === 'package.json');
  const gitignoreFile = repoFiles.find(f => f.path === '.gitignore');

  let packageJson: any = null;
  if (packageJsonFile) {
    try {
      packageJson = JSON.parse(packageJsonFile.content);
    } catch (e) {
      // Invalid JSON handled below
    }
  }

  // === CATEGORY 1: Configuration Requirements (Auto-fixable: 6 items) ===

  // 1. Missing wrangler.toml
  if (!hasWranglerConfig) {
    issues.push({
      category: 'config',
      severity: 'error',
      message: 'Missing wrangler.toml configuration file',
      suggestion: 'Create wrangler.toml with Workers configuration'
    });
  } else {
    const wranglerContent = hasWranglerConfig.content;

    // 2. Check name field
    if (!wranglerContent.includes('name =')) {
      issues.push({
        category: 'config',
        severity: 'error',
        message: 'wrangler.toml missing required "name" field',
        suggestion: 'Add name field to wrangler.toml'
      });
    }

    // 3. Check main field (optional for assets-only workers)
    if (!wranglerContent.includes('main =') && !wranglerContent.includes('assets')) {
      issues.push({
        category: 'config',
        severity: 'error',
        message: 'wrangler.toml missing "main" entry point field',
        suggestion: 'Add main field pointing to your Worker entry point (e.g., main = "src/index.ts")'
      });
    }

    // 4. Check compatibility_date
    if (!wranglerContent.includes('compatibility_date =')) {
      issues.push({
        category: 'config',
        severity: 'error',
        message: 'wrangler.toml missing required "compatibility_date" field',
        suggestion: 'Add compatibility_date with current date (e.g., compatibility_date = "2025-01-15")'
      });
    } else {
      // 5. Check if compatibility_date is recent (within 6 months)
      const dateMatch = wranglerContent.match(/compatibility_date\s*=\s*"(\d{4}-\d{2}-\d{2})"/);
      if (dateMatch) {
        const compatDate = new Date(dateMatch[1]);
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        if (compatDate < sixMonthsAgo) {
          issues.push({
            category: 'config',
            severity: 'warning',
            message: `compatibility_date (${dateMatch[1]}) is outdated (older than 6 months)`,
            suggestion: 'Update compatibility_date to a recent date for latest runtime features'
          });
        }
      }
    }
  }

  // === CATEGORY 2: Runtime Compatibility (Auto-fixable: 3 items) ===

  // 6. Check for Express.js
  const hasExpress = packageJson?.dependencies?.express || packageJson?.dependencies?.['express'];
  if (hasExpress) {
    issues.push({
      category: 'runtime',
      severity: 'error',
      message: 'Express.js is not compatible with Cloudflare Workers',
      suggestion: 'Migrate to Hono or other Workers-compatible framework (itty-router, worktop)'
    });
  }

  // 7. Check for SQLite
  const hasSQLite = packageJson?.dependencies?.sqlite3 ||
                    packageJson?.dependencies?.sqlite ||
                    packageJson?.dependencies?.['better-sqlite3'];
  if (hasSQLite) {
    issues.push({
      category: 'database',
      severity: 'error',
      message: 'SQLite is not compatible with Cloudflare Workers',
      suggestion: 'Migrate to D1 database (Cloudflare\'s SQLite-compatible database)'
    });
  }

  // 8. Check for local file system usage
  const hasLocalStorage = repoFiles.some(f => {
    const content = f.content.toLowerCase();
    return content.includes('fs.writefile') ||
           content.includes('fs.readfile') ||
           content.includes('fs.createwritestream') ||
           content.includes('fs.existssync') ||
           content.includes('require(\'fs\')') ||
           content.includes('import * as fs') ||
           content.includes('from \'fs\'');
  });

  const hasMulter = packageJson?.dependencies?.multer;

  if (hasLocalStorage || hasMulter) {
    issues.push({
      category: 'storage',
      severity: 'error',
      message: 'Local file system storage is not available in Cloudflare Workers',
      suggestion: 'Migrate to R2 object storage for file storage'
    });
  }

  // 9. Check for port binding
  const hasPortBinding = repoFiles.some(f =>
    f.content.includes('app.listen(') ||
    f.content.includes('.listen(') ||
    f.content.includes('server.listen(')
  );

  if (hasPortBinding) {
    issues.push({
      category: 'runtime',
      severity: 'error',
      message: 'Port binding (.listen()) is not compatible with Cloudflare Workers',
      suggestion: 'Remove port binding and export default handler (export default app or export default { fetch })'
    });
  }

  // 10. Check for Node.js APIs without nodejs_compat flag
  const usesNodeAPIs = repoFiles.some(f => {
    const content = f.content;
    return content.includes('require(\'crypto\')') ||
           content.includes('require(\'path\')') ||
           content.includes('require(\'buffer\')') ||
           content.includes('from \'crypto\'') ||
           content.includes('from \'path\'') ||
           content.includes('from \'buffer\'');
  });

  if (usesNodeAPIs && hasWranglerConfig && !hasWranglerConfig.content.includes('nodejs_compat')) {
    issues.push({
      category: 'runtime',
      severity: 'error',
      message: 'Node.js built-in modules detected but nodejs_compat flag not enabled',
      suggestion: 'Add compatibility_flags = ["nodejs_compat"] to wrangler.toml'
    });
  }

  // === CATEGORY 3: Storage & Bindings (Auto-fixable: 3 items) ===

  // 11. Check if D1 binding needed but not configured
  if (hasSQLite && hasWranglerConfig && !hasWranglerConfig.content.includes('d1_databases')) {
    issues.push({
      category: 'database',
      severity: 'error',
      message: 'D1 database binding not configured in wrangler.toml',
      suggestion: 'Add [[d1_databases]] binding configuration to wrangler.toml'
    });
  }

  // 12. Check if R2 binding needed but not configured
  if ((hasLocalStorage || hasMulter) && hasWranglerConfig && !hasWranglerConfig.content.includes('r2_buckets')) {
    issues.push({
      category: 'storage',
      severity: 'error',
      message: 'R2 bucket binding not configured in wrangler.toml',
      suggestion: 'Add [[r2_buckets]] binding configuration to wrangler.toml'
    });
  }

  // 13. Check for session/cache needs (detect patterns suggesting KV usage)
  const needsKV = repoFiles.some(f => {
    const content = f.content.toLowerCase();
    return content.includes('session') ||
           content.includes('cache') ||
           content.includes('redis') ||
           content.includes('memcache');
  });

  if (needsKV && hasWranglerConfig && !hasWranglerConfig.content.includes('kv_namespaces')) {
    issues.push({
      category: 'storage',
      severity: 'warning',
      message: 'Application appears to need caching/sessions but KV namespace not configured',
      suggestion: 'Consider adding [[kv_namespaces]] binding for session storage or caching'
    });
  }

  // === CATEGORY 4: Environment & Secrets (Auto-fixable: 4 items) ===

  // 14. Check for sensitive data in wrangler.toml
  if (hasWranglerConfig) {
    const sensitivePatterns = [
      /api[_-]?key\s*=\s*"[^"]+"/i,
      /secret\s*=\s*"[^"]+"/i,
      /password\s*=\s*"[^"]+"/i,
      /token\s*=\s*"[^"]+"/i,
      /private[_-]?key\s*=\s*"[^"]+"/i
    ];

    const hasSensitiveData = sensitivePatterns.some(pattern =>
      pattern.test(hasWranglerConfig.content)
    );

    if (hasSensitiveData) {
      issues.push({
        category: 'config',
        severity: 'error',
        message: 'Sensitive data detected in wrangler.toml vars section',
        suggestion: 'Move sensitive values to secrets using "wrangler secret put <KEY>"'
      });
    }
  }

  // 15. Check for .dev.vars in .gitignore
  if (!gitignoreFile || !gitignoreFile.content.includes('.dev.vars')) {
    issues.push({
      category: 'config',
      severity: 'warning',
      message: '.dev.vars file not in .gitignore - risk of exposing secrets',
      suggestion: 'Add .dev.vars* and .env* to .gitignore'
    });
  }

  // 16. Check environment variable count limits
  if (hasWranglerConfig) {
    const varsMatch = hasWranglerConfig.content.match(/\[vars\]([\s\S]*?)(\[|$)/);
    if (varsMatch) {
      const varsSection = varsMatch[1];
      const varCount = (varsSection.match(/\w+\s*=/g) || []).length;

      // Free tier: 64, Paid tier: 128
      if (varCount > 64) {
        issues.push({
          category: 'config',
          severity: 'warning',
          message: `Environment variable count (${varCount}) exceeds Free tier limit (64)`,
          suggestion: 'Reduce environment variables or upgrade to Paid plan (128 limit)'
        });
      }
    }
  }

  // === CATEGORY 5: Observability (Auto-fixable: 1 item) ===

  // 17. Check for JSON logging
  const hasConsoleLog = repoFiles.some(f => f.content.includes('console.log'));
  const hasJSONLogging = repoFiles.some(f =>
    f.content.includes('JSON.stringify') && f.content.includes('console.log')
  );

  if (hasConsoleLog && !hasJSONLogging) {
    issues.push({
      category: 'config',
      severity: 'info',
      message: 'Consider using JSON logging format for better log analysis',
      suggestion: 'Use console.log(JSON.stringify({...})) for structured logging'
    });
  }

  // === CATEGORY 6: Deployment & Environments (Auto-fixable: 1 item) ===

  // 18. Check for multiple environments
  if (hasWranglerConfig && !hasWranglerConfig.content.includes('[env.')) {
    issues.push({
      category: 'config',
      severity: 'info',
      message: 'No separate environments configured (staging, production)',
      suggestion: 'Add [env.staging] and [env.production] sections to wrangler.toml'
    });
  }

  // === CATEGORY 7: Detectable Issues (Warning/Info) ===

  // 19. Check for potential subrequest issues (loops with fetch)
  const hasLoopedFetch = repoFiles.some(f => {
    const content = f.content;
    return (content.includes('for') || content.includes('while') || content.includes('.map(')) &&
           content.includes('fetch(');
  });

  if (hasLoopedFetch) {
    issues.push({
      category: 'runtime',
      severity: 'warning',
      message: 'Detected fetch calls inside loops - may exceed 1,000 subrequest limit',
      suggestion: 'Consider batching requests or using Promise.all() to parallelize'
    });
  }

  // 20. Check for large dependencies
  if (packageJson?.dependencies) {
    const largeDeps = ['moment', 'lodash', 'axios'];
    const foundLargeDeps = largeDeps.filter(dep => packageJson.dependencies[dep]);

    if (foundLargeDeps.length > 0) {
      issues.push({
        category: 'config',
        severity: 'warning',
        message: `Large dependencies detected: ${foundLargeDeps.join(', ')} - may increase bundle size`,
        suggestion: 'Consider lighter alternatives: date-fns (vs moment), lodash-es (vs lodash), native fetch (vs axios)'
      });
    }
  }

  // 21. Check for secret files in repo
  const secretFiles = repoFiles.filter(f =>
    f.path === '.env' ||
    f.path === '.env.local' ||
    f.path === '.dev.vars' ||
    f.path.includes('credentials.json') ||
    f.path.includes('secret')
  );

  if (secretFiles.length > 0) {
    issues.push({
      category: 'config',
      severity: 'error',
      message: `Secret files found in repository: ${secretFiles.map(f => f.path).join(', ')}`,
      suggestion: 'Remove secret files from git and add to .gitignore'
    });
  }

  // 22. Check for routes configuration guidance
  if (hasWranglerConfig && !hasWranglerConfig.content.includes('routes') && !hasWranglerConfig.content.includes('route')) {
    issues.push({
      category: 'config',
      severity: 'info',
      message: 'No routes configured - Worker will only be accessible via workers.dev subdomain',
      suggestion: 'Add routes or custom domain configuration for production deployment'
    });
  }

  return issues;
};
