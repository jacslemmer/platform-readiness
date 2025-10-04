import type { RepoFile, ReadinessIssue, PortingResult, PortedFile } from '../types';

export const portToCloudflare = (
  repoFiles: RepoFile[],
  issues: ReadinessIssue[]
): PortingResult => {
  const portedFiles: PortedFile[] = [];

  portedFiles.push(createWranglerConfig());

  const hasExpress = issues.some(i => i.message.includes('Express'));
  const hasSQLite = issues.some(i => i.message.includes('SQLite'));
  const hasLocalStorage = issues.some(i => i.message.includes('file system'));

  if (hasExpress) {
    portedFiles.push(...convertExpressToHono(repoFiles));
  }

  if (hasSQLite) {
    portedFiles.push(...convertSQLiteToD1(repoFiles));
  }

  if (hasLocalStorage) {
    portedFiles.push(...convertLocalStorageToR2(repoFiles));
  }

  portedFiles.push(updatePackageJson(repoFiles));

  return {
    success: true,
    files: portedFiles,
    summary: `Ported application to Cloudflare Workers. Converted Express to Hono, SQLite to D1, and local storage to R2.`
  };
};

const createWranglerConfig = (): PortedFile => {
  const content = `name = "ported-app"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "app-database"
database_id = ""

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "app-storage"
`;

  return {
    path: 'wrangler.toml',
    content,
    action: 'create'
  };
};

const convertExpressToHono = (repoFiles: RepoFile[]): PortedFile[] => {
  const indexFile = repoFiles.find(f => f.path.includes('index.ts') || f.path.includes('index.js'));

  if (!indexFile) return [];

  let content = indexFile.content;

  content = content.replace(/import express.*from ['"]express['"];?/g, 'import { Hono } from \'hono\';');
  content = content.replace(/const app = express\(\);?/g, 'const app = new Hono();');
  content = content.replace(/app\.listen\([^)]+\)[^}]*}/g, 'export default app;');
  content = content.replace(/req: Request, res: Response/g, 'c');
  content = content.replace(/res\.json\(/g, 'return c.json(');
  content = content.replace(/res\.status\((\d+)\)\.json\(/g, 'return c.json(');
  content = content.replace(/res\.send\(/g, 'return c.text(');

  return [{
    path: indexFile.path,
    content,
    action: 'modify'
  }];
};

const convertSQLiteToD1 = (repoFiles: RepoFile[]): PortedFile[] => {
  const dbFile = repoFiles.find(f => f.path.includes('database.ts') || f.path.includes('database.js'));

  if (!dbFile) return [];

  let content = `import type { D1Database } from '@cloudflare/workers-types';

export const getTasks = async (db: D1Database) => {
  const result = await db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
  return result.results;
};

export const createTask = async (db: D1Database, title: string, description?: string) => {
  const result = await db.prepare(
    'INSERT INTO tasks (title, description) VALUES (?, ?) RETURNING *'
  ).bind(title, description || null).first();
  return result;
};

export const updateTask = async (
  db: D1Database,
  id: number,
  updates: { title?: string; description?: string; completed?: boolean }
) => {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.title) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.completed !== undefined) {
    fields.push('completed = ?');
    values.push(updates.completed ? 1 : 0);
  }

  if (fields.length === 0) return null;

  values.push(id);

  const result = await db.prepare(
    \`UPDATE tasks SET \${fields.join(', ')} WHERE id = ? RETURNING *\`
  ).bind(...values).first();

  return result;
};

export const deleteTask = async (db: D1Database, id: number) => {
  const result = await db.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
  return result.success;
};
`;

  return [{
    path: dbFile.path,
    content,
    action: 'modify'
  }];
};

const convertLocalStorageToR2 = (repoFiles: RepoFile[]): PortedFile[] => {
  const storageFile = repoFiles.find(f => f.path.includes('storage.ts') || f.path.includes('storage.js'));

  if (!storageFile) return [];

  const content = `import type { R2Bucket } from '@cloudflare/workers-types';

export const uploadFile = async (
  storage: R2Bucket,
  filename: string,
  file: ArrayBuffer,
  metadata?: Record<string, string>
) => {
  await storage.put(filename, file, { customMetadata: metadata });
  return { filename, uploaded: true };
};

export const getFile = async (storage: R2Bucket, filename: string) => {
  const object = await storage.get(filename);
  if (!object) return null;
  return await object.arrayBuffer();
};

export const deleteFile = async (storage: R2Bucket, filename: string) => {
  await storage.delete(filename);
  return { deleted: true };
};
`;

  return [{
    path: storageFile.path,
    content,
    action: 'modify'
  }];
};

const updatePackageJson = (repoFiles: RepoFile[]): PortedFile => {
  const packageFile = repoFiles.find(f => f.path === 'package.json');

  if (!packageFile) {
    return {
      path: 'package.json',
      content: JSON.stringify({
        name: 'ported-app',
        version: '1.0.0',
        scripts: {
          dev: 'wrangler dev',
          deploy: 'wrangler deploy'
        },
        dependencies: {
          hono: '^4.0.0'
        },
        devDependencies: {
          '@cloudflare/workers-types': '^4.20240117.0',
          wrangler: '^3.22.0',
          typescript: '^5.3.3'
        }
      }, null, 2),
      action: 'modify'
    };
  }

  const pkg = JSON.parse(packageFile.content);

  delete pkg.dependencies?.express;
  delete pkg.dependencies?.sqlite3;
  delete pkg.dependencies?.multer;

  pkg.dependencies = pkg.dependencies || {};
  pkg.dependencies.hono = '^4.0.0';

  pkg.devDependencies = pkg.devDependencies || {};
  pkg.devDependencies['@cloudflare/workers-types'] = '^4.20240117.0';
  pkg.devDependencies.wrangler = '^3.22.0';

  pkg.scripts = pkg.scripts || {};
  pkg.scripts.dev = 'wrangler dev';
  pkg.scripts.deploy = 'wrangler deploy';
  delete pkg.scripts.start;

  return {
    path: 'package.json',
    content: JSON.stringify(pkg, null, 2),
    action: 'modify'
  };
};
