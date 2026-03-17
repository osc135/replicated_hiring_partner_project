import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSimilar, type SimilarIncident } from '../api';

interface Props {
  analysisId: string;
}

const severityBadge: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
};

export default function SimilarIncidents({ analysisId }: Props) {
  const [incidents, setIncidents] = useState<SimilarIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getSimilar(analysisId)
      .then(setIncidents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [analysisId]);

  if (loading) {
    return (
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Similar Incidents</h3>
        <div className="animate-pulse space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (incidents.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Similar Incidents</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {incidents.map((incident) => (
          <button
            key={incident.analysis_id}
            onClick={() => navigate(`/analysis/${incident.analysis_id}`)}
            className="text-left bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-900 truncate mr-2">
                {incident.bundle_filename}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${severityBadge[incident.severity] || severityBadge.info}`}>
                {incident.severity}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              <span className="font-medium text-blue-600">
                {Math.round(incident.similarity_score * 100)}% match
              </span>
            </p>
            <p className="text-sm text-gray-600 line-clamp-2">
              {incident.summary?.slice(0, 100)}
              {(incident.summary?.length || 0) > 100 ? '...' : ''}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
