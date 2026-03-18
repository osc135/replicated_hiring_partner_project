import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  streaming?: boolean;
}

function cleanMarkdown(raw: string): string {
  let text = raw;

  // Strip SEVERITY line
  text = text.replace(/^SEVERITY:\s*(critical|warning|info)\s*\n*/i, '');

  // Force heading syntax on known section names that appear as plain lines.
  // Must be at start of line, not already prefixed with #
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
    // Match the section name alone on a line (case insensitive) without # prefix
    const re = new RegExp(`^(?!#)(${section})\\s*$`, 'gmi');
    text = text.replace(re, `\n## $1\n`);
  }

  // Fix sub-headings for findings: a line that is a known K8s error pattern
  // or a short title-like line (no colon, no bold markers) followed by a **Status** line
  text = text.replace(
    /^(?!#)(?!\*\*)(?!-)([\w][\w\s/.-]{2,60})\s*$(?=\n\*?\*?Status\*?\*?:|\n- \*\*Status)/gm,
    '\n### $1'
  );

  // Ensure numbered lists use proper markdown (some LLMs output "1. **Bold**: text")
  // This is already valid markdown, just make sure there's spacing
  text = text.replace(/\n(\d+\.\s)/g, '\n\n$1');

  // Clean up excessive blank lines
  text = text.replace(/\n{4,}/g, '\n\n\n');

  return text.trim();
}

export default function StreamingMarkdown({ content, streaming = false }: Props) {
  const cleaned = cleanMarkdown(content);

  return (
    <div className="analysis-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-gray-900 mt-8 mb-3 pb-2 border-b border-gray-200 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <div className="mt-5 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              <h3 className="text-base font-semibold text-gray-900">{children}</h3>
            </div>
          ),
          p: ({ children }) => (
            <p className="text-sm text-gray-700 leading-relaxed mb-3">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-gray-900">{children}</strong>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-');
            if (isBlock) {
              return (
                <code className={`${className} text-xs`}>{children}</code>
              );
            }
            return (
              <code className="text-xs font-mono bg-gray-100 text-red-700 px-1.5 py-0.5 rounded border border-gray-200">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-xs my-4">
              {children}
            </pre>
          ),
          ul: ({ children }) => (
            <ul className="space-y-1.5 my-3 ml-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="space-y-2 my-4 list-decimal list-inside ml-0 pl-0 marker:text-blue-600 marker:font-bold">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
              {children}
            </li>
          ),
        }}
      >
        {cleaned}
      </ReactMarkdown>
      {streaming && (
        <span className="inline-block w-2 h-5 bg-blue-500 animate-pulse rounded-sm ml-0.5 align-text-bottom" />
      )}
    </div>
  );
}
