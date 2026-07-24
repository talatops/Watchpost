import { useEffect, useState } from 'react';
import {
  Play, Save, Trash2, Clock, Bookmark, BookmarkCheck,
  Database, ChevronRight, Loader2, Table2, Terminal,
  CheckCircle2, AlertCircle,
} from 'lucide-react';
import { api } from '../hooks/useApi';
import type { TelemetryQuery, QueryResult } from '../types';

const EXAMPLE = `SELECT serial_number, model, os_version, patch_level, compliance_status
FROM device_telemetry_view
WHERE os_version NOT LIKE 'Android 14%'`;

// Quick-pick query templates
const TEMPLATES = [
  { label: 'Non-compliant',   icon: '⚠️', sql: `SELECT serial_number, model, compliance_status\nFROM device_telemetry_view\nWHERE compliance_status = 'NON_COMPLIANT'` },
  { label: 'Low battery',     icon: '🔋', sql: `SELECT serial_number, model, battery_level\nFROM device_telemetry_view\nWHERE battery_level < 20\nORDER BY battery_level ASC` },
  { label: 'Old OS',          icon: '📱', sql: `SELECT serial_number, model, os_version\nFROM device_telemetry_view\nWHERE os_version NOT LIKE 'Android 14%'\nORDER BY os_version` },
  { label: 'Seen today',      icon: '📡', sql: `SELECT serial_number, model, last_seen\nFROM device_telemetry_view\nORDER BY last_seen DESC\nLIMIT 25` },
];

// Minimal SQL keyword highlighting via HTML injection
function highlightSQL(sql: string): string {
  const keywords = ['SELECT','FROM','WHERE','AND','OR','NOT','LIKE','ORDER','BY','ASC','DESC','LIMIT','IN','IS','NULL','JOIN','ON','GROUP','HAVING','DISTINCT'];
  let out = sql
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  keywords.forEach(kw => {
    out = out.replace(new RegExp(`\\b${kw}\\b`, 'g'), `<span class="text-violet-400 font-bold">${kw}</span>`);
  });
  // Strings
  out = out.replace(/'([^']*)'/g, `<span class="text-amber-400">'$1'</span>`);
  // Numbers
  out = out.replace(/\b(\d+)\b/g, `<span class="text-emerald-400">$1</span>`);
  // Comments
  out = out.replace(/(--[^\n]*)/g, `<span class="text-gray-600">$1</span>`);
  return out;
}

