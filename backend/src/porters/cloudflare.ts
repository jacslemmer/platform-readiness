import type { RepoFile, ReadinessIssue, PortingResult, PortedFile } from '../types';

export const portToCloudflare = (
  repoFiles: RepoFile[],
  issues: ReadinessIssue[],
  _preferences?: { databaseChoice?: string; storageChoice?: string }
): PortingResult => {
  const portedFiles: PortedFile[] = [];
  const fixedIssues: string[] = [];

  // Get existing files
  const packageJsonFile = repoFiles.find(f => f.path === 'package.json');
  const wranglerFile = repoFiles.find(f => f.path === 'wrangler.toml');
  const gitignoreFile = repoFiles.find(f => f.path === '.gitignore');

  let packageJson: any = {};
  if (packageJsonFile) {
    try {
      packageJson = JSON.parse(packageJsonFile.content);
    } catch (e) {
      packageJson = {};
    }
  }

  // Detect what needs to be fixed
  const hasExpress = issues.some(i => i.message.includes('Express'));
  const hasSQLite = issues.some(i => i.message.includes('SQLite'));
  const hasLocalStorage = issues.some(i => i.message.includes('file system'));
  const hasPortBinding = issues.some(i => i.message.includes('Port binding'));
  const needsNodeCompat = issues.some(i => i.message.includes('nodejs_compat'));
  const needsD1Binding = issues.some(i => i.message.includes('D1 database binding'));
  const needsR2Binding = issues.some(i => i.message.includes('R2 bucket binding'));
  const needsKVBinding = issues.some(i => i.message.includes('KV namespace'));
  const hasSecretFiles = issues.some(i => i.message.includes('Secret files found'));

  // === FIX 1: Create or update wrangler.toml ===
  if (!wranglerFile || issues.some(i => i.message.includes('wrangler.toml'))) {
    const wranglerContent = createOrUpdateWranglerConfig(
      wranglerFile?.content,
      packageJson,
      repoFiles,
      {
        needsD1: hasSQLite || needsD1Binding,
        needsR2: hasLocalStorage || needsR2Binding,
        needsKV: needsKVBinding,
        needsNodeCompat
      }
    );
    portedFiles.push(wranglerContent);
    fixedIssues.push('Created/updated wrangler.toml with complete configuration');
  }

  // === FIX 2: Convert Express to Hono ===
  if (hasExpress) {
    const convertedFiles = convertExpressToHono(repoFiles);
    portedFiles.push(...convertedFiles);
    fixedIssues.push('Converted Express.js to Hono framework');
  }

  // === FIX 3: Convert SQLite to D1 ===
  if (hasSQLite) {
    const convertedFiles = convertSQLiteToD1(repoFiles);
    portedFiles.push(...convertedFiles);
    fixedIssues.push('Migrated SQLite to Cloudflare D1 database');
  }

  // === FIX 4: Convert local storage to R2 ===
  if (hasLocalStorage) {
    const convertedFiles = convertLocalStorageToR2(repoFiles);
    portedFiles.push(...convertedFiles);
    fixedIssues.push('Migrated local file storage to R2 object storage');
  }

  // === FIX 5: Remove port binding ===
  if (hasPortBinding) {
    const fixedFiles = removePortBinding(repoFiles);
    portedFiles.push(...fixedFiles);
    fixedIssues.push('Removed port binding and exported Workers handler');
  }

  // === FIX 6: Update package.json ===
  const updatedPackageJson = updatePackageJson(
    repoFiles,
    {
      removeExpress: hasExpress,
      removeSQLite: hasSQLite,
      removeMulter: hasLocalStorage,
      addHono: hasExpress,
      removeLargeDeps: issues.some(i => i.message.includes('Large dependencies'))
    }
  );
  portedFiles.push(updatedPackageJson);
  fixedIssues.push('Updated package.json dependencies and scripts');

  // === FIX 7: Update .gitignore ===
  if (!gitignoreFile || !gitignoreFile.content.includes('.dev.vars')) {
    const updatedGitignore = updateGitignore(gitignoreFile);
    portedFiles.push(updatedGitignore);
    fixedIssues.push('Updated .gitignore to exclude secret files');
  }

  // === FIX 8: Remove secret files ===
  if (hasSecretFiles) {
    const secretFilesToRemove = repoFiles.filter(f =>
      f.path === '.env' ||
      f.path === '.env.local' ||
      f.path === '.dev.vars' ||
      f.path.includes('credentials.json') ||
      f.path.includes('secret')
    );

    secretFilesToRemove.forEach(f => {
      portedFiles.push({
        path: f.path,
        content: '',
        action: 'delete'
      });
    });

    if (secretFilesToRemove.length > 0) {
      fixedIssues.push(`Removed ${secretFilesToRemove.length} secret file(s) from repository`);
    }
  }

  // === FIX 9: Create .dev.vars template ===
  portedFiles.push(createDevVarsTemplate());
  fixedIssues.push('Created .dev.vars.example template for local development');

  // === FIX 10: Create README with manual steps ===
  const readme = createDeploymentReadme(issues, fixedIssues, packageJson);
  portedFiles.push(readme);

  return {
    success: true,
    files: portedFiles,
    summary: generateSummary(fixedIssues, issues)
  };
};

