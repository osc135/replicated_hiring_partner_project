import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { ClusterPod } from '../api';

interface Finding {
  rule: string;
  severity: string;
  description: string;
}

interface Props {
  findings: Finding[];
  pods: ClusterPod[];
}

const severityConfig: Record<string, { Icon: typeof AlertCircle; color: string; bg: string; border: string }> = {
  critical: { Icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  warning: { Icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  info: { Icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
};

export default function TopIssues({ findings, pods }: Props) {
  // Count pods affected by each issue type
  const ERROR_STATUSES = new Set([
    'CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull',
    'RunContainerError', 'OOMKilled', 'Error', 'Failed',
  ]);

  const podsByStatus: Record<string, number> = {};
  for (const pod of pods) {
    if (!pod.ready && ERROR_STATUSES.has(pod.status)) {
      podsByStatus[pod.status] = (podsByStatus[pod.status] || 0) + 1;
    }
  }

  // Deduplicate findings by rule name, keep highest severity
  const uniqueFindings: Record<string, { rule: string; severity: string; description: string; count: number }> = {};
  for (const f of findings) {
    if (uniqueFindings[f.rule]) {
      uniqueFindings[f.rule].count++;
    } else {
      uniqueFindings[f.rule] = { ...f, count: 1 };
    }
  }

  // Sort: critical first, then warning, then info
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const sorted = Object.values(uniqueFindings)
    .sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))
    .slice(0, 5);

  if (sorted.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Top Issues</h3>
      <div className="space-y-2">
        {sorted.map(issue => {
          const config = severityConfig[issue.severity] || severityConfig.info;
          const affectedPods = podsByStatus[issue.rule] || 0;

          return (
            <div key={issue.rule} className={`flex items-start gap-3 rounded-lg border ${config.border} ${config.bg} px-3 py-2.5`}>
              <config.Icon className={`h-4 w-4 ${config.color} shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${config.color}`}>{issue.rule}</span>
                  {issue.count > 1 && (
                    <span className="text-[10px] text-gray-400 bg-white/60 px-1.5 py-0.5 rounded">x{issue.count}</span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-0.5">{issue.description}</p>
                {affectedPods > 0 && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{affectedPods} pod{affectedPods > 1 ? 's' : ''} affected</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
