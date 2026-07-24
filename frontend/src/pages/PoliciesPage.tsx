import React, { useEffect, useState } from 'react';
import { Plus, Code, Trash2, Pencil, History, RotateCcw, FileCode2, Shield } from 'lucide-react';
import { api } from '../hooks/useApi';
import type { Policy, PolicyVersion } from '../types';
import Modal from '../components/Modal';
import Btn from '../components/Btn';
import { ToastContainer, useToast } from '../components/Toast';

/** Pure-CSS YAML syntax highlighter — no external dependencies */
function YamlHighlight({ code }: { code: string }) {
  const lines = code.split('\n');
  return (
    <code className="text-xs font-mono leading-relaxed block">
      {lines.map((line, i) => {
        // Comment
        if (/^\s*#/.test(line)) {
          return <div key={i}><span style={{ color: '#6B7280' }}>{line}</span></div>;
        }
        // Key: value
        const kvMatch = line.match(/^(\s*)([\w_-]+)(\s*:\s*)(.*)$/);
        if (kvMatch) {
          const [, indent, key, colon, val] = kvMatch;
          const isTopKey = /^\s{0,2}[\w_-]+:/.test(line) && !val.trim();
          const keyColor = isTopKey ? '#00BCD4' : '#93C5FD';
          let valEl: React.ReactNode = <span style={{ color: '#D1D5DB' }}>{val}</span>;
          if (/^["']/.test(val.trim())) valEl = <span style={{ color: '#86EFAC' }}>{val}</span>;
          else if (/^(true|false)$/i.test(val.trim())) valEl = <span style={{ color: '#FCA5A5' }}>{val}</span>;
          else if (/^\d+$/.test(val.trim())) valEl = <span style={{ color: '#FCD34D' }}>{val}</span>;
          else if (/^(HIGH|MEDIUM|LOW|CRITICAL|WARN|INFO)$/i.test(val.trim())) valEl = <span style={{ color: '#F9A8D4' }}>{val}</span>;
          return (
            <div key={i}>
              <span>{indent}</span>
              <span style={{ color: keyColor }}>{key}</span>
              <span style={{ color: '#6B7280' }}>{colon}</span>
              {valEl}
            </div>
          );
        }
        return <div key={i}><span style={{ color: '#9CA3AF' }}>{line}</span></div>;
      })}
    </code>
  );
}

// Team color palette — each policy gets a deterministic accent color
const POLICY_ACCENTS = [
  { border: 'border-l-accentCyan', bg: 'bg-accentCyan/5', icon: 'text-accentCyan', dot: 'bg-accentCyan' },
  { border: 'border-l-blue-500',   bg: 'bg-blue-500/5',   icon: 'text-blue-400',   dot: 'bg-blue-400' },
  { border: 'border-l-purple-500', bg: 'bg-purple-500/5', icon: 'text-purple-400', dot: 'bg-purple-400' },
  { border: 'border-l-green-500',  bg: 'bg-green-500/5',  icon: 'text-green-400',  dot: 'bg-green-400' },
  { border: 'border-l-amber-500',  bg: 'bg-amber-500/5',  icon: 'text-amber-400',  dot: 'bg-amber-400' },
];

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

  // Version history state
  const [historyPolicy, setHistoryPolicy] = useState<Policy | null>(null);
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<PolicyVersion | null>(null);

  const { toasts, remove, flash, flashErr } = useToast();

  const load = () =>
    api.get<Policy[]>('/policies').then(p => setPolicies(p || [])).catch(e => flashErr(e.message));

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
    } catch (e: unknown) { flashErr((e as Error).message); }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this policy?')) return;
    try {
      await api.delete(`/policies/${id}`);
      flash('Policy deleted');
      load();
    } catch (e: unknown) { flashErr((e as Error).message); }
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
      flashErr((e as Error).message);
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
    } catch (e: unknown) { flashErr((e as Error).message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance Policies</h1>
          <p className="text-gray-400 text-sm mt-1">Policy-as-Code — YAML declarative configuration</p>
        </div>
        <Btn onClick={openNew} icon={<Plus className="w-4 h-4" />}>New Policy</Btn>
      </div>

      <ToastContainer toasts={toasts} onRemove={remove} />

      {/* Empty state */}
      {policies.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in">
          <div className="w-20 h-20 rounded-3xl bg-accentCyan/10 border border-accentCyan/20 flex items-center justify-center">
            <FileCode2 className="w-10 h-10 text-accentCyan/60" />
          </div>
          <div className="text-center">
            <p className="text-white font-semibold text-lg">No policies yet</p>
            <p className="text-gray-500 text-sm mt-1">Create your first policy to start enforcing compliance rules</p>
          </div>
          <Btn onClick={openNew} icon={<Plus className="w-4 h-4" />} className="mt-2">
            Create First Policy
          </Btn>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {policies.map((p, idx) => {
          const accent = POLICY_ACCENTS[idx % POLICY_ACCENTS.length];
          return (
            <div key={p.id}
              className={`group bg-darkCard border-l-4 ${accent.border} border-t border-r border-b border-darkBorder rounded-2xl overflow-hidden flex flex-col hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40 transition-all duration-200 animate-fade-in-up`}
              style={{ animationDelay: `${idx * 60}ms` }}>
              {/* Card header */}
              <div className={`${accent.bg} px-5 pt-5 pb-4 border-b border-darkBorder`}>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl bg-darkCard border border-darkBorder flex items-center justify-center`}>
                      <Shield className={`w-4.5 h-4.5 ${accent.icon}`} style={{ width: '18px', height: '18px' }} />
                    </div>
                    <div>
                      <h3 className="font-bold text-white leading-tight">{p.name}</h3>
                      {p.description && <p className="text-xs text-gray-400 mt-0.5">{p.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${accent.dot} animate-pulse2`} />
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border bg-darkCard border-darkBorder ${accent.icon}`}>
                      v{p.version}
                    </span>
                  </div>
                </div>
              </div>

              {/* YAML preview with syntax highlighting */}
              <div className="flex-1 px-5 py-4">
                <div className="bg-darkBg/80 rounded-xl border border-darkBorder p-3 max-h-44 overflow-y-auto">
                  <YamlHighlight code={p.content_yaml} />
                </div>
              </div>

              {/* Action buttons */}
              <div className="px-5 pb-5 pt-1">
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => openHistory(p)}
                    className="flex items-center justify-center gap-1.5 py-2.5 bg-purple-500/5 border border-purple-500/20 text-purple-400 text-xs font-semibold rounded-xl hover:bg-purple-500/15 hover:border-purple-500/40 hover:scale-[1.02] transition-all">
                    <History className="w-3.5 h-3.5" /> History
                  </button>
                  <button onClick={() => openEdit(p)}
                    className="flex items-center justify-center gap-1.5 py-2.5 bg-accentCyan/5 border border-accentCyan/20 text-accentCyan text-xs font-semibold rounded-xl hover:bg-accentCyan/15 hover:border-accentCyan/40 hover:scale-[1.02] transition-all">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button onClick={() => del(p.id)}
                    className="flex items-center justify-center gap-1.5 py-2.5 bg-red-500/5 border border-red-500/20 text-red-400 text-xs font-semibold rounded-xl hover:bg-red-500/15 hover:border-red-500/40 hover:scale-[1.02] transition-all">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit Policy modal */}
      {showModal && (
        <Modal title={editing ? 'Edit Policy' : 'Create Policy'} onClose={() => setShowModal(false)} wide>
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="form-label">Policy Name</label>
              <input value={name} onChange={e => setName(e.target.value)} required autoFocus
                className="input-base" />
            </div>
            <div>
              <label className="form-label">Description</label>
              <input value={desc} onChange={e => setDesc(e.target.value)}
                placeholder="Optional description…"
                className="input-base" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="form-label mb-0">YAML Configuration</label>
                <span className="text-[10px] text-gray-500 flex items-center gap-1"><Code className="w-3 h-3" /> Must contain a policy: block</span>
              </div>
              <textarea value={yaml} onChange={e => setYaml(e.target.value)} rows={12} required
                className="input-base font-mono text-xs text-gray-300 resize-none" />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Btn type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Btn>
              <Btn type="submit">Save Policy</Btn>
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
              <div className="relative">
                {/* Vertical timeline line */}
                <div className="absolute left-[19px] top-0 bottom-0 w-px bg-gradient-to-b from-accentCyan/40 via-darkBorder to-transparent" />
                <div className="space-y-1">
                  {versions.map((v, vi) => {
                    const isCurrent = v.version === historyPolicy?.version;
                    const isPreview = previewVersion?.id === v.id;
                    return (
                      <div key={v.id} className="relative pl-10 animate-fade-in-up" style={{ animationDelay: `${vi * 50}ms` }}>
                        {/* Timeline dot */}
                        <div className={`absolute left-[13px] top-4 w-3 h-3 rounded-full border-2 ${
                          isCurrent
                            ? 'bg-accentCyan border-accentCyan shadow-[0_0_8px_#00D2FF80]'
                            : 'bg-darkBg border-darkBorder'
                        }`} />
                        <div className={`rounded-xl border p-3 mb-2 transition-all duration-150 ${
                          isCurrent
                            ? 'bg-accentCyan/5 border-accentCyan/30'
                            : 'bg-darkBg/40 border-darkBorder hover:border-gray-600'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${
                                isCurrent
                                  ? 'bg-accentCyan/15 border-accentCyan/40 text-accentCyan'
                                  : 'bg-darkCard border-darkBorder text-gray-400'
                              }`}>
                                v{v.version}
                              </span>
                              {isCurrent && (
                                <span className="text-[10px] font-semibold text-accentCyan bg-accentCyan/10 px-2 py-0.5 rounded-full border border-accentCyan/20">
                                  CURRENT
                                </span>
                              )}
                              <span className="text-xs text-gray-500 font-mono">{v.created_at?.slice(0, 16).replace('T', ' ')}</span>
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => setPreviewVersion(isPreview ? null : v)}
                                className={`text-xs px-3 py-1 rounded-lg border transition-all ${
                                  isPreview
                                    ? 'bg-accentCyan/10 border-accentCyan/30 text-accentCyan'
                                    : 'border-darkBorder text-gray-400 hover:bg-darkCard'
                                }`}
                              >
                                {isPreview ? 'Hide' : 'Preview'}
                              </button>
                              {!isCurrent && (
                                <button
                                  onClick={() => rollback(historyPolicy!.id, v.version)}
                                  className="flex items-center gap-1 text-xs px-3 py-1 border border-purple-500/30 text-purple-400 rounded-lg hover:bg-purple-500/10 transition-all"
                                >
                                  <RotateCcw className="w-3 h-3" /> Rollback
                                </button>
                              )}
                            </div>
                          </div>
                          {isPreview && (
                            <div className="mt-3 bg-darkBg/80 rounded-lg border border-darkBorder p-3 max-h-52 overflow-y-auto animate-slide-down">
                              <YamlHighlight code={v.content_yaml} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
