import type { AnalysisHistoryItem } from '../api';

interface Props {
  analyses: AnalysisHistoryItem[];
}

const severityColor: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

const severityHeight: Record<string, string> = {
  critical: 'h-full',
  warning: 'h-2/3',
  info: 'h-1/3',
};

export default function SeverityTrend({ analyses }: Props) {
  // Show last 10, oldest first (left to right)
  const recent = [...analyses].reverse().slice(-10);

  if (recent.length < 2) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Severity Trend</h3>
      <p className="text-[10px] text-gray-400 mb-3">Last {recent.length} analyses</p>

      <div className="flex items-end gap-2 h-16">
        {recent.map((a) => {
          const color = severityColor[a.severity] || severityColor.info;
          const height = severityHeight[a.severity] || severityHeight.info;
          const date = new Date(a.uploaded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

          return (
            <div key={a.analysis_id} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div className="w-full max-w-[32px] bg-gray-50 rounded-sm h-16 flex items-end">
                <div
                  className={`w-full rounded-sm transition-all ${height}`}
                  style={{ backgroundColor: color }}
                />
              </div>
              <span className="text-[9px] text-gray-400 truncate max-w-full">{date}</span>

              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 hidden group-hover:block z-10">
                <div className="bg-slate-800 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap">
                  {a.severity.toUpperCase()} &middot; {a.finding_counts.critical + a.finding_counts.warning + a.finding_counts.info} findings
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Critical</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Warning</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Info</span>
      </div>
    </div>
  );
}
