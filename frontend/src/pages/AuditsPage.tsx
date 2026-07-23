import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { api } from '../hooks/useApi';
import type { AuditLog } from '../types';

const ACTION_COLOR: Record<string, string> = {
  USER_LOGIN: 'text-accentCyan',
  POLICY_CREATE: 'text-green-400',
  POLICY_UPDATE: 'text-amber-400',
  POLICY_DELETE: 'text-red-400',
  REMOTE_REBOOT: 'text-blue-400',
  REMOTE_LOCK: 'text-amber-400',
  REMOTE_WIPE: 'text-red-400',
  REMOTE_SYNC: 'text-accentCyan',
  APP_CREATE: 'text-green-400',
  APP_DEPLOY: 'text-purple-400',
  USER_CREATE: 'text-green-400',
  USER_ROLE_UPDATE: 'text-amber-400',
};

export default function AuditsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<AuditLog[]>('/audits').then(l => setLogs(l || [])).catch(e => setError(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Audit Trail</h1>
        <p className="text-gray-400 text-sm mt-1">Immutable log of all administrative actions</p>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}

      <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-darkBorder bg-darkBg/30 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <th className="p-3">Timestamp</th>
              <th className="p-3">Action</th>
              <th className="p-3">Target</th>
              <th className="p-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-darkBorder text-gray-300">
            {logs.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-500">No audit logs yet</td></tr>}
            {logs.map((l, i) => (
              <tr key={i} className="hover:bg-darkBg/30">
                <td className="p-3 text-xs text-gray-400 whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                <td className="p-3">
                  <span className={`flex items-center gap-1.5 font-semibold text-sm ${ACTION_COLOR[l.action] || 'text-white'}`}>
                    <Activity className="w-3.5 h-3.5" /> {l.action}
                  </span>
                </td>
                <td className="p-3 text-xs font-mono text-gray-400">{l.target_type} ({l.target_id.slice(0, 8)}…)</td>
                <td className="p-3 text-xs">
                  <pre className="font-mono bg-darkBg/50 border border-darkBorder p-2 rounded max-w-md overflow-x-auto whitespace-pre-wrap">{l.details}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
