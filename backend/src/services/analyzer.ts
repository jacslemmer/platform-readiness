import type { Env, AnalysisResult, RepoFile } from '../types';
import { fetchRepository } from './github';
import { checkCloudflareReadiness } from '../checkers/cloudflare';
import { checkAzureReadiness } from '../checkers/azure';
import { generateId } from '../utils/id';

export const analyzeRepository = async (
  repoUrl: string,
  targetPlatform: string,
  branch: string,
  env: Env,
  bypassCache: boolean = false
): Promise<AnalysisResult> => {
  const repoFiles = await fetchRepository(repoUrl, branch, env, bypassCache);

  const checker = getChecker(targetPlatform);
  const issues = checker(repoFiles);

  const isReady = issues.filter((issue) => issue.severity === 'error').length === 0;

  const result: AnalysisResult = {
    id: generateId(),
    repoUrl,
    targetPlatform,
    isReady,
    issues,
    timestamp: new Date().toISOString()
  };

  await storeAnalysis(result, repoFiles, env);

  return result;
};

const getChecker = (platform: string) => {
  switch (platform) {
    case 'cloudflare':
      return checkCloudflareReadiness;
    case 'azure':
      return checkAzureReadiness;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
};

const storeAnalysis = async (
  result: AnalysisResult,
  repoFiles: RepoFile[],
  env: Env
): Promise<void> => {
  await env.DB.prepare(
    'INSERT INTO analyses (id, repo_url, target_platform, is_ready, issues, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(
      result.id,
      result.repoUrl,
      result.targetPlatform,
      result.isReady ? 1 : 0,
      JSON.stringify(result.issues),
      result.timestamp
    )
    .run();

  const filesJson = JSON.stringify(repoFiles);
  await env.REPO_STORAGE.put(`${result.id}/files.json`, filesJson);
};
