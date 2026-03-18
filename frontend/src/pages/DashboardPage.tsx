import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { uploadBundle, parseSSEStream, type RuleFinding } from '../api';
import FindingCard from '../components/FindingCard';
import SeverityBanner from '../components/SeverityBanner';
import StreamingMarkdown from '../components/StreamingMarkdown';

type UploadPhase = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error';

export default function DashboardPage() {
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
                  setRuleFindings(parsed.content.findings.map((f: { rule: string; severity: string; description: string; file: string; matches?: Array<{ line_number: number; line: string }> }) => ({
                    rule: f.rule,
                    severity: f.severity,
                    message: f.description,
                    file_path: f.file,
                    matches: f.matches,
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
                // Auto-navigate to analysis page
                setBundleId(prev => {
                  const id = prev;
                  if (id) {
                    setTimeout(() => navigate(`/analysis/${id}`), 1500);
                  }
                  return prev;
                });
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

  return (
    <div className="max-w-4xl mx-auto">
      {/* Upload drop zone — shown when idle */}
      {phase === 'idle' && (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
              dragOver
                ? 'border-blue-500 bg-blue-50 scale-[1.02]'
                : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50'
            }`}
          >
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 ${
              dragOver ? 'bg-blue-100' : 'bg-gray-100'
            }`}>
              <Upload className={`h-8 w-8 ${dragOver ? 'text-blue-500' : 'text-gray-400'}`} />
            </div>
            <p className="text-base font-medium text-gray-700">
              Drop your support bundle here
            </p>
            <p className="text-sm text-gray-400 mt-1.5">
              <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">.tar.gz</span> or <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">.tgz</span> files
            </p>
            <p className="text-xs text-gray-400 mt-3">or click to browse</p>
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
          <p className="text-xs text-gray-400 mt-6">
            Past analyses are available in the sidebar
          </p>
        </div>
      )}

      {/* Active upload / analysis */}
      {phase !== 'idle' && (
        <div className="space-y-4">
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
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Rule Findings
                <span className="ml-2 text-xs font-normal text-gray-400">click to expand</span>
              </h3>
              <div className="space-y-2">
                {ruleFindings.map((finding, i) => (
                  <FindingCard
                    key={i}
                    rule={finding.rule}
                    severity={finding.severity}
                    message={finding.message}
                    file_path={finding.file_path}
                    matches={finding.matches}
                  />
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
    </div>
  );
}
