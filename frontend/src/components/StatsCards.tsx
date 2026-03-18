import { Box, CheckCircle, AlertCircle, Server } from 'lucide-react';
import type { ClusterData } from '../api';

interface Props {
  summary: ClusterData['summary'];
  findingCounts: { critical: number; warning: number; info: number };
}

export default function StatsCards({ summary, findingCounts }: Props) {
  const cards = [
    { label: 'Total Pods', value: summary.total_pods, icon: Box, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Healthy', value: summary.healthy_pods, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Unhealthy', value: summary.unhealthy_pods, icon: AlertCircle,
      color: summary.unhealthy_pods > 0 ? 'text-red-600' : 'text-gray-400',
      bg: summary.unhealthy_pods > 0 ? 'bg-red-50' : 'bg-gray-50' },
    { label: 'Nodes', value: summary.node_count, icon: Server, color: 'text-slate-600', bg: 'bg-slate-50' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Overview</h3>
      <div className="grid grid-cols-2 gap-3">
        {cards.map(card => (
          <div key={card.label} className="flex items-center gap-2.5">
            <div className={`${card.bg} p-1.5 rounded-lg`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 leading-none">{card.value}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{card.label}</p>
            </div>
          </div>
        ))}
      </div>
      {/* Rule findings */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="text-[10px] text-gray-400 mb-1.5">Rule Findings</p>
        <div className="flex items-center gap-2">
          {findingCounts.critical > 0 && (
            <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{findingCounts.critical} critical</span>
          )}
          {findingCounts.warning > 0 && (
            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{findingCounts.warning} warning</span>
          )}
          {findingCounts.info > 0 && (
            <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{findingCounts.info} info</span>
          )}
          {findingCounts.critical + findingCounts.warning + findingCounts.info === 0 && (
            <span className="text-[10px] text-gray-400">None</span>
          )}
        </div>
      </div>
    </div>
  );
}
