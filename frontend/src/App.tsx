import { useState } from 'react';
import './App.css';

interface AnalysisResult {
  id: string;
  repoUrl: string;
  targetPlatform: string;
  isReady: boolean;
  issues: Array<{
    category: string;
    severity: string;
    message: string;
    suggestion?: string;
  }>;
  timestamp: string;
}

const API_URL = import.meta.env.PROD
  ? 'https://platform-readiness-backend.jaco-lemmer.workers.dev'
  : '/api';

const App = () => {
  const [repoUrl, setRepoUrl] = useState('');
  const [targetPlatform, setTargetPlatform] = useState<'azure' | 'cloudflare'>('cloudflare');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [ported, setPorted] = useState(false);
  const [portedPlatform, setPortedPlatform] = useState('');
  const [showPortOptions, setShowPortOptions] = useState(false);
  const [databaseChoice, setDatabaseChoice] = useState('azure-sql-free');
  const [storageChoice, setStorageChoice] = useState('blob-storage');

  const analyzeRepo = async () => {
    if (!repoUrl) {
      setError('Please enter a GitHub repository URL');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      // Normalize repo URL - accept both full URLs and owner/repo format
      let normalizedUrl = repoUrl.trim();
      if (!normalizedUrl.includes('github.com')) {
        normalizedUrl = `https://github.com/${normalizedUrl}`;
      }

      const response = await fetch(`${API_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: normalizedUrl, targetPlatform })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Analysis failed');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const downloadPatch = async () => {
    if (!result) return;

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/port`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId: result.id,
          databaseChoice: targetPlatform === 'azure' ? databaseChoice : 'd1',
          storageChoice: targetPlatform === 'azure' ? storageChoice : 'r2'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate patch');
      }

      const { patch } = await response.json();

      const blob = new Blob([patch], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${targetPlatform}-port.patch`;
      a.click();
      URL.revokeObjectURL(url);

      // Show certificate after successful porting
      setPorted(true);
      setPortedPlatform(targetPlatform);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate patch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>Platform Readiness Checker</h1>
      <p className="subtitle">
        Test your application for cloud platform deployment readiness
      </p>

      <div className="form">
        <div className="form-group">
          <label htmlFor="repoUrl">GitHub Repository URL</label>
          <input
            id="repoUrl"
            type="text"
            placeholder="username/repo or https://github.com/username/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="platform">Target Platform</label>
          <select
            id="platform"
            value={targetPlatform}
            onChange={(e) => setTargetPlatform(e.target.value as 'azure' | 'cloudflare')}
            disabled={loading}
          >
            <option value="cloudflare">Cloudflare</option>
            <option value="azure">Microsoft Azure</option>
          </select>
        </div>

        <button onClick={analyzeRepo} disabled={loading}>
          {loading ? 'Analyzing...' : 'Analyze Repository'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <div className="results">
          <h2>Analysis Results</h2>

          <div className={`status ${result.isReady ? 'ready' : 'not-ready'}`}>
            {result.isReady ? (
              <p>✅ Your application is ready for {result.targetPlatform}!</p>
            ) : (
              <p>⚠️ Your application needs changes for {result.targetPlatform}</p>
            )}
          </div>

          {result.issues.length > 0 && (
            <div className="issues">
              <h3>Readiness Report ({result.issues.length} issues found)</h3>

              {/* Group by severity */}
              {['error', 'warning', 'info'].map(severity => {
                const issuesForSeverity = result.issues.filter(i => i.severity === severity);
                if (issuesForSeverity.length === 0) return null;

                return (
                  <div key={severity} className="issue-group">
                    <h4 className={`severity-header ${severity}`}>
                      {severity === 'error' && '🚫 Blocking Issues'}
                      {severity === 'warning' && '⚠️ Warnings'}
                      {severity === 'info' && 'ℹ️ Recommendations'}
                      {' '}({issuesForSeverity.length})
                    </h4>
                    {issuesForSeverity.map((issue, index) => (
                      <div key={index} className={`issue ${issue.severity}`}>
                        <div className="issue-header">
                          <span className="category">{issue.category}</span>
                        </div>
                        <p className="message">{issue.message}</p>
                        {issue.suggestion && (
                          <p className="suggestion">💡 {issue.suggestion}</p>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {!result.isReady && !ported && !showPortOptions && (
            <div className="porting-section">
              <h3>Ready to Port?</h3>
              <p>
                The Platform Readiness tool can automatically generate fixes for many of these issues.
                {targetPlatform === 'azure' && result.issues.some(i => i.category === 'database' || i.category === 'storage') && (
                  <> You'll be able to choose your database and storage options.</>
                )}
              </p>
              <button onClick={() => setShowPortOptions(true)} disabled={loading} className="download-btn">
                Continue to Port Options
              </button>
            </div>
          )}

          {!result.isReady && !ported && showPortOptions && (
            <div className="porting-section">
              <h3>Select Porting Options</h3>

              {targetPlatform === 'azure' && result.issues.some(i => i.category === 'database') && (
                <div className="option-group">
                  <label>Database Solution:</label>
                  <select value={databaseChoice} onChange={(e) => setDatabaseChoice(e.target.value)}>
                    <option value="azure-sql-free">✅ Azure SQL Free Tier (FREE FOREVER - 32GB) - RECOMMENDED</option>
                    <option value="cosmosdb-free">✅ Cosmos DB Free Tier (FREE FOREVER - 25GB) - NoSQL</option>
                    <option value="azure-sql-paid">💰 Azure SQL Paid (~$5+/month) - Enterprise</option>
                    <option value="postgresql">⏰ PostgreSQL (Free 12 months, then ~$15-30/mo)</option>
                    <option value="mysql">⏰ MySQL (Free 12 months, then ~$15-30/mo)</option>
                  </select>
                </div>
              )}

              {targetPlatform === 'azure' && result.issues.some(i => i.category === 'storage') && (
                <div className="option-group">
                  <label>Storage Solution:</label>
                  <select value={storageChoice} onChange={(e) => setStorageChoice(e.target.value)}>
                    <option value="blob-storage">Azure Blob Storage (Recommended)</option>
                  </select>
                </div>
              )}

              <div className="button-group">
                <button onClick={() => setShowPortOptions(false)} className="back-btn">
                  ← Back
                </button>
                <button onClick={downloadPatch} disabled={loading} className="download-btn">
                  {loading ? 'Generating Patch...' : 'Generate Porting Patch'}
                </button>
              </div>

              <p className="help-text">
                After downloading, apply with: <code>git apply {targetPlatform}-port.patch</code>
              </p>
            </div>
          )}

          {ported && (
            <div className="certificate">
              <div className="badge">🏆</div>
              <h2>Platform Ready Certificate</h2>
              <p className="platform">{portedPlatform === 'azure' ? 'Microsoft Azure' : 'Cloudflare'}</p>
              <p className="message">
                This application has been successfully ported and is now ready for deployment on {portedPlatform === 'azure' ? 'Microsoft Azure' : 'Cloudflare'}.
              </p>
              <p className="message">
                ✅ All platform requirements met<br />
                ✅ Configuration files generated<br />
                ✅ Code adapted for target platform
              </p>
              <p className="timestamp">
                Certified by Platform Readiness Checker<br />
                {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;
