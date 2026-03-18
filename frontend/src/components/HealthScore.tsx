interface Props {
  healthyPods: number;
  totalPods: number;
  nodeCount: number;
  nodesReady: number;
  criticalFindings: number;
  warningFindings: number;
  totalRestarts: number;
}

function calculateScore({
  healthyPods, totalPods, nodeCount, nodesReady,
  criticalFindings, warningFindings, totalRestarts,
}: Props): number {
  if (totalPods === 0 && nodeCount === 0) return 0;

  let score = 100;

  // Pod health: up to -40 points
  if (totalPods > 0) {
    const podHealthRatio = healthyPods / totalPods;
    score -= (1 - podHealthRatio) * 40;
  }

  // Node readiness: up to -20 points
  if (nodeCount > 0) {
    const nodeReadyRatio = nodesReady / nodeCount;
    score -= (1 - nodeReadyRatio) * 20;
  }

  // Critical findings: -8 each, max -24
  score -= Math.min(criticalFindings * 8, 24);

  // Warning findings: -3 each, max -12
  score -= Math.min(warningFindings * 3, 12);

  // Restarts: -1 per 5 restarts, max -10
  score -= Math.min(Math.floor(totalRestarts / 5), 10);

  return Math.max(0, Math.round(score));
}

function getScoreColor(score: number) {
  if (score >= 90) return { ring: '#22c55e', text: 'text-green-600', label: 'Healthy', bg: 'from-green-50 to-emerald-50' };
  if (score >= 70) return { ring: '#eab308', text: 'text-yellow-600', label: 'Degraded', bg: 'from-yellow-50 to-amber-50' };
  if (score >= 50) return { ring: '#f97316', text: 'text-orange-600', label: 'Warning', bg: 'from-orange-50 to-amber-50' };
  return { ring: '#ef4444', text: 'text-red-600', label: 'Critical', bg: 'from-red-50 to-rose-50' };
}

export default function HealthScore(props: Props) {
  const score = calculateScore(props);
  const { ring, text, label, bg } = getScoreColor(score);

  // SVG circular gauge
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className={`bg-gradient-to-br ${bg} rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-6`}>
      {/* Circular gauge */}
      <div className="relative shrink-0">
        <svg width="128" height="128" viewBox="0 0 128 128">
          {/* Background ring */}
          <circle cx="64" cy="64" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8" />
          {/* Score ring */}
          <circle
            cx="64" cy="64" r={radius} fill="none"
            stroke={ring} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 64 64)"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${text}`}>{score}</span>
          <span className="text-[10px] text-gray-400 font-medium">/ 100</span>
        </div>
      </div>

      {/* Label + breakdown */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Cluster Health</h3>
        <p className={`text-lg font-bold ${text} mt-0.5`}>{label}</p>
        <div className="mt-2 space-y-1 text-xs text-gray-500">
          <p>{props.healthyPods}/{props.totalPods} pods healthy</p>
          <p>{props.nodesReady}/{props.nodeCount} nodes ready</p>
          {props.criticalFindings > 0 && (
            <p className="text-red-600 font-medium">{props.criticalFindings} critical findings</p>
          )}
        </div>
      </div>
    </div>
  );
}
