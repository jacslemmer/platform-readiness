import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, AnalysisRequest } from './types';
import { analyzeRepository } from './services/analyzer';
import { generatePatch } from './services/patcher';

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors());

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/analyze', async (c) => {
  const body = await c.req.json<AnalysisRequest>();

  const { repoUrl, targetPlatform, branch = 'main' } = body;

  if (!repoUrl || !targetPlatform) {
    return c.json({ error: 'repoUrl and targetPlatform are required' }, 400);
  }

  const result = await analyzeRepository(
    repoUrl,
    targetPlatform,
    branch,
    c.env
  );

  return c.json(result);
});

app.post('/port', async (c) => {
  const body = await c.req.json<{ analysisId: string }>();

  const { analysisId } = body;

  if (!analysisId) {
    return c.json({ error: 'analysisId is required' }, 400);
  }

  const patch = await generatePatch(analysisId, c.env);

  if (!patch) {
    return c.json({ error: 'Analysis not found' }, 404);
  }

  return c.json(patch);
});

app.get('/analysis/:id', async (c) => {
  const { id } = c.param();

  const result = await c.env.DB.prepare(
    'SELECT * FROM analyses WHERE id = ?'
  )
    .bind(id)
    .first();

  if (!result) {
    return c.json({ error: 'Analysis not found' }, 404);
  }

  return c.json(result);
});

export default app;
