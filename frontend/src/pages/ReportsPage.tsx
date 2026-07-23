import { useEffect, useState } from 'react';
import {
  Download, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Clock, Search, Smartphone,
} from 'lucide-react';
import { api } from '../hooks/useApi';
import type { ComplianceReportEntry } from '../types';

function StatusIcon({ status }: { status: string }) {
  if (status === 'COMPLIANT') return <CheckCircle className="w-4 h-4 text-green-400" />;
  if (status === 'NON_COMPLIANT') return <XCircle className="w-4 h-4 text-red-500" />;
  return <Clock className="w-4 h-4 text-amber-500" />;
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLIANT:     'bg-green-500/10 border-green-500/20 text-green-400',
    NON_COMPLIANT: 'bg-red-500/10 border-red-500/20 text-red-400',
    PENDING:       'bg-amber-500/10 border-amber-500/20 text-amber-400',
  };
  const labels: Record<string, string> = {
    COMPLIANT: 'Compliant', NON_COMPLIANT: 'Non-Compliant', PENDING: 'Pending',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold border px-2.5 py-1 rounded-full ${styles[status] ?? styles.PENDING}`}>
      <StatusIcon status={status} />
      {labels[status] ?? status}
    </span>
  );
}

function DetailsPanel({ entry }: { entry: ComplianceReportEntry }) {
  const fields = [
    { label: 'Serial Number', value: entry.serial_number, mono: true },
    { label: 'Model', value: entry.model },
    { label: 'OS Version', value: entry.os_version },
    { label: 'Security Patch', value: entry.patch_level },
    { label: 'Team', value: entry.team_name || 'Unassigned' },
    { label: 'Last Seen', value: new Date(entry.last_seen).toLocaleString() },
  ];
  return (
    <tr>
      <td colSpan={8} className="px-4 pb-4 bg-darkBg/60 border-b border-darkBorder">
        <div className="rounded-xl border border-darkBorder bg-darkCard p-4 mt-1">
          {/* Status banner */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <StatusIcon status={entry.compliance_status} />
              <span className="text-sm font-semibold text-white">
                {entry.compliance_status === 'COMPLIANT' ? 'All policies passing — device is compliant' :
                 entry.compliance_status === 'NON_COMPLIANT' ? 'Policy violation detected — device is non-compliant' :
                 'No policy has been evaluated yet — commands may still have executed successfully'}
              </span>
            </div>
            <StatusPill status={entry.compliance_status} />
          </div>
          {/* Note about command status */}
          {entry.compliance_status === 'PENDING' && (
            <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
              ℹ️ <strong>PENDING</strong> means no compliance policy has been evaluated on this device yet.
              Remote commands (LOCK, REBOOT, etc.) execute immediately via FCM and are separate from policy compliance.
            </div>
          )}
          {/* Info grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {fields.map(({ label, value, mono }) => (
              <div key={label}>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
                <p className={`text-sm text-white font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</p>
              </div>
            ))}
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
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

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

  const downloadCSV = () => api.download('/reports/compliance/csv', 'compliance_report.csv');

  const toggleRow = (serial: string) =>
    setExpandedRow(prev => prev === serial ? null : serial);

  const filtered = entries.filter(e => {
    const q = search.toLowerCase();
    return !q || e.serial_number.toLowerCase().includes(q) ||
      e.model.toLowerCase().includes(q) || e.team_name?.toLowerCase().includes(q);
  });

  const compliant    = entries.filter(e => e.compliance_status === 'COMPLIANT').length;
  const violations   = entries.filter(e => e.compliance_status === 'NON_COMPLIANT').length;
  const pending      = entries.filter(e => e.compliance_status === 'PENDING').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance Reports</h1>
          <p className="text-gray-400 text-sm mt-1">Policy compliance snapshot for all enrolled Android devices</p>
        </div>
        <div className="flex gap-3">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 border border-darkBorder text-gray-300 text-sm px-4 py-2.5 rounded-lg hover:bg-darkBg">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={downloadCSV}
            className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: <Smartphone className="w-5 h-5 text-accentCyan" />, label: 'Total Devices', value: count, color: 'text-white' },
          { icon: <CheckCircle className="w-5 h-5 text-green-400" />, label: 'Compliant', value: compliant, color: 'text-green-400' },
          { icon: <XCircle className="w-5 h-5 text-red-500" />, label: 'Violations', value: violations, color: 'text-red-500' },
          { icon: <Clock className="w-5 h-5 text-amber-500" />, label: 'Pending', value: pending, color: 'text-amber-500' },
        ].map(s => (
          <div key={s.label} className="bg-darkCard border border-darkBorder rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 bg-white/5 rounded-lg">{s.icon}</div>
            <div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-gray-500 absolute left-3 top-3.5" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter by serial, model, or team…"
          className="w-full bg-darkCard border border-darkBorder rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accentCyan"
        />
      </div>

      {/* Table */}
      <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-darkBorder bg-darkBg/30 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <th className="p-3 w-10"></th>
                <th className="p-3">Serial Number</th>
                <th className="p-3">Model</th>
                <th className="p-3">OS Version</th>
                <th className="p-3">Patch Level</th>
                <th className="p-3">Team</th>
                <th className="p-3">Last Seen</th>
                <th className="p-3">Compliance</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500">
                  {search ? 'No results match your filter' : 'No enrolled devices'}
                </td></tr>
              )}
              {filtered.map((e) => (
                <>
                  <tr key={e.serial_number}
                    className={`border-b border-darkBorder hover:bg-darkBg/30 transition-colors ${expandedRow === e.serial_number ? 'bg-darkBg/30' : ''}`}>
                    <td className="p-3">
                      <button
                        onClick={() => toggleRow(e.serial_number)}
                        className="p-1 rounded-lg border border-darkBorder hover:bg-darkBg text-gray-400 hover:text-white transition-colors"
                        title={expandedRow === e.serial_number ? 'Collapse' : 'View Details'}
                      >
                        {expandedRow === e.serial_number
                          ? <ChevronUp className="w-3.5 h-3.5" />
                          : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                    <td className="p-3 font-mono text-xs text-white">{e.serial_number}</td>
                    <td className="p-3 font-semibold text-white">{e.model}</td>
                    <td className="p-3">{e.os_version}</td>
                    <td className="p-3 text-xs">{e.patch_level}</td>
                    <td className="p-3 text-xs text-gray-400">{e.team_name}</td>
                    <td className="p-3 text-xs text-gray-400">{new Date(e.last_seen).toLocaleString()}</td>
                    <td className="p-3"><StatusPill status={e.compliance_status} /></td>
                  </tr>
                  {expandedRow === e.serial_number && <DetailsPanel key={`detail-${e.serial_number}`} entry={e} />}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-gray-500 text-right">
          Showing {filtered.length} of {count} devices
          {search && ` · filtered by "${search}"`}
        </p>
      )}
    </div>
  );
}
