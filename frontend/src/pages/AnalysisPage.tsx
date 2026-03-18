import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  FileText,
  Search,
  MessageSquare,
  Clock,
  ChevronDown,
  ChevronRight,
  X,
  Layers,
} from 'lucide-react';
import { getAnalysis, getBundle, type Analysis, type Bundle } from '../api';
import FindingCard from '../components/FindingCard';
import SeverityBanner from '../components/SeverityBanner';
import StreamingMarkdown from '../components/StreamingMarkdown';
import ChatSidebar from '../components/ChatSidebar';
import SimilarIncidents from '../components/SimilarIncidents';

export default function AnalysisPage() {
  const { bundleId } = useParams<{ bundleId: string }>();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ruleFindingsOpen, setRuleFindingsOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (!bundleId) return;
    setLoading(true);
    Promise.all([
      getAnalysis(bundleId),
      getBundle(bundleId),
    ])
      .then(([analysisData, bundleData]) => {
        setAnalysis(analysisData);
        setBundle(bundleData);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [bundleId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Analysis not found'}</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  // Strip the SEVERITY line from the diagnosis since it is already shown in the banner
  const cleanedDiagnosis = analysis.llm_diagnosis?.replace(
    /^SEVERITY:\s*(critical|warning|info)\s*\n*/i,
    ''
  );

  const formattedDate = analysis.created_at
    ? new Date(analysis.created_at).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="flex h-[calc(100vh-4rem)] lg:h-[calc(100vh-2rem)] -m-6 lg:-m-8">
      {/* Main content */}
      <div className="flex-[7] overflow-y-auto p-6 lg:p-8">
        {/* Breadcrumb / Back button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md px-3 py-1.5 mb-5 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        {/* Bundle filename + timestamp header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <FileText className="h-5 w-5 text-gray-500" />
            {bundle?.filename || 'Support Bundle'}
          </div>
          {formattedDate && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-1 ml-7">
              <Clock className="h-3.5 w-3.5" />
              Analyzed {formattedDate}
            </div>
          )}
        </div>

        {/* Severity banner */}
        <SeverityBanner severity={analysis.severity} />

        {/* Rule findings card */}
        {analysis.rule_findings?.findings && analysis.rule_findings.findings.length > 0 && (
          <div className="mt-6 bg-white rounded-lg border border-gray-200 shadow-sm">
            <button
              onClick={() => setRuleFindingsOpen(prev => !prev)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors rounded-t-lg"
            >
              <Search className="h-4 w-4 text-gray-500 shrink-0" />
              <h3 className="text-sm font-semibold text-gray-900 flex-1">
                Rule Findings
                <span className="ml-2 text-xs font-normal text-gray-500">
                  ({analysis.rule_findings.scanned_files}/{analysis.rule_findings.total_files} files scanned)
                </span>
              </h3>
              {ruleFindingsOpen ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400" />
              )}
            </button>
            {ruleFindingsOpen && (
              <div className="px-5 pb-5 space-y-2">
                {analysis.rule_findings.findings.map((finding, i) => (
                  <FindingCard
                    key={i}
                    rule={finding.rule}
                    severity={finding.severity}
                    message={finding.description}
                    file_path={finding.file}
                    matches={finding.matches}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Analysis card */}
        <div className="mt-6 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <FileText className="h-4 w-4 text-gray-500 shrink-0" />
            <h3 className="text-sm font-semibold text-gray-900">AI Analysis</h3>
          </div>
          <div className="p-6">
            <StreamingMarkdown content={cleanedDiagnosis} />
          </div>
        </div>

        {/* Similar incidents card */}
        <div className="mt-6 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <Layers className="h-4 w-4 text-gray-500 shrink-0" />
            <h3 className="text-sm font-semibold text-gray-900">Similar Incidents</h3>
          </div>
          <div className="p-5">
            <SimilarIncidents analysisId={analysis.id} />
          </div>
        </div>
      </div>

      {/* Desktop chat sidebar */}
      <div className="hidden lg:flex flex-[3] min-w-[280px] max-w-[400px]">
        <ChatSidebar analysisId={analysis.id} />
      </div>

      {/* Mobile chat floating button */}
      <button
        onClick={() => setChatOpen(true)}
        className="lg:hidden fixed bottom-6 right-6 z-40 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition-colors"
        aria-label="Open chat"
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      {/* Mobile chat overlay */}
      {chatOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setChatOpen(false)}
          />
          <div className="relative ml-auto w-full max-w-md h-full bg-white shadow-xl flex flex-col">
            <button
              onClick={() => setChatOpen(false)}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Close chat"
            >
              <X className="h-5 w-5" />
            </button>
            <ChatSidebar analysisId={analysis.id} />
          </div>
        </div>
      )}
    </div>
  );
}
