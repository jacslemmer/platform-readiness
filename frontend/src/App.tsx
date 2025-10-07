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
  const [bypassCache, setBypassCache] = useState(false);

  // Helper to check if app is non-portable
  const isNonPortable = (result: AnalysisResult | null) => {
    return result?.issues.some(i =>
      i.message.includes('CANNOT PORT') ||
      i.message.includes('NOT RECOMMENDED TO PORT')
    ) ?? false;
  };

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
        body: JSON.stringify({ repoUrl: normalizedUrl, targetPlatform, bypassCache })
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

  const downloadCSV = () => {
    if (!result) return;

    // Generate CSV content
    const csvRows = [
      ['Severity', 'Category', 'Message', 'Suggestion'],
      ...result.issues.map(issue => [
        issue.severity,
        issue.category,
        issue.message,
        issue.suggestion || ''
      ])
    ];

    const csvContent = csvRows
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    // Download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${targetPlatform}-readiness-report.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadCertificate = () => {
    if (!result) return;

    const platformName = targetPlatform === 'azure' ? 'Microsoft Azure' : 'Cloudflare';
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Create certificate HTML
    const certificateHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Platform Ready Certificate - ${platformName}</title>
  <style>
    body {
      margin: 0;
      padding: 40px;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .certificate {
      background: white;
      padding: 60px;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 800px;
      text-align: center;
    }
    .badge {
      font-size: 72px;
      margin-bottom: 20px;
    }
    h1 {
      color: #333;
      font-size: 36px;
      margin: 20px 0;
    }
    .platform {
      font-size: 28px;
      color: #667eea;
      font-weight: bold;
      margin: 20px 0;
    }
    .repo {
      font-size: 18px;
      color: #666;
      font-family: 'Courier New', monospace;
      margin: 20px 0;
      padding: 10px;
      background: #f5f5f5;
      border-radius: 5px;
    }
    .message {
      font-size: 18px;
      color: #555;
      line-height: 1.8;
      margin: 30px 0;
    }
    .timestamp {
      font-size: 14px;
      color: #888;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #eee;
    }
    .checkmarks {
      text-align: left;
      display: inline-block;
      margin: 20px 0;
    }
    .checkmark-item {
      font-size: 16px;
      color: #2ecc71;
      margin: 10px 0;
    }
    @media print {
      body {
        background: white;
        padding: 0;
      }
      .certificate {
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="certificate">
    <div class="badge">🏆</div>
    <h1>Platform Ready Certificate</h1>
    <p class="platform">${platformName}</p>
    <p class="repo">${result.repoUrl}</p>
    <p class="message">
      This application has been analyzed and is certified ready for deployment on ${platformName}.
    </p>
    <div class="checkmarks">
      <div class="checkmark-item">✅ All platform requirements met</div>
      <div class="checkmark-item">✅ No blocking compatibility issues</div>
      <div class="checkmark-item">✅ Ready for production deployment</div>
    </div>
    <p class="timestamp">
      Certified by Platform Readiness Checker<br>
      ${date}
    </p>
  </div>
</body>
</html>
    `;

    // Download certificate as HTML
    const blob = new Blob([certificateHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${targetPlatform}-ready-certificate.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

      const data = await response.json();

      // Handle portability rejection
      if (!data.success || !data.canPort) {
        setError(
          `❌ Cannot Port: This application cannot be automatically ported.\n\n` +
          `Portability Score: ${data.portability?.score || 0}/100\n\n` +
          `${data.summary}\n\n` +
          `Please see the detailed recommendation above.`
        );
        return;
      }

      // Handle successful porting with warnings
      if (data.portability && data.portability.score < 50) {
        // Show warning but continue with download
        console.warn(`Low portability score: ${data.portability.score}/100`);
      }

      const blob = new Blob([data.patch], { type: 'text/plain' });
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

        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={bypassCache}
              onChange={(e) => setBypassCache(e.target.checked)}
              disabled={loading}
            />
            <span>Force refresh (bypass cache)</span>
          </label>
          <p className="help-text">
            Check this if you've recently updated your repository and want to analyze the latest changes
          </p>
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

          {result.isReady && (
            <div className="certificate">
              <div className="badge">🏆</div>
              <h2>Platform Ready Certificate</h2>
              <p className="platform">{targetPlatform === 'azure' ? 'Microsoft Azure' : 'Cloudflare'}</p>
              <p className="message">
                This application has been analyzed and is certified ready for deployment on {targetPlatform === 'azure' ? 'Microsoft Azure' : 'Cloudflare'}.
              </p>
              <p className="message">
                ✅ All platform requirements met<br />
                ✅ No blocking compatibility issues<br />
                ✅ Ready for production deployment
              </p>
              <p className="timestamp">
                Certified by Platform Readiness Checker<br />
                {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <button onClick={downloadCertificate} className="download-btn" style={{marginTop: '20px'}}>
                📥 Download Certificate
              </button>
            </div>
          )}

          {result.issues.length > 0 && (
            <div className="issues">
              <div className="issues-header">
                <h3>Readiness Report ({result.issues.length} issues found)</h3>
                <button onClick={downloadCSV} className="csv-btn">
                  📥 Download CSV Report
                </button>
              </div>

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

          {!result.isReady && !ported && !showPortOptions && !isNonPortable(result) && (
            <div className="porting-section">
              <h3>Generate Fix Recommendations</h3>
              <p>
                The Platform Readiness tool can generate a patch file with recommended code fixes for many of these issues.
                {targetPlatform === 'azure' && result.issues.some(i => i.category === 'database' || i.category === 'storage') && (
                  <> You'll be able to choose your database and storage options.</>
                )}
              </p>
              <p className="manual-note">
                ⚠️ Note: The patch file must be manually applied to your local repository using <code>git apply</code>
              </p>
              <button onClick={() => setShowPortOptions(true)} disabled={loading} className="download-btn">
                Continue to Options
              </button>
            </div>
          )}

          {!result.isReady && !ported && isNonPortable(result) && (
            <div className="porting-section" style={{backgroundColor: '#fee', borderColor: '#d00'}}>
              <h3>❌ Application Cannot Be Automatically Ported</h3>
              <p style={{fontSize: '1.1em', fontWeight: 'bold', color: '#d00'}}>
                This application has fundamental incompatibilities that prevent automated porting.
              </p>
              <p>
                Based on the portability analysis above, this application requires a complete rebuild
                rather than automated porting. Please review the detailed recommendations in the blocking issues.
              </p>
              <p style={{fontWeight: 'bold', marginTop: '1em'}}>
                💡 <strong>Recommended Action:</strong> Build a new Azure-native application from scratch.
                This will be faster and produce better results than attempting to port.
              </p>
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
                  {loading ? 'Generating...' : 'Download Patch File'}
                </button>
              </div>

              <div className="patch-instructions">
                <p className="help-text">
                  📝 After downloading, you'll need to manually apply the patch to your local repository:
                </p>
                <code className="command-block">git apply {targetPlatform}-port.patch</code>
                <p className="help-text">
                  Then review the changes, commit, and push to your repository.
                </p>
              </div>
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
