import { useEffect, useState, useRef } from 'react';
import {
  Download, RefreshCw, ChevronDown,
  CheckCircle2, XCircle, Clock, Search, Smartphone, X, Loader2,
} from 'lucide-react';
import { api } from '../hooks/useApi';
import type { ComplianceReportEntry } from '../types';

// ── Animated counter hook ──────────────────────────────────────────────────
function useCountUp(target: number, duration = 800) {
  const [val, setVal] = useState(0);
  const raf = useRef<number | null>(null);
  const start = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    start.current = null;
    const step = (ts: number) => {
      if (start.current === null) start.current = ts;
      const progress = Math.min((ts - start.current) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(eased * target));
      if (progress < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current !== null) cancelAnimationFrame(raf.current); };
  }, [target, duration]);

  return val;
}

// ── Status config ──────────────────────────────────────────────────────────
const STATUS_CFG = {
  COMPLIANT:     { label: 'Compliant',     color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/25', dot: 'bg-green-400', pulse: true  },
  NON_COMPLIANT: { label: 'Non-Compliant', color: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/25',   dot: 'bg-red-400',   pulse: true  },
  PENDING:       { label: 'Pending',       color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/25', dot: 'bg-amber-400', pulse: false },
} as const;
type StatusKey = keyof typeof STATUS_CFG;

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CFG[status as StatusKey] ?? STATUS_CFG.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold border px-2.5 py-1 rounded-full ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <span className="relative flex-shrink-0 w-2 h-2">
        <span className={`absolute inset-0 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-ping opacity-60' : ''}`} />
        <span className={`relative rounded-full w-2 h-2 block ${cfg.dot}`} />
      </span>
      {cfg.label}
    </span>
  );
}

// ── Highlight helper ───────────────────────────────────────────────────────
function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-accentCyan/25 text-accentCyan rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Details accordion panel ────────────────────────────────────────────────
function DetailsPanel({ entry, open }: { entry: ComplianceReportEntry; open: boolean }) {
  const cfg = STATUS_CFG[entry.compliance_status as StatusKey] ?? STATUS_CFG.PENDING;
  const fields = [
    { label: 'Serial Number', value: entry.serial_number, mono: true },
    { label: 'Model',         value: entry.model },
    { label: 'OS Version',    value: entry.os_version },
    { label: 'Security Patch',value: entry.patch_level },
    { label: 'Team',          value: entry.team_name || 'Unassigned' },
    { label: 'Last Seen',     value: new Date(entry.last_seen).toLocaleString() },
  ];

  return (
    <tr>
      <td colSpan={8} className="p-0 bg-darkBg/50 border-b border-darkBorder overflow-hidden">
        <div
          style={{
            maxHeight: open ? '400px' : '0px',
            opacity: open ? 1 : 0,
            transition: 'max-height 0.3s ease, opacity 0.25s ease',
          }}>
          <div className="p-4">
            <div className={`rounded-2xl border ${cfg.border} bg-darkCard p-4 space-y-4`}>
              {/* Status banner */}
              <div className="flex items-center justify-between">
                <p className={`text-sm font-semibold ${cfg.color}`}>
                  {entry.compliance_status === 'COMPLIANT'     ? '✓ All policies passing — device is compliant' :
                   entry.compliance_status === 'NON_COMPLIANT' ? '✕ Policy violation detected — device is non-compliant' :
                   '⏳ No policy evaluated yet on this device'}
                </p>
                <StatusPill status={entry.compliance_status} />
              </div>

              {entry.compliance_status === 'PENDING' && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300">
                  <strong>PENDING</strong> means no compliance policy has been evaluated on this device yet.
                  Remote commands (LOCK, REBOOT, etc.) execute immediately via FCM and are separate from policy compliance.
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {fields.map(({ label, value, mono }) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
                    <p className={`text-sm text-white font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function ReportsPage() {
  const [entries, setEntries] = useState<ComplianceReportEntry[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const r = await api.get<{ data: ComplianceReportEntry[]; count: number }>('/reports/compliance');
      setEntries(r.data ?? []);
      setCount(r.count ?? 0);
    } catch (e: unknown) { setError((e as Error).message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const downloadCSV = async () => {
    setExporting(true);
    await api.download('/reports/compliance/csv', 'compliance_report.csv');
    setExporting(false);
  };

  const toggleRow = (serial: string) =>
    setExpandedRow(prev => prev === serial ? null : serial);

  const compliant   = entries.filter(e => e.compliance_status === 'COMPLIANT').length;
  const violations  = entries.filter(e => e.compliance_status === 'NON_COMPLIANT').length;
  const pending     = entries.filter(e => e.compliance_status === 'PENDING').length;

  // Animated counters
  const totalAnim     = useCountUp(count);
  const compliantAnim = useCountUp(compliant);
  const violationAnim = useCountUp(violations);
  const pendingAnim   = useCountUp(pending);

  const filtered = entries.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.serial_number.toLowerCase().includes(q) ||
      e.model.toLowerCase().includes(q) || e.team_name?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'ALL' || e.compliance_status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Compliance rate bar
  const complianceRate = count > 0 ? Math.round((compliant / count) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance Reports</h1>
          <p className="text-gray-400 text-sm mt-1">Policy compliance snapshot for all enrolled Android devices</p>
        </div>
        <div className="flex gap-3">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 border border-darkBorder text-gray-300 text-sm px-4 py-2.5 rounded-xl hover:bg-darkBg transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={downloadCSV} disabled={exporting}
            className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-accentBlue/20 disabled:opacity-70">
            {exporting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Exporting…</>
              : <><Download className="w-4 h-4" /> Export CSV</>}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Animated summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: <Smartphone className="w-5 h-5" />, label: 'Total Devices', value: totalAnim,     color: 'text-accentCyan',  iconBg: 'bg-accentCyan/10',   border: 'border-accentCyan/20'  },
          { icon: <CheckCircle2 className="w-5 h-5"/>, label: 'Compliant',    value: compliantAnim,  color: 'text-green-400',   iconBg: 'bg-green-500/10',    border: 'border-green-500/20'   },
          { icon: <XCircle className="w-5 h-5" />,    label: 'Violations',   value: violationAnim,  color: 'text-red-400',     iconBg: 'bg-red-500/10',      border: 'border-red-500/20'     },
          { icon: <Clock className="w-5 h-5" />,      label: 'Pending',      value: pendingAnim,    color: 'text-amber-400',   iconBg: 'bg-amber-500/10',    border: 'border-amber-500/20'   },
        ].map(s => (
          <div key={s.label} className="bg-darkCard border border-darkBorder rounded-2xl p-4 flex items-center gap-3 relative overflow-hidden">
            <div className={`p-2.5 rounded-xl ${s.iconBg} border ${s.border} ${s.color} flex-shrink-0`}>
              {s.icon}
            </div>
            <div>
              <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Compliance rate bar */}
      {count > 0 && (
        <div className="bg-darkCard border border-darkBorder rounded-2xl p-4 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-400 font-medium">Overall Compliance Rate</span>
            <span className={`font-bold tabular-nums ${complianceRate >= 80 ? 'text-green-400' : complianceRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {complianceRate}%
            </span>
          </div>
          <div className="h-2.5 bg-darkBg rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-out ${complianceRate >= 80 ? 'bg-gradient-to-r from-green-500 to-emerald-400' : complianceRate >= 50 ? 'bg-gradient-to-r from-amber-500 to-yellow-400' : 'bg-gradient-to-r from-red-500 to-rose-400'}`}
              style={{ width: `${complianceRate}%` }}
            />
          </div>
        </div>
      )}

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-3 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filter by serial, model, or team…"
            className="w-full bg-darkCard border border-darkBorder rounded-xl pl-10 pr-9 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-gray-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {(['ALL', 'COMPLIANT', 'NON_COMPLIANT', 'PENDING'] as const).map(f => {
            const cfg = f === 'ALL' ? null : STATUS_CFG[f];
            return (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                  statusFilter === f
                    ? cfg ? `${cfg.color} ${cfg.bg} ${cfg.border}` : 'bg-accentCyan/10 border-accentCyan/30 text-accentCyan'
                    : 'border-darkBorder text-gray-500 hover:border-gray-600 hover:text-gray-300'
                }`}>
                {f === 'ALL' ? 'All' : f === 'NON_COMPLIANT' ? 'Violations' : f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-darkBorder bg-darkBg/40 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="p-3 pl-4 w-10" />
                <th className="p-3">Serial</th>
                <th className="p-3">Model</th>
                <th className="p-3">OS</th>
                <th className="p-3">Patch</th>
                <th className="p-3">Team</th>
                <th className="p-3">Last Seen</th>
                <th className="p-3">Compliance</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {loading && (
                <tr><td colSpan={8} className="p-12 text-center">
                  <div className="w-7 h-7 border-2 border-accentCyan/30 border-t-accentCyan rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">Loading compliance data…</p>
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="p-10 text-center">
                  <Smartphone className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">{search || statusFilter !== 'ALL' ? 'No results match your filter' : 'No enrolled devices'}</p>
                </td></tr>
              )}
              {!loading && filtered.map((e, i) => {
                const isOpen = expandedRow === e.serial_number;
                const cfg = STATUS_CFG[e.compliance_status as StatusKey] ?? STATUS_CFG.PENDING;
                return (
                  <>
                    <tr key={e.serial_number}
                      style={{ animationDelay: `${i * 25}ms` }}
                      className={`border-b border-darkBorder hover:bg-darkBg/40 transition-colors cursor-pointer animate-fade-in ${isOpen ? 'bg-darkBg/30' : ''}`}
                      onClick={() => toggleRow(e.serial_number)}>
                      {/* Left accent bar */}
                      <td className="p-0 pl-4 relative w-10">
                        <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r transition-opacity duration-150 ${cfg.dot} ${isOpen ? 'opacity-100' : 'opacity-0'}`} />
                        <div className={`p-1 rounded-lg border border-darkBorder w-fit text-gray-500 transition-all ${isOpen ? 'rotate-180 bg-darkBg text-white' : ''}`}>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </div>
                      </td>
                      <td className="p-3 font-mono text-xs text-white">
                        <Highlighted text={e.serial_number} query={search} />
                      </td>
                      <td className="p-3 font-semibold text-white">
                        <Highlighted text={e.model} query={search} />
                      </td>
                      <td className="p-3 text-xs text-gray-400">{e.os_version}</td>
                      <td className="p-3 text-xs text-gray-500">{e.patch_level}</td>
                      <td className="p-3 text-xs text-gray-400">
                        <Highlighted text={e.team_name || '—'} query={search} />
                      </td>
                      <td className="p-3 text-xs text-gray-500">{new Date(e.last_seen).toLocaleString()}</td>
                      <td className="p-3"><StatusPill status={e.compliance_status} /></td>
                    </tr>
                    <DetailsPanel key={`detail-${e.serial_number}`} entry={e} open={isOpen} />
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length > 0 && !loading && (
        <p className="text-xs text-gray-600 text-right">
          Showing {filtered.length} of {count} device{count !== 1 ? 's' : ''}
          {(search || statusFilter !== 'ALL') && ` · filtered`}
        </p>
      )}
    </div>
  );
}
