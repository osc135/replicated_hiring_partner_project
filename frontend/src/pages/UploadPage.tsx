import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Upload, Loader2, Send, Bot, User, CheckCircle, Circle, ChevronDown, ChevronRight, AlertCircle, AlertTriangle, Info, X, FileText, HelpCircle } from 'lucide-react';
import {
  uploadBundle,
  parseSSEStream,
  sendChatMessage,
  type ChatMessage,
  type RuleFinding,
} from '../api';
import StreamingMarkdown from '../components/StreamingMarkdown';
import FindingCard from '../components/FindingCard';

type Phase = 'idle' | 'uploading' | 'analyzing' | 'chat';
type AnalysisStep = 'extracting' | 'scanning' | 'analyzing' | 'finalizing' | 'complete';

const STEP_ORDER: AnalysisStep[] = ['extracting', 'scanning', 'analyzing', 'finalizing', 'complete'];
const STEP_LABELS: Record<AnalysisStep, string> = {
  extracting: 'Extracting bundle',
  scanning: 'Scanning files',
  analyzing: 'Running AI analysis',
  finalizing: 'Finalizing',
  complete: 'Complete',
};

/* ---- Typing dots indicator ---- */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map(i => (
        <div key={i} className="typing-dot w-2 h-2 rounded-full bg-blue-400" />
      ))}
    </div>
  );
}

/* ---- Progress stepper with shimmer bar ---- */
function ProgressStepper({ currentStep, stepMessage }: {
  currentStep: AnalysisStep;
  stepMessage: string;
}) {
  const currentIndex = STEP_ORDER.indexOf(currentStep);
  const progressPercent = Math.min(((currentIndex + 1) / STEP_ORDER.length) * 100, 100);

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        {STEP_ORDER.filter(s => s !== 'complete').map((step, i) => {
          const isDone = currentIndex > i || currentStep === 'complete';
          const isActive = currentIndex === i && currentStep !== 'complete';
          const label = step === currentStep && stepMessage
            ? stepMessage
            : STEP_LABELS[step];
          return (
            <div key={step} className="flex items-center gap-2.5 text-sm animate-slide-up"
              style={{ animationDelay: `${i * 50}ms` }}>
              {isDone ? (
                <span className="animate-pop-in">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                </span>
              ) : isActive ? (
                <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-gray-300 shrink-0" />
              )}
              <span className={
                isDone ? 'text-gray-700' : isActive ? 'text-gray-900 font-medium' : 'text-gray-400'
              }>
                {label}
              </span>
            </div>
          );
        })}
      </div>
      {/* Shimmer progress bar */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out animate-shimmer"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

/* ---- Bot avatar (glows when active) ---- */
function BotAvatar({ active = false }: { active?: boolean }) {
  return (
    <div className={`shrink-0 w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center ${
      active ? 'animate-pulse-glow' : ''
    }`}>
      <Bot className="h-4 w-4 text-blue-400" />
    </div>
  );
}

/* ---- Glass-style bot bubble wrapper ---- */
function BotBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gradient-to-br from-white to-slate-50/80 backdrop-blur-sm rounded-xl rounded-tl-sm border border-gray-200/60 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5">
      {children}
    </div>
  );
}

/* ---- Compact severity chip (inline, not a huge banner) ---- */
const severityStyles = {
  critical: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', Icon: AlertCircle },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', Icon: AlertTriangle },
  info: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', Icon: Info },
};

/* ---- Findings count tooltip ---- */
function FindingsTooltip({ issueCount, totalMatches }: { issueCount: number; totalMatches: number }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex">
      <span
        className="cursor-help text-gray-400 hover:text-gray-500 transition-colors"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        <HelpCircle className="h-3 w-3" />
      </span>
      {show && (
        <span className="absolute top-full right-0 mt-2 w-72 px-3 py-2.5 text-xs text-gray-700 bg-white rounded-lg shadow-lg border border-gray-200 z-50 leading-relaxed">
          <span className="font-semibold text-gray-900">How findings are counted</span>
          <br />
          The scanner detected <span className="font-medium">{totalMatches} matches</span> across multiple files.
          These are grouped into <span className="font-medium">{issueCount} distinct issue{issueCount !== 1 ? 's' : ''}</span> by
          rule type (e.g. all CrashLoopBackOff matches count as one issue).
          The AI analysis discusses each unique issue, not every individual file match.
        </span>
      )}
    </span>
  );
}

