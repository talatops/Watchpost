import React, { useEffect, useState } from 'react';
import {
  Plus, Pencil, Trash2, Zap, ToggleLeft, ToggleRight,
  Loader2, CheckCircle2, XCircle, Globe, Shield,
} from 'lucide-react';
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

const EVENT_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  COMPLIANCE_VIOLATION: { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30'     },
  ENROLLMENT:           { color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/30'   },
  ROOT_DETECTED:        { color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30'    },
  REMOTE_ACTION:        { color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30'    },
  POLICY_UPDATE:        { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30'   },
  TEST:                 { color: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/30'    },
};

function EventChip({ event, active = true }: { event: string; active?: boolean }) {
  const cfg = EVENT_CONFIG[event] ?? { color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/30' };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border font-mono transition-all ${
      active ? `${cfg.color} ${cfg.bg} ${cfg.border}` : 'text-gray-600 bg-transparent border-darkBorder'
    }`}>
      {event}
    </span>
  );
}

export default function WebhooksPage() {
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Webhook | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [eventTypes, setEventTypes] = useState<string[]>(['COMPLIANCE_VIOLATION']);
  const [enabled, setEnabled] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, WebhookTestResult>>({});
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const flash = (msg: string, isErr = false) => {
    isErr ? setError(msg) : setFeedback(msg);
    setTimeout(() => isErr ? setError('') : setFeedback(''), 4000);
  };

  const load = () =>
    api.get<Webhook[]>('/webhooks').then(h => setHooks(h || [])).catch(e => flash(e.message, true));
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null); setName(''); setUrl(''); setSecret('');
    setEventTypes(['COMPLIANCE_VIOLATION']); setEnabled(true);
    setShowModal(true);
  };
  const openEdit = (h: Webhook) => {
    setEditing(h); setName(h.name); setUrl(h.url); setSecret('');
    setEventTypes(h.event_types); setEnabled(h.enabled);
    setShowModal(true);
  };

  const toggleEvent = (ev: string) =>
    setEventTypes(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);

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
    setTestingId(id);
    // clear previous result for this hook
    setTestResults(prev => { const n = { ...prev }; delete n[id]; return n; });
    try {
      const r = await api.post<WebhookTestResult>(`/webhooks/${id}/test`);
      setTestResults(prev => ({ ...prev, [id]: r }));
    } catch (e: unknown) { flash((e as Error).message, true); }
    setTestingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Webhooks</h1>
          <p className="text-gray-400 text-sm mt-1">Configure alert delivery endpoints for MDM events</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-accentBlue/20">
          <Plus className="w-4 h-4" /> New Webhook
        </button>
      </div>

      {/* Toast */}
      {feedback && (
        <div className="fixed bottom-5 right-5 z-50 animate-slide-down flex items-center gap-3 bg-darkCard border border-green-500/30 text-green-400 text-sm font-medium px-4 py-3 rounded-xl shadow-2xl">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />{feedback}
        </div>
      )}
      {error && (
        <div className="fixed bottom-5 right-5 z-50 animate-slide-down flex items-center gap-3 bg-darkCard border border-red-500/30 text-red-400 text-sm font-medium px-4 py-3 rounded-xl shadow-2xl">
          <XCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {/* Summary bar */}
      {hooks.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse2" />
            {hooks.filter(h => h.enabled).length} active
          </span>
          <span>·</span>
          <span>{hooks.filter(h => !h.enabled).length} disabled</span>
          <span>·</span>
          <span>{hooks.length} total</span>
        </div>
      )}

      {/* Webhook cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hooks.length === 0 && (
          <div className="col-span-2 py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-darkCard border border-darkBorder flex items-center justify-center mx-auto mb-4">
              <Zap className="w-7 h-7 text-gray-700" />
            </div>
            <p className="text-gray-400 font-medium">No webhooks configured yet</p>
            <p className="text-gray-600 text-sm mt-1">Add an endpoint to start receiving event notifications</p>
          </div>
        )}

        {hooks.map((h, idx) => {
          const isHov = hoveredId === h.id;
          const isTesting = testingId === h.id;
          const testResult = testResults[h.id];
          return (
            <div key={h.id}
              onMouseEnter={() => setHoveredId(h.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                animationDelay: `${idx * 60}ms`,
                transform: isHov ? 'translateY(-2px)' : 'translateY(0)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                boxShadow: isHov
                  ? h.enabled ? '0 8px 32px -8px rgba(0,210,255,0.15)' : '0 8px 32px -8px rgba(0,0,0,0.4)'
                  : '0 2px 12px -4px rgba(0,0,0,0.3)',
              }}
              className={`animate-fade-in-up bg-darkCard border ${isHov ? (h.enabled ? 'border-accentCyan/30' : 'border-gray-600/40') : 'border-darkBorder'} rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden`}>

              {/* Top accent line */}
              <div className={`absolute top-0 left-0 right-0 h-[2px] ${h.enabled ? 'bg-gradient-to-r from-accentCyan to-accentBlue' : 'bg-darkBorder'}`} />

              {/* Header */}
              <div className="flex items-start justify-between gap-3 pt-1">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Pulse status indicator */}
                  <div className="relative flex-shrink-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${h.enabled ? 'bg-accentCyan/10 border border-accentCyan/25' : 'bg-gray-500/10 border border-gray-500/25'}`}>
                      <Zap className={`w-4 h-4 ${h.enabled ? 'text-accentCyan' : 'text-gray-600'}`} />
                    </div>
                    {/* Live pulse dot */}
                    {h.enabled && (
                      <>
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-darkCard" />
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 animate-ping opacity-75" />
                      </>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-white truncate">{h.name}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
                        h.enabled
                          ? 'bg-green-500/10 border-green-500/30 text-green-400'
                          : 'bg-gray-500/10 border-gray-500/30 text-gray-500'
                      }`}>
                        {h.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Globe className="w-3 h-3 text-gray-600 flex-shrink-0" />
                      <p className="text-[11px] text-gray-500 font-mono truncate">{h.url}</p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 flex-shrink-0">
                  {/* Test button */}
                  <button onClick={() => test(h.id)} disabled={isTesting}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-xl font-semibold transition-all ${
                      testResult
                        ? testResult.success
                          ? 'border-green-500/30 bg-green-500/10 text-green-400'
                          : 'border-red-500/30 bg-red-500/10 text-red-400'
                        : 'border-darkBorder text-gray-400 hover:border-accentCyan/40 hover:text-accentCyan'
                    } disabled:opacity-60`}>
                    {isTesting
                      ? <><Loader2 className="w-3 h-3 animate-spin" />Testing…</>
                      : testResult
                        ? testResult.success
                          ? <><CheckCircle2 className="w-3 h-3" />{testResult.status_code}</>
                          : <><XCircle className="w-3 h-3" />{testResult.status_code}</>
                        : 'Test'}
                  </button>
                  <button onClick={() => openEdit(h)}
                    className="p-1.5 border border-darkBorder rounded-xl text-gray-500 hover:text-white hover:bg-darkBg transition-all">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => del(h.id)}
                    className="p-1.5 border border-red-500/20 rounded-xl text-red-500/60 hover:text-red-400 hover:bg-red-500/10 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Test result inline feedback */}
              {testResult && (
                <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl border animate-fade-in ${
                  testResult.success
                    ? 'bg-green-500/10 border-green-500/20 text-green-400'
                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                }`}>
                  {testResult.success
                    ? <><CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> Delivery succeeded · HTTP {testResult.status_code}</>
                    : <><XCircle className="w-3.5 h-3.5 flex-shrink-0" /> Delivery failed · HTTP {testResult.status_code}{testResult.error ? ` — ${testResult.error}` : ''}</>}
                </div>
              )}

              {/* Event type chips */}
              <div className="flex flex-wrap gap-1.5">
                {(h.event_types || []).map(ev => (
                  <EventChip key={ev} event={ev} active={h.enabled} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit modal */}
      {showModal && (
        <Modal title={editing ? 'Edit Webhook' : 'Create Webhook'} onClose={() => setShowModal(false)} wide>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Name</label>
                <input value={name} onChange={e => setName(e.target.value)} required autoFocus
                  placeholder="e.g. Slack Alerts"
                  className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <span className="text-sm text-gray-400">Enabled</span>
                <button type="button" onClick={() => setEnabled(!enabled)} className="transition-transform hover:scale-105">
                  {enabled
                    ? <ToggleRight className="w-8 h-8 text-accentCyan" />
                    : <ToggleLeft className="w-8 h-8 text-gray-600" />}
                </button>
                <span className={`text-xs font-semibold ${enabled ? 'text-green-400' : 'text-gray-500'}`}>
                  {enabled ? 'Active' : 'Disabled'}
                </span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Endpoint URL</label>
              <div className="relative">
                <Globe className="w-4 h-4 text-gray-500 absolute left-3.5 top-3.5 pointer-events-none" />
                <input value={url} onChange={e => setUrl(e.target.value)} required type="url"
                  placeholder="https://hooks.example.com/…"
                  className="w-full bg-darkBg border border-darkBorder rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">
                HMAC Secret <span className="normal-case font-normal text-gray-600">(optional)</span>
              </label>
              <div className="relative">
                <Shield className="w-4 h-4 text-gray-500 absolute left-3.5 top-3.5 pointer-events-none" />
                <input value={secret} onChange={e => setSecret(e.target.value)}
                  placeholder="Leave blank to skip signing"
                  className="w-full bg-darkBg border border-darkBorder rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">Event Types</label>
              <div className="flex flex-wrap gap-2">
                {ALL_EVENTS.map(ev => {
                  const cfg = EVENT_CONFIG[ev] ?? { color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/30' };
                  const sel = eventTypes.includes(ev);
                  return (
                    <button key={ev} type="button" onClick={() => toggleEvent(ev)}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border font-mono transition-all ${
                        sel
                          ? `${cfg.color} ${cfg.bg} ${cfg.border}`
                          : 'border-darkBorder text-gray-500 hover:border-gray-500'
                      }`}>
                      {ev}
                    </button>
                  );
                })}
              </div>
              {eventTypes.length === 0 && (
                <p className="text-xs text-red-400 mt-1.5">Select at least one event type</p>
              )}
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowModal(false)}
                className="px-5 py-2.5 border border-darkBorder text-sm text-gray-400 rounded-xl hover:bg-darkBg transition-colors">
                Cancel
              </button>
              <button type="submit"
                className="px-5 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity">
                {editing ? 'Save Changes' : 'Create Webhook'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
