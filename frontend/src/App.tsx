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

const App = () => {
  const [repoUrl, setRepoUrl] = useState('');
  const [targetPlatform, setTargetPlatform] = useState<'azure' | 'cloudflare'>('cloudflare');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');

  const analyzeRepo = async () => {
    if (!repoUrl) {
      setError('Please enter a GitHub repository URL');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, targetPlatform })
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const data = await response.json();
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
      const response = await fetch('/api/port', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: result.id })
      });

      if (!response.ok) {
        throw new Error('Failed to generate patch');
      }

      const { patch, summary } = await response.json();

      const blob = new Blob([patch], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${targetPlatform}-port.patch`;
      a.click();
      URL.revokeObjectURL(url);

      alert(`Patch generated!\n\n${summary}`);
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
            placeholder="https://github.com/username/repo"
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
              <h3>Issues Found ({result.issues.length})</h3>
              {result.issues.map((issue, index) => (
                <div key={index} className={`issue ${issue.severity}`}>
                  <div className="issue-header">
                    <span className="category">{issue.category}</span>
                    <span className="severity">{issue.severity}</span>
                  </div>
                  <p className="message">{issue.message}</p>
                  {issue.suggestion && (
                    <p className="suggestion">💡 {issue.suggestion}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {!result.isReady && (
            <button onClick={downloadPatch} disabled={loading} className="download-btn">
              {loading ? 'Generating...' : 'Download Porting Patch'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default App;
