import { Server, RefreshCw, AlertCircle } from 'lucide-react';
import type { ClusterPod, ClusterNode } from '../api';

interface Props {
  pods: ClusterPod[];
  nodes: ClusterNode[];
}

const ERROR_STATUSES = new Set([
  'Failed', 'CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull',
  'RunContainerError', 'OOMKilled', 'Error',
]);

function getPodStyle(pod: ClusterPod): { border: string; bg: string; text: string; dot: string } {
  if (pod.ready) return { border: 'border-green-200', bg: 'bg-green-50/60', text: 'text-green-700', dot: 'bg-green-400' };
  if (ERROR_STATUSES.has(pod.status)) return { border: 'border-red-300', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' };
  if (pod.status === 'Pending') return { border: 'border-amber-200', bg: 'bg-amber-50/60', text: 'text-amber-700', dot: 'bg-amber-400' };
  return { border: 'border-gray-200', bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' };
}

function getStatusLabel(pod: ClusterPod) {
  if (pod.ready) return 'Running';
  return pod.status;
}

function PodCard({ pod }: { pod: ClusterPod }) {
  const style = getPodStyle(pod);
  const restarts = pod.containers.reduce((sum, c) => sum + c.restarts, 0);
  const isError = ERROR_STATUSES.has(pod.status);

  // Truncate pod name: show prefix, skip the hash
  const shortName = pod.name.length > 28
    ? pod.name.replace(/-[a-f0-9]{8,10}-[a-z0-9]{5}$/, '-...')
    : pod.name;

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} px-3 py-2 ${isError ? 'ring-1 ring-red-200' : ''}`}>
      <div className="flex items-start gap-2 min-w-0">
        <span className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${style.dot}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-900 truncate" title={pod.name}>{shortName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-medium ${style.text}`}>{getStatusLabel(pod)}</span>
            {restarts > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                <RefreshCw className="h-2.5 w-2.5" />
                {restarts}
              </span>
            )}
            {isError && <AlertCircle className="h-3 w-3 text-red-400" />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClusterHealthMap({ pods, nodes }: Props) {
  // Group pods by node
  const podsByNode: Record<string, ClusterPod[]> = {};
  for (const pod of pods) {
    const node = pod.node || 'unassigned';
    if (!podsByNode[node]) podsByNode[node] = [];
    podsByNode[node].push(pod);
  }

  // Sort pods: unhealthy first, then by name
  for (const node of Object.keys(podsByNode)) {
    podsByNode[node].sort((a, b) => {
      const aErr = ERROR_STATUSES.has(a.status) ? 0 : a.ready ? 2 : 1;
      const bErr = ERROR_STATUSES.has(b.status) ? 0 : b.ready ? 2 : 1;
      if (aErr !== bErr) return aErr - bErr;
      return a.name.localeCompare(b.name);
    });
  }

  const nodeNames = nodes.length > 0
    ? nodes.map(n => n.name)
    : Object.keys(podsByNode).sort();

  const nodeStatusMap: Record<string, string> = {};
  for (const n of nodes) nodeStatusMap[n.name] = n.status;

  if (pods.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Cluster Map</h3>
        <p className="text-xs text-gray-400">No pod data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Cluster Map</h3>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" /> Healthy</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Pending</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Error</span>
        </div>
      </div>

      <div className="space-y-4">
        {nodeNames.map(nodeName => {
          const nodePods = podsByNode[nodeName] || [];
          const nodeStatus = nodeStatusMap[nodeName] || 'Unknown';
          const isReady = nodeStatus === 'Ready';
          const healthyCount = nodePods.filter(p => p.ready).length;
          const errorCount = nodePods.filter(p => ERROR_STATUSES.has(p.status)).length;

          return (
            <div key={nodeName} className={`rounded-xl border-2 border-dashed p-4 ${
              isReady ? 'border-slate-200 bg-slate-50/30' : 'border-amber-300 bg-amber-50/20'
            }`}>
              {/* Node header */}
              <div className="flex items-center gap-2 mb-3">
                <div className={`p-1.5 rounded-lg ${isReady ? 'bg-slate-100' : 'bg-amber-100'}`}>
                  <Server className={`h-4 w-4 ${isReady ? 'text-slate-500' : 'text-amber-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{nodeName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      isReady ? 'text-green-700 bg-green-100' : 'text-amber-700 bg-amber-100'
                    }`}>
                      {nodeStatus}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {healthyCount}/{nodePods.length} healthy
                      {errorCount > 0 && <span className="text-red-500 font-medium"> &middot; {errorCount} errors</span>}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pod grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {nodePods.slice(0, 30).map(pod => (
                  <PodCard key={`${pod.namespace}/${pod.name}`} pod={pod} />
                ))}
              </div>
              {nodePods.length > 30 && (
                <p className="text-[10px] text-gray-400 mt-2">+{nodePods.length - 30} more pods</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
