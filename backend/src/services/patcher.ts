import type { Env, RepoFile, PortingResult } from '../types';
import type { PortabilityResult } from './portabilityChecker';
import { portToCloudflare } from '../porters/cloudflare';
import { portToAzure } from '../porters/azure';

export interface PatchResult {
  patch?: string;
  summary: string;
  success: boolean;
  canPort?: boolean;
  portability?: PortabilityResult;
}

export const generatePatch = async (
  analysisId: string,
  env: Env,
  preferences?: {
    databaseChoice?: string;
    storageChoice?: string;
  }
): Promise<PatchResult | null> => {
  const analysis = await env.DB.prepare(
    'SELECT * FROM analyses WHERE id = ?'
  )
    .bind(analysisId)
    .first();

  if (!analysis) {
    return null;
  }

  const filesData = await env.REPO_STORAGE.get(`${analysisId}/files.json`);

  if (!filesData) {
    return null;
  }

  const repoFiles: RepoFile[] = JSON.parse(await filesData.text());
  const issues = JSON.parse(analysis.issues as string);

  const porter = getPorter(analysis.target_platform as string);
  const portingResult = porter(repoFiles, issues, preferences);

  // Handle portability rejection (score < 30)
  if (!portingResult.success) {
    return {
      success: false,
      canPort: false,
      summary: portingResult.summary,
      portability: portingResult.portability
    };
  }

  const patch = generateGitPatch(portingResult);

  return {
    success: true,
    canPort: true,
    patch,
    summary: portingResult.summary,
    portability: portingResult.portability
  };
};

const getPorter = (platform: string) => {
  switch (platform) {
    case 'cloudflare':
      return portToCloudflare;
    case 'azure':
      return portToAzure;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
};

const generateGitPatch = (result: PortingResult): string => {
  let patch = '';

  for (const file of result.files) {
    if (file.action === 'create') {
      const lines = file.content.split('\n');
      patch += `diff --git a/${file.path} b/${file.path}\n`;
      patch += `new file mode 100644\n`;
      patch += `--- /dev/null\n`;
      patch += `+++ b/${file.path}\n`;
      patch += `@@ -0,0 +1,${lines.length} @@\n`;
      patch += lines.map(line => `+${line}`).join('\n');
      if (!file.content.endsWith('\n')) {
        patch += '\n';
      }
    } else if (file.action === 'modify') {
      // For modifications, we replace the entire file content
      // This is a simplified approach - in reality we'd want proper diff
      const lines = file.content.split('\n');
      patch += `diff --git a/${file.path} b/${file.path}\n`;
      patch += `--- a/${file.path}\n`;
      patch += `+++ b/${file.path}\n`;
      // Note: This creates a patch that replaces the entire file
      // The format is: @@ -startLine,lineCount +startLine,lineCount @@
      // We're saying "replace all old lines with these new lines"
      patch += `@@ -1 +1,${lines.length} @@\n`;
      patch += lines.map(line => `+${line}`).join('\n');
      if (!file.content.endsWith('\n')) {
        patch += '\n';
      }
    } else if (file.action === 'delete') {
      patch += `diff --git a/${file.path} b/${file.path}\n`;
      patch += `deleted file mode 100644\n`;
      patch += `--- a/${file.path}\n`;
      patch += `+++ /dev/null\n`;
    }
  }

  return patch;
};