/* ---- Analysis bubble: compact severity + collapsible findings + streaming text ---- */
function AnalysisBubble({ severity, ruleFindings, analysisText, analysisStreaming }: {
  severity: 'critical' | 'warning' | 'info' | null;
  ruleFindings: RuleFinding[];
  analysisText: string;
  analysisStreaming: boolean;
}) {
  const [findingsOpen, setFindingsOpen] = useState(false);

  // Group findings by rule name to avoid duplicates
  const grouped = ruleFindings.reduce<Record<string, { finding: RuleFinding; count: number }>>((acc, f) => {
    const key = `${f.rule}-${f.severity}`;
    if (acc[key]) {
      acc[key].count++;
    } else {
      acc[key] = { finding: f, count: 1 };
    }
    return acc;
  }, {});
  const uniqueFindings = Object.values(grouped);

  // Count unique issues (by rule name) vs total file matches
  const uniqueRules = [...new Set(ruleFindings.map(f => f.rule))];
  const issueCount = uniqueRules.length;
  const totalMatches = ruleFindings.length;

  // Count by severity (unique rules)
  const criticalCount = [...new Set(ruleFindings.filter(f => f.severity === 'critical').map(f => f.rule))].length;
  const warningCount = [...new Set(ruleFindings.filter(f => f.severity === 'warning').map(f => f.rule))].length;
  const infoCount = [...new Set(ruleFindings.filter(f => f.severity === 'info').map(f => f.rule))].length;

  const sev = severity ? severityStyles[severity] : null;

  // Extract the first recommended action once analysis is done
  const nextStep = (() => {
    if (analysisStreaming || !analysisText) return null;
    // Look for Recommended Actions / Recommendations section
    const actionsMatch = analysisText.match(/##\s*(?:Recommended Actions|Recommendations|Actions)\s*\n([\s\S]*?)(?=\n##\s|\n$|$)/i);
    if (!actionsMatch) return null;
    // Get the first list item or meaningful line, strip markdown syntax
    const lines = actionsMatch[1].trim().split('\n').filter(l => l.trim());
    const first = lines[0]
      ?.replace(/^#{1,4}\s*/, '')       // strip heading markers
      .replace(/^[-*•\d.)\s]+/, '')     // strip list markers
      .replace(/\*\*/g, '')             // strip bold
      .replace(/`/g, '')               // strip inline code
      .trim();
    return first || null;
  })();

  return (
    <div className="mt-4 flex gap-3 animate-fade-in-up">
      <BotAvatar active={analysisStreaming} />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-gray-900 mb-2 block">Bundle Analyzer</span>
        <BotBubble>
          <div className="space-y-3">
            {/* Compact severity + findings summary -- single row */}
            {(severity || ruleFindings.length > 0) && (
              <div className="flex items-center gap-2 flex-wrap">
                {sev && (
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${sev.bg} ${sev.text} ${sev.border} ${severity === 'critical' ? 'animate-shake' : 'animate-slide-in-left'}`}>
                    <sev.Icon className="h-3 w-3" />
                    {severity!.toUpperCase()}
                  </span>
                )}
                {ruleFindings.length > 0 && (
                  <div className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                    <button
                      onClick={() => setFindingsOpen(!findingsOpen)}
                      className="inline-flex items-center gap-1.5 hover:text-gray-700 transition-colors"
                    >
                      {findingsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      <span>{issueCount} issue{issueCount !== 1 ? 's' : ''}</span>
                      <span className="text-gray-400">({totalMatches} across files)</span>
                      <span className="text-gray-400">&mdash;</span>
                      {criticalCount > 0 && <span className="text-red-600 font-medium">{criticalCount} critical</span>}
                      {criticalCount > 0 && (warningCount > 0 || infoCount > 0) && <span className="text-gray-300">/</span>}
                      {warningCount > 0 && <span className="text-amber-600 font-medium">{warningCount} warning</span>}
                      {warningCount > 0 && infoCount > 0 && <span className="text-gray-300">/</span>}
                      {infoCount > 0 && <span className="text-blue-600 font-medium">{infoCount} info</span>}
                    </button>
                    <FindingsTooltip issueCount={issueCount} totalMatches={totalMatches} />
                  </div>
                )}
              </div>
            )}

            {/* Expandable findings list */}
            {findingsOpen && uniqueFindings.length > 0 && (
              <div className="space-y-1.5 animate-slide-up">
                {uniqueFindings.map(({ finding, count }, i) => (
                  <FindingCard
                    key={i}
                    rule={count > 1 ? `${finding.rule} (x${count})` : finding.rule}
                    severity={finding.severity}
                    message={finding.message}
                    file_path={finding.file_path}
                    matches={finding.matches}
                  />
                ))}
              </div>
            )}

            {/* Streaming AI diagnosis */}
            {analysisText && (
              <StreamingMarkdown content={analysisText} streaming={analysisStreaming} />
            )}

            {/* Typing dots while waiting for tokens */}
            {analysisStreaming && !analysisText && (
              <TypingDots />
            )}

            {/* Next step card — appears after streaming completes */}
            {nextStep && (
              <div className="mt-4 rounded-lg px-4 py-3 bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 animate-fade-in-up">
                <span className="font-semibold">First step:</span> {nextStep}
              </div>
            )}
          </div>
        </BotBubble>
      </div>
    </div>
  );
}

