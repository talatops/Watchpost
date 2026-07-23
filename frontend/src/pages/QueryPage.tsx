import { useEffect, useState } from 'react';
import { Play, Save, Trash2, Clock } from 'lucide-react';
import { api } from '../hooks/useApi';
import type { TelemetryQuery, QueryResult } from '../types';

const EXAMPLE = `SELECT serial_number, model, os_version, patch_level, compliance_status
FROM device_telemetry_view
WHERE os_version NOT LIKE 'Android 14%'`;

export default function QueryPage() {
  const [queries, setQueries] = useState<TelemetryQuery[]>([]);
  const [sql, setSql] = useState(EXAMPLE);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const flash = (msg: string, isErr = false) => {
    isErr ? setError(msg) : setFeedback(msg);
    setTimeout(() => isErr ? setError('') : setFeedback(''), 5000);
  };

  const load = () => api.get<TelemetryQuery[]>('/queries').then(q => setQueries(q || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const run = async () => {
    setRunning(true); setResult(null); setError('');
    try {
      const r = await api.post<QueryResult>('/queries/run', { query_sql: sql });
      setResult(r);
    } catch (e: unknown) { flash((e as Error).message, true); }
    setRunning(false);
  };

  const runSaved = async (q: TelemetryQuery) => {
    setSql(q.query_sql);
    setRunning(true); setResult(null); setError('');
    try {
      const r = await api.post<QueryResult>(`/queries/${q.id}/run`);
      setResult(r);
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
    setRunning(false);
  };

  const saveQuery = async () => {
    if (!saveName.trim()) { flash('Enter a name to save', true); return; }
    try {
      await api.post('/queries', { name: saveName, query_sql: sql });
      flash(`Query "${saveName}" saved`);
      setSaveName('');
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const del = async (id: string) => {
    try {
      await api.delete(`/queries/${id}`);
      flash('Query deleted');
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Telemetry Queries</h1>
        <p className="text-gray-400 text-sm mt-1">Run read-only SQL queries against <span className="font-mono text-accentCyan">device_telemetry_view</span></p>
      </div>

      {feedback && <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">{feedback}</div>}
      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Editor */}
        <div className="lg:col-span-3 space-y-3">
          <textarea value={sql} onChange={e => setSql(e.target.value)} rows={8}
            spellCheck={false}
            className="w-full bg-darkCard border border-darkBorder rounded-xl p-4 text-sm text-accentCyan font-mono focus:outline-none focus:border-accentCyan resize-none" />

          <div className="flex gap-3 items-center">
            <button onClick={run} disabled={running}
              className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50">
              <Play className="w-4 h-4" /> {running ? 'Running…' : 'Run Query'}
            </button>
            <div className="flex gap-2 flex-1">
              <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Name to save as…"
                className="flex-1 bg-darkCard border border-darkBorder rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accentCyan" />
              <button onClick={saveQuery} className="flex items-center gap-1.5 px-4 py-2.5 border border-darkBorder text-sm text-gray-300 rounded-lg hover:bg-darkBg">
                <Save className="w-4 h-4" /> Save
              </button>
            </div>
          </div>

          {/* Results */}
          {result && (
            <div className="bg-darkCard border border-darkBorder rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-darkBorder">
                <span className="text-xs font-semibold text-gray-400 uppercase">{result.count} row{result.count !== 1 ? 's' : ''}</span>
              </div>
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-darkBg/30">
                      {(result.columns || []).map(c => <th key={c} className="p-2.5 font-semibold text-gray-400 uppercase whitespace-nowrap">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-darkBorder font-mono">
                    {result.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-darkBg/30">
                        {(result.columns || []).map(c => (
                          <td key={c} className="p-2.5 text-gray-300 whitespace-nowrap max-w-xs truncate">
                            {String(row[c] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Saved queries sidebar */}
        <div className="bg-darkCard border border-darkBorder rounded-xl p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Saved Queries</h3>
          {queries.length === 0 && <p className="text-gray-500 text-xs">None yet</p>}
          <div className="space-y-2">
            {queries.map(q => (
              <div key={q.id} className="p-3 border border-darkBorder rounded-lg hover:border-gray-600 group">
                <div className="flex items-start justify-between gap-1">
                  <button onClick={() => runSaved(q)} className="text-sm font-semibold text-white text-left hover:text-accentCyan truncate">{q.name}</button>
                  <button onClick={() => del(q.id)} className="opacity-0 group-hover:opacity-100 p-0.5 text-red-400 hover:text-red-300 flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {q.last_run_at && (
                  <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3" /> {new Date(q.last_run_at).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
