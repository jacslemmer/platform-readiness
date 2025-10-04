import type { Env, RepoFile, PortingResult } from '../types';
import { portToCloudflare } from '../porters/cloudflare';
import { portToAzure } from '../porters/azure';

export const generatePatch = async (
  analysisId: string,
  env: Env
): Promise<{ patch: string; summary: string } | null> => {
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
  const portingResult = porter(repoFiles, issues);

  if (!portingResult.success) {
    throw new Error('Porting failed');
  }

  const patch = generateGitPatch(portingResult);

  return {
    patch,
    summary: portingResult.summary
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
      patch += `diff --git a/${file.path} b/${file.path}\n`;
      patch += `new file mode 100644\n`;
      patch += `--- /dev/null\n`;
      patch += `+++ b/${file.path}\n`;
      patch += `@@ -0,0 +1,${file.content.split('\n').length} @@\n`;
      patch += file.content.split('\n').map(line => `+${line}`).join('\n');
      patch += '\n';
    } else if (file.action === 'modify') {
      patch += `diff --git a/${file.path} b/${file.path}\n`;
      patch += `--- a/${file.path}\n`;
      patch += `+++ b/${file.path}\n`;
      patch += `@@ -1,1 +1,${file.content.split('\n').length} @@\n`;
      patch += file.content.split('\n').map(line => `+${line}`).join('\n');
      patch += '\n';
    }
  }

  return patch;
};
