import React, { useEffect, useState } from 'react';
import { Plus, Tag, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { api } from '../hooks/useApi';
import type { Label } from '../types';
import Modal from '../components/Modal';

const EXAMPLE_QUERIES = [
  { label: 'Android 14 devices', query: "os_version LIKE 'Android 14%'" },
  { label: 'Low battery (< 20%)', query: 'battery_level < 20' },
  { label: 'Low storage (< 5 GB)', query: 'storage_available < 5368709120' },
  { label: 'All enrolled', query: "enrollment_status = 'ENROLLED'" },
];

export default function LabelsPage() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Label | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [ruleQuery, setRuleQuery] = useState('');
  const [labelType, setLabelType] = useState('DYNAMIC');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [evaluating, setEvaluating] = useState(false);

  const flash = (msg: string, isErr = false) => {
    isErr ? setError(msg) : setFeedback(msg);
    setTimeout(() => isErr ? setError('') : setFeedback(''), 4000);
  };

  const load = () => api.get<Label[]>('/labels').then(l => setLabels(l || [])).catch(e => flash(e.message, true));
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setName(''); setDesc(''); setRuleQuery(''); setLabelType('DYNAMIC'); setShowModal(true); };
  const openEdit = (l: Label) => { setEditing(l); setName(l.name); setDesc(l.description); setRuleQuery(l.rule_query); setLabelType(l.label_type); setShowModal(true); };

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
      flash(`Evaluated ${r.labels_evaluated} labels`);
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
    setEvaluating(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Labels</h1>
          <p className="text-gray-400 text-sm mt-1">Dynamic rule-based device groups</p>
        </div>
        <div className="flex gap-3">
          <button onClick={evaluateAll} disabled={evaluating}
            className="flex items-center gap-2 border border-darkBorder text-gray-300 text-sm px-4 py-3 rounded-lg hover:bg-darkBg">
            <RefreshCw className={`w-4 h-4 ${evaluating ? 'animate-spin' : ''}`} /> Re-evaluate All
          </button>
          <button onClick={openNew} className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-3 rounded-lg hover:opacity-90">
            <Plus className="w-4 h-4" /> New Label
          </button>
        </div>
      </div>

      {feedback && <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">{feedback}</div>}
      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {labels.length === 0 && <p className="text-gray-500 text-sm col-span-3">No labels yet.</p>}
        {labels.map(l => (
          <div key={l.id} className="bg-darkCard border border-darkBorder rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-accentCyan" />
                <span className="font-bold text-white">{l.name}</span>
                <span className="text-[10px] border border-darkBorder text-gray-400 px-1.5 py-0.5 rounded">{l.label_type}</span>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => openEdit(l)} className="p-1.5 border border-darkBorder rounded-lg text-gray-400 hover:text-white hover:bg-darkBg">
                  <Pencil className="w-3 h-3" />
                </button>
                <button onClick={() => del(l.id)} className="p-1.5 border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/10">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
            {l.description && <p className="text-xs text-gray-400 mb-2">{l.description}</p>}
            <pre className="text-xs font-mono text-accentCyan bg-darkBg/50 border border-darkBorder p-2 rounded-lg overflow-x-auto">{l.rule_query}</pre>
            <p className="text-xs text-gray-400 mt-2">{l.device_count} device{l.device_count !== 1 ? 's' : ''} matched</p>
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit Label' : 'Create Label'} onClose={() => setShowModal(false)} wide>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Label Name</label>
                <input value={name} onChange={e => setName(e.target.value)} required
                  className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Type</label>
                <select value={labelType} onChange={e => setLabelType(e.target.value)}
                  className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan">
                  <option value="DYNAMIC">Dynamic (auto-evaluated)</option>
                  <option value="MANUAL">Manual</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Description</label>
              <input value={desc} onChange={e => setDesc(e.target.value)}
                className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Rule Query (SQL WHERE clause on devices table)</label>
              <textarea value={ruleQuery} onChange={e => setRuleQuery(e.target.value)} required rows={3}
                className="w-full bg-darkBg border border-darkBorder rounded-lg p-3 text-xs text-accentCyan font-mono focus:outline-none focus:border-accentCyan" />
            </div>
            <div className="p-3 bg-darkBg/50 border border-darkBorder rounded-lg">
              <p className="text-xs text-gray-400 mb-2 font-semibold uppercase">Quick Examples</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_QUERIES.map(eq => (
                  <button key={eq.label} type="button" onClick={() => setRuleQuery(eq.query)}
                    className="text-xs px-2 py-1 border border-accentCyan/30 text-accentCyan rounded hover:bg-accentCyan/10">
                    {eq.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-darkBorder text-sm text-gray-400 rounded-lg hover:bg-darkBg">Cancel</button>
              <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-lg text-sm">
                {editing ? 'Save' : 'Create Label'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
