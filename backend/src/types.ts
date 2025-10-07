import type { PortabilityResult } from './services/portabilityChecker';

export interface Env {
  DB: D1Database;
  REPO_STORAGE: R2Bucket;
  CACHE: KVNamespace;
  GITHUB_TOKEN: string;
  GITHUB_CLIENT_ID?: string;  // Legacy, no longer used
  GITHUB_CLIENT_SECRET?: string;  // Legacy, no longer used
  ENVIRONMENT: string;
}

export interface AnalysisRequest {
  repoUrl: string;
  targetPlatform: 'azure' | 'cloudflare' | 'aws';
  branch?: string;
  bypassCache?: boolean;
}

export interface PortRequest {
  analysisId: string;
  databaseChoice?: 'azure-sql-free' | 'azure-sql-paid' | 'cosmosdb-free' | 'postgresql' | 'mysql' | 'd1';
  storageChoice?: 'blob-storage' | 'r2' | 'cosmosdb-storage';
}

export interface AnalysisResult {
  id: string;
  repoUrl: string;
  targetPlatform: string;
  isReady: boolean;
  issues: ReadinessIssue[];
  timestamp: string;
}

export interface ReadinessIssue {
  category: 'database' | 'storage' | 'runtime' | 'config' | 'dependencies';
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface PlatformConfig {
  name: string;
  checkers: ReadinessChecker[];
  porter: PlatformPorter;
}

export type ReadinessChecker = (repoFiles: RepoFile[]) => ReadinessIssue[];

export type PlatformPorter = (
  repoFiles: RepoFile[],
  issues: ReadinessIssue[],
  preferences?: { databaseChoice?: string; storageChoice?: string }
) => PortingResult;

export interface RepoFile {
  path: string;
  content: string;
  type: 'file' | 'directory';
}

export interface PortingResult {
  success: boolean;
  files: PortedFile[];
  summary: string;
  portability?: PortabilityResult;
}

export interface PortedFile {
  path: string;
  content: string;
  action: 'create' | 'modify' | 'delete';
}
