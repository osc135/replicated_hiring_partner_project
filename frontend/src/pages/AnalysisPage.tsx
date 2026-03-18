import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  FileText,
  Search,
  Clock,
  ChevronDown,
  ChevronRight,
  Send,
  Bot,
  User,
} from 'lucide-react';
import {
  getAnalysis,
  getBundle,
  getChatHistory,
  sendChatMessage,
  parseSSEStream,
  type Analysis,
  type Bundle,
  type ChatMessage,
} from '../api';
import FindingCard from '../components/FindingCard';
import SeverityBanner from '../components/SeverityBanner';
import StreamingMarkdown from '../components/StreamingMarkdown';
import SimilarIncidents from '../components/SimilarIncidents';

export default function AnalysisPage() {
  const { bundleId } = useParams<{ bundleId: string }>();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ruleFindingsOpen, setRuleFindingsOpen] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
        // Load existing chat history
        if (analysisData?.id) {
          getChatHistory(analysisData.id)
            .then(setMessages)
            .catch(() => {});
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [bundleId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !analysis) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setStreaming(true);

    let assistantContent = '';
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await sendChatMessage(analysis.id, text);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: 'Chat request failed' }));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      cancelRef.current = parseSSEStream(
        reader,
        (event) => {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'token') {
              assistantContent += parsed.content || '';
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                return updated;
              });
            } else if (parsed.type === 'done') {
              setStreaming(false);
            }
          } catch {
            // ignore
          }
        },
        () => setStreaming(false),
        () => setStreaming(false),
      );
    } catch {
      setStreaming(false);
      setMessages(prev => prev.slice(0, -1));
    }
  }, [analysis, input, streaming]);

  useEffect(() => {
    return () => { cancelRef.current?.(); };
  }, []);

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
    <div className="flex flex-col h-full">
      {/* Scrollable content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 lg:px-8 py-6">
          {/* Header */}
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md px-3 py-1.5 mb-5 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </button>

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

          {/* Rule findings — collapsed by default */}
          {analysis.rule_findings?.findings && analysis.rule_findings.findings.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setRuleFindingsOpen(prev => !prev)}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                {ruleFindingsOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <Search className="h-3.5 w-3.5" />
                <span>{analysis.rule_findings.findings.length} rule findings</span>
                <span className="text-xs text-gray-400">
                  ({analysis.rule_findings.scanned_files}/{analysis.rule_findings.total_files} files)
                </span>
              </button>
              {ruleFindingsOpen && (
                <div className="mt-3 space-y-2">
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

          {/* AI Analysis — first "message" in the chat */}
          <div className="mt-6 flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center">
              <Bot className="h-4 w-4 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-gray-900">Bundle Analyzer</span>
                {formattedDate && (
                  <span className="text-xs text-gray-400">{formattedDate}</span>
                )}
              </div>
              <div className="bg-white rounded-xl rounded-tl-sm border border-gray-200 shadow-sm p-5">
                <StreamingMarkdown content={cleanedDiagnosis} />
              </div>
            </div>
          </div>

          {/* Similar incidents */}
          <SimilarIncidents analysisId={analysis.id} />

          {/* Chat messages */}
          {messages.map((msg, i) => (
            <div key={i} className="mt-4 flex gap-3">
              {msg.role === 'user' ? (
                <>
                  <div className="shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                    <User className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-gray-900 mb-2 block">You</span>
                    <div className="bg-blue-50 rounded-xl rounded-tl-sm border border-blue-100 px-4 py-3">
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="shrink-0 w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-gray-900 mb-2 block">Bundle Analyzer</span>
                    <div className="bg-white rounded-xl rounded-tl-sm border border-gray-200 shadow-sm p-5">
                      <StreamingMarkdown
                        content={msg.content}
                        streaming={streaming && i === messages.length - 1}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Bottom spacer */}
          <div className="h-4" />
        </div>
      </div>

      {/* Fixed chat input at bottom */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-6 lg:px-8 py-3">
        <div className="max-w-3xl mx-auto flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask a follow-up question about this analysis..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="shrink-0 p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