/* ---- Collapsible sources list ---- */
function SourcesToggle({ files }: { files: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="animate-chip-in" style={{ animationDelay: '320ms' }}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        <FileText className="h-3 w-3" />
        {files.length} file{files.length !== 1 ? 's' : ''} analyzed
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-1.5 pl-4 space-y-0.5 animate-slide-up">
          {files.map(f => (
            <p key={f} className="text-xs text-gray-400 font-mono truncate" title={f}>
              {f}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function UploadPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [severity, setSeverity] = useState<'critical' | 'warning' | 'info' | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [ruleFindings, setRuleFindings] = useState<RuleFinding[]>([]);
  const [analysisText, setAnalysisText] = useState('');
  const [currentStep, setCurrentStep] = useState<AnalysisStep | null>(null);
  const [stepMessage, setStepMessage] = useState('');

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [analysisStreaming, setAnalysisStreaming] = useState(false);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isWorking = phase === 'uploading' || analysisStreaming;

  // Handle file passed from dashboard via navigation state
  const hasHandledNavFile = useRef(false);
  useEffect(() => {
    const navState = location.state as { file?: File } | null;
    if (navState?.file && !hasHandledNavFile.current) {
      hasHandledNavFile.current = true;
      // Clear the state so refresh doesn't re-trigger
      window.history.replaceState({}, '');
      handleFile(navState.file);
    }
  }, [location.state]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, analysisStreaming, chatStreaming, analysisText, ruleFindings, severity, currentStep]);

  // Focus input when entering chat phase
  useEffect(() => {
    if (phase === 'chat' && !analysisStreaming) {
      inputRef.current?.focus();
    }
  }, [phase, analysisStreaming]);

  // Auto-grow textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const resetForNewAnalysis = () => {
    setPhase('idle');
    setFileName('');
    setFileSize(null);
    setSeverity(null);
    setAnalysisId(null);
    setUploadError(null);
    setRuleFindings([]);
    setAnalysisText('');
    setCurrentStep(null);
    setStepMessage('');
    setMessages([]);
    setAnalysisStreaming(false);
    setChatStreaming(false);
    setInput('');
  };

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.tar.gz') && !file.name.endsWith('.tgz')) {
      setUploadError('Please upload a .tar.gz or .tgz file');
      return;
    }

    setFileName(file.name);
    setFileSize(file.size);
    setPhase('uploading');
    setMessages([]);
    setSeverity(null);
    setAnalysisId(null);
    setUploadError(null);
    setRuleFindings([]);
    setAnalysisText('');
    setCurrentStep(null);
    setStepMessage('');

    try {
      const res = await uploadBundle(file);

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      setPhase('analyzing');
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
                if (parsed.step) {
                  setCurrentStep(parsed.step as AnalysisStep);
                  setStepMessage(parsed.message || '');
                }
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
                setCurrentStep('complete');
                if (parsed.analysis_id) {
                  setAnalysisId(parsed.analysis_id);
                }
                break;
              case 'error':
                setUploadError(parsed.content || 'Analysis failed');
                setAnalysisStreaming(false);
                setPhase('idle');
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
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';
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

  // ---- IDLE: Drop zone ----
  if (phase === 'idle') {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center p-6 lg:p-8"
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
      >
        <div className="max-w-lg w-full text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">New Analysis</h1>
          <p className="text-sm text-gray-400 mb-8">Upload a Kubernetes support bundle to analyze</p>

          {uploadError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4 animate-fade-in-up">
              {uploadError}
            </div>
          )}

          <div
            onClick={() => fileInputRef.current?.click()}
            className={`w-full border-2 border-dashed rounded-2xl p-16 cursor-pointer transition-all duration-200 ${
              dragOver
                ? 'border-blue-500 bg-blue-50 scale-[1.02] shadow-lg shadow-blue-100'
                : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50 hover:shadow-md'
            }`}
          >
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 transition-colors ${
              dragOver ? 'bg-blue-100' : 'bg-gray-100'
            }`}>
              <Upload className={`h-8 w-8 transition-colors ${dragOver ? 'text-blue-500' : 'text-gray-400'}`} />
            </div>
            <p className="text-lg font-medium text-gray-700">
              {dragOver ? 'Drop it here' : 'Drop your support bundle here'}
            </p>
            <p className="text-sm text-gray-400 mt-2">
              <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">.tar.gz</span> or{' '}
              <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">.tgz</span>
            </p>
            <p className="text-sm text-blue-600 font-medium mt-4">or click to browse files</p>
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
        </div>
      </div>
    );
  }

  // ---- UPLOADING / ANALYZING / CHAT ----
  const isStreaming = analysisStreaming || chatStreaming;
  const showAnalysis = ruleFindings.length > 0 || severity || analysisText;
  const showStepper = currentStep && currentStep !== 'complete' && !analysisText;

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 lg:px-8 py-6">
          {/* File name header with size + cancel */}
          <div className="mb-4 flex items-center justify-center gap-3">
            <p className="text-xs text-gray-400">
              {fileName}
              {fileSize != null && (
                <span className="ml-1.5 text-gray-300">
                  · {fileSize < 1024 * 1024
                    ? `${(fileSize / 1024).toFixed(0)} KB`
                    : `${(fileSize / (1024 * 1024)).toFixed(1)} MB`}
                </span>
              )}
            </p>
            {(phase === 'uploading' || (phase === 'analyzing' && analysisStreaming)) && (
              <button
                onClick={() => {
                  cancelRef.current?.();
                  resetForNewAnalysis();
                }}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Cancel analysis"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Uploading state */}
          {phase === 'uploading' && (
            <div className="mt-4 flex gap-3 animate-fade-in-up">
              <BotAvatar active />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-gray-900 mb-2 block">Bundle Analyzer</span>
                <BotBubble>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
                    Uploading bundle...
                  </div>
                </BotBubble>
              </div>
            </div>
          )}

          {/* Progress stepper (shown before tokens arrive) */}
          {showStepper && (
            <div className="mt-4 flex gap-3 animate-fade-in-up">
              <BotAvatar active />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-gray-900 mb-2 block">Bundle Analyzer</span>
                <BotBubble>
                  <ProgressStepper currentStep={currentStep} stepMessage={stepMessage} />
                </BotBubble>
              </div>
            </div>
          )}

          {/* Analysis chat bubble */}
          {showAnalysis && !showStepper && (
            <AnalysisBubble
              severity={severity}
              ruleFindings={ruleFindings}
              analysisText={analysisText}
              analysisStreaming={analysisStreaming}
            />
          )}

          {/* Contextual follow-up suggestions + sources */}
          {phase === 'chat' && messages.length === 0 && analysisId && (
            <div className="mt-4 ml-11 space-y-3">
              {/* Suggested questions based on actual findings */}
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const questions: string[] = ['What should I fix first?'];
                  const rules = ruleFindings.map(f => f.rule);
                  if (rules.some(r => /CrashLoopBackOff/i.test(r)))
                    questions.push('Why is the pod crash looping and how do I fix it?');
                  if (rules.some(r => /ImagePullBackOff|ErrImagePull/i.test(r)))
                    questions.push('How do I resolve the image pull errors?');
                  if (rules.some(r => /OOMKilled/i.test(r)))
                    questions.push('What memory limits should I set to prevent OOMKill?');
                  if (rules.some(r => /NodeNotReady/i.test(r)))
                    questions.push('Why is the node not ready?');
                  if (rules.some(r => /FailedScheduling/i.test(r)))
                    questions.push('Why are pods failing to schedule?');
                  if (questions.length < 3)
                    questions.push('Are there any other risks I should watch for?');
                  if (questions.length < 4)
                    questions.push('Can you walk me through the root cause?');
                  return questions.slice(0, 4).map((q, i) => (
                    <button
                      key={q}
                      onClick={() => {
                        setInput(q);
                        setTimeout(() => { inputRef.current?.focus(); }, 0);
                      }}
                      className="animate-chip-in text-xs bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-600 hover:text-blue-700 rounded-full px-3 py-1.5 transition-colors shadow-sm hover:shadow"
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      {q}
                    </button>
                  ));
                })()}
              </div>

              {/* Files analyzed toggle */}
              {ruleFindings.length > 0 && (() => {
                const files = [...new Set(ruleFindings.map(f => f.file_path).filter(Boolean))];
                if (files.length === 0) return null;
                return (
                  <SourcesToggle files={files as string[]} />
                );
              })()}
            </div>
          )}

          {/* Follow-up chat messages */}
          {messages.map((msg, i) => (
            <div key={i} className="mt-4 flex gap-3 animate-fade-in-up">
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
                  <BotAvatar active={chatStreaming && i === messages.length - 1} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-gray-900 mb-2 block">Bundle Analyzer</span>
                    <BotBubble>
                      {msg.content ? (
                        <StreamingMarkdown
                          content={msg.content}
                          streaming={chatStreaming && i === messages.length - 1}
                        />
                      ) : (
                        <TypingDots />
                      )}
                    </BotBubble>
                  </div>
                </>
              )}
            </div>
          ))}

          <div className="h-4" />
        </div>
      </div>

      {/* Fixed chat input at bottom */}
      <div className="shrink-0 border-t border-gray-200 bg-white/80 backdrop-blur-sm px-6 lg:px-8 py-3">
        <div className="max-w-3xl mx-auto flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              isWorking
                ? 'Analyzing bundle...'
                : !analysisId
                  ? 'Waiting for analysis to finish...'
                  : 'Ask a follow-up question about this analysis...'
            }
            disabled={isWorking || !analysisId}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm transition-shadow duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 focus:shadow-[0_0_0_4px_rgba(59,130,246,0.1)] placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
          />
          <div className="flex items-center gap-2">
            {phase === 'chat' && (
              <button
                onClick={resetForNewAnalysis}
                className="shrink-0 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors"
              >
                New
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming || !analysisId}
              className="shrink-0 p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-md active:scale-95"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
        {phase === 'chat' && (
          <div className="max-w-3xl mx-auto mt-2 flex justify-center">
            <button
              onClick={() => navigate('/dashboard')}
              className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
