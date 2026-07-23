import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Zap, ToggleLeft, ToggleRight } from 'lucide-react';
import { api } from '../hooks/useApi';
import type { Webhook } from '../types';
import Modal from '../components/Modal';

interface WebhookTestResult {
  success: boolean;
  status_code: number;
  error?: string;
}

const ALL_EVENTS = [
  'COMPLIANCE_VIOLATION', 'ENROLLMENT', 'ROOT_DETECTED',
  'REMOTE_ACTION', 'POLICY_UPDATE', 'TEST',
];

export default function WebhooksPage() {
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Webhook | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [eventTypes, setEventTypes] = useState<string[]>(['COMPLIANCE_VIOLATION']);
  const [enabled, setEnabled] = useState(true);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const flash = (msg: string, isErr = false) => {
    isErr ? setError(msg) : setFeedback(msg);
    setTimeout(() => isErr ? setError('') : setFeedback(''), 4000);
  };

  const load = () => api.get<Webhook[]>('/webhooks').then(h => setHooks(h || [])).catch(e => flash(e.message, true));
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setName(''); setUrl(''); setSecret(''); setEventTypes(['COMPLIANCE_VIOLATION']); setEnabled(true); setTestResult(null); setShowModal(true); };
  const openEdit = (h: Webhook) => { setEditing(h); setName(h.name); setUrl(h.url); setSecret(''); setEventTypes(h.event_types); setEnabled(h.enabled); setTestResult(null); setShowModal(true); };

  const toggleEvent = (ev: string) => {
    setEventTypes(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (eventTypes.length === 0) { flash('Select at least one event type', true); return; }
    try {
      const body = { name, url, secret, event_types: eventTypes, enabled };
      if (editing) {
        await api.put(`/webhooks/${editing.id}`, body);
        flash('Webhook updated');
      } else {
        await api.post('/webhooks', body);
        flash('Webhook created');
      }
      setShowModal(false);
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this webhook?')) return;
    try { await api.delete(`/webhooks/${id}`); flash('Webhook deleted'); load(); }
    catch (e: unknown) { flash((e as Error).message, true); }
  };

  const test = async (id: string) => {
    try {
      const r = await api.post<WebhookTestResult>(`/webhooks/${id}/test`);
      setTestResult(r);
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const isSuccess = testResult ? Boolean(testResult['success']) : false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Webhooks</h1>
          <p className="text-gray-400 text-sm mt-1">Configure alert delivery endpoints for MDM events</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-3 rounded-lg hover:opacity-90">
          <Plus className="w-4 h-4" /> New Webhook
        </button>
      </div>

      {feedback && <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">{feedback}</div>}
      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}
      {testResult && (
        <div className={`p-3 border rounded-lg text-sm ${isSuccess ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          Test result: HTTP {testResult.status_code} — {isSuccess ? 'Delivery succeeded' : 'Delivery failed'}
          {testResult.error && <span> — {testResult.error}</span>}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hooks.length === 0 && <p className="text-gray-500 text-sm col-span-2">No webhooks configured yet.</p>}
        {hooks.map(h => (
          <div key={h.id} className="bg-darkCard border border-darkBorder rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className={`w-4 h-4 ${h.enabled ? 'text-accentCyan' : 'text-gray-500'}`} />
                <span className="font-bold text-white">{h.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${h.enabled ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'}`}>
                  {h.enabled ? 'Active' : 'Disabled'}
                </span>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => test(h.id)} className="text-xs px-2.5 py-1 border border-darkBorder text-gray-400 rounded-lg hover:bg-darkBg hover:text-white">Test</button>
                <button onClick={() => openEdit(h)} className="p-1.5 border border-darkBorder rounded-lg text-gray-400 hover:text-white hover:bg-darkBg">
                  <Pencil className="w-3 h-3" />
                </button>
                <button onClick={() => del(h.id)} className="p-1.5 border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/10">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400 font-mono truncate mb-2">{h.url}</p>
            <div className="flex flex-wrap gap-1">
              {(h.event_types || []).map(ev => (
                <span key={ev} className="text-[10px] px-2 py-0.5 bg-accentBlue/10 border border-accentBlue/20 text-accentCyan rounded font-mono">{ev}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit Webhook' : 'Create Webhook'} onClose={() => setShowModal(false)} wide>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Name</label>
                <input value={name} onChange={e => setName(e.target.value)} required
                  className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <label className="text-sm text-gray-400">Enabled</label>
                <button type="button" onClick={() => setEnabled(!enabled)} className="text-gray-400 hover:text-white">
                  {enabled ? <ToggleRight className="w-7 h-7 text-accentCyan" /> : <ToggleLeft className="w-7 h-7" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Endpoint URL</label>
              <input value={url} onChange={e => setUrl(e.target.value)} required type="url" placeholder="https://hooks.example.com/…"
                className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">HMAC Secret (optional)</label>
              <input value={secret} onChange={e => setSecret(e.target.value)} placeholder="Leave blank to skip signing"
                className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">Event Types</label>
              <div className="flex flex-wrap gap-2">
                {ALL_EVENTS.map(ev => (
                  <button key={ev} type="button" onClick={() => toggleEvent(ev)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-mono transition-colors ${eventTypes.includes(ev) ? 'bg-accentBlue/20 border-accentBlue/40 text-accentCyan' : 'border-darkBorder text-gray-400 hover:border-gray-500'}`}>
                    {ev}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-darkBorder text-sm text-gray-400 rounded-lg hover:bg-darkBg">Cancel</button>
              <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-lg text-sm">
                {editing ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
