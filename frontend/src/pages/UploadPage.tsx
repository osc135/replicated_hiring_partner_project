import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import FileDropZone from '../components/FileDropZone';
import SeverityBanner from '../components/SeverityBanner';
import StreamingMarkdown from '../components/StreamingMarkdown';
import { uploadBundle, parseSSEStream, type RuleFinding } from '../api';

type Phase = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error';

export default function UploadPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState('');
  const [ruleFindings, setRuleFindings] = useState<RuleFinding[]>([]);
  const [analysisText, setAnalysisText] = useState('');
  const [severity, setSeverity] = useState<'critical' | 'warning' | 'info' | null>(null);
  const [bundleId, setBundleId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const navigate = useNavigate();

  const handleFileSelected = async (file: File) => {
    setFileName(file.name);
    setPhase('uploading');
    setProgress('Uploading bundle...');
    setRuleFindings([]);
    setAnalysisText('');
    setSeverity(null);
    setBundleId(null);
    setErrorMsg(null);
    setStreaming(false);

    try {
      const res = await uploadBundle(file);

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }

      // Capture bundle ID from response header
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
                // Backend sends all findings at once as an array
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
                // Extract severity from the first line if present
                if (!severity && accumulatedAnalysis.includes('\n')) {
                  const match = accumulatedAnalysis.match(/SEVERITY:\s*(critical|warning|info)/i);
                  if (match) setSeverity(match[1].toLowerCase() as 'critical' | 'warning' | 'info');
                }
                break;

              case 'done':
                setSeverity(prev => prev || parsed.severity || null);
                setPhase('complete');
                setStreaming(false);
                break;

              case 'error':
                setErrorMsg(parsed.content || 'Analysis failed');
                setPhase('error');
                setStreaming(false);
                break;
            }
          } catch {
            // Non-JSON SSE data; ignore
          }
        },
        () => {
          setPhase(prev => (prev === 'error' ? 'error' : 'complete'));
          setStreaming(false);
        },
        (err) => {
          setErrorMsg(err.message);
          setPhase('error');
          setStreaming(false);
        },
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
      setPhase('error');
    }
  };

  const severityBadgeColor: Record<string, string> = {
    critical: 'text-red-600',
    warning: 'text-amber-600',
    info: 'text-blue-600',
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Upload Support Bundle</h1>

      {/* Drop zone - only show in idle state */}
      {phase === 'idle' && (
        <FileDropZone onFileSelected={handleFileSelected} />
      )}

      {/* Progress / Active state */}
      {phase !== 'idle' && (
        <div className="space-y-6">
          {/* File info + status */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{fileName}</p>
                <p className="text-xs text-gray-500 mt-0.5">{progress}</p>
              </div>
              {phase === 'uploading' && <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
              {phase === 'analyzing' && <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
              {phase === 'complete' && <CheckCircle className="h-5 w-5 text-green-500" />}
              {phase === 'error' && <AlertCircle className="h-5 w-5 text-red-500" />}
            </div>

            {/* Upload progress bar */}
            {(phase === 'uploading' || phase === 'analyzing') && (
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    phase === 'uploading' ? 'w-1/3 bg-blue-500' : 'w-2/3 bg-blue-500 animate-pulse'
                  }`}
                />
              </div>
            )}
            {phase === 'complete' && (
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-green-500 w-full" />
              </div>
            )}
          </div>

          {/* Error */}
          {phase === 'error' && errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {errorMsg}
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

          {/* Severity banner */}
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
                onClick={() => {
                  setPhase('idle');
                  setFileName('');
                  setRuleFindings([]);
                  setAnalysisText('');
                  setSeverity(null);
                  setBundleId(null);
                  setErrorMsg(null);
                }}
                className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                Upload Another
              </button>
            </div>
          )}

          {phase === 'error' && (
            <button
              onClick={() => {
                setPhase('idle');
                setErrorMsg(null);
              }}
              className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              Try Again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
