import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Loader2, Send, Bot, User } from 'lucide-react';
import {
  uploadBundle,
  parseSSEStream,
  sendChatMessage,
  type ChatMessage,
  type RuleFinding,
} from '../api';
import StreamingMarkdown from '../components/StreamingMarkdown';
import SeverityBanner from '../components/SeverityBanner';
import FindingCard from '../components/FindingCard';

type Phase = 'idle' | 'uploading' | 'analyzing' | 'chat';

export default function DashboardPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState('');
  const [severity, setSeverity] = useState<'critical' | 'warning' | 'info' | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [ruleFindings, setRuleFindings] = useState<RuleFinding[]>([]);
  const [analysisText, setAnalysisText] = useState('');

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [analysisStreaming, setAnalysisStreaming] = useState(false);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, analysisStreaming, chatStreaming, analysisText, ruleFindings, severity]);

  // Focus input when entering chat phase
  useEffect(() => {
    if (phase === 'chat' && !analysisStreaming) {
      inputRef.current?.focus();
    }
  }, [phase, analysisStreaming]);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.tar.gz') && !file.name.endsWith('.tgz')) {
      setUploadError('Please upload a .tar.gz or .tgz file');
      return;
    }

    setFileName(file.name);
    setPhase('uploading');
    setProgress('Uploading bundle...');
    setMessages([]);
    setSeverity(null);
    setAnalysisId(null);
    setUploadError(null);
    setRuleFindings([]);
    setAnalysisText('');

    try {
      const res = await uploadBundle(file);

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      setPhase('analyzing');
      setProgress('Analyzing bundle...');
      setAnalysisStreaming(true);

      let accumulatedAnalysis = '';
      let foundSeverity: string | null = null;

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
                const displayText = accumulatedAnalysis.replace(
                  /^SEVERITY:\s*(critical|warning|info)\s*\n*/i,
                  ''
                );
                setAnalysisText(displayText);
                if (!foundSeverity && accumulatedAnalysis.includes('\n')) {
                  const match = accumulatedAnalysis.match(/SEVERITY:\s*(critical|warning|info)/i);
                  if (match) {
                    foundSeverity = match[1].toLowerCase();
                    setSeverity(foundSeverity as 'critical' | 'warning' | 'info');
                  }
                }
                break;
              case 'done':
                setSeverity(prev => prev || parsed.severity || null);
                setAnalysisStreaming(false);
                setPhase('chat');
                // analysis_id comes directly in the done event
                if (parsed.analysis_id) {
                  setAnalysisId(parsed.analysis_id);
                }
                break;
              case 'error':
                setUploadError(parsed.content || 'Analysis failed');
                setAnalysisStreaming(false);
                break;
            }
          } catch {
            // ignore non-JSON
          }
        },
        () => {
          setAnalysisStreaming(false);
          setPhase('chat');
        },
        (err) => {
          setUploadError(err.message);
          setAnalysisStreaming(false);
        },
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      setPhase('idle');
    }
  };

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || chatStreaming || !analysisId) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setChatStreaming(true);

    let assistantContent = '';
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await sendChatMessage(analysisId, text);
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
              setChatStreaming(false);
            }
          } catch {
            // ignore
          }
        },
        () => setChatStreaming(false),
        () => setChatStreaming(false),
      );
    } catch {
      setChatStreaming(false);
      setMessages(prev => prev.slice(0, -1));
    }
  }, [analysisId, input, chatStreaming]);

  useEffect(() => {
    return () => { cancelRef.current?.(); };
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ---- IDLE: Upload drop zone ----
  if (phase === 'idle') {
    return (
      <div className="flex-1 overflow-auto p-6 lg:p-8">
        <div className="max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[60vh]">
          {uploadError && (
            <div className="w-full max-w-lg bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
              {uploadError}
            </div>
          )}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
      </div>
    );
  }

  // ---- UPLOADING: just a progress indicator ----
  if (phase === 'uploading') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700">{fileName}</p>
          <p className="text-xs text-gray-400 mt-1">{progress}</p>
        </div>
      </div>
    );
  }

  // ---- ANALYZING / CHAT: chat interface ----
  const isStreaming = analysisStreaming || chatStreaming;
  const showFirstBubble = ruleFindings.length > 0 || severity || analysisText;

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 lg:px-8 py-6">
          {/* File name header */}
          <div className="mb-4 text-center">
            <p className="text-xs text-gray-400">{fileName}</p>
          </div>

          {/* First chat bubble: the FULL analysis (severity + findings + diagnosis) */}
          {showFirstBubble && (
            <div className="mt-4 flex gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center">
                <Bot className="h-4 w-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-gray-900 mb-2 block">Bundle Analyzer</span>
                <div className="bg-white rounded-xl rounded-tl-sm border border-gray-200 shadow-sm p-5 space-y-4">
                  {/* Severity banner inside the bubble */}
                  {severity && <SeverityBanner severity={severity} />}

                  {/* Rule findings inside the bubble */}
                  {ruleFindings.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-2">
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

                  {/* AI diagnosis streaming inside the bubble */}
                  {analysisText && (
                    <StreamingMarkdown content={analysisText} streaming={analysisStreaming} />
                  )}

                  {/* Loading indicator while waiting for first tokens */}
                  {analysisStreaming && !analysisText && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {progress}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Suggested follow-up questions */}
          {phase === 'chat' && messages.length === 0 && analysisId && (
            <div className="mt-4 ml-11 flex flex-wrap gap-2">
              {[
                'What should I fix first?',
                'How do I resolve the image pull errors?',
                'Are there any other risks I should watch for?',
                'Can you walk me through the root cause?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInput(q);
                    // Auto-send after a tick so the input is set
                    setTimeout(() => {
                      inputRef.current?.focus();
                    }, 0);
                  }}
                  className="text-xs bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-600 hover:text-blue-700 rounded-full px-3 py-1.5 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Analyzing indicator before anything arrives */}
          {analysisStreaming && !showFirstBubble && (
            <div className="mt-4 flex gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center">
                <Bot className="h-4 w-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-gray-900 mb-2 block">Bundle Analyzer</span>
                <div className="bg-white rounded-xl rounded-tl-sm border border-gray-200 shadow-sm p-5">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {progress}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Follow-up chat messages */}
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
                        streaming={chatStreaming && i === messages.length - 1}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}

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
            placeholder={
              analysisStreaming
                ? 'Analyzing bundle...'
                : !analysisId
                  ? 'Waiting for analysis to finish...'
                  : 'Ask a follow-up question about this analysis...'
            }
            disabled={analysisStreaming || !analysisId}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || !analysisId}
            className="shrink-0 p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
