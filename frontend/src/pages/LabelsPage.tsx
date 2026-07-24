import React, { useEffect, useState, useMemo } from 'react';
import { Plus, Tag, Pencil, Trash2, RefreshCw, Search, X, Zap, Hash } from 'lucide-react';
import { api } from '../hooks/useApi';
import type { Label } from '../types';
import Modal from '../components/Modal';

const EXAMPLE_QUERIES = [
  { label: 'Android 14', query: "os_version LIKE 'Android 14%'", color: 'cyan' },
  { label: 'Low battery', query: 'battery_level < 20', color: 'amber' },
  { label: 'Low storage', query: 'storage_available < 5368709120', color: 'orange' },
  { label: 'Enrolled', query: "enrollment_status = 'ENROLLED'", color: 'green' },
  { label: 'Unenrolled', query: "enrollment_status = 'UNENROLLED'", color: 'red' },
];

// 12-colour rotating palette for label chips
const LABEL_PALETTES = [
  { bg: 'bg-cyan-500/15',    border: 'border-cyan-500/35',    text: 'text-cyan-300',    dot: 'bg-cyan-400',    glow: 'rgba(0,210,255,0.15)'  },
  { bg: 'bg-violet-500/15',  border: 'border-violet-500/35',  text: 'text-violet-300',  dot: 'bg-violet-400',  glow: 'rgba(139,92,246,0.15)' },
  { bg: 'bg-emerald-500/15', border: 'border-emerald-500/35', text: 'text-emerald-300', dot: 'bg-emerald-400', glow: 'rgba(52,211,153,0.15)' },
  { bg: 'bg-amber-500/15',   border: 'border-amber-500/35',   text: 'text-amber-300',   dot: 'bg-amber-400',   glow: 'rgba(251,191,36,0.15)' },
  { bg: 'bg-rose-500/15',    border: 'border-rose-500/35',    text: 'text-rose-300',    dot: 'bg-rose-400',    glow: 'rgba(251,113,133,0.15)'},
  { bg: 'bg-sky-500/15',     border: 'border-sky-500/35',     text: 'text-sky-300',     dot: 'bg-sky-400',     glow: 'rgba(56,189,248,0.15)' },
  { bg: 'bg-pink-500/15',    border: 'border-pink-500/35',    text: 'text-pink-300',    dot: 'bg-pink-400',    glow: 'rgba(236,72,153,0.15)' },
  { bg: 'bg-teal-500/15',    border: 'border-teal-500/35',    text: 'text-teal-300',    dot: 'bg-teal-400',    glow: 'rgba(45,212,191,0.15)' },
  { bg: 'bg-orange-500/15',  border: 'border-orange-500/35',  text: 'text-orange-300',  dot: 'bg-orange-400',  glow: 'rgba(251,146,60,0.15)' },
  { bg: 'bg-indigo-500/15',  border: 'border-indigo-500/35',  text: 'text-indigo-300',  dot: 'bg-indigo-400',  glow: 'rgba(99,102,241,0.15)' },
  { bg: 'bg-lime-500/15',    border: 'border-lime-500/35',    text: 'text-lime-300',    dot: 'bg-lime-400',    glow: 'rgba(163,230,53,0.15)' },
  { bg: 'bg-fuchsia-500/15', border: 'border-fuchsia-500/35', text: 'text-fuchsia-300', dot: 'bg-fuchsia-400', glow: 'rgba(232,121,249,0.15)'},
];

function palFor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return LABEL_PALETTES[Math.abs(h) % LABEL_PALETTES.length];
}

const EXAMPLE_CHIP_COLORS: Record<string, string> = {
  cyan: 'bg-cyan-500/15 border-cyan-500/35 text-cyan-300 hover:bg-cyan-500/25',
  amber: 'bg-amber-500/15 border-amber-500/35 text-amber-300 hover:bg-amber-500/25',
  orange: 'bg-orange-500/15 border-orange-500/35 text-orange-300 hover:bg-orange-500/25',
  green: 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25',
  red: 'bg-rose-500/15 border-rose-500/35 text-rose-300 hover:bg-rose-500/25',
};

