import type { AnalysisHistoryItem } from '../api';

interface Props {
  analyses: AnalysisHistoryItem[];
}

const severityColor: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

const severityPercent: Record<string, number> = {
  critical: 100,
  warning: 66,
  info: 33,
};

export default function SeverityTrend({ analyses }: Props) {
  const recent = [...analyses].reverse().slice(-10);

  if (recent.length < 2) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Severity Trend</h3>
      <p className="text-[10px] text-gray-400 mb-4">Last {recent.length} analyses</p>

      {/* flex-1 stretches to fill whatever height the grid gives us */}
      <div className="flex items-end gap-1 flex-1 min-h-[100px]">
        {recent.map((a) => {
          const color = severityColor[a.severity] || severityColor.info;
          const pct = severityPercent[a.severity] ?? 33;
          const d = new Date(a.uploaded_at);
          const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

          return (
            <div key={a.analysis_id} className="flex-1 flex flex-col items-center gap-1.5 group relative h-full">
              <div className="w-full bg-gray-50 rounded-sm relative flex-1">
                <div
                  className="absolute bottom-0 left-0 w-full rounded-sm"
                  style={{ backgroundColor: color, height: `${pct}%` }}
                />
              </div>
              <span className="text-[9px] text-gray-400 whitespace-nowrap shrink-0">{date}</span>

              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 hidden group-hover:block z-10">
                <div className="bg-slate-800 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap">
                  {a.severity.toUpperCase()} &middot; {a.finding_counts.critical + a.finding_counts.warning + a.finding_counts.info} findings &middot; {time}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-4 text-[10px] text-gray-500 shrink-0">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Critical</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Warning</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Info</span>
      </div>
    </div>
  );
}
