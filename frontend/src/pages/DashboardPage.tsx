import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Loader2 } from 'lucide-react';
import { getDashboardData, type DashboardData } from '../api';
import StatsCards from '../components/StatsCards';
import ClusterHealthMap from '../components/ClusterHealthMap';
import EventTimeline from '../components/EventTimeline';
import AnalysesTable from '../components/AnalysesTable';
import HealthScore from '../components/HealthScore';
import DonutChart from '../components/DonutChart';
import SeverityTrend from '../components/SeverityTrend';
import TopIssues from '../components/TopIssues';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  useEffect(() => {
    setDashboardLoading(true);
    getDashboardData()
      .then(setDashboardData)
      .catch(() => setDashboardData(null))
      .finally(() => setDashboardLoading(false));
  }, []);

  if (dashboardLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  const latest = dashboardData?.latest_analysis;
  const history = dashboardData?.analyses_history || [];

  // Full dashboard when analyses exist
  if (latest) {
    const cd = latest.cluster_data;
    const summary = cd?.summary || { total_pods: 0, healthy_pods: 0, unhealthy_pods: 0, node_count: 0, event_count: 0 };
    const pods = cd?.pods || [];
    const nodes = cd?.nodes || [];
    const events = cd?.events || [];
    const findings = latest.rule_findings?.findings || [];
    const findingCounts = {
      critical: findings.filter((f: { severity: string }) => f.severity === 'critical').length,
      warning: findings.filter((f: { severity: string }) => f.severity === 'warning').length,
      info: findings.filter((f: { severity: string }) => f.severity === 'info').length,
    };
    const totalRestarts = pods.reduce((sum, p) =>
      sum + p.containers.reduce((cs, c) => cs + c.restarts, 0), 0
    );
    const nodesReady = nodes.filter(n => n.status === 'Ready').length;

    return (
      <div className="flex-1 overflow-auto p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Latest: {latest.filename} &middot; {new Date(latest.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </p>
            </div>
            <button
              onClick={() => navigate('/upload')}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
              <Upload className="h-4 w-4" />
              Analyze Bundle
            </button>
          </div>

          {/* Row 1: Health Score + Donut Charts + Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Health Score */}
            <HealthScore
              healthyPods={summary.healthy_pods}
              totalPods={summary.total_pods}
              nodeCount={summary.node_count}
              nodesReady={nodesReady}
              criticalFindings={findingCounts.critical}
              warningFindings={findingCounts.warning}
              totalRestarts={totalRestarts}
            />

            {/* Donut charts */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center justify-around">
              <DonutChart
                title="Pod Status"
                segments={[
                  { value: summary.healthy_pods, color: '#22c55e', label: 'Healthy' },
                  { value: pods.filter(p => p.status === 'Pending').length, color: '#eab308', label: 'Pending' },
                  { value: summary.unhealthy_pods, color: '#ef4444', label: 'Failed' },
                ]}
              />
              <DonutChart
                title="Findings"
                segments={[
                  { value: findingCounts.critical, color: '#ef4444', label: 'Critical' },
                  { value: findingCounts.warning, color: '#f59e0b', label: 'Warning' },
                  { value: findingCounts.info, color: '#3b82f6', label: 'Info' },
                ]}
              />
            </div>

            {/* Stats cards (vertical) */}
            <StatsCards summary={summary} findingCounts={findingCounts} />
          </div>

          {/* Row 2: Top Issues + Severity Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <TopIssues findings={findings} pods={pods} />
            <SeverityTrend analyses={history} />
          </div>

          {/* Row 3: Cluster Map + Event Timeline */}
          {(pods.length > 0 || events.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ClusterHealthMap pods={pods} nodes={nodes} />
              <EventTimeline events={events} />
            </div>
          )}

          {/* History table */}
          <AnalysesTable analyses={history} />
        </div>
      </div>
    );
  }

  // Empty state: centered drop zone (first-time user)
  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-lg text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 bg-gray-100">
            <Upload className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-base font-medium text-gray-700">
            No analyses yet
          </p>
          <p className="text-sm text-gray-400 mt-1.5">
            Upload a Kubernetes support bundle to get started
          </p>
          <button
            onClick={() => navigate('/upload')}
            className="mt-6 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors shadow-sm"
          >
            <Upload className="h-4 w-4" />
            Analyze Bundle
          </button>
        </div>
      </div>
    </div>
  );
}
