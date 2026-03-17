import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Upload, CheckCircle, AlertCircle, Loader2, Search } from 'lucide-react';
import { getBundles, uploadBundle, parseSSEStream, type Bundle, type RuleFinding } from '../api';
import SeverityBanner from '../components/SeverityBanner';
import StreamingMarkdown from '../components/StreamingMarkdown';

const severityBadge: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
};

const statusBadge: Record<string, string> = {
  processing: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

type UploadPhase = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error';

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function DashboardPage() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Upload state
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState('');
  const [ruleFindings, setRuleFindings] = useState<RuleFinding[]>([]);
  const [analysisText, setAnalysisText] = useState('');
  const [severity, setSeverity] = useState<'critical' | 'warning' | 'info' | null>(null);
  const [bundleId, setBundleId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBundles()
      .then(setBundles)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const refreshBundles = () => {
    getBundles().then(setBundles).catch(() => {});
  };

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.tar.gz') && !file.name.endsWith('.tgz')) {
      setUploadError('Please upload a .tar.gz or .tgz file');
      return;
    }

    setFileName(file.name);
    setPhase('uploading');
    setProgress('Uploading bundle...');
    setRuleFindings([]);
    setAnalysisText('');
    setSeverity(null);
    setBundleId(null);
    setUploadError(null);
    setStreaming(false);

    try {
      const res = await uploadBundle(file);

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }

      const headerBundleId = res.headers.get('X-Bundle-Id');
      if (headerBundleId) setBundleId(headerBundleId);

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      setPhase('analyzing');
      setProgress('Analyzing bundle...');
      setStreaming(true);

      let accumulatedAnalysis = '';

      cancelRef.current = parseSSEStream(
        reader,
        (event) => {
          try {
            const parsed = JSON.parse(event.data);
            switch (parsed.type) {
              case 'status':
                setProgress(parsed.content || 'Processing...');
                break;
              case 'rule_findings':
                if (parsed.content?.findings) {
                  setRuleFindings(parsed.content.findings.map((f: { rule: string; severity: string; description: string; file: string }) => ({
                    rule: f.rule,
                    severity: f.severity,
                    message: f.description,
                    file_path: f.file,
                  })));
                }
                break;
              case 'token':
                accumulatedAnalysis += parsed.content || '';
                setAnalysisText(accumulatedAnalysis);
                if (!severity && accumulatedAnalysis.includes('\n')) {
                  const match = accumulatedAnalysis.match(/SEVERITY:\s*(critical|warning|info)/i);
                  if (match) setSeverity(match[1].toLowerCase() as 'critical' | 'warning' | 'info');
                }
                break;
              case 'done':
                setSeverity(prev => prev || parsed.severity || null);
                setPhase('complete');
                setStreaming(false);
                refreshBundles();
                break;
              case 'error':
                setUploadError(parsed.content || 'Analysis failed');
                setPhase('error');
                setStreaming(false);
                break;
            }
          } catch {
            // ignore non-JSON
          }
        },
        () => {
          setPhase(prev => (prev === 'error' ? 'error' : 'complete'));
          setStreaming(false);
          refreshBundles();
        },
        (err) => {
          setUploadError(err.message);
          setPhase('error');
          setStreaming(false);
        },
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      setPhase('error');
    }
  };

  const resetUpload = () => {
    setPhase('idle');
    setFileName('');
    setRuleFindings([]);
    setAnalysisText('');
    setSeverity(null);
    setBundleId(null);
    setUploadError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const severityBadgeColor: Record<string, string> = {
    critical: 'text-red-600',
    warning: 'text-amber-600',
    info: 'text-blue-600',
  };

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* Upload drop zone — always visible when idle */}
      {phase === 'idle' && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-6 border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50'
          }`}
        >
          <Upload className={`h-8 w-8 mx-auto mb-2 ${dragOver ? 'text-blue-500' : 'text-gray-400'}`} />
          <p className="text-sm font-medium text-gray-700">
            Drop your <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">.tar.gz</span> support bundle here
          </p>
          <p className="text-xs text-gray-400 mt-1">or click to browse</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".tar.gz,.tgz"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {/* Active upload / analysis */}
      {phase !== 'idle' && (
        <div className="mb-8 space-y-4">
          {/* Status card */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{fileName}</p>
                <p className="text-xs text-gray-500 mt-0.5">{progress}</p>
              </div>
              {(phase === 'uploading' || phase === 'analyzing') && <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
              {phase === 'complete' && <CheckCircle className="h-5 w-5 text-green-500" />}
              {phase === 'error' && <AlertCircle className="h-5 w-5 text-red-500" />}
            </div>
            {(phase === 'uploading' || phase === 'analyzing') && (
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all duration-500 ${
                  phase === 'uploading' ? 'w-1/3 bg-blue-500' : 'w-2/3 bg-blue-500 animate-pulse'
                }`} />
              </div>
            )}
            {phase === 'complete' && (
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-green-500 w-full" />
              </div>
            )}
          </div>

          {/* Error */}
          {phase === 'error' && uploadError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {uploadError}
            </div>
          )}

          {/* Rule Findings */}
          {ruleFindings.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Rule Findings</h3>
              <div className="space-y-2">
                {ruleFindings.map((finding, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm border-l-2 pl-3 py-1 border-gray-200">
                    <span className={`font-medium shrink-0 ${severityBadgeColor[finding.severity] || 'text-gray-600'}`}>
                      [{finding.severity.toUpperCase()}]
                    </span>
                    <div className="min-w-0">
                      <span className="font-medium text-gray-800">{finding.rule}</span>
                      <span className="text-gray-600"> &mdash; {finding.message}</span>
                      {finding.file_path && (
                        <p className="text-xs text-gray-400 mt-0.5 font-mono">{finding.file_path}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Severity */}
          {severity && <SeverityBanner severity={severity} />}

          {/* Streaming Analysis */}
          {analysisText && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Analysis</h3>
              <StreamingMarkdown content={analysisText} streaming={streaming} />
            </div>
          )}

          {/* Actions */}
          {phase === 'complete' && (
            <div className="flex items-center gap-3">
              {bundleId && (
                <button
                  onClick={() => navigate(`/analysis/${bundleId}`)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                >
                  View Full Analysis
                </button>
              )}
              <button
                onClick={resetUpload}
                className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                Upload Another
              </button>
            </div>
          )}
          {phase === 'error' && (
            <button
              onClick={resetUpload}
              className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              Try Again
            </button>
          )}
        </div>
      )}

      {/* Past analyses table */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="animate-pulse p-4 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      ) : bundles.length > 0 ? (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Past Analyses
            <span className="ml-2 text-sm font-normal text-gray-400">
              {bundles.length} {bundles.length === 1 ? 'analysis' : 'analyses'}
            </span>
          </h2>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                    Filename
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                    Date
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                    Severity
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bundles.map(bundle => (
                  <tr
                    key={bundle.id}
                    onClick={() => {
                      if (bundle.status === 'completed') navigate(`/analysis/${bundle.id}`);
                    }}
                    className={`${
                      bundle.status === 'completed'
                        ? 'hover:bg-gray-50 hover:shadow-sm hover:-translate-y-px cursor-pointer'
                        : 'opacity-70'
                    } transition-all duration-150`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                        <span className="text-sm font-medium text-gray-900 truncate max-w-xs">
                          {bundle.filename}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500" title={new Date(bundle.uploaded_at).toLocaleString()}>
                      {relativeTime(bundle.uploaded_at)}
                    </td>
                    <td className="px-4 py-3">
                      {bundle.severity ? (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${severityBadge[bundle.severity] || severityBadge.info}`}>
                          {bundle.severity}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge[bundle.status] || ''}`}>
                        {bundle.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
            <Search className="h-7 w-7 text-gray-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">No analyses yet</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            Upload a Kubernetes support bundle above to get started. Your past analyses will appear here.
          </p>
        </div>
      )}
    </div>
  );
}
