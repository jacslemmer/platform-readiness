import type { RepoFile } from '../types';

export interface PortabilityResult {
  score: number;           // 0-100
  canPort: boolean;        // true if score >= 50
  severity: 'BLOCKING' | 'WARNING' | 'OK';
  issues: PortabilityIssue[];
  recommendation: string;
  estimatedEffort: string;
}

interface PortabilityIssue {
  category: string;
  impact: number;          // Points deducted from score
  description: string;
  blocker: boolean;
}

/**
 * Calculate portability score for Azure App Service
 * Score ranges:
 *   0-30: Cannot port (complete rewrite needed)
 *   30-50: High effort (porter helps, but heavy manual work)
 *   50-100: Portable (porter can automate most changes)
 */
export const calculatePortabilityScore = (repoFiles: RepoFile[]): PortabilityResult => {
  let score = 100;
  const issues: PortabilityIssue[] = [];

  const packageJson = repoFiles.find(f => f.path === 'package.json');
  const pkg = packageJson ? JSON.parse(packageJson.content) : null;

  // ========================================
  // BLOCKING ISSUES (Score 0 - Cannot Port)
  // ========================================

  // 1. Desktop Framework Detection (-100 points - INSTANT FAIL)
  const desktopFrameworks = {
    electron: pkg?.dependencies?.electron || pkg?.devDependencies?.electron,
    tauri: pkg?.dependencies?.['@tauri-apps/api'] || pkg?.dependencies?.['@tauri-apps/cli'],
    nwjs: pkg?.dependencies?.nw || pkg?.devDependencies?.nw
  };

  const detectedFramework = Object.entries(desktopFrameworks).find(([_, exists]) => exists)?.[0];

  if (detectedFramework) {
    score = 0;
    issues.push({
      category: 'architecture',
      impact: 100,
      description: `Desktop application framework detected (${detectedFramework}). ` +
                   `Desktop apps cannot run on Azure App Service web platform.`,
      blocker: true
    });

    return {
      score: 0,
      canPort: false,
      severity: 'BLOCKING',
      issues,
      recommendation:
        `❌ CANNOT PORT: This is a ${detectedFramework} desktop application.\n\n` +
        `Desktop applications use fundamentally different architectures than web applications:\n` +
        `• Desktop: Process-based, IPC communication, native windows, single-user\n` +
        `• Web: Request-based, HTTP communication, browser-based, multi-user\n\n` +
        `Azure App Service hosts web applications, not desktop applications.\n\n` +
        `RECOMMENDED ACTION:\n` +
        `Build a new Azure-native web application from scratch instead of porting.\n\n` +
        `Why rebuild is better:\n` +
        `✅ Proper web architecture from the start\n` +
        `✅ Faster than trying to convert desktop → web\n` +
        `✅ Better performance and scalability\n` +
        `✅ Cleaner codebase without architectural compromises\n\n` +
        `Estimated effort:\n` +
        `• Porting + fixing: 60-100 hours (30% success rate)\n` +
        `• Rebuilding fresh: 40-60 hours (100% success rate)\n\n` +
        `The platform-readiness tool cannot generate a functional patch for this application.`,
      estimatedEffort: 'Cannot be automated - Complete rewrite required (40-60 hours)'
    };
  }

  // 2. IPC Communication Pattern (-50 points)
  const hasIPC = repoFiles.some(f =>
    /ipcMain\.|ipcRenderer\.|ipc\./.test(f.content)
  );

  if (hasIPC) {
    score -= 50;
    issues.push({
      category: 'communication',
      impact: 50,
      description: 'IPC (Inter-Process Communication) detected. Web apps use HTTP, not IPC.',
      blocker: score < 30
    });
  }

  // 3. No HTTP Server Framework (-40 points)
  const hasHttpServer =
    pkg?.dependencies?.express ||
    pkg?.dependencies?.fastify ||
    pkg?.dependencies?.koa ||
    pkg?.dependencies?.['@hapi/hapi'] ||
    pkg?.dependencies?.hono ||
    repoFiles.some(f =>
      /express\(\)/.test(f.content) ||
      /new Fastify/.test(f.content) ||
      /new Hono/.test(f.content)
    );

  if (!hasHttpServer) {
    score -= 40;
    issues.push({
      category: 'infrastructure',
      impact: 40,
      description: 'No HTTP server framework detected. Azure App Service requires HTTP server.',
      blocker: score < 30
    });
  }

  // ========================================
  // HIGH IMPACT ISSUES (Score 30-50)
  // ========================================

  // 4. No Authentication System (-30 points)
  const hasAuth =
    pkg?.dependencies?.passport ||
    pkg?.dependencies?.jsonwebtoken ||
    pkg?.dependencies?.['express-session'] ||
    pkg?.dependencies?.['next-auth'] ||
    repoFiles.some(f =>
      /passport\.authenticate/.test(f.content) ||
      /jwt\.sign/.test(f.content) ||
      /bcrypt\.hash/.test(f.content)
    );

  if (!hasAuth && hasHttpServer) {
    score -= 30;
    issues.push({
      category: 'security',
      impact: 30,
      description: 'No authentication system detected. Web apps need user authentication.',
      blocker: false
    });
  }

  // 5. Single-User Global State (-25 points)
  const hasSingleUserState = repoFiles.some(f =>
    /let\s+\w+Data\s*[:=]/.test(f.content) && // Global mutable state
    !/userId|user_id|req\.user/.test(f.content) // No user isolation
  );

  if (hasSingleUserState) {
    score -= 25;
    issues.push({
      category: 'architecture',
      impact: 25,
      description: 'Single-user global state detected. Web apps need multi-user isolation.',
      blocker: false
    });
  }

  // ========================================
  // MEDIUM IMPACT ISSUES (Score 50-70)
  // ========================================

  // 6. SQLite Database (-15 points)
  const hasSQLite =
    pkg?.dependencies?.sqlite3 ||
    pkg?.dependencies?.['better-sqlite3'] ||
    repoFiles.some(f => /new sqlite3\.Database/.test(f.content));

  if (hasSQLite) {
    score -= 15;
    issues.push({
      category: 'database',
      impact: 15,
      description: 'SQLite database detected. Azure needs cloud database (SQL, PostgreSQL, etc.).',
      blocker: false
    });
  }

  // 7. Local File Storage (-15 points)
  const hasFileStorage = repoFiles.some(f =>
    /fs\.writeFile|fs\.writeFileSync/.test(f.content) &&
    !/node_modules/.test(f.path)
  );

  if (hasFileStorage) {
    score -= 15;
    issues.push({
      category: 'storage',
      impact: 15,
      description: 'Local file storage detected. Azure needs Blob Storage for persistence.',
      blocker: false
    });
  }

  // 8. Hardcoded Port (-10 points)
  const hasHardcodedPort = repoFiles.some(f =>
    /\.listen\(\d{4}\)/.test(f.content) && // app.listen(3000)
    !/process\.env\.PORT/.test(f.content)
  );

  if (hasHardcodedPort && hasHttpServer) {
    score -= 10;
    issues.push({
      category: 'config',
      impact: 10,
      description: 'Hardcoded port detected. Azure requires process.env.PORT.',
      blocker: false
    });
  }

  // 9. No Health Check Endpoint (-10 points)
  const hasHealthCheck = repoFiles.some(f =>
    /['"]\/health['"]/.test(f.content) ||
    /['"]\/healthz['"]/.test(f.content)
  );

  if (!hasHealthCheck && hasHttpServer) {
    score -= 10;
    issues.push({
      category: 'monitoring',
      impact: 10,
      description: 'No health check endpoint. Azure needs /health for monitoring.',
      blocker: false
    });
  }

  // 10. Missing CORS Configuration (-5 points)
  const hasCORS =
    pkg?.dependencies?.cors ||
    repoFiles.some(f => /cors\(\)/.test(f.content));

  if (!hasCORS && hasHttpServer) {
    score -= 5;
    issues.push({
      category: 'config',
      impact: 5,
      description: 'No CORS configuration detected. May be needed for frontend.',
      blocker: false
    });
  }

  // ========================================
  // Calculate Final Result
  // ========================================

  score = Math.max(0, score);

  const canPort = score >= 50;
  const severity: 'BLOCKING' | 'WARNING' | 'OK' =
    score < 30 ? 'BLOCKING' : score < 50 ? 'WARNING' : 'OK';

  let recommendation: string;
  let estimatedEffort: string;

  if (score < 30) {
    recommendation =
      `❌ CANNOT PORT (Score: ${score}/100)\n\n` +
      `This application has fundamental architectural incompatibilities with Azure App Service.\n\n` +
      `Critical issues found:\n${issues.filter(i => i.blocker).map(i => `• ${i.description}`).join('\n')}\n\n` +
      `RECOMMENDED ACTION:\n` +
      `Build a new Azure-native web application from scratch.\n\n` +
      `This will be faster and result in better architecture than attempting to port.`;
    estimatedEffort = 'Cannot automate - Complete rewrite required (40-80 hours)';
  } else if (score < 50) {
    recommendation =
      `⚠️  HIGH EFFORT REQUIRED (Score: ${score}/100)\n\n` +
      `This application can technically be ported, but will require significant manual work.\n\n` +
      `Issues to address:\n${issues.map(i => `• ${i.description}`).join('\n')}\n\n` +
      `OPTIONS:\n` +
      `1. Use porter + extensive manual fixes (recommended if close to 50)\n` +
      `2. Rebuild as Azure-native app (recommended if below 40)\n\n` +
      `Consider: Is it worth the effort to port, or faster to rebuild?`;
    estimatedEffort = 'Porter helps, but 30-50 hours manual work required';
  } else {
    recommendation =
      `✅ CAN PORT (Score: ${score}/100)\n\n` +
      `This application is suitable for automated porting with minor manual cleanup.\n\n` +
      `Issues to address:\n${issues.map(i => `• ${i.description}`).join('\n')}\n\n` +
      `The porter will handle most changes automatically.\n` +
      `Manual work needed: ${issues.length * 2}-${issues.length * 4} hours estimated.`;
    estimatedEffort = `Porter automates most changes - ${issues.length * 2}-${issues.length * 4} hours manual work`;
  }

  return {
    score,
    canPort,
    severity,
    issues,
    recommendation,
    estimatedEffort
  };
};
