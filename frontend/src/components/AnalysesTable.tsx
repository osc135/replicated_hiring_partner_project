import { useNavigate } from 'react-router-dom';
import { FileText, ChevronRight } from 'lucide-react';
import type { AnalysisHistoryItem } from '../api';

interface Props {
  analyses: AnalysisHistoryItem[];
}

const severityBadge: Record<string, string> = {
  critical: 'text-red-700 bg-red-50 border-red-200',
  warning: 'text-amber-700 bg-amber-50 border-amber-200',
  info: 'text-blue-700 bg-blue-50 border-blue-200',
};

export default function AnalysesTable({ analyses }: Props) {
  const navigate = useNavigate();

  if (analyses.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Past Analyses</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {analyses.map(a => {
          const totalFindings = a.finding_counts.critical + a.finding_counts.warning + a.finding_counts.info;
          return (
            <button
              key={a.analysis_id}
              onClick={() => navigate(`/analysis/${a.bundle_id}`)}
              className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors text-left group"
            >
              <FileText className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{a.filename}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(a.uploaded_at).toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {a.severity && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${severityBadge[a.severity] || severityBadge.info}`}>
                    {a.severity.toUpperCase()}
                  </span>
                )}
                {totalFindings > 0 && (
                  <span className="text-[10px] text-gray-400">{totalFindings} findings</span>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
