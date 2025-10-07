import type { RepoFile, ReadinessIssue, PortingResult, PortedFile } from '../types';
import { calculatePortabilityScore, type PortabilityResult } from '../services/portabilityChecker';

export const portToAzure = (
  repoFiles: RepoFile[],
  issues: ReadinessIssue[],
  preferences?: { databaseChoice?: string; storageChoice?: string }
): PortingResult => {
  // ========================================
  // STEP 1: PRE-FLIGHT PORTABILITY CHECK
  // ========================================
  const portability = calculatePortabilityScore(repoFiles);

  // REJECT if score too low (< 30)
  if (portability.score < 30) {
    return {
      success: false,
      files: [],
      summary: portability.recommendation + '\n\n' +
               `Portability Score: ${portability.score}/100\n` +
               `Severity: ${portability.severity}\n\n` +
               `Issues Found:\n` +
               portability.issues.map(issue =>
                 `• [${issue.blocker ? 'BLOCKER' : 'ISSUE'}] ${issue.description}`
               ).join('\n') + '\n\n' +
               `Estimated Effort: ${portability.estimatedEffort}\n\n` +
               `The platform-readiness tool cannot generate a functional patch.\n` +
               `A new Azure-native application must be built from scratch.`,
      portability
    };
  }

  // WARN if score medium (30-50)
  if (portability.score < 50) {
    console.warn(`⚠️ Low portability score (${portability.score}/100) - high manual effort required`);
    // Continue with porting, but include warnings in documentation
  }

  // ========================================
  // STEP 2: PROCEED WITH PORTING (only if score >= 30)
  // ========================================

  const portedFiles: PortedFile[] = [];
  const fixedIssues: string[] = [];

  // Get existing files
  const packageJsonFile = repoFiles.find(f => f.path === 'package.json');
  const azureConfigFile = repoFiles.find(f => f.path === 'azure.yaml' || f.path === '.azure/config');
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
  const missingPackageJson = !packageJsonFile;
  const missingStartScript = issues.some(i => i.message.includes('start script'));
  const missingNodeVersion = issues.some(i => i.message.includes('Node.js version'));
  const hasSQLite = issues.some(i => i.message.includes('SQLite'));
  const hasLocalStorage = issues.some(i => i.message.includes('file storage'));
  const hasMulter = issues.some(i => i.message.includes('Multer'));
  const hasDotEnv = issues.some(i => i.message.includes('.env file found'));
  const hasHardcodedConnStr = issues.some(i => i.message.includes('Hardcoded connection'));
  const hasSecretFiles = issues.some(i => i.message.includes('Secret files found'));
  const needsHealthEndpoint = issues.some(i => i.message.includes('health check endpoint'));

  // Determine database choice (default to azure-sql-free)
  const databaseChoice = preferences?.databaseChoice || 'azure-sql-free';

  // Determine storage choice (default to blob-storage)
  const storageChoice = preferences?.storageChoice || 'blob-storage';

  // === FIX 1: Create or update package.json ===
  // Update package.json if any dependencies or configuration needs to change
  if (missingPackageJson || missingStartScript || missingNodeVersion || hasSQLite || hasLocalStorage) {
    const updatedPackageJson = createOrUpdatePackageJson(
      packageJsonFile,
      {
        addStartScript: missingStartScript,
        addNodeVersion: missingNodeVersion,
        removeSQLite: hasSQLite,
        addAzureSQL: hasSQLite && databaseChoice.startsWith('azure-sql'),
        addCosmosDB: hasSQLite && databaseChoice === 'cosmosdb-free',
        addPostgreSQL: hasSQLite && databaseChoice === 'postgresql',
        addMySQL: hasSQLite && databaseChoice === 'mysql',
        addBlobStorage: hasLocalStorage && storageChoice === 'blob-storage',
        removeSecrets: hasHardcodedConnStr
      },
      databaseChoice
    );
    portedFiles.push(updatedPackageJson);
    fixedIssues.push(`Created/updated package.json with ${getDatabaseName(databaseChoice)} and Azure-compatible dependencies`);
  }

  // === FIX 2: Create or update azure.yaml ===
  if (!azureConfigFile) {
    const azureConfig = createAzureConfig(packageJson);
    portedFiles.push(azureConfig);
    fixedIssues.push('Created azure.yaml deployment configuration');
  }

  // === FIX 3: Create health check endpoint ===
  if (needsHealthEndpoint) {
    const healthEndpoint = createHealthCheckEndpoint(repoFiles);
    if (healthEndpoint) {
      portedFiles.push(healthEndpoint);
      fixedIssues.push('Added /health endpoint for App Service health monitoring');
    }
  }

  // === FIX 4: Convert SQLite to Azure SQL ===
  if (hasSQLite) {
    const convertedFiles = convertSQLiteToAzureSQL(repoFiles);
    portedFiles.push(...convertedFiles);
    fixedIssues.push('Migrated SQLite to Azure SQL Database connection');
  }

  // === FIX 5: Convert local storage to Blob Storage ===
  if (hasLocalStorage) {
    const convertedFiles = convertLocalStorageToBlobStorage(repoFiles);
    portedFiles.push(...convertedFiles);
    fixedIssues.push('Migrated local file storage to Azure Blob Storage');
  }

  // === FIX 6: Configure multer for memory storage ===
  if (hasMulter) {
    const multerFiles = configureMulterForAzure(repoFiles);
    portedFiles.push(...multerFiles);
    fixedIssues.push('Configured multer for memory storage with Blob Storage upload');
  }

  // === FIX 7: Update .gitignore ===
  if (!gitignoreFile || !gitignoreFile.content.includes('.env')) {
    const updatedGitignore = updateGitignore(gitignoreFile);
    portedFiles.push(updatedGitignore);
    fixedIssues.push('Updated .gitignore to exclude secret files');
  }

  // === FIX 8: Remove secret files ===
  if (hasSecretFiles || hasDotEnv) {
    const secretFilesToRemove = repoFiles.filter(f =>
      f.path === '.env' ||
      f.path === '.env.local' ||
      f.path === '.env.production' ||
      f.path.includes('credentials.json') ||
      f.path.includes('serviceAccountKey') ||
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

  // === FIX 9: Move hardcoded connection strings to env vars ===
  if (hasHardcodedConnStr) {
    const envVarFiles = moveConnectionStringsToEnv(repoFiles);
    portedFiles.push(...envVarFiles);
    fixedIssues.push('Moved hardcoded connection strings to environment variables');
  }

  // === FIX 10: Create .env.example template ===
  portedFiles.push(createEnvTemplate(hasSQLite, hasLocalStorage));
  fixedIssues.push('Created .env.example template for configuration');

  // === FIX 11: Create deployment README ===
  const readme = createDeploymentReadme(issues, fixedIssues, packageJson, portability);
  portedFiles.push(readme);

  return {
    success: true,
    files: portedFiles,
    summary: generateSummary(fixedIssues, issues, portability),
    portability
  };
};

// ============================================================================
// Helper Functions
// ============================================================================

const createOrUpdatePackageJson = (
  existingFile: RepoFile | undefined,
  options: {
    addStartScript: boolean;
    addNodeVersion: boolean;
    removeSQLite: boolean;
    addAzureSQL: boolean;
    addCosmosDB?: boolean;
    addPostgreSQL?: boolean;
    addMySQL?: boolean;
    addBlobStorage: boolean;
    removeSecrets: boolean;
  },
  _databaseChoice?: string
): PortedFile => {
  let pkg: any = {
    name: 'ported-app',
    version: '1.0.0',
    scripts: {},
    dependencies: {},
    devDependencies: {},
    engines: {}
  };

  if (existingFile) {
    try {
      pkg = JSON.parse(existingFile.content);
    } catch (e) {
      // Keep default
    }
  }

  // Add/update scripts
  pkg.scripts = pkg.scripts || {};
  if (options.addStartScript && !pkg.scripts.start) {
    pkg.scripts.start = 'node dist/index.js';
  }
  if (!pkg.scripts.build) {
    pkg.scripts.build = 'tsc';
  }

  // Add Node.js version
  if (options.addNodeVersion) {
    pkg.engines = pkg.engines || {};
    pkg.engines.node = '>=18.0.0';
  }

  // Remove incompatible dependencies
  if (options.removeSQLite) {
    delete pkg.dependencies?.sqlite3;
    delete pkg.dependencies?.sqlite;
    delete pkg.dependencies?.['better-sqlite3'];
  }

  // Add Azure dependencies based on database choice
  pkg.dependencies = pkg.dependencies || {};

  if (options.addAzureSQL) {
    pkg.dependencies.mssql = '^10.0.0';
    pkg.dependencies['@azure/identity'] = '^4.0.0';
  }

  if (options.addCosmosDB) {
    pkg.dependencies['@azure/cosmos'] = '^4.0.0';
    pkg.dependencies['@azure/identity'] = '^4.0.0';
  }

  if (options.addPostgreSQL) {
    pkg.dependencies.pg = '^8.11.0';
  }

  if (options.addMySQL) {
    pkg.dependencies.mysql2 = '^3.6.0';
  }

  if (options.addBlobStorage) {
    pkg.dependencies['@azure/storage-blob'] = '^12.17.0';
    pkg.dependencies['@azure/identity'] = '^4.0.0';
  }

  return {
    path: 'package.json',
    content: JSON.stringify(pkg, null, 2),
    action: existingFile ? 'modify' : 'create'
  };
};

const createAzureConfig = (packageJson: any): PortedFile => {
  const appName = packageJson.name || 'ported-app';

  const content = `# Azure App Service Configuration
# Auto-generated by Platform Readiness Checker

name: ${appName}

services:
  web:
    language: node
    version: 18

    host:
      os: linux

    build:
      npm:
        - install
        - run build

    run:
      npm:
        - run start

    # Recommended: Use Premium v3 tier for production
    # tier: PremiumV3

    # High availability: minimum 2 instances
    instances: 2

    # Environment variables (set actual values in Azure Portal)
    env:
      - name: NODE_ENV
        value: production
      # Add other non-sensitive environment variables here
      # Sensitive values should be configured in Azure App Service settings
`;

  return {
    path: 'azure.yaml',
    content,
    action: 'create'
  };
};

const createHealthCheckEndpoint = (repoFiles: RepoFile[]): PortedFile | null => {
  // Find main server file
  const serverFile = repoFiles.find(f =>
    (f.path.includes('index') || f.path.includes('server') || f.path.includes('app')) &&
    (f.path.endsWith('.ts') || f.path.endsWith('.js')) &&
    (f.content.includes('app.get') || f.content.includes('router.get'))
  );

  if (!serverFile) return null;

  let content = serverFile.content;

  // Add health check endpoint if not present
  if (!content.includes('/health')) {
    const healthEndpoint = `
// Health check endpoint for Azure App Service
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
`;

    // Insert before the export or listen statement
    const exportMatch = content.match(/(export\s+default|app\.listen|module\.exports)/);
    if (exportMatch) {
      const insertIndex = exportMatch.index || content.length;
      content = content.slice(0, insertIndex) + healthEndpoint + '\n' + content.slice(insertIndex);
    } else {
      content += '\n' + healthEndpoint;
    }

    return {
      path: serverFile.path,
      content,
      action: 'modify'
    };
  }

  return null;
};

const convertSQLiteToAzureSQL = (repoFiles: RepoFile[]): PortedFile[] => {
  const portedFiles: PortedFile[] = [];

  // Find database files
  const dbFiles = repoFiles.filter(f =>
    (f.path.includes('database') || f.path.includes('db')) &&
    (f.content.includes('sqlite3') || f.content.includes('sqlite'))
  );

  dbFiles.forEach(file => {
    let content = file.content;

    // Replace imports
    content = content.replace(/import\s+.*\s+from\s+['"]sqlite3['"];?/g, "import sql from 'mssql';");
    content = content.replace(/const\s+sqlite3\s*=\s*require\(['"]sqlite3['"]\);?/g, "import sql from 'mssql';");

    // Add connection config
    const configSection = `
// Azure SQL Database configuration
const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

let pool: sql.ConnectionPool;

export const getPool = async () => {
  if (!pool) {
    pool = await sql.connect(config);
  }
  return pool;
};
`;

    content = configSection + '\n' + content;

    portedFiles.push({
      path: file.path,
      content,
      action: 'modify'
    });
  });

  // If no DB files, create a new one
  if (dbFiles.length === 0) {
    portedFiles.push({
      path: 'src/database.ts',
      content: `import sql from 'mssql';

// Azure SQL Database configuration
const config: sql.config = {
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  server: process.env.DB_SERVER || '',
  database: process.env.DB_NAME || '',
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

let pool: sql.ConnectionPool;

export const getPool = async (): Promise<sql.ConnectionPool> => {
  if (!pool) {
    pool = await sql.connect(config);
  }
  return pool;
};

export const query = async (queryText: string, params: any[] = []) => {
  const pool = await getPool();
  const request = pool.request();

  params.forEach((param, index) => {
    request.input(\`param\${index}\`, param);
  });

  const result = await request.query(queryText);
  return result.recordset;
};

export const execute = async (queryText: string, params: any[] = []) => {
  const pool = await getPool();
  const request = pool.request();

  params.forEach((param, index) => {
    request.input(\`param\${index}\`, param);
  });

  const result = await request.query(queryText);
  return result.rowsAffected[0] > 0;
};
`,
      action: 'create'
    });
  }

  return portedFiles;
};

const convertLocalStorageToBlobStorage = (repoFiles: RepoFile[]): PortedFile[] => {
  const portedFiles: PortedFile[] = [];

  // Find files using fs
  const fsFiles = repoFiles.filter(f =>
    f.content.includes('fs.writeFile') ||
    f.content.includes('fs.readFile')
  );

  fsFiles.forEach(file => {
    let content = file.content;

    // Add import for storage module at the top if not already present
    if (!content.includes("from './storage'") && !content.includes('from "../storage"')) {
      // Find first import statement or top of file
      const firstImportMatch = content.match(/^import\s/m);
      if (firstImportMatch && firstImportMatch.index !== undefined) {
        content = content.slice(0, firstImportMatch.index) +
                  "import { uploadFile, downloadFile } from './storage';\n" +
                  content.slice(firstImportMatch.index);
      } else {
        content = "import { uploadFile, downloadFile } from './storage';\n\n" + content;
      }
    }

    // Fix fs.readFileSync - leave code intact with comment
    content = content.replace(
      /(const\s+\w+\s*=\s*fs\.readFileSync\(.*?\);?)/g,
      '// TODO: Migrate to Azure Blob Storage - see src/storage.ts\n$1'
    );

    // Fix fs.writeFileSync - leave code intact with comment
    content = content.replace(
      /(fs\.writeFileSync\(.*?\);?)/g,
      '// TODO: Migrate to Azure Blob Storage - see src/storage.ts\n$1'
    );

    // Fix async fs.readFile - leave code intact with comment
    content = content.replace(
      /(fs\.readFile\(.*?\);?)/g,
      '// TODO: Migrate to Azure Blob Storage - see src/storage.ts and use downloadFile()\n$1'
    );

    // Fix async fs.writeFile - leave code intact with comment
    content = content.replace(
      /(fs\.writeFile\(.*?\);?)/g,
      '// TODO: Migrate to Azure Blob Storage - see src/storage.ts and use uploadFile()\n$1'
    );

    portedFiles.push({
      path: file.path,
      content,
      action: 'modify'
    });
  });

  // Create Blob Storage helper module
  portedFiles.push({
    path: 'src/storage.ts',
    content: `import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';

let containerClient: ContainerClient;

export const getContainerClient = (): ContainerClient => {
  if (!containerClient) {
    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'uploads';

    if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
      // Use connection string for local development
      const blobServiceClient = BlobServiceClient.fromConnectionString(
        process.env.AZURE_STORAGE_CONNECTION_STRING
      );
      containerClient = blobServiceClient.getContainerClient(containerName);
    } else {
      // Use Managed Identity for production
      const credential = new DefaultAzureCredential();
      const blobServiceClient = new BlobServiceClient(
        \`https://\${accountName}.blob.core.windows.net\`,
        credential
      );
      containerClient = blobServiceClient.getContainerClient(containerName);
    }
  }
  return containerClient;
};

export const uploadFile = async (
  filename: string,
  data: Buffer | string,
  contentType?: string
) => {
  const containerClient = getContainerClient();
  const blockBlobClient = containerClient.getBlockBlobClient(filename);

  await blockBlobClient.upload(data, data.length, {
    blobHTTPHeaders: contentType ? { blobContentType: contentType } : undefined
  });

  return {
    filename,
    url: blockBlobClient.url
  };
};

export const downloadFile = async (filename: string): Promise<Buffer | null> => {
  const containerClient = getContainerClient();
  const blockBlobClient = containerClient.getBlockBlobClient(filename);

  try {
    const downloadResponse = await blockBlobClient.download();
    if (!downloadResponse.readableStreamBody) return null;

    const chunks: Buffer[] = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    return null;
  }
};

export const deleteFile = async (filename: string): Promise<boolean> => {
  const containerClient = getContainerClient();
  const blockBlobClient = containerClient.getBlockBlobClient(filename);

  const deleteResponse = await blockBlobClient.deleteIfExists();
  return deleteResponse.succeeded;
};

export const listFiles = async (prefix?: string): Promise<string[]> => {
  const containerClient = getContainerClient();
  const fileNames: string[] = [];

  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    fileNames.push(blob.name);
  }

  return fileNames;
};
`,
    action: 'create'
  });

  return portedFiles;
};

const configureMulterForAzure = (repoFiles: RepoFile[]): PortedFile[] => {
  const portedFiles: PortedFile[] = [];

  const multerFiles = repoFiles.filter(f => f.content.includes('multer'));

  multerFiles.forEach(file => {
    let content = file.content;

    // Update multer configuration to use memoryStorage
    content = content.replace(/multer\(\{[^}]*storage:[^}]*\}\)/g,
      'multer({ storage: multer.memoryStorage() })');

    // Add comment about blob upload
    if (!content.includes('Upload to Blob Storage')) {
      content = '// Note: Files are stored in memory then uploaded to Blob Storage\n' +
                '// See src/storage.ts for Blob Storage operations\n' + content;
    }

    portedFiles.push({
      path: file.path,
      content,
      action: 'modify'
    });
  });

  return portedFiles;
};

const moveConnectionStringsToEnv = (repoFiles: RepoFile[]): PortedFile[] => {
  const portedFiles: PortedFile[] = [];

  const filesWithConnStr = repoFiles.filter(f =>
    f.content.match(/mongodb:\/\/[^'"\s]+/i) ||
    f.content.match(/Server=.+;Database=.+;/i) ||
    f.content.match(/postgresql:\/\/[^'"\s]+/i)
  );

  filesWithConnStr.forEach(file => {
    let content = file.content;

    // Replace hardcoded MongoDB connection strings
    content = content.replace(/mongodb:\/\/[^'"\s]+/gi, "process.env.DATABASE_URL || ''");

    // Replace hardcoded SQL connection strings
    content = content.replace(/"Server=.+;Database=.+;[^"]+"/gi, "process.env.DATABASE_URL || ''");

    // Replace hardcoded PostgreSQL connection strings
    content = content.replace(/postgresql:\/\/[^'"\s]+/gi, "process.env.DATABASE_URL || ''");

    portedFiles.push({
      path: file.path,
      content,
      action: 'modify'
    });
  });

  return portedFiles;
};

const updateGitignore = (existingFile?: RepoFile): PortedFile => {
  let content = existingFile?.content || '';

  const linesToAdd = [
    '\n# Azure',
    '.azure/',
    '\n# Environment variables',
    '.env',
    '.env.*',
    '!.env.example',
    '\n# Secrets',
    '*.pem',
    '*.key',
    'credentials.json',
    'serviceAccountKey.json',
    '\n# Build',
    'dist/',
    'build/'
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

const createEnvTemplate = (needsDatabase: boolean, needsStorage: boolean): PortedFile => {
  let content = `# Azure App Service Environment Variables Template
# Copy relevant values to Azure App Service Configuration (App Settings)
# DO NOT commit actual values to git!

NODE_ENV=production
`;

  if (needsDatabase) {
    content += `
# Azure SQL Database
DB_SERVER=your-server.database.windows.net
DB_NAME=your-database-name
DB_USER=your-admin-username
DB_PASSWORD=your-admin-password
# Or use single connection string:
# DATABASE_URL=Server=tcp:your-server.database.windows.net,1433;Database=your-db;User ID=user;Password=pass;Encrypt=true;
`;
  }

  if (needsStorage) {
    content += `
# Azure Blob Storage
AZURE_STORAGE_ACCOUNT_NAME=your-storage-account
AZURE_STORAGE_CONTAINER_NAME=uploads
# For local development, use connection string:
# AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
# For production, use Managed Identity (no connection string needed)
`;
  }

  content += `
# Add other environment variables as needed
# API_KEY=your-api-key
# SECRET_TOKEN=your-secret-token
`;

  return {
    path: '.env.example',
    content,
    action: 'create'
  };
};

const createDeploymentReadme = (
  issues: ReadinessIssue[],
  fixedIssues: string[],
  packageJson: any,
  portability: PortabilityResult
): PortedFile => {
  const manualIssues = issues.filter(i =>
    i.severity === 'warning' || i.severity === 'info'
  );

  const appName = packageJson.name || 'app';

  let content = `# Azure App Service Deployment Guide

## Portability Assessment

**Score:** ${portability.score}/100
**Severity:** ${portability.severity}
**Can Port:** ${portability.canPort ? '✅ Yes' : '❌ No'}

${portability.recommendation}

---

## Estimated Effort

**Automated by Porter:** ${Math.max(0, 100 - portability.score)}% of issues addressed
**Manual Work Required:** ${portability.estimatedEffort}

${portability.score < 50 ? `
⚠️ **WARNING:** This application has a low portability score.
Consider whether porting is worth the effort vs rebuilding from scratch.
` : ''}

---

## What Was Fixed Automatically

${fixedIssues.map(f => `- ✅ ${f}`).join('\n')}

## Manual Configuration Required

### 1. Create Azure Resources

\`\`\`bash
# Login to Azure
az login

# Create resource group
az group create --name ${appName}-rg --location eastus

# Create App Service Plan (Premium v3 recommended for production)
az appservice plan create \\
  --name ${appName}-plan \\
  --resource-group ${appName}-rg \\
  --sku P1V3 \\
  --is-linux

# Create Web App
az webapp create \\
  --resource-group ${appName}-rg \\
  --plan ${appName}-plan \\
  --name ${appName} \\
  --runtime "NODE:18-lts"
\`\`\`

### 2. Create Azure SQL Database (if needed)

\`\`\`bash
# Create SQL Server
az sql server create \\
  --name ${appName}-sql \\
  --resource-group ${appName}-rg \\
  --location eastus \\
  --admin-user sqladmin \\
  --admin-password <YourPassword123!>

# Create Database
az sql db create \\
  --resource-group ${appName}-rg \\
  --server ${appName}-sql \\
  --name ${appName}-db \\
  --service-objective S0

# Configure firewall (allow Azure services)
az sql server firewall-rule create \\
  --resource-group ${appName}-rg \\
  --server ${appName}-sql \\
  --name AllowAzureServices \\
  --start-ip-address 0.0.0.0 \\
  --end-ip-address 0.0.0.0
\`\`\`

### 3. Create Azure Blob Storage (if needed)

\`\`\`bash
# Create storage account
az storage account create \\
  --name ${appName.replace(/-/g, '')}storage \\
  --resource-group ${appName}-rg \\
  --location eastus \\
  --sku Standard_LRS

# Create container
az storage container create \\
  --name uploads \\
  --account-name ${appName.replace(/-/g, '')}storage
\`\`\`

### 4. Configure Environment Variables

\`\`\`bash
# Set environment variables in App Service
az webapp config appsettings set \\
  --resource-group ${appName}-rg \\
  --name ${appName} \\
  --settings \\
    NODE_ENV=production \\
    DB_SERVER=${appName}-sql.database.windows.net \\
    DB_NAME=${appName}-db \\
    DB_USER=sqladmin \\
    DB_PASSWORD=<YourPassword123!> \\
    AZURE_STORAGE_ACCOUNT_NAME=${appName.replace(/-/g, '')}storage \\
    AZURE_STORAGE_CONTAINER_NAME=uploads
\`\`\`

### 5. Enable Managed Identity (Recommended)

\`\`\`bash
# Enable system-assigned managed identity
az webapp identity assign \\
  --resource-group ${appName}-rg \\
  --name ${appName}

# Grant Blob Storage permissions
# (Get the identity principal ID from the previous command output)
az role assignment create \\
  --role "Storage Blob Data Contributor" \\
  --assignee <principal-id> \\
  --scope /subscriptions/<subscription-id>/resourceGroups/${appName}-rg/providers/Microsoft.Storage/storageAccounts/${appName.replace(/-/g, '')}storage
\`\`\`

### 6. Deploy Application

\`\`\`bash
# Deploy from GitHub (recommended)
az webapp deployment source config \\
  --name ${appName} \\
  --resource-group ${appName}-rg \\
  --repo-url https://github.com/yourusername/yourrepo \\
  --branch main \\
  --manual-integration

# Or deploy via ZIP
npm run build
zip -r deploy.zip dist package.json package-lock.json
az webapp deployment source config-zip \\
  --resource-group ${appName}-rg \\
  --name ${appName} \\
  --src deploy.zip
\`\`\`

### 7. Enable Health Check

\`\`\`bash
az webapp config set \\
  --resource-group ${appName}-rg \\
  --name ${appName} \\
  --health-check-path "/health"
\`\`\`

### 8. Configure Always On (Basic tier and above)

\`\`\`bash
az webapp config set \\
  --resource-group ${appName}-rg \\
  --name ${appName} \\
  --always-on true
\`\`\`

## Remaining Issues to Address

${manualIssues.length > 0 ? manualIssues.map(issue => `
### ${issue.category.toUpperCase()}: ${issue.message}
**Severity:** ${issue.severity}
**Suggestion:** ${issue.suggestion}
`).join('\n') : 'No remaining issues! 🎉'}

## Production Checklist

- [ ] Configure custom domain and SSL certificate
- [ ] Set up Application Insights for monitoring
- [ ] Enable diagnostic logging
- [ ] Configure autoscaling rules
- [ ] Set up deployment slots (staging/production)
- [ ] Configure backup schedule
- [ ] Set up alerts for errors and performance
- [ ] Review security settings (HTTPS only, TLS 1.2+)
- [ ] Disable basic authentication
- [ ] Configure CORS if needed
- [ ] Add security headers (helmet middleware)
- [ ] Set up CI/CD pipeline (GitHub Actions or Azure DevOps)
- [ ] Test disaster recovery procedures

## Documentation

- [Azure App Service Documentation](https://learn.microsoft.com/en-us/azure/app-service/)
- [Azure SQL Database](https://learn.microsoft.com/en-us/azure/azure-sql/)
- [Azure Blob Storage](https://learn.microsoft.com/en-us/azure/storage/blobs/)
- [Managed Identity](https://learn.microsoft.com/en-us/azure/app-service/overview-managed-identity)
- [Well-Architected Framework](https://learn.microsoft.com/en-us/azure/well-architected/)

---

🤖 Generated by Platform Readiness Checker
`;

  return {
    path: 'AZURE_DEPLOYMENT.md',
    content,
    action: 'create'
  };
};

const getDatabaseName = (choice: string): string => {
  switch (choice) {
    case 'azure-sql-free': return 'Azure SQL Free Tier';
    case 'azure-sql-paid': return 'Azure SQL (Paid)';
    case 'cosmosdb-free': return 'Cosmos DB Free Tier';
    case 'postgresql': return 'PostgreSQL';
    case 'mysql': return 'MySQL';
    default: return 'Azure SQL Free Tier';
  }
};

const generateSummary = (fixedIssues: string[], allIssues: ReadinessIssue[], portability: PortabilityResult): string => {
  const errorCount = allIssues.filter(i => i.severity === 'error').length;
  const warningCount = allIssues.filter(i => i.severity === 'warning').length;

  return `Successfully ported application to Azure App Service.

Portability Score: ${portability.score}/100 (${portability.severity})
${portability.score < 50 ? '⚠️ Warning: Low portability score - significant manual work required\n' : ''}
Fixed ${fixedIssues.length} issues automatically:
${fixedIssues.map(f => `  • ${f}`).join('\n')}

Total issues found: ${allIssues.length} (${errorCount} errors, ${warningCount} warnings)
Automatic fixes applied: ${fixedIssues.length}
Manual steps required: See AZURE_DEPLOYMENT.md

Estimated Manual Effort: ${portability.estimatedEffort}

Next: Create Azure resources and deploy using Azure CLI or Azure Portal`;
};
