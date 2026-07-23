import React, { useEffect, useState } from 'react';
import { Plus, Code, Trash2, Pencil, History, RotateCcw } from 'lucide-react';
import { api } from '../hooks/useApi';
import type { Policy, PolicyVersion } from '../types';
import Modal from '../components/Modal';

const DEFAULT_YAML = `policy:
  password_complexity: HIGH
  camera_disabled: true
  wifi_ssid: "Enterprise-Secure"
  max_password_attempts: 10
  encryption_required: true`;

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [yaml, setYaml] = useState(DEFAULT_YAML);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  // Version history state
  const [historyPolicy, setHistoryPolicy] = useState<Policy | null>(null);
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<PolicyVersion | null>(null);

  const flash = (msg: string, isErr = false) => {
    isErr ? setError(msg) : setFeedback(msg);
    setTimeout(() => isErr ? setError('') : setFeedback(''), 4000);
  };

  const load = () =>
    api.get<Policy[]>('/policies').then(p => setPolicies(p || [])).catch(e => flash(e.message, true));

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null); setName(''); setDesc(''); setYaml(DEFAULT_YAML); setShowModal(true);
  };
  const openEdit = (p: Policy) => {
    setEditing(p); setName(p.name); setDesc(p.description); setYaml(p.content_yaml); setShowModal(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/policies/${editing.id}`, { name, description: desc, content_yaml: yaml });
        flash('Policy updated');
      } else {
        await api.post('/policies', { name, description: desc, content_yaml: yaml });
        flash('Policy created');
      }
      setShowModal(false);
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this policy?')) return;
    try {
      await api.delete(`/policies/${id}`);
      flash('Policy deleted');
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  // ---- History & Rollback -------------------------------------------------

  const openHistory = async (p: Policy) => {
    setHistoryPolicy(p);
    setPreviewVersion(null);
    setHistoryLoading(true);
    try {
      const v = await api.get<PolicyVersion[]>(`/policies/${p.id}/versions`);
      setVersions(v || []);
    } catch (e: unknown) {
      flash((e as Error).message, true);
      setVersions([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const rollback = async (policyId: string, version: number) => {
    if (!confirm(`Roll back to version ${version}? This will create a new version with that content.`)) return;
    try {
      await api.post(`/policies/${policyId}/rollback`, { version });
      flash(`Rolled back to version ${version} — new version created`);
      setHistoryPolicy(null);
      setVersions([]);
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance Policies</h1>
          <p className="text-gray-400 text-sm mt-1">Policy-as-Code — YAML declarative configuration</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-3 rounded-lg hover:opacity-90">
          <Plus className="w-4 h-4" /> New Policy
        </button>
      </div>

      {feedback && <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">{feedback}</div>}
      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {policies.length === 0 && <p className="text-gray-500 text-sm">No policies yet</p>}
        {policies.map(p => (
          <div key={p.id} className="bg-darkCard border border-darkBorder rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-white">{p.name}</h3>
                <span className="text-xs text-accentCyan bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded font-mono">v{p.version}</span>
              </div>
              <p className="text-sm text-gray-400">{p.description}</p>
              <pre className="mt-3 text-xs text-gray-400 font-mono bg-darkBg/60 p-3 rounded-lg border border-darkBorder max-h-40 overflow-y-auto whitespace-pre-wrap">{p.content_yaml}</pre>
            </div>
            <div className="flex gap-2 justify-end mt-4 border-t border-darkBorder pt-3">
              <button onClick={() => openHistory(p)} className="flex items-center gap-1 px-3 py-1.5 border border-purple-500/30 text-xs text-purple-400 rounded-lg hover:bg-purple-500/10">
                <History className="w-3.5 h-3.5" /> History
              </button>
              <button onClick={() => openEdit(p)} className="flex items-center gap-1 px-3 py-1.5 border border-darkBorder text-xs text-white rounded-lg hover:bg-darkBg">
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={() => del(p.id)} className="flex items-center gap-1 px-3 py-1.5 border border-red-500/20 text-xs text-red-400 rounded-lg hover:bg-red-500/10">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Policy modal */}
      {showModal && (
        <Modal title={editing ? 'Edit Policy' : 'Create Policy'} onClose={() => setShowModal(false)} wide>
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Policy Name</label>
              <input value={name} onChange={e => setName(e.target.value)} required
                className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Description</label>
              <input value={desc} onChange={e => setDesc(e.target.value)}
                className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase">YAML Configuration</label>
                <span className="text-[10px] text-gray-500 flex items-center gap-1"><Code className="w-3 h-3" /> Must contain a policy: block</span>
              </div>
              <textarea value={yaml} onChange={e => setYaml(e.target.value)} rows={12} required
                className="w-full bg-darkBg border border-darkBorder rounded-lg p-3 text-xs text-gray-300 font-mono focus:outline-none focus:border-accentCyan" />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-darkBorder text-sm text-gray-400 rounded-lg hover:bg-darkBg">Cancel</button>
              <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-lg text-sm hover:opacity-90">Save Policy</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Version History modal */}
      {historyPolicy && (
        <Modal
          title={`Version History — ${historyPolicy.name}`}
          onClose={() => { setHistoryPolicy(null); setVersions([]); setPreviewVersion(null); }}
          wide
        >
          <div className="space-y-4">
            {historyLoading && <p className="text-gray-400 text-sm">Loading versions…</p>}
            {!historyLoading && versions.length === 0 && (
              <p className="text-gray-500 text-sm">No version history available.</p>
            )}
            {!historyLoading && versions.length > 0 && (
              <div className="divide-y divide-darkBorder">
                {versions.map(v => (
                  <div key={v.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
                          v.version === historyPolicy.version
                            ? 'bg-accentCyan/10 border-accentCyan/30 text-accentCyan'
                            : 'bg-darkBg border-darkBorder text-gray-400'
                        }`}>
                          v{v.version}
                          {v.version === historyPolicy.version && ' (current)'}
                        </span>
                        <span className="text-xs text-gray-500">{v.created_at}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPreviewVersion(previewVersion?.id === v.id ? null : v)}
                          className="text-xs px-2 py-1 border border-darkBorder text-gray-400 rounded hover:bg-darkBg"
                        >
                          {previewVersion?.id === v.id ? 'Hide' : 'Preview'}
                        </button>
                        {v.version !== historyPolicy.version && (
                          <button
                            onClick={() => rollback(historyPolicy.id, v.version)}
                            className="flex items-center gap-1 text-xs px-2 py-1 border border-purple-500/30 text-purple-400 rounded hover:bg-purple-500/10"
                          >
                            <RotateCcw className="w-3 h-3" /> Rollback
                          </button>
                        )}
                      </div>
                    </div>
                    {previewVersion?.id === v.id && (
                      <pre className="mt-2 text-xs text-gray-400 font-mono bg-darkBg/60 p-3 rounded-lg border border-darkBorder max-h-48 overflow-y-auto whitespace-pre-wrap">
                        {v.content_yaml}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
