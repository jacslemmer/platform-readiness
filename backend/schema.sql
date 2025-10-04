-- D1 Database Schema for Platform Readiness

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  repo_url TEXT NOT NULL,
  target_platform TEXT NOT NULL,
  is_ready INTEGER NOT NULL DEFAULT 0,
  issues TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analyses_repo_url ON analyses(repo_url);
CREATE INDEX IF NOT EXISTS idx_analyses_timestamp ON analyses(timestamp);
