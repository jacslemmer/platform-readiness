import type { Env, RepoFile } from '../types';

/**
 * Creates authenticated headers for GitHub API requests
 */
const createGitHubHeaders = (env: Env, accept: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'User-Agent': 'Platform-Readiness-Tool',
    'Accept': accept
  };

  if (env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`;
  }

  return headers;
};

export const fetchRepository = async (
  repoUrl: string,
  branch: string,
  env: Env,
  bypassCache: boolean = false
): Promise<RepoFile[]> => {
  const { owner, repo } = parseRepoUrl(repoUrl);

  const cacheKey = `repo:${owner}/${repo}:${branch}`;

  if (!bypassCache) {
    const cached = await env.CACHE.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }
  }

  // Fetch important files that we need to check for platform readiness
  const importantFiles = [
    'package.json',
    'wrangler.toml',
    'azure.yaml',
    '.azure/config',
    'Dockerfile',
    'docker-compose.yml',
    '.env.example',
    'tsconfig.json'
  ];

  const files: RepoFile[] = [];

  // Try to fetch tree first to get all files
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const headers = createGitHubHeaders(env, 'application/vnd.github.v3+json');

  const treeResponse = await fetch(apiUrl, { headers });

  if (!treeResponse.ok) {
    const errorText = await treeResponse.text();
    throw new Error(`Failed to fetch repository: ${treeResponse.status} ${treeResponse.statusText} - ${errorText}`);
  }

  const treeData = await treeResponse.json<{ tree: Array<{ path: string; type: string; sha: string }> }>();

  // Fetch content for key files
  for (const item of treeData.tree) {
    if (item.type === 'blob' && (
      importantFiles.includes(item.path) ||
      item.path.endsWith('.ts') ||
      item.path.endsWith('.js') ||
      item.path.endsWith('.json')
    )) {
      try {
        const content = await fetchFileFromRepo(owner, repo, item.path, branch, env);
        files.push({
          path: item.path,
          content,
          type: 'file'
        });
      } catch (err) {
        console.error(`Failed to fetch ${item.path}:`, err);
      }
    }
  }

  await env.CACHE.put(cacheKey, JSON.stringify(files), { expirationTtl: 300 });

  return files;
};

const fetchFileFromRepo = async (owner: string, repo: string, path: string, branch: string, env: Env): Promise<string> => {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const headers = createGitHubHeaders(env, 'application/vnd.github.v3.raw');

  const response = await fetch(url, { headers });

  if (!response.ok) {
    return '';
  }

  return await response.text();
};

const parseRepoUrl = (url: string): { owner: string; repo: string } => {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);

  if (!match) {
    throw new Error('Invalid GitHub repository URL');
  }

  return {
    owner: match[1],
    repo: match[2].replace('.git', '')
  };
};
