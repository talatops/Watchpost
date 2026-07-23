import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { api } from '../hooks/useApi';
import type { ComplianceReportEntry } from '../types';
import StatusBadge from '../components/StatusBadge';

export default function ReportsPage() {
  const [entries, setEntries] = useState<ComplianceReportEntry[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance Reports</h1>
          <p className="text-gray-400 text-sm mt-1">Point-in-time compliance snapshot for all enrolled devices</p>
        </div>
        <div className="flex gap-3">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 border border-darkBorder text-gray-300 text-sm px-4 py-3 rounded-lg hover:bg-darkBg">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={downloadCSV}
            className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-3 rounded-lg hover:opacity-90">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}

      <div className="flex gap-4 text-sm text-gray-400">
        <span><strong className="text-white">{count}</strong> devices in report</span>
        <span>·</span>
        <span><strong className="text-green-400">{entries.filter(e => e.compliance_status === 'COMPLIANT').length}</strong> compliant</span>
        <span>·</span>
        <span><strong className="text-red-400">{entries.filter(e => e.compliance_status === 'NON_COMPLIANT').length}</strong> non-compliant</span>
        <span>·</span>
        <span><strong className="text-amber-400">{entries.filter(e => e.compliance_status === 'PENDING').length}</strong> pending</span>
      </div>

      <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-darkBorder bg-darkBg/30 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <th className="p-3">Serial Number</th>
                <th className="p-3">Model</th>
                <th className="p-3">OS Version</th>
                <th className="p-3">Patch Level</th>
                <th className="p-3">Team</th>
                <th className="p-3">Last Seen</th>
                <th className="p-3">Compliance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-darkBorder text-gray-300">
              {entries.length === 0 && !loading && (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">No enrolled devices</td></tr>
              )}
              {entries.map((e, i) => (
                <tr key={i} className="hover:bg-darkBg/30">
                  <td className="p-3 font-mono text-xs text-white">{e.serial_number}</td>
                  <td className="p-3">{e.model}</td>
                  <td className="p-3">{e.os_version}</td>
                  <td className="p-3 text-xs">{e.patch_level}</td>
                  <td className="p-3 text-xs text-gray-400">{e.team_name}</td>
                  <td className="p-3 text-xs text-gray-400">{new Date(e.last_seen).toLocaleString()}</td>
                  <td className="p-3"><StatusBadge status={e.compliance_status} small /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
