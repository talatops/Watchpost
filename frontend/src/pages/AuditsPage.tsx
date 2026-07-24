import { useEffect, useState, useMemo } from 'react';
import {
  Activity, Search, X, RefreshCw, Shield, User,
  FileText, Zap, Lock, RotateCcw, Trash2,
  LogIn, Settings, Package,
} from 'lucide-react';
import { api } from '../hooks/useApi';
import type { AuditLog } from '../types';

// ── Event config ──────────────────────────────────────────────────────────
const EVENT_CFG: Record<string, {
  label: string;
  color: string; bg: string; border: string; dot: string;
  icon: React.ReactNode;
  category: string;
}> = {
  USER_LOGIN:       { label: 'Login',          color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/25',    dot: 'bg-cyan-400',    icon: <LogIn className="w-3.5 h-3.5" />,       category: 'auth'    },
  POLICY_CREATE:    { label: 'Policy Created',  color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/25',   dot: 'bg-green-400',   icon: <FileText className="w-3.5 h-3.5" />,    category: 'policy'  },
  POLICY_UPDATE:    { label: 'Policy Updated',  color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25',   dot: 'bg-amber-400',   icon: <Settings className="w-3.5 h-3.5" />,    category: 'policy'  },
  POLICY_DELETE:    { label: 'Policy Deleted',  color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/25',     dot: 'bg-red-400',     icon: <Trash2 className="w-3.5 h-3.5" />,      category: 'policy'  },
  REMOTE_REBOOT:    { label: 'Remote Reboot',   color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/25',    dot: 'bg-blue-400',    icon: <RotateCcw className="w-3.5 h-3.5" />,   category: 'device'  },
  REMOTE_LOCK:      { label: 'Remote Lock',     color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25',   dot: 'bg-amber-400',   icon: <Lock className="w-3.5 h-3.5" />,        category: 'device'  },
  REMOTE_WIPE:      { label: 'Remote Wipe',     color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/25',     dot: 'bg-red-400',     icon: <Zap className="w-3.5 h-3.5" />,         category: 'device'  },
  REMOTE_SYNC:      { label: 'Remote Sync',     color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/25',    dot: 'bg-cyan-400',    icon: <RefreshCw className="w-3.5 h-3.5" />,   category: 'device'  },
  APP_CREATE:       { label: 'App Registered',  color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/25',   dot: 'bg-green-400',   icon: <Package className="w-3.5 h-3.5" />,     category: 'app'     },
  APP_DEPLOY:       { label: 'App Deployed',    color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/25',  dot: 'bg-violet-400',  icon: <Package className="w-3.5 h-3.5" />,     category: 'app'     },
  USER_CREATE:      { label: 'User Created',    color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/25',   dot: 'bg-green-400',   icon: <User className="w-3.5 h-3.5" />,        category: 'user'    },
  USER_ROLE_UPDATE: { label: 'Role Changed',    color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25',   dot: 'bg-amber-400',   icon: <Shield className="w-3.5 h-3.5" />,      category: 'user'    },
};

const FALLBACK_CFG = {
  label: 'Event', color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/25',
  dot: 'bg-gray-400', icon: <Activity className="w-3.5 h-3.5" />, category: 'other',
};

const CATEGORIES = ['all', 'auth', 'policy', 'device', 'app', 'user'] as const;
type Category = typeof CATEGORIES[number];

// ── Search highlight ───────────────────────────────────────────────────────
function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-accentCyan/25 text-accentCyan rounded px-0.5 not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// Group logs by calendar date
function groupByDate(logs: AuditLog[]): Array<{ date: string; entries: AuditLog[] }> {
  const map = new Map<string, AuditLog[]>();
  for (const l of logs) {
    const d = new Date(l.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(l);
  }
  return Array.from(map.entries()).map(([date, entries]) => ({ date, entries }));
}

export default function AuditsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');

  const load = () => {
    setLoading(true);
    api.get<AuditLog[]>('/audits')
      .then(l => setLogs(l || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return logs.filter(l => {
      const cfg = EVENT_CFG[l.action] ?? FALLBACK_CFG;
      const matchCat = category === 'all' || cfg.category === category;
      const matchSearch = !q ||
        l.action.toLowerCase().includes(q) ||
        l.target_type.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [logs, search, category]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Trail</h1>
          <p className="text-gray-400 text-sm mt-1">Immutable log of all administrative actions</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{logs.length} event{logs.length !== 1 ? 's' : ''}</span>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 border border-darkBorder text-gray-400 text-sm px-4 py-2 rounded-xl hover:bg-darkBg transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>
      )}

      {/* Search + category filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-3 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search actions, targets, details…"
            className="w-full bg-darkCard border border-darkBorder rounded-xl pl-10 pr-9 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-gray-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border capitalize transition-all ${
                category === cat
                  ? 'bg-accentCyan/10 border-accentCyan/30 text-accentCyan'
                  : 'border-darkBorder text-gray-500 hover:border-gray-600 hover:text-gray-300'
              }`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="py-16 text-center">
          <div className="w-7 h-7 border-2 border-accentCyan/30 border-t-accentCyan rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading audit trail…</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-darkCard border border-darkBorder flex items-center justify-center mx-auto mb-4">
            <Activity className="w-7 h-7 text-gray-700" />
          </div>
          <p className="text-gray-400 font-medium">{logs.length === 0 ? 'No audit events yet' : 'No events match your filter'}</p>
          {search && <p className="text-gray-600 text-sm mt-1">Try a different search term</p>}
        </div>
      )}

      {/* ── Vertical timeline ── */}
      {!loading && groups.map((group, gi) => (
        <div key={group.date} className="space-y-0">
          {/* Date separator */}
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-darkBorder" />
            <span className="text-xs font-semibold text-gray-500 bg-darkBg px-3 py-1 rounded-full border border-darkBorder">
              {group.date}
            </span>
            <div className="h-px flex-1 bg-darkBorder" />
          </div>

          {/* Timeline entries */}
          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute left-[19px] top-0 bottom-0 w-px bg-darkBorder" />

            <div className="space-y-1">
              {group.entries.map((l, i) => {
                const cfg = EVENT_CFG[l.action] ?? FALLBACK_CFG;
                let parsedDetails: Record<string, unknown> | null = null;
                try { parsedDetails = JSON.parse(l.details); } catch { /* not JSON */ }

                return (
                  <div key={l.id ?? `${gi}-${i}`}
                    style={{ animationDelay: `${i * 30}ms` }}
                    className="relative flex gap-4 pl-1 group animate-fade-in">

                    {/* Timeline dot */}
                    <div className="relative z-10 flex-shrink-0 mt-3.5">
                      <div className={`w-9 h-9 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center ${cfg.color} transition-transform duration-150 group-hover:scale-110`}>
                        {cfg.icon}
                      </div>
                    </div>

                    {/* Event card */}
                    <div className="flex-1 min-w-0 mb-3">
                      <div className="bg-darkCard border border-darkBorder rounded-2xl px-4 py-3 hover:border-gray-600/60 transition-all group-hover:shadow-lg relative overflow-hidden">
                        {/* Left accent */}
                        <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${cfg.dot} rounded-l-2xl opacity-0 group-hover:opacity-100 transition-opacity`} />

                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Event badge */}
                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                              {cfg.icon}
                              <Highlighted text={cfg.label} query={search} />
                            </span>
                            {/* Raw action (if not in map) */}
                            {!EVENT_CFG[l.action] && (
                              <span className="text-xs font-mono text-gray-500">
                                <Highlighted text={l.action} query={search} />
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-gray-600 flex-shrink-0 tabular-nums">
                            {new Date(l.created_at).toLocaleTimeString()}
                          </span>
                        </div>

                        {/* Target */}
                        <p className="text-xs text-gray-500 mt-1.5 font-mono">
                          <span className="text-gray-600">target: </span>
                          <Highlighted text={`${l.target_type} · ${l.target_id.slice(0, 12)}…`} query={search} />
                        </p>

                        {/* Details */}
                        {l.details && l.details !== '{}' && (
                          <div className="mt-2">
                            {parsedDetails ? (
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                {Object.entries(parsedDetails).slice(0, 6).map(([k, v]) => (
                                  <span key={k} className="text-[11px]">
                                    <span className="text-gray-600">{k}: </span>
                                    <span className="text-gray-400 font-mono">
                                      <Highlighted text={String(v ?? '')} query={search} />
                                    </span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-gray-500 font-mono bg-darkBg/60 px-2.5 py-1.5 rounded-lg border border-darkBorder">
                                <Highlighted text={l.details.slice(0, 120) + (l.details.length > 120 ? '…' : '')} query={search} />
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}

      {filtered.length > 0 && !loading && (
        <p className="text-xs text-gray-600 text-center pb-2">
          {filtered.length} event{filtered.length !== 1 ? 's' : ''}
          {(search || category !== 'all') && ' · filtered'}
        </p>
      )}
    </div>
  );
}
