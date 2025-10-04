import type { Env, RepoFile } from '../types';

export const fetchRepository = async (
  repoUrl: string,
  branch: string,
  env: Env
): Promise<RepoFile[]> => {
  const { owner, repo } = parseRepoUrl(repoUrl);

  const cacheKey = `repo:${owner}/${repo}:${branch}`;
  const cached = await env.CACHE.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;

  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Platform-Readiness-Tool',
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch repository: ${response.statusText}`);
  }

  const data = await response.json<{ tree: Array<{ path: string; type: string; url?: string }> }>();

  const files: RepoFile[] = [];

  for (const item of data.tree) {
    if (item.type === 'blob' && item.url) {
      const fileContent = await fetchFileContent(item.url);
      files.push({
        path: item.path,
        content: fileContent,
        type: 'file'
      });
    }
  }

  await env.CACHE.put(cacheKey, JSON.stringify(files), { expirationTtl: 300 });

  return files;
};

const fetchFileContent = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Platform-Readiness-Tool',
      'Accept': 'application/vnd.github.v3.raw'
    }
  });

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