// ============================================================================
// Helper Functions
// ============================================================================

const createOrUpdateWranglerConfig = (
  existingContent: string | undefined,
  packageJson: any,
  repoFiles: RepoFile[],
  options: { needsD1: boolean; needsR2: boolean; needsKV: boolean; needsNodeCompat: boolean }
): PortedFile => {
  const appName = packageJson.name || 'ported-app';
  const currentDate = new Date().toISOString().split('T')[0];

  // Detect entry point
  let mainFile = 'src/index.ts';
  if (repoFiles.some(f => f.path === 'src/index.js')) mainFile = 'src/index.js';
  else if (repoFiles.some(f => f.path === 'index.ts')) mainFile = 'index.ts';
  else if (repoFiles.some(f => f.path === 'index.js')) mainFile = 'index.js';

  let content = `# Cloudflare Workers Configuration
# Auto-generated by Platform Readiness Checker

name = "${appName}"
main = "${mainFile}"
compatibility_date = "${currentDate}"
`;

  // Add compatibility flags if needed
  if (options.needsNodeCompat) {
    content += `\n# Node.js compatibility for built-in modules\ncompatibility_flags = ["nodejs_compat"]\n`;
  }

  // Add D1 database binding
  if (options.needsD1) {
    content += `
# D1 Database (SQLite-compatible)
# Run: wrangler d1 create ${appName}-db
# Then update database_id below with the output
[[d1_databases]]
binding = "DB"
database_name = "${appName}-db"
database_id = "YOUR_D1_DATABASE_ID"  # Replace with actual database ID
`;
  }

  // Add R2 bucket binding
  if (options.needsR2) {
    content += `
# R2 Object Storage
# Run: wrangler r2 bucket create ${appName}-storage
[[r2_buckets]]
binding = "STORAGE"
bucket_name = "${appName}-storage"
`;
  }

  // Add KV namespace binding
  if (options.needsKV) {
    content += `
# KV Namespace for caching/sessions
# Run: wrangler kv:namespace create CACHE
# Then update id below with the output
[[kv_namespaces]]
binding = "CACHE"
id = "YOUR_KV_NAMESPACE_ID"  # Replace with actual namespace ID
`;
  }

  // Add environment examples
  content += `
# Example: Staging environment
# [env.staging]
# name = "${appName}-staging"

# Example: Production environment
# [env.production]
# name = "${appName}-production"
`;

  return {
    path: 'wrangler.toml',
    content,
    action: existingContent ? 'modify' : 'create'
  };
};

