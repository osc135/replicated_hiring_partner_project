import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';

interface Props {
  content: string;
  streaming?: boolean;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText(node: any): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node?.props?.children) return extractText(node.props.children);
  return '';
}

/* ---- Diff viewer: side-by-side before/after ---- */
interface DiffPair {
  before: string;
  after: string;
  file?: string;
}

function DiffLine({ text, type }: { text: string; type: 'remove' | 'add' }) {
  const isRemove = type === 'remove';
  return (
    <div className={`flex items-start ${isRemove ? 'bg-red-50/60' : 'bg-green-50/60'}`}>
      <span className={`select-none shrink-0 w-8 text-right pr-2 text-[11px] leading-5 ${isRemove ? 'text-red-300' : 'text-green-300'}`}>
        {isRemove ? '−' : '+'}
      </span>
      <span className={`flex-1 text-[12px] leading-5 font-mono px-2 ${isRemove ? 'text-red-700' : 'text-green-700'}`}>
        {text}
      </span>
    </div>
  );
}

function DiffViewer({ before, after, file }: DiffPair) {
  const [open, setOpen] = useState(false);
  const [copiedAfter, setCopiedAfter] = useState(false);

  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  return (
    <div className="my-4 rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header bar */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2 bg-gray-50/80 hover:bg-gray-100/80 transition-colors text-left border-b border-gray-100"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
        {file ? (
          <span className="text-xs font-mono text-gray-500 truncate">{file}</span>
        ) : (
          <span className="text-xs text-gray-500">View changes</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-red-400 font-medium">−{beforeLines.length}</span>
          <span className="text-[11px] text-green-500 font-medium">+{afterLines.length}</span>
        </div>
      </button>

      {open && (
        <div className="bg-white">
          {/* Unified diff view */}
          <div className="font-mono text-xs overflow-x-auto">
            {/* Removed lines */}
            {beforeLines.map((line, i) => (
              <DiffLine key={`r-${i}`} text={line} type="remove" />
            ))}
            {/* Separator */}
            <div className="border-t border-dashed border-gray-200" />
            {/* Added lines */}
            {afterLines.map((line, i) => (
              <DiffLine key={`a-${i}`} text={line} type="add" />
            ))}
          </div>

          {/* Footer with copy */}
          <div className="flex items-center justify-end px-3 py-1.5 border-t border-gray-100 bg-gray-50/50">
            <button
              onClick={() => {
                navigator.clipboard.writeText(after);
                setCopiedAfter(true);
                setTimeout(() => setCopiedAfter(false), 2000);
              }}
              className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
            >
              {copiedAfter ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              {copiedAfter ? 'Copied!' : 'Copy fix'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Extract before/after pairs from markdown ---- */
interface ContentSegment {
  type: 'markdown' | 'diff';
  content?: string;
  diff?: DiffPair;
}

function parseSegments(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  // Match consecutive before/after code blocks, optionally preceded by **File:** line
  const pattern = /(?:\*\*File:\*\*\s*`([^`]+)`\s*\n\s*)?```before\n([\s\S]*?)```\s*\n\s*```after\n([\s\S]*?)```/g;

  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    // Add markdown before this match
    if (match.index > lastIndex) {
      const md = text.slice(lastIndex, match.index).trim();
      if (md) segments.push({ type: 'markdown', content: md });
    }
    segments.push({
      type: 'diff',
      diff: {
        file: match[1] || undefined,
        before: match[2].trim(),
        after: match[3].trim(),
      },
    });
    lastIndex = match.index + match[0].length;
  }

  // Remaining markdown
  if (lastIndex < text.length) {
    const md = text.slice(lastIndex).trim();
    if (md) segments.push({ type: 'markdown', content: md });
  }

  return segments;
}

function cleanMarkdown(raw: string): string {
  let text = raw;

  // Strip SEVERITY line
  text = text.replace(/^SEVERITY:\s*(critical|warning|info)\s*\n*/i, '');

  // Force heading syntax on known section names that appear as plain lines.
  const h2Sections = [
    'Summary',
    'Findings',
    'Root Cause Analysis',
    'Root Cause',
    'Recommended Actions',
    'Recommendations',
    'Actions',
  ];
  for (const section of h2Sections) {
    const re = new RegExp(`^(?!#)(${section})\\s*$`, 'gmi');
    text = text.replace(re, `\n## $1\n`);
  }

  // Fix sub-headings for findings
  text = text.replace(
    /^(?!#)(?!\*\*)(?!-)([\w][\w\s/.-]{2,60})\s*$(?=\n\*?\*?Status\*?\*?:|\n- \*\*Status)/gm,
    '\n### $1'
  );

  // Ensure numbered lists use proper markdown
  text = text.replace(/\n(\d+\.\s)/g, '\n\n$1');

  // Clean up excessive blank lines
  text = text.replace(/\n{4,}/g, '\n\n\n');

  return text.trim();
}

/* ---- Confidence badge with hover tooltip ---- */
const confidenceConfig: Record<string, { color: string; bg: string; border: string; tooltip: string }> = {
  high: {
    color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200',
    tooltip: 'High — Confirmed by both the automated scanner and AI analysis. Two independent systems agree on this finding.',
  },
  medium: {
    color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200',
    tooltip: 'Medium — Identified by AI analysis only. No automated scanner rule matched this pattern. Based on log/state evidence.',
  },
  low: {
    color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200',
    tooltip: 'Low — Inferred from indirect evidence or the absence of expected data. May require manual verification.',
  },
};

function ConfidenceBadge({ level }: { level: string }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const key = level.toLowerCase().trim();
  const config = confidenceConfig[key];
  if (!config) return <span className="font-semibold text-gray-900">{level}</span>;

  return (
    <span className="relative inline-flex items-center gap-1">
      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${config.bg} ${config.color} ${config.border}`}>
        {level}
        <span
          className="cursor-help"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <HelpCircle className="h-3 w-3 opacity-60" />
        </span>
      </span>
      {showTooltip && (
        <span className="absolute bottom-full left-0 mb-2 w-64 px-3 py-2 text-xs text-gray-700 bg-white rounded-lg shadow-lg border border-gray-200 z-50 leading-relaxed">
          {config.tooltip}
        </span>
      )}
    </span>
  );
}

const markdownComponents = {
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-lg font-bold text-gray-900 mt-8 mb-3 pb-2 border-b border-gray-200 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <div className="mt-5 mb-3 flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
      <h3 className="text-base font-semibold text-gray-900">{children}</h3>
    </div>
  ),
  p: ({ children }: { children?: React.ReactNode }) => {
    // Detect confidence lines: "**Confidence**: High" or "- **Confidence**: Medium"
    const text = extractText(children);
    const confidenceMatch = text.match(/^-?\s*Confidence:?\s*(High|Medium|Low)\s*$/i);
    if (confidenceMatch) {
      return (
        <p className="text-sm text-gray-700 leading-relaxed mb-3 flex items-center gap-2">
          <strong className="font-semibold text-gray-900">Confidence:</strong>
          <ConfidenceBadge level={confidenceMatch[1]} />
        </p>
      );
    }
    return <p className="text-sm text-gray-700 leading-relaxed mb-3">{children}</p>;
  },
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return <code className={`${className} text-xs`}>{children}</code>;
    }
    return (
      <code className="text-xs font-mono bg-gray-100 text-red-700 px-1.5 py-0.5 rounded border border-gray-200">
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => {
    const textContent = extractText(children);
    return (
      <div className="relative group my-4">
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 pr-10 overflow-x-auto text-xs">
          {children}
        </pre>
        {textContent && <CopyButton text={textContent} />}
      </div>
    );
  },
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="space-y-1.5 my-3 ml-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="space-y-2 my-4 list-decimal list-inside ml-0 pl-0 marker:text-blue-600 marker:font-bold">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => {
    // Detect confidence in list items
    const text = extractText(children);
    const confidenceMatch = text.match(/Confidence:?\s*(High|Medium|Low)/i);
    if (confidenceMatch) {
      return (
        <li className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg px-4 py-3 border border-gray-100 flex items-center gap-2">
          <strong className="font-semibold text-gray-900">Confidence:</strong>
          <ConfidenceBadge level={confidenceMatch[1]} />
        </li>
      );
    }
    return (
      <li className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
        {children}
      </li>
    );
  },
};

export default function StreamingMarkdown({ content, streaming = false }: Props) {
  const cleaned = cleanMarkdown(content);

  // Parse segments: interleaved markdown and diff blocks
  const segments = useMemo(() => parseSegments(cleaned), [cleaned]);
  const hasDiffs = segments.some(s => s.type === 'diff');

  return (
    <div className="analysis-content">
      {hasDiffs ? (
        // Render with diff viewers inline
        segments.map((seg, i) =>
          seg.type === 'diff' && seg.diff ? (
            <DiffViewer key={i} {...seg.diff} />
          ) : (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {seg.content || ''}
            </ReactMarkdown>
          )
        )
      ) : (
        // No diffs, render normally
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {cleaned}
        </ReactMarkdown>
      )}
      {streaming && (
        <span className="inline-block w-2 h-5 bg-blue-500 animate-pulse rounded-sm ml-0.5 align-text-bottom" />
      )}
    </div>
  );
}
