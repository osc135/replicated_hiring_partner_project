import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Loader2, Search, MessageSquare, BarChart3 } from 'lucide-react';
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
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Empty state: welcoming onboarding experience
  const handleFile = (file: File) => {
    if (!file.name.endsWith('.tar.gz') && !file.name.endsWith('.tgz')) return;
    // Navigate to upload page and let it handle the file
    navigate('/upload', { state: { file } });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div
      className="flex-1 overflow-auto p-6 lg:p-8"
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
    >
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center min-h-[70vh]">
        {/* Welcome header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Kubernetes Bundle Analyzer
          </h1>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            Upload a Troubleshoot support bundle and get an AI-powered diagnosis
            with root cause analysis, severity scoring, and remediation steps.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-12 cursor-pointer transition-all duration-200 text-center ${
            dragOver
              ? 'border-blue-500 bg-blue-50 scale-[1.02] shadow-lg shadow-blue-100'
              : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50 hover:shadow-md'
          }`}
        >
          <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3 transition-colors ${
            dragOver ? 'bg-blue-100' : 'bg-gray-100'
          }`}>
            <Upload className={`h-7 w-7 transition-colors ${dragOver ? 'text-blue-500' : 'text-gray-400'}`} />
          </div>
          <p className="text-base font-medium text-gray-700">
            {dragOver ? 'Drop it here' : 'Drop your support bundle here'}
          </p>
          <p className="text-sm text-gray-400 mt-1.5">
            <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">.tar.gz</span> or{' '}
            <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">.tgz</span>
          </p>
          <p className="text-sm text-blue-600 font-medium mt-3">or click to browse files</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".tar.gz,.tgz"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
        </div>

        {/* Feature hints */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10 w-full max-w-lg">
          {[
            { icon: Search, title: 'Pattern Detection', desc: 'Scans for CrashLoopBackOff, OOMKilled, and 10+ K8s failure patterns' },
            { icon: MessageSquare, title: 'AI Diagnosis', desc: 'GPT-4o analyzes root cause and suggests specific remediation steps' },
            { icon: BarChart3, title: 'Cluster Overview', desc: 'Pod health, node status, event timeline, and severity trends' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="text-center p-3">
              <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 mb-2">
                <Icon className="h-4 w-4 text-gray-500" />
              </div>
              <p className="text-sm font-medium text-gray-700">{title}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