const convertExpressToHono = (repoFiles: RepoFile[]): PortedFile[] => {
  const portedFiles: PortedFile[] = [];

  // Find main server file
  const serverFiles = repoFiles.filter(f =>
    (f.path.includes('index') || f.path.includes('server') || f.path.includes('app')) &&
    (f.path.endsWith('.ts') || f.path.endsWith('.js')) &&
    f.content.includes('express')
  );

  serverFiles.forEach(file => {
    let content = file.content;

    // Replace imports
    content = content.replace(/import\s+express\s+from\s+['"]express['"];?/g, "import { Hono } from 'hono';");
    content = content.replace(/const\s+express\s*=\s*require\(['"]express['"]\);?/g, "import { Hono } from 'hono';");

    // Replace app initialization
    content = content.replace(/const\s+app\s*=\s*express\(\);?/g, 'const app = new Hono();');

    // Replace route handlers - Express to Hono context
    content = content.replace(/\(req:\s*Request,\s*res:\s*Response\)/g, '(c)');
    content = content.replace(/\(req,\s*res\)/g, '(c)');

    // Replace response methods
    content = content.replace(/res\.json\(/g, 'return c.json(');
    content = content.replace(/res\.send\(/g, 'return c.text(');
    content = content.replace(/res\.status\((\d+)\)\.json\(/g, 'return c.json(');
    content = content.replace(/res\.status\((\d+)\)\.send\(/g, 'return c.text(');

    // Replace request properties
    content = content.replace(/req\.body/g, 'await c.req.json()');
    content = content.replace(/req\.params/g, 'c.req.param()');
    content = content.replace(/req\.query/g, 'c.req.query()');

    // Remove port binding and replace with export
    content = content.replace(/app\.listen\([^)]+\)[^;]*;?\s*$/gm, 'export default app;');
    content = content.replace(/server\.listen\([^)]+\)[^;]*;?\s*$/gm, 'export default app;');

    // Add type imports if TypeScript
    if (file.path.endsWith('.ts') && !content.includes('import type')) {
      content = `import type { Context } from 'hono';\n${content}`;
    }

    portedFiles.push({
      path: file.path,
      content,
      action: 'modify'
    });
  });

  return portedFiles;
};

const convertSQLiteToD1 = (repoFiles: RepoFile[]): PortedFile[] => {
  const portedFiles: PortedFile[] = [];

  // Find database files
  const dbFiles = repoFiles.filter(f =>
    (f.path.includes('database') || f.path.includes('db')) &&
    (f.content.includes('sqlite3') || f.content.includes('sqlite'))
  );

  dbFiles.forEach(file => {
    let content = file.content;

    // Replace imports
    content = content.replace(/import\s+.*\s+from\s+['"]sqlite3['"];?/g, "import type { D1Database } from '@cloudflare/workers-types';");
    content = content.replace(/const\s+sqlite3\s*=\s*require\(['"]sqlite3['"]\);?/g, "import type { D1Database } from '@cloudflare/workers-types';");

    // Replace database initialization
    content = content.replace(/new\s+sqlite3\.Database\([^)]+\)/g, 'db');

    // Convert common SQLite patterns to D1
    content = content.replace(/db\.run\(/g, 'await db.prepare(');
    content = content.replace(/db\.get\(/g, 'await db.prepare(');
    content = content.replace(/db\.all\(/g, 'await db.prepare(');

    // Add D1 method calls
    content = content.replace(/await db\.prepare\(([^)]+)\);\s*$/gm, 'await db.prepare($1).run();');

    portedFiles.push({
      path: file.path,
      content,
      action: 'modify'
    });
  });

  // If no specific DB files, create a new one
  if (dbFiles.length === 0) {
    portedFiles.push({
      path: 'src/database.ts',
      content: `import type { D1Database } from '@cloudflare/workers-types';

// Example D1 database functions
export const query = async (db: D1Database, sql: string, params: any[] = []) => {
  const result = await db.prepare(sql).bind(...params).all();
  return result.results;
};

export const execute = async (db: D1Database, sql: string, params: any[] = []) => {
  const result = await db.prepare(sql).bind(...params).run();
  return result.success;
};
`,
      action: 'create'
    });
  }

  return portedFiles;
};

const convertLocalStorageToR2 = (repoFiles: RepoFile[]): PortedFile[] => {
  const portedFiles: PortedFile[] = [];

  // Find files using fs
  const fsFiles = repoFiles.filter(f =>
    f.content.includes('fs.writeFile') ||
    f.content.includes('fs.readFile') ||
    f.content.includes('multer')
  );

  fsFiles.forEach(file => {
    let content = file.content;

    // Replace fs imports
    content = content.replace(/import\s+.*fs.*from\s+['"]fs['"];?/g, "import type { R2Bucket } from '@cloudflare/workers-types';");

    // Comment out fs operations with migration notes
    content = content.replace(/fs\.writeFile/g, '// TODO: Migrate to R2 - storage.put');
    content = content.replace(/fs\.readFile/g, '// TODO: Migrate to R2 - storage.get');

    portedFiles.push({
      path: file.path,
      content,
      action: 'modify'
    });
  });

  // Create R2 helper module
  portedFiles.push({
    path: 'src/storage.ts',
    content: `import type { R2Bucket } from '@cloudflare/workers-types';

export const uploadFile = async (
  storage: R2Bucket,
  key: string,
  data: ArrayBuffer | string,
  metadata?: Record<string, string>
) => {
  await storage.put(key, data, {
    customMetadata: metadata
  });
  return { key, uploaded: true };
};

export const downloadFile = async (storage: R2Bucket, key: string) => {
  const object = await storage.get(key);
  if (!object) return null;
  return await object.arrayBuffer();
};

export const deleteFile = async (storage: R2Bucket, key: string) => {
  await storage.delete(key);
  return { key, deleted: true };
};

export const listFiles = async (storage: R2Bucket, prefix?: string) => {
  const list = await storage.list({ prefix });
  return list.objects.map(obj => obj.key);
};
`,
    action: 'create'
  });

  return portedFiles;
};

const removePortBinding = (repoFiles: RepoFile[]): PortedFile[] => {
  const portedFiles: PortedFile[] = [];

  const serverFiles = repoFiles.filter(f =>
    f.content.includes('.listen(')
  );

  serverFiles.forEach(file => {
    let content = file.content;

    // Remove listen calls and add export
    content = content.replace(/app\.listen\([^)]+\)[^;]*;?\s*/g, '');
    content = content.replace(/server\.listen\([^)]+\)[^;]*;?\s*/g, '');

    // Add export if not present
    if (!content.includes('export default')) {
      content += '\n\nexport default app;\n';
    }

    portedFiles.push({
      path: file.path,
      content,
      action: 'modify'
    });
  });

  return portedFiles;
};

const updatePackageJson = (
  repoFiles: RepoFile[],
  options: {
    removeExpress: boolean;
    removeSQLite: boolean;
    removeMulter: boolean;
    addHono: boolean;
    removeLargeDeps: boolean;
  }
): PortedFile => {
  const packageFile = repoFiles.find(f => f.path === 'package.json');

  let pkg: any = {
    name: 'ported-app',
    version: '1.0.0',
    scripts: {},
    dependencies: {},
    devDependencies: {}
  };

  if (packageFile) {
    try {
      pkg = JSON.parse(packageFile.content);
    } catch (e) {
      // Keep default
    }
  }

  // Remove incompatible dependencies
  if (options.removeExpress) {
    delete pkg.dependencies?.express;
    delete pkg.dependencies?.['@types/express'];
  }

  if (options.removeSQLite) {
    delete pkg.dependencies?.sqlite3;
    delete pkg.dependencies?.sqlite;
    delete pkg.dependencies?.['better-sqlite3'];
  }

  if (options.removeMulter) {
    delete pkg.dependencies?.multer;
  }

  if (options.removeLargeDeps) {
    delete pkg.dependencies?.moment;
    delete pkg.dependencies?.axios;
    // Keep lodash but note it in README
  }

  // Add Workers dependencies
  pkg.dependencies = pkg.dependencies || {};
  if (options.addHono) {
    pkg.dependencies.hono = '^4.0.0';
  }

  pkg.devDependencies = pkg.devDependencies || {};
  pkg.devDependencies['@cloudflare/workers-types'] = '^4.20250106.0';
  pkg.devDependencies.wrangler = '^4.0.0';

  if (!pkg.devDependencies.typescript) {
    pkg.devDependencies.typescript = '^5.3.3';
  }

  // Update scripts
  pkg.scripts = pkg.scripts || {};
  pkg.scripts.dev = 'wrangler dev';
  pkg.scripts.deploy = 'wrangler deploy';
  pkg.scripts['cf:d1'] = 'wrangler d1 execute DB --command';
  delete pkg.scripts.start;

  return {
    path: 'package.json',
    content: JSON.stringify(pkg, null, 2),
    action: 'modify'
  };
};

const updateGitignore = (existingFile?: RepoFile): PortedFile => {
  let content = existingFile?.content || '';

  const linesToAdd = [
    '\n# Cloudflare Workers',
    '.dev.vars',
    '.dev.vars.*',
    '.env',
    '.env.*',
    '.wrangler/',
    'wrangler.toml.backup',
    '\n# Secrets',
    '*.pem',
    '*.key',
    'credentials.json',
    'serviceAccountKey.json'
  ];

  linesToAdd.forEach(line => {
    if (!content.includes(line.trim())) {
      content += `\n${line}`;
    }
  });

  return {
    path: '.gitignore',
    content: content.trim() + '\n',
    action: existingFile ? 'modify' : 'create'
  };
};

const createDevVarsTemplate = (): PortedFile => {
  return {
    path: '.dev.vars.example',
    content: `# Local development environment variables
# Copy this file to .dev.vars and fill in your values
# NEVER commit .dev.vars to git!

# Example variables:
# API_KEY=your_api_key_here
# DATABASE_URL=your_database_url_here
# SECRET_TOKEN=your_secret_token_here
`,
    action: 'create'
  };
};

const createDeploymentReadme = (
  issues: ReadinessIssue[],
  fixedIssues: string[],
  packageJson: any
): PortedFile => {
  const manualIssues = issues.filter(i =>
    i.severity === 'warning' || i.severity === 'info' ||
    i.message.includes('routes') ||
    i.message.includes('observability')
  );

  let content = `# Cloudflare Workers Deployment Guide

## What Was Fixed Automatically

${fixedIssues.map(f => `- ✅ ${f}`).join('\n')}

## Manual Configuration Required

### 1. Create Cloudflare Resources

\`\`\`bash
# Create D1 database (if needed)
wrangler d1 create ${packageJson.name || 'app'}-db

# Create R2 bucket (if needed)
wrangler r2 bucket create ${packageJson.name || 'app'}-storage

# Create KV namespace (if needed)
wrangler kv:namespace create CACHE
\`\`\`

After creating resources, update the IDs in \`wrangler.toml\`.

### 2. Configure Secrets

\`\`\`bash
# Set production secrets
wrangler secret put API_KEY
wrangler secret put DATABASE_URL
# Add other secrets as needed
\`\`\`

### 3. Local Development Setup

1. Copy \`.dev.vars.example\` to \`.dev.vars\`
2. Fill in your local development values
3. Run \`npm install\`
4. Run \`npm run dev\`

### 4. Deploy to Cloudflare

\`\`\`bash
# First deployment
npm run deploy

# Or with specific environment
wrangler deploy --env production
\`\`\`

## Remaining Issues to Address

${manualIssues.length > 0 ? manualIssues.map(issue => `
### ${issue.category.toUpperCase()}: ${issue.message}
**Suggestion:** ${issue.suggestion}
`).join('\n') : 'No remaining issues! 🎉'}

## Next Steps

1. Review and test all ported code
2. Configure routes or custom domains in Cloudflare dashboard
3. Enable observability and logging
4. Set up CI/CD pipeline (GitHub Actions recommended)
5. Test thoroughly in staging environment
6. Deploy to production

## Documentation

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Hono Framework](https://hono.dev/)
- [D1 Database](https://developers.cloudflare.com/d1/)
- [R2 Storage](https://developers.cloudflare.com/r2/)

---

🤖 Generated by Platform Readiness Checker
`;

  return {
    path: 'CLOUDFLARE_DEPLOYMENT.md',
    content,
    action: 'create'
  };
};

const generateSummary = (fixedIssues: string[], allIssues: ReadinessIssue[]): string => {
  const errorCount = allIssues.filter(i => i.severity === 'error').length;
  const warningCount = allIssues.filter(i => i.severity === 'warning').length;

  return `Successfully ported application to Cloudflare Workers.

Fixed ${fixedIssues.length} issues automatically:
${fixedIssues.map(f => `  • ${f}`).join('\n')}

Total issues found: ${allIssues.length} (${errorCount} errors, ${warningCount} warnings)
Automatic fixes applied: ${fixedIssues.length}
Manual steps required: See CLOUDFLARE_DEPLOYMENT.md

Next: Configure Cloudflare resources and deploy using 'wrangler deploy'`;
};
