import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, LogOut, Box, Menu, X, FileText, Loader2, ChevronDown, ChevronRight, Upload } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getBundles, type Bundle } from '../api';

const severityDot: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loadingBundles, setLoadingBundles] = useState(true);

  const fetchBundles = () => {
    getBundles()
      .then(setBundles)
      .catch(() => {})
      .finally(() => setLoadingBundles(false));
  };

  useEffect(() => {
    fetchBundles();
    // Refresh when navigating back to dashboard
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Logo / Title */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700/50">
        <Box className="h-7 w-7 text-blue-400 shrink-0" />
        <span className="text-lg font-semibold text-white tracking-tight">Bundle Analyzer</span>
      </div>

      {/* Dashboard nav */}
      <nav className="px-3 pt-4 pb-2">
        <NavLink
          to="/dashboard"
          onClick={() => setSidebarOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-slate-800 text-white'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`
          }
        >
          <LayoutDashboard className="h-5 w-5 shrink-0" />
          Dashboard
        </NavLink>
        <NavLink
          to="/upload"
          onClick={() => setSidebarOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-slate-800 text-white'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`
          }
        >
          <Upload className="h-5 w-5 shrink-0" />
          New Analysis
        </NavLink>
      </nav>

      {/* Past Analyses list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800/40 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2">
            {historyOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
            )}
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">History</span>
          </div>
          {bundles.length > 0 && (
            <span className="text-xs text-slate-500">{bundles.length}</span>
          )}
        </button>

        {!historyOpen ? null : loadingBundles ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 text-slate-500 animate-spin" />
          </div>
        ) : bundles.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">No analyses yet</p>
        ) : (
          <div className="space-y-0.5">
            {bundles.map(bundle => {
              const isActive = location.pathname === `/analysis/${bundle.id}`;
              return (
                <button
                  key={bundle.id}
                  onClick={() => {
                    if (bundle.status === 'completed') {
                      navigate(`/analysis/${bundle.id}`);
                      setSidebarOpen(false);
                    }
                  }}
                  disabled={bundle.status !== 'completed'}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors group ${
                    isActive
                      ? 'bg-slate-800 text-white'
                      : bundle.status === 'completed'
                        ? 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                        : 'text-slate-500 cursor-default'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{bundle.filename}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {bundle.status === 'completed' && (
                          <span className={`w-1.5 h-1.5 rounded-full ${bundle.severity ? severityDot[bundle.severity] || severityDot.info : 'bg-green-500'}`} />
                        )}
                        <span className="text-xs text-slate-500">
                          {new Date(bundle.uploaded_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                          {' · '}
                          {new Date(bundle.uploaded_at).toLocaleTimeString(undefined, {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                        {bundle.status === 'processing' && (
                          <Loader2 className="h-3 w-3 text-slate-500 animate-spin" />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* User + Logout */}
      <div className="px-3 py-4 border-t border-slate-700/50">
        {user && (
          <p className="px-3 mb-3 text-xs text-slate-400 truncate">{user}</p>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800/60 hover:text-white transition-colors"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-[260px] lg:flex-col bg-slate-900 shrink-0">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-[260px] h-full bg-slate-900 z-50">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-3 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-600 hover:text-gray-900">
            <Menu className="h-6 w-6" />
          </button>
          <span className="font-semibold text-gray-900">Bundle Analyzer</span>
        </div>

        <main className="flex-1 flex flex-col min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
}
