import { useState } from 'react';
import { ChevronDown, ChevronRight, FileCode, AlertCircle, AlertTriangle, Info } from 'lucide-react';

interface Match {
  line_number: number;
  line: string;
}

interface Props {
  rule: string;
  severity: string;
  message: string;
  file_path?: string;
  matches?: Match[];
}

const severityConfig: Record<string, { color: string; bg: string; border: string; Icon: typeof AlertCircle }> = {
  critical: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', Icon: AlertCircle },
  warning: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', Icon: AlertTriangle },
  info: { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', Icon: Info },
};

export default function FindingCard({ rule, severity, message, file_path, matches }: Props) {
  const [expanded, setExpanded] = useState(false);
  const config = severityConfig[severity] || severityConfig.info;
  const hasDetails = (matches && matches.length > 0) || file_path;

  return (
    <div className={`rounded-lg border ${config.border} ${config.bg} overflow-hidden`}>
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={`w-full flex items-start gap-3 px-4 py-3 text-left ${hasDetails ? 'cursor-pointer hover:brightness-95' : 'cursor-default'} transition-all`}
      >
        <config.Icon className={`h-4 w-4 ${config.color} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${config.color}`}>{rule}</span>
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${config.color} bg-white/60`}>
              {severity.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5">{message}</p>
        </div>
        {hasDetails && (
          <div className="shrink-0 mt-0.5">
            {expanded
              ? <ChevronDown className="h-4 w-4 text-gray-400" />
              : <ChevronRight className="h-4 w-4 text-gray-400" />
            }
          </div>
        )}
      </button>

      {expanded && hasDetails && (
        <div className="border-t border-gray-200/60 bg-white/40 px-4 py-3 space-y-2">
          {file_path && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <FileCode className="h-3.5 w-3.5 shrink-0" />
              <span className="font-mono">{file_path}</span>
            </div>
          )}
          {matches && matches.length > 0 && (
            <div className="space-y-1.5 mt-2">
              <p className="text-xs font-medium text-gray-500">Evidence:</p>
              {matches.map((match, i) => (
                <div key={i} className="flex items-start gap-2 text-xs font-mono bg-gray-900 text-gray-100 rounded-md px-3 py-2 overflow-x-auto">
                  <span className="text-gray-500 shrink-0 select-none">L{match.line_number}</span>
                  <span className="whitespace-pre-wrap break-all">{match.line}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