export default function QueryPage() {
  const [queries, setQueries] = useState<TelemetryQuery[]>([]);
  const [sql, setSql] = useState(EXAMPLE);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [hoveredQuery, setHoveredQuery] = useState<string | null>(null);

  const flash = (msg: string, isErr = false) => {
    isErr ? setError(msg) : setFeedback(msg);
    setTimeout(() => isErr ? setError('') : setFeedback(''), 5000);
  };

  const load = () =>
    api.get<TelemetryQuery[]>('/queries').then(q => setQueries(q || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const run = async () => {
    setRunning(true); setResult(null); setResultVisible(false); setError('');
    try {
      const r = await api.post<QueryResult>('/queries/run', { query_sql: sql });
      setResult(r);
      // small delay so the fade-in is visible
      setTimeout(() => setResultVisible(true), 80);
    } catch (e: unknown) { flash((e as Error).message, true); }
    setRunning(false);
  };

  const runSaved = async (q: TelemetryQuery) => {
    setSql(q.query_sql);
    setRunning(true); setResult(null); setResultVisible(false); setError('');
    try {
      const r = await api.post<QueryResult>(`/queries/${q.id}/run`);
      setResult(r);
      setTimeout(() => setResultVisible(true), 80);
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
      setStarred(prev => { const n = new Set(prev); n.delete(id); return n; });
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const toggleStar = (id: string) =>
    setStarred(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Sort saved queries: starred first
  const sortedQueries = [...queries].sort((a, b) => {
    const aS = starred.has(a.id) ? 0 : 1;
    const bS = starred.has(b.id) ? 0 : 1;
    return aS - bS;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Telemetry Queries</h1>
          <p className="text-gray-400 text-sm mt-1">
            Run read-only SQL against{' '}
            <span className="font-mono text-accentCyan bg-accentCyan/10 border border-accentCyan/20 px-1.5 py-0.5 rounded text-xs">
              device_telemetry_view
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Database className="w-4 h-4" />
          <span>{queries.length} saved quer{queries.length !== 1 ? 'ies' : 'y'}</span>
        </div>
      </div>

      {/* Toast */}
      {feedback && (
        <div className="fixed bottom-5 right-5 z-50 animate-slide-down flex items-center gap-3 bg-darkCard border border-green-500/30 text-green-400 text-sm font-medium px-4 py-3 rounded-xl shadow-2xl">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />{feedback}
        </div>
      )}
      {error && (
        <div className="fixed bottom-5 right-5 z-50 animate-slide-down flex items-center gap-3 bg-darkCard border border-red-500/30 text-red-400 text-sm font-medium px-4 py-3 rounded-xl shadow-2xl">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Template chips */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-gray-500 self-center mr-1">Templates:</span>
        {TEMPLATES.map(t => (
          <button key={t.label} onClick={() => { setSql(t.sql); setResult(null); setResultVisible(false); }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-darkCard border border-darkBorder rounded-full text-gray-300 hover:border-accentCyan/40 hover:text-accentCyan transition-all">
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* ── Editor panel ── */}
        <div className="lg:col-span-3 space-y-3">
          {/* Editor card */}
          <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
            {/* Editor title bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-darkBorder bg-darkBg/40">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-accentCyan" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">SQL Editor</span>
              </div>
              <button onClick={() => setShowPreview(p => !p)}
                className={`text-[10px] font-semibold px-2 py-1 rounded-lg border transition-all ${showPreview ? 'bg-accentCyan/10 border-accentCyan/30 text-accentCyan' : 'border-darkBorder text-gray-500 hover:border-gray-600'}`}>
                {showPreview ? 'Plain' : 'Highlight'}
              </button>
            </div>

            <div className="relative">
              {/* Editable textarea — always present for input */}
              <textarea
                value={sql}
                onChange={e => setSql(e.target.value)}
                rows={9}
                spellCheck={false}
                className={`w-full bg-transparent p-4 text-sm font-mono focus:outline-none resize-none ${showPreview ? 'text-transparent caret-white selection:bg-accentCyan/30' : 'text-accentCyan'}`}
                style={{ lineHeight: '1.6' }}
              />
              {/* Syntax highlight overlay */}
              {showPreview && (
                <pre
                  aria-hidden
                  className="absolute inset-0 p-4 text-sm font-mono pointer-events-none overflow-hidden whitespace-pre-wrap break-words"
                  style={{ lineHeight: '1.6' }}
                  dangerouslySetInnerHTML={{ __html: highlightSQL(sql) }}
                />
              )}
            </div>
          </div>

          {/* Action bar */}
          <div className="flex gap-3 items-center flex-wrap">
            <button onClick={run} disabled={running}
              className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity shadow-lg shadow-accentBlue/20">
              {running
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Running…</>
                : <><Play className="w-4 h-4" /> Run Query</>}
            </button>
            <div className="flex gap-2 flex-1 min-w-0">
              <input
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveQuery()}
                placeholder="Name to save as…"
                className="flex-1 min-w-0 bg-darkCard border border-darkBorder rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all"
              />
              <button onClick={saveQuery}
                className="flex items-center gap-1.5 px-4 py-2.5 border border-darkBorder text-sm text-gray-300 rounded-xl hover:bg-darkBg hover:border-gray-600 transition-all">
                <Save className="w-4 h-4" /> Save
              </button>
            </div>
          </div>

          {/* ── Results ── */}
          {running && !result && (
            <div className="bg-darkCard border border-darkBorder rounded-2xl p-10 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-accentCyan/30 border-t-accentCyan rounded-full animate-spin" />
              <p className="text-gray-400 text-sm">Executing query…</p>
            </div>
          )}

          {result && (
            <div
              className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden"
              style={{
                opacity: resultVisible ? 1 : 0,
                transform: resultVisible ? 'translateY(0)' : 'translateY(12px)',
                transition: 'opacity 0.35s ease, transform 0.35s ease',
              }}>
              {/* Result header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-darkBorder bg-darkBg/40">
                <div className="flex items-center gap-3">
                  <Table2 className="w-4 h-4 text-accentCyan" />
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Results</span>
                  {/* Animated count badge */}
                  <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-accentCyan/10 border border-accentCyan/20 text-accentCyan animate-scale-in">
                    {result.count} row{result.count !== 1 ? 's' : ''}
                  </span>
                  {result.columns?.length > 0 && (
                    <span className="text-[10px] text-gray-500">
                      {result.columns.length} col{result.columns.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 rotate-90" />
              </div>

              <div className="overflow-x-auto max-h-80">
                {result.rows.length === 0 ? (
                  <div className="p-10 text-center">
                    <Table2 className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">Query returned no rows</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-darkBg/90 backdrop-blur-sm border-b border-darkBorder">
                        {(result.columns || []).map(c => (
                          <th key={c} className="px-3 py-2.5 font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-darkBorder font-mono">
                      {result.rows.map((row, i) => (
                        <tr key={i}
                          style={{ animationDelay: `${i * 20}ms` }}
                          className="hover:bg-darkBg/50 transition-colors animate-fade-in">
                          {(result.columns || []).map(c => {
                            const val = String(row[c] ?? '');
                            // Colour-code common values
                            const valClass =
                              val === 'COMPLIANT' || val === 'ENROLLED'   ? 'text-emerald-400' :
                              val === 'NON_COMPLIANT' || val === 'FAILED' ? 'text-rose-400'    :
                              val === 'UNENROLLED'                         ? 'text-amber-400'   :
                              'text-gray-300';
                            return (
                              <td key={c} className={`px-3 py-2 whitespace-nowrap max-w-[180px] truncate ${valClass}`}>
                                {val}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Saved queries sidebar ── */}
        <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-darkBorder bg-darkBg/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bookmark className="w-3.5 h-3.5 text-accentCyan" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Saved</span>
            </div>
            {queries.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-darkBorder text-gray-400">
                {queries.length}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-darkBorder">
            {queries.length === 0 && (
              <div className="p-6 text-center">
                <Bookmark className="w-7 h-7 text-gray-700 mx-auto mb-2" />
                <p className="text-gray-500 text-xs">No saved queries yet</p>
                <p className="text-gray-600 text-[10px] mt-1">Save a query using the input above</p>
              </div>
            )}
            {sortedQueries.map(q => {
              const isHov = hoveredQuery === q.id;
              const isStarred = starred.has(q.id);
              return (
                <div key={q.id}
                  onMouseEnter={() => setHoveredQuery(q.id)}
                  onMouseLeave={() => setHoveredQuery(null)}
                  className={`p-3 transition-colors ${isHov ? 'bg-darkBg/60' : ''}`}>
                  <div className="flex items-start justify-between gap-1 mb-1">
                    {/* Star toggle */}
                    <button onClick={() => toggleStar(q.id)}
                      className={`flex-shrink-0 mt-0.5 transition-all ${isStarred ? 'text-amber-400 scale-110' : 'text-gray-600 hover:text-amber-400'}`}
                      title={isStarred ? 'Unstar' : 'Star'}>
                      {isStarred
                        ? <BookmarkCheck className="w-3.5 h-3.5" />
                        : <Bookmark className="w-3.5 h-3.5" />}
                    </button>
                    {/* Query name — click to load & run */}
                    <button onClick={() => runSaved(q)}
                      className="flex-1 text-xs font-semibold text-white text-left hover:text-accentCyan transition-colors truncate">
                      {q.name}
                    </button>
                    <button onClick={() => del(q.id)}
                      className={`flex-shrink-0 p-0.5 text-red-500/50 hover:text-red-400 transition-all ${isHov ? 'opacity-100' : 'opacity-0'}`}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  {/* SQL snippet */}
                  <p className="text-[10px] font-mono text-gray-600 truncate pl-5">
                    {q.query_sql.replace(/\s+/g, ' ').slice(0, 60)}…
                  </p>
                  {q.last_run_at && (
                    <p className="text-[10px] text-gray-600 flex items-center gap-1 mt-1 pl-5">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(q.last_run_at).toLocaleString()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