export default function LabelsPage() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'DYNAMIC' | 'MANUAL'>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Label | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [ruleQuery, setRuleQuery] = useState('');
  const [labelType, setLabelType] = useState('DYNAMIC');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const flash = (msg: string, isErr = false) => {
    isErr ? setError(msg) : setFeedback(msg);
    setTimeout(() => isErr ? setError('') : setFeedback(''), 4000);
  };

  const load = () =>
    api.get<Label[]>('/labels').then(l => setLabels(l || [])).catch(e => flash(e.message, true));
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null); setName(''); setDesc(''); setRuleQuery(''); setLabelType('DYNAMIC');
    setShowModal(true);
  };
  const openEdit = (l: Label) => {
    setEditing(l); setName(l.name); setDesc(l.description);
    setRuleQuery(l.rule_query); setLabelType(l.label_type);
    setShowModal(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/labels/${editing.id}`, { name, description: desc, rule_query: ruleQuery, label_type: labelType });
        flash('Label updated');
      } else {
        await api.post('/labels', { name, description: desc, rule_query: ruleQuery, label_type: labelType });
        flash('Label created');
      }
      setShowModal(false);
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this label?')) return;
    try {
      await api.delete(`/labels/${id}`);
      flash('Label deleted');
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const evaluateAll = async () => {
    setEvaluating(true);
    try {
      const r = await api.post<{ labels_evaluated: number }>('/labels/evaluate');
      flash(`Evaluated ${r.labels_evaluated} label${r.labels_evaluated !== 1 ? 's' : ''}`);
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
    setEvaluating(false);
  };

  const filtered = useMemo(() => labels.filter(l => {
    const matchSearch = search === '' ||
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.description?.toLowerCase().includes(search.toLowerCase()) ||
      l.rule_query.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'ALL' || l.label_type === typeFilter;
    return matchSearch && matchType;
  }), [labels, search, typeFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Labels</h1>
          <p className="text-gray-400 text-sm mt-1">Dynamic rule-based device groups</p>
        </div>
        <div className="flex gap-3">
          <button onClick={evaluateAll} disabled={evaluating}
            className="flex items-center gap-2 border border-darkBorder text-gray-300 text-sm px-4 py-2.5 rounded-xl hover:bg-darkBg transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${evaluating ? 'animate-spin' : ''}`} />
            Re-evaluate All
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-accentBlue/20">
            <Plus className="w-4 h-4" /> New Label
          </button>
        </div>
      </div>

      {/* Toast */}
      {feedback && (
        <div className="fixed bottom-5 right-5 z-50 animate-slide-down flex items-center gap-3 bg-darkCard border border-green-500/30 text-green-400 text-sm font-medium px-4 py-3 rounded-xl shadow-2xl">
          <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center text-xs">✓</div>
          {feedback}
        </div>
      )}
      {error && (
        <div className="fixed bottom-5 right-5 z-50 animate-slide-down flex items-center gap-3 bg-darkCard border border-red-500/30 text-red-400 text-sm font-medium px-4 py-3 rounded-xl shadow-2xl">
          <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center text-xs">✕</div>
          {error}
        </div>
      )}

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-3 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search labels, rules…"
            className="w-full bg-darkCard border border-darkBorder rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-gray-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {(['ALL', 'DYNAMIC', 'MANUAL'] as const).map(f => (
            <button key={f} onClick={() => setTypeFilter(f)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                typeFilter === f
                  ? 'bg-accentCyan/10 border-accentCyan/40 text-accentCyan'
                  : 'border-darkBorder text-gray-400 hover:border-gray-600 hover:text-gray-300'
              }`}>
              {f === 'ALL' ? 'All' : f === 'DYNAMIC' ? '⚡ Dynamic' : '✋ Manual'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary chips row */}
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-500">
            {filtered.length} of {labels.length} label{labels.length !== 1 ? 's' : ''}
            {search && ` matching "${search}"`}
          </span>
          <span className="text-gray-700">·</span>
          <span className="text-xs text-gray-500">
            {labels.reduce((s, l) => s + l.device_count, 0)} total device matches
          </span>
        </div>
      )}

      {/* Label cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 && (
          <div className="col-span-3 py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-darkCard border border-darkBorder flex items-center justify-center mx-auto mb-4">
              <Tag className="w-7 h-7 text-gray-700" />
            </div>
            <p className="text-gray-400 font-medium">{labels.length === 0 ? 'No labels yet' : 'No labels match your search'}</p>
            <p className="text-gray-600 text-sm mt-1">
              {labels.length === 0 ? 'Create your first label to group devices dynamically' : 'Try a different search term or filter'}
            </p>
          </div>
        )}

        {filtered.map((l, idx) => {
          const pal = palFor(l.name);
          const isHov = hoveredId === l.id;
          return (
            <div key={l.id}
              onMouseEnter={() => setHoveredId(l.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                animationDelay: `${idx * 50}ms`,
                boxShadow: isHov ? `0 8px 32px -8px ${pal.glow}, 0 0 0 1px ${pal.glow}` : '0 2px 12px -4px rgba(0,0,0,0.3)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                transform: isHov ? 'translateY(-2px)' : 'translateY(0)',
              }}
              className={`animate-fade-in-up bg-darkCard border ${isHov ? pal.border : 'border-darkBorder'} rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden`}>

              {/* Subtle tinted glow */}
              <div className={`absolute inset-0 ${pal.bg} rounded-2xl pointer-events-none transition-opacity duration-200 ${isHov ? 'opacity-100' : 'opacity-0'}`} />

              {/* Header row */}
              <div className="relative flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Colour chip */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${pal.bg} border ${pal.border} flex items-center justify-center`}>
                    <Tag className={`w-4 h-4 ${pal.text}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">{l.name}</p>
                    {l.description && <p className="text-xs text-gray-500 truncate mt-0.5">{l.description}</p>}
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => openEdit(l)}
                    className="p-1.5 border border-darkBorder rounded-lg text-gray-500 hover:text-white hover:bg-darkBg transition-all">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => del(l.id)}
                    className="p-1.5 border border-red-500/20 rounded-lg text-red-500/60 hover:text-red-400 hover:bg-red-500/10 transition-all">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Type + device count badges */}
              <div className="relative flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border ${
                  l.label_type === 'DYNAMIC'
                    ? 'bg-accentCyan/10 border-accentCyan/30 text-accentCyan'
                    : 'bg-gray-500/10 border-gray-500/30 text-gray-400'
                }`}>
                  {l.label_type === 'DYNAMIC' ? <Zap className="w-2.5 h-2.5" /> : <Hash className="w-2.5 h-2.5" />}
                  {l.label_type}
                </span>
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg ${pal.bg} border ${pal.border} ${pal.text}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${pal.dot} animate-pulse2`} />
                  {l.device_count} device{l.device_count !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Rule query preview */}
              <div className="relative">
                <pre className={`text-xs font-mono ${pal.text} bg-darkBg/60 border border-darkBorder p-2.5 rounded-xl overflow-x-auto whitespace-pre-wrap break-all`}>
                  {l.rule_query}
                </pre>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit modal */}
      {showModal && (
        <Modal title={editing ? 'Edit Label' : 'Create Label'} onClose={() => setShowModal(false)} wide>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Label Name</label>
                <input value={name} onChange={e => setName(e.target.value)} required autoFocus
                  placeholder="e.g. Low Battery Devices"
                  className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
                {/* Live chip preview */}
                {name && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-500">Preview:</span>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${palFor(name).bg} ${palFor(name).border} ${palFor(name).text}`}>
                      <Tag className="w-3 h-3" />{name}
                    </span>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Type</label>
                <div className="grid grid-cols-2 gap-2 mt-0.5">
                  {(['DYNAMIC', 'MANUAL'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setLabelType(t)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        labelType === t
                          ? 'bg-accentCyan/10 border-accentCyan/40 text-accentCyan'
                          : 'border-darkBorder text-gray-400 hover:border-gray-600'
                      }`}>
                      {t === 'DYNAMIC' ? <Zap className="w-3.5 h-3.5" /> : <Hash className="w-3.5 h-3.5" />}
                      {t === 'DYNAMIC' ? 'Dynamic' : 'Manual'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Description</label>
              <input value={desc} onChange={e => setDesc(e.target.value)}
                placeholder="Optional description…"
                className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Rule Query <span className="normal-case text-gray-600 font-normal">(SQL WHERE clause on devices table)</span></label>
              <textarea value={ruleQuery} onChange={e => setRuleQuery(e.target.value)} required rows={3}
                placeholder="e.g. battery_level < 20"
                className="w-full bg-darkBg border border-darkBorder rounded-xl p-3 text-xs text-accentCyan font-mono focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all resize-none" />
            </div>

            {/* Quick example chips */}
            <div className="p-3 bg-darkBg/50 border border-darkBorder rounded-xl">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Quick Examples — click to use</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_QUERIES.map(eq => (
                  <button key={eq.label} type="button" onClick={() => setRuleQuery(eq.query)}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border rounded-full transition-all ${EXAMPLE_CHIP_COLORS[eq.color]}`}>
                    <Tag className="w-3 h-3" />{eq.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowModal(false)}
                className="px-5 py-2.5 border border-darkBorder text-sm text-gray-400 rounded-xl hover:bg-darkBg transition-colors">
                Cancel
              </button>
              <button type="submit"
                className="px-5 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity">
                {editing ? 'Save Changes' : 'Create Label'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
