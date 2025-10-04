import type { RepoFile, ReadinessIssue, PortingResult, PortedFile } from '../types';

export const portToAzure = (
  repoFiles: RepoFile[],
  issues: ReadinessIssue[]
): PortingResult => {
  const portedFiles: PortedFile[] = [];

  portedFiles.push(createAzureConfig());

  const hasSQLite = issues.some(i => i.message.includes('SQLite'));
  const hasLocalStorage = issues.some(i => i.message.includes('file storage'));
  const missingStartScript = issues.some(i => i.message.includes('start script'));

  if (hasSQLite) {
    portedFiles.push(createAzureSQLConfig());
  }

  if (hasLocalStorage) {
    portedFiles.push(createBlobStorageConfig());
  }

  if (missingStartScript) {
    portedFiles.push(updatePackageJsonForAzure(repoFiles));
  }

  portedFiles.push(createDeploymentDocs());

  return {
    success: true,
    files: portedFiles,
    summary: `Ported application to Azure App Service. Added azure.yaml, configured for Azure SQL and Blob Storage.`
  };
};

const createAzureConfig = (): PortedFile => {
  const content = `# Azure App Service configuration
name: ported-app
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
`;

  return {
    path: 'azure.yaml',
    content,
    action: 'create'
  };
};

const createAzureSQLConfig = (): PortedFile => {
  const content = `# Azure SQL Database Configuration Guide

## Setup Steps

1. Create Azure SQL Database:
   \`\`\`bash
   az sql server create --name <server-name> --resource-group <rg> --location <location> --admin-user <admin> --admin-password <password>
   az sql db create --resource-group <rg> --server <server-name> --name <db-name> --service-objective S0
   \`\`\`

2. Add connection string to App Service environment variables:
   \`\`\`
   DATABASE_URL=Server=tcp:<server-name>.database.windows.net,1433;Database=<db-name>;User ID=<admin>;Password=<password>;Encrypt=true;
   \`\`\`

3. Update database.ts to use Azure SQL instead of SQLite

## Required npm packages:
\`\`\`bash
npm install mssql
\`\`\`
`;

  return {
    path: 'docs/AZURE_SQL_SETUP.md',
    content,
    action: 'create'
  };
};

const createBlobStorageConfig = (): PortedFile => {
  const content = `# Azure Blob Storage Configuration Guide

## Setup Steps

1. Create Storage Account:
   \`\`\`bash
   az storage account create --name <storage-name> --resource-group <rg> --location <location> --sku Standard_LRS
   \`\`\`

2. Create Blob Container:
   \`\`\`bash
   az storage container create --name uploads --account-name <storage-name>
   \`\`\`

3. Add connection string to App Service environment variables:
   \`\`\`
   AZURE_STORAGE_CONNECTION_STRING=<connection-string>
   \`\`\`

4. Update storage.ts to use Azure Blob Storage

## Required npm packages:
\`\`\`bash
npm install @azure/storage-blob
\`\`\`
`;

  return {
    path: 'docs/AZURE_BLOB_SETUP.md',
    content,
    action: 'create'
  };
};

const updatePackageJsonForAzure = (repoFiles: RepoFile[]): PortedFile => {
  const packageFile = repoFiles.find(f => f.path === 'package.json');

  if (!packageFile) {
    return {
      path: 'package.json',
      content: JSON.stringify({
        name: 'ported-app',
        version: '1.0.0',
        scripts: {
          start: 'node dist/index.js',
          build: 'tsc',
          dev: 'ts-node src/index.ts'
        },
        engines: {
          node: '>=18.0.0'
        }
      }, null, 2),
      action: 'modify'
    };
  }

  const pkg = JSON.parse(packageFile.content);

  pkg.scripts = pkg.scripts || {};

  if (!pkg.scripts.start) {
    pkg.scripts.start = 'node dist/index.js';
  }

  if (!pkg.scripts.build) {
    pkg.scripts.build = 'tsc';
  }

  pkg.engines = pkg.engines || {};
  pkg.engines.node = '>=18.0.0';

  return {
    path: 'package.json',
    content: JSON.stringify(pkg, null, 2),
    action: 'modify'
  };
};

const createDeploymentDocs = (): PortedFile => {
  const content = `# Azure Deployment Guide

## Prerequisites
- Azure CLI installed
- Azure subscription

## Deployment Steps

1. Login to Azure:
   \`\`\`bash
   az login
   \`\`\`

2. Create Resource Group:
   \`\`\`bash
   az group create --name <rg-name> --location eastus
   \`\`\`

3. Create App Service Plan:
   \`\`\`bash
   az appservice plan create --name <plan-name> --resource-group <rg-name> --sku B1 --is-linux
   \`\`\`

4. Create Web App:
   \`\`\`bash
   az webapp create --resource-group <rg-name> --plan <plan-name> --name <app-name> --runtime "NODE:18-lts"
   \`\`\`

5. Deploy from GitHub:
   \`\`\`bash
   az webapp deployment source config --name <app-name> --resource-group <rg-name> --repo-url <github-url> --branch main --manual-integration
   \`\`\`

6. Configure environment variables in Azure Portal or via CLI:
   \`\`\`bash
   az webapp config appsettings set --resource-group <rg-name> --name <app-name> --settings DATABASE_URL=<value> API_KEY=<value>
   \`\`\`
`;

  return {
    path: 'docs/AZURE_DEPLOYMENT.md',
    content,
    action: 'create'
  };
};
