import { useState } from 'react';
import type { ClusterEvent } from '../api';

interface Props {
  events: ClusterEvent[];
}

// Severe errors — things that are actively broken
const ERROR_REASONS = new Set([
  'Failed', 'CrashLoopBackOff', 'ImagePullBackOff',
  'ErrImagePull', 'RunContainerError', 'OOMKilled',
  'FailedCreate',
]);

type Filter = 'errors' | 'warnings' | 'all';

function getEventLevel(e: ClusterEvent): 'error' | 'warning' | 'normal' {
  // Hard errors: specific failure reasons
  if (ERROR_REASONS.has(e.reason)) return 'error';
  // Warnings: K8s marks these as Warning type (BackOff, FailedScheduling, Unhealthy, etc.)
  if (e.type === 'Warning') return 'warning';
  // Everything else is normal
  return 'normal';
}

function getDotColor(level: 'error' | 'warning' | 'normal') {
  if (level === 'error') return 'bg-red-500';
  if (level === 'warning') return 'bg-amber-500';
  return 'bg-slate-300';
}

function getReasonStyle(level: 'error' | 'warning' | 'normal') {
  if (level === 'error') return 'text-red-700 bg-red-50 border-red-200';
  if (level === 'warning') return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
}

function formatTime(ts: string) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

interface GroupedEvent {
  event: ClusterEvent;
  count: number;
  level: 'error' | 'warning' | 'normal';
}

function deduplicateEvents(events: ClusterEvent[]): GroupedEvent[] {
  const groups: GroupedEvent[] = [];
  const seen = new Map<string, number>(); // key -> index in groups

  for (const e of events) {
    // Key: reason + involved object name (ignore timestamp differences)
    const key = `${e.reason}|${e.name}|${e.message.slice(0, 80)}`;
    const existing = seen.get(key);
    if (existing !== undefined) {
      groups[existing].count++;
    } else {
      seen.set(key, groups.length);
      groups.push({ event: e, count: 1, level: getEventLevel(e) });
    }
  }

  return groups;
}

const INITIAL_SHOW = 15;

export default function EventTimeline({ events }: Props) {
  const [filter, setFilter] = useState<Filter>('errors');
  const [showAll, setShowAll] = useState(false);

  const grouped = deduplicateEvents(events);

  const errorCount = grouped.filter(g => g.level === 'error').length;
  const warningCount = grouped.filter(g => g.level === 'warning').length;

  const filtered = filter === 'all'
    ? grouped
    : filter === 'errors'
      ? grouped.filter(g => g.level === 'error')
      : grouped.filter(g => g.level === 'warning');

  const displayed = showAll ? filtered : filtered.slice(0, INITIAL_SHOW);

  if (events.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Event Timeline</h3>
        <p className="text-xs text-gray-400">No events available</p>
      </div>
    );
  }

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'errors', label: 'Error Events', count: errorCount },
    { key: 'warnings', label: 'Warning Events', count: warningCount },
    { key: 'all', label: 'All Events', count: grouped.length },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Event Timeline</h3>
        <span className="text-[10px] text-gray-400">{events.length} total events</span>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setFilter(tab.key); setShowAll(false); }}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
              filter === tab.key
                ? tab.key === 'errors'
                  ? 'bg-red-100 text-red-700'
                  : tab.key === 'warnings'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-slate-100 text-slate-700'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 opacity-60">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">
          No {filter === 'errors' ? 'error' : filter === 'warnings' ? 'warning' : ''} events
        </p>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-100" />

          <div className="space-y-2.5">
            {displayed.map((g, i) => (
              <div key={i} className="flex gap-3 items-start relative">
                <div className={`shrink-0 w-[15px] h-[15px] rounded-full border-2 border-white shadow-sm ${getDotColor(g.level)} mt-0.5 z-10`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${getReasonStyle(g.level)}`}>
                      {g.event.reason}
                    </span>
                    {g.count > 1 && (
                      <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        x{g.count}
                      </span>
                    )}
                    {g.event.timestamp && (
                      <span className="text-[10px] text-gray-400">{formatTime(g.event.timestamp)}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{g.event.message}</p>
                  {g.event.name && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {g.event.kind && `${g.event.kind}/`}{g.event.name}
                      {g.event.namespace && ` in ${g.event.namespace}`}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {filtered.length > INITIAL_SHOW && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          Show all {filtered.length} events
        </button>
      )}
    </div>
  );
}
