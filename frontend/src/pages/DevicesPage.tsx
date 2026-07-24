import { useEffect, useState, useCallback } from 'react';
import {
  Search, RefreshCw, Lock, Power, Trash2, ChevronLeft, ChevronRight,
  X, Tag, Package, Terminal, Activity, Shield, Battery, HardDrive,
  Wifi, Smartphone, CheckCircle, AlertTriangle,
} from 'lucide-react';
import { api } from '../hooks/useApi';
import type { Device, DevicesPage, DeviceDetail, Label, Team, Policy } from '../types';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import { ToastContainer, useToast } from '../components/Toast';
import { useUser } from '../context/UserContext';
import { usePermissions } from '../hooks/usePermissions';

type DetailTab = 'overview' | 'apps' | 'commands' | 'compliance' | 'activity';

interface InstalledApp {
  package: string;
  name: string;
  version: string;
  system?: boolean;
}

export default function DevicesPage() {
  const { role } = useUser();
  const perms = usePermissions(role);
  const dp = perms.devices;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [data, setData] = useState<DevicesPage>({ data: [], total: 0, page: 1, page_size: 50 });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<DeviceDetail | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const { toasts, remove, flash } = useToast();
  const [showBulkTeam, setShowBulkTeam] = useState(false);
  const [showBulkPolicy, setShowBulkPolicy] = useState(false);
  const [bulkTeamId, setBulkTeamId] = useState('');
  const [bulkPolicyId, setBulkPolicyId] = useState('');
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [appSearch, setAppSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let path = `/devices?page=${page}&page_size=50`;
      if (search) path += `&search=${encodeURIComponent(search)}`;
      if (statusFilter) path += `&status=${statusFilter}`;

      let result: DevicesPage;
      if (selectedLabel) {
        const labelDevices = await api.get<Device[]>(`/labels/${selectedLabel}/devices`);
        result = { data: (labelDevices ?? []), total: (labelDevices ?? []).length, page: 1, page_size: 50 };
      } else {
        const raw = await api.get<DevicesPage>(path);
        result = { ...raw, data: raw.data ?? [] };
      }
      setData(result);
    } catch (e: unknown) {
      flash((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, selectedLabel]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get<Label[]>('/labels').then(l => setLabels(l || [])).catch(() => {});
    api.get<Team[]>('/teams').then(t => setTeams(t || [])).catch(() => {});
    api.get<Policy[]>('/policies').then(p => setPolicies(p || [])).catch(() => {});
  }, []);

  const loadDetail = async (id: string) => {
    try {
      const d = await api.get<DeviceDetail>(`/devices/${id}`);
      setDetail(d);
      setActiveTab('overview');
      setAppSearch('');
    } catch (e: unknown) { flash((e as Error).message); }
  };

  const sendAction = async (deviceId: string, action: string, wipeType?: string) => {
    try {
      const body: Record<string, string> = { action };
      if (wipeType) body.wipe_type = wipeType;
      await api.post(`/devices/${deviceId}/actions`, body);
      const label = action === 'WIPE'
        ? `${wipeType === 'CORPORATE' ? 'Corporate Wipe' : 'Factory Reset'} command queued`
        : `${action} command queued successfully`;
      flash(label);
      loadDetail(deviceId);
    } catch (e: unknown) { flash((e as Error).message); }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const selectAll = () => {
    if (selected.size === (data.data ?? []).length) setSelected(new Set());
    else setSelected(new Set((data.data ?? []).map(d => d.id)));
  };

  const bulkAction = async (action: string) => {
    try {
      await api.post('/devices/bulk/action', { device_ids: [...selected], action });
      flash(`Bulk ${action} queued for ${selected.size} devices`);
      setSelected(new Set());
    } catch (e: unknown) { flash((e as Error).message); }
  };

  const bulkAssignTeam = async () => {
    try {
      await api.post('/devices/bulk/assign-team', { device_ids: [...selected], team_id: bulkTeamId });
      flash(`Assigned ${selected.size} devices to team`);
      setSelected(new Set()); setShowBulkTeam(false); load();
    } catch (e: unknown) { flash((e as Error).message); }
  };

  const bulkAssignPolicy = async () => {
    try {
      await api.post('/devices/bulk/assign-policy', { device_ids: [...selected], policy_id: bulkPolicyId });
      flash(`Policy pushed to ${selected.size} devices`);
      setSelected(new Set()); setShowBulkPolicy(false); load();
    } catch (e: unknown) { flash((e as Error).message); }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / 50));

  // ── Detail view ────────────────────────────────────────────────────────────
  if (detail) {
    const dev = detail.device;

    // Parse installed apps
    let installedApps: InstalledApp[] = [];
    try {
      if (dev.installed_apps) {
        installedApps = JSON.parse(dev.installed_apps) as InstalledApp[];
      }
    } catch { installedApps = []; }

    const filteredApps = installedApps.filter(a => {
      const q = appSearch.toLowerCase();
      return !q || a.name?.toLowerCase().includes(q) || a.package?.toLowerCase().includes(q);
    });

    const tabs: { id: DetailTab; label: string; icon: React.ReactNode }[] = [
      { id: 'overview',    label: 'Overview',      icon: <Smartphone className="w-4 h-4" /> },
      { id: 'apps',        label: 'Applications',  icon: <Package    className="w-4 h-4" /> },
      { id: 'commands',    label: 'Commands',      icon: <Terminal   className="w-4 h-4" /> },
      { id: 'compliance',  label: 'Compliance',    icon: <Shield     className="w-4 h-4" /> },
      { id: 'activity',    label: 'Activity',      icon: <Activity   className="w-4 h-4" /> },
    ];

    return (
      <div className="space-y-5">
        <button onClick={() => setDetail(null)} className="text-sm text-gray-400 hover:text-white flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Back to Device Hosts
        </button>
        {/* Device header card */}
        <div className="bg-darkCard border border-darkBorder rounded-2xl p-5 relative overflow-hidden animate-fade-in-up">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-accentCyan to-accentBlue" />
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-white">{dev.model}</h2>
              <p className="text-xs font-mono text-gray-400 mt-1">{dev.id}</p>
            </div>
            <StatusBadge status={dev.enrollment_status} />
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-darkBorder">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === t.id
                  ? 'border-b-2 border-accentCyan text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── Overview tab ──────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-5 animate-fade-in">
            {/* Quick-stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-darkCard border border-darkBorder rounded-2xl p-4 flex items-center gap-3 hover:-translate-y-0.5 transition-transform duration-150">
                <Battery className="w-8 h-8 text-accentCyan shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 uppercase">Battery</p>
                  <p className="text-lg font-bold text-white">
                    {dev.battery_level != null ? `${dev.battery_level}%` : 'N/A'}
                  </p>
                </div>
              </div>
              <div className="bg-darkCard border border-darkBorder rounded-2xl p-4 flex items-center gap-3">
                <HardDrive className="w-8 h-8 text-accentBlue shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 uppercase">Storage Free</p>
                  <p className="text-lg font-bold text-white">
                    {dev.storage_available != null ? `${(dev.storage_available / 1e9).toFixed(1)} GB` : 'N/A'}
                  </p>
                </div>
              </div>
              <div className="bg-darkCard border border-darkBorder rounded-2xl p-4 flex items-center gap-3">
                <Smartphone className="w-8 h-8 text-purple-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 uppercase">OS Version</p>
                  <p className="text-lg font-bold text-white truncate">{dev.os_version || 'N/A'}</p>
                </div>
              </div>
              <div className="bg-darkCard border border-darkBorder rounded-2xl p-4 flex items-center gap-3">
                <Wifi className="w-8 h-8 text-amber-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 uppercase">Last Contact</p>
                  <p className="text-sm font-bold text-white">{new Date(dev.last_seen).toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Device info grid */}
            <div className="bg-darkCard border border-darkBorder rounded-2xl p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Device Information</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-5 text-sm">
                {[
                  ['Serial', dev.serial_number],
                  ['OS Version', dev.os_version],
                  ['Patch Level', dev.patch_level],
                  ['Last Contact', new Date(dev.last_seen).toLocaleString()],
                  ['Battery', dev.battery_level != null ? `${dev.battery_level}%` : 'N/A'],
                  ['Storage Free', dev.storage_available != null ? `${(dev.storage_available / 1e9).toFixed(1)} GB` : 'N/A'],
                  ['Wi-Fi SSID', dev.wifi_ssid || 'N/A'],
                  ['Team', (dev.team_id ? (teams.find(t => t.id === dev.team_id)?.name ?? dev.team_id) : 'Unassigned')],
                ].map(([k, v]) => (
                  <div key={k}><p className="text-xs text-gray-400 uppercase">{k}</p><p className="font-semibold text-white mt-0.5 truncate">{v}</p></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Applications tab ──────────────────────────────────────────── */}
        {activeTab === 'apps' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-500 absolute left-3 top-3.5" />
              <input
                value={appSearch}
                onChange={e => setAppSearch(e.target.value)}
                placeholder="Search by app name or package…"
                className="w-full bg-darkCard border border-darkBorder rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accentCyan"
              />
            </div>
            <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
              {installedApps.length === 0 ? (
                <p className="p-8 text-center text-gray-500 text-sm">No installed apps data available</p>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left" style={{ minWidth: '600px' }}>
                  <thead>
                    <tr className="border-b border-darkBorder bg-darkBg/30 text-gray-400 text-xs font-semibold uppercase tracking-wider">
                      <th className="p-3">App Name</th>
                      <th className="p-3">Package</th>
                      <th className="p-3">Version</th>
                      <th className="p-3">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-darkBorder text-sm text-gray-300">
                    {filteredApps.length === 0 && (
                      <tr><td colSpan={4} className="p-6 text-center text-gray-500">No apps match your search</td></tr>
                    )}
                    {filteredApps.map((app, i) => (
                      <tr key={i} className="hover:bg-darkBg/40 transition-colors">
                        <td className="p-3 font-semibold text-white">{app.name || '—'}</td>
                        <td className="p-3 font-mono text-xs text-gray-400">{app.package}</td>
                        <td className="p-3 text-xs">{app.version || '—'}</td>
                        <td className="p-3">
                          {app.system && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-accentBlue/20 border border-accentBlue/30 text-accentBlue rounded-full">
                              System
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500">{filteredApps.length} of {installedApps.length} apps</p>
          </div>
        )}

        {/* ── Commands tab ──────────────────────────────────────────────── */}
        {activeTab === 'commands' && (
          <div className="bg-darkCard border border-darkBorder rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Remote Commands</h3>
            {!dp.execCommand && (
              <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-sm mb-4">
                <Lock className="w-4 h-4 flex-shrink-0" />
                <p>Your role (<strong>{role}</strong>) does not have permission to execute remote commands.</p>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {/* SYNC */}
              <button
                onClick={() => sendAction(dev.id, 'SYNC')}
                disabled={!dp.execCommand}
                className="group flex flex-col items-center justify-center p-5 bg-accentCyan/5 border border-accentCyan/20 hover:bg-accentCyan/10 hover:border-accentCyan/40 hover:scale-[1.03] active:scale-[0.98] rounded-2xl transition-all duration-150 gap-3 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <div className="w-12 h-12 rounded-xl bg-accentCyan/10 flex items-center justify-center group-hover:bg-accentCyan/20 transition-colors">
                  <RefreshCw className="w-6 h-6 text-accentCyan" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">Sync Policies</p>
                  <p className="text-[10px] text-accentCyan/70 mt-0.5">Pull latest config</p>
                </div>
              </button>
              {/* LOCK */}
              <button
                onClick={() => sendAction(dev.id, 'LOCK')}
                disabled={!dp.execCommand}
                className="group flex flex-col items-center justify-center p-5 bg-amber-500/5 border border-amber-500/20 hover:bg-amber-500/10 hover:border-amber-500/40 hover:scale-[1.03] active:scale-[0.98] rounded-2xl transition-all duration-150 gap-3 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                  <Lock className="w-6 h-6 text-amber-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">Lock Screen</p>
                  <p className="text-[10px] text-amber-400/70 mt-0.5">Immediate lock</p>
                </div>
              </button>
              {/* REBOOT */}
              <button
                onClick={() => sendAction(dev.id, 'REBOOT')}
                disabled={!dp.execCommand}
                className="group flex flex-col items-center justify-center p-5 bg-blue-500/5 border border-blue-500/20 hover:bg-blue-500/10 hover:border-blue-500/40 hover:scale-[1.03] active:scale-[0.98] rounded-2xl transition-all duration-150 gap-3 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                  <Power className="w-6 h-6 text-blue-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">Reboot</p>
                  <p className="text-[10px] text-blue-400/70 mt-0.5">Restart device</p>
                </div>
              </button>
              {/* Corporate Wipe — TEAM_ADMIN+ */}
              <button
                onClick={() => {
                  if (confirm('Corporate Wipe removes all managed data but preserves personal data. Continue?')) {
                    sendAction(dev.id, 'WIPE', 'CORPORATE');
                  }
                }}
                disabled={!dp.execWipeCorp}
                className="group flex flex-col items-center justify-center p-5 bg-orange-500/5 border border-orange-500/20 hover:bg-orange-500/10 hover:border-orange-500/40 hover:scale-[1.03] active:scale-[0.98] rounded-2xl transition-all duration-150 gap-3 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                  <Trash2 className="w-6 h-6 text-orange-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">Corporate Wipe</p>
                  <p className="text-[10px] text-orange-400/70 mt-0.5">Work data only</p>
                </div>
              </button>
              {/* Factory Reset — SUPER_ADMIN / ORG_ADMIN only */}
              <button
                onClick={() => {
                  if (confirm('⚠️ Factory Reset will erase ALL data on the device. This cannot be undone. Continue?')) {
                    sendAction(dev.id, 'WIPE', 'FULL');
                  }
                }}
                disabled={!dp.execWipeFull}
                className="group flex flex-col items-center justify-center p-5 bg-red-500/5 border border-red-500/20 hover:bg-red-500/10 hover:border-red-500/40 hover:scale-[1.03] active:scale-[0.98] rounded-2xl transition-all duration-150 gap-3 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                  <Trash2 className="w-6 h-6 text-red-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">Factory Reset</p>
                  <p className="text-[10px] text-red-400/70 mt-0.5">Full wipe ⚠️</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── Compliance tab ────────────────────────────────────────────── */}
        {activeTab === 'compliance' && (
          <div className="bg-darkCard border border-darkBorder rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Policy Compliance</h3>
            {(!detail.policy_compliance || detail.policy_compliance.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-500">
                <CheckCircle className="w-8 h-8 text-gray-600" />
                <p className="text-sm">No policy compliance records</p>
              </div>
            ) : (
              <div className="divide-y divide-darkBorder">
                {detail.policy_compliance.map((pc, i) => (
                  <div key={i} className="py-3 flex justify-between items-center text-sm">
                    <div>
                      <p className="font-semibold text-white text-xs font-mono">{pc.policy_id.slice(0, 16)}…</p>
                      {pc.error_message && (
                        <p className="text-xs text-red-400 mt-0.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />{pc.error_message}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-0.5">{new Date(pc.updated_at).toLocaleString()}</p>
                    </div>
                    <StatusBadge status={pc.status} small />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Activity tab ──────────────────────────────────────────────── */}
        {activeTab === 'activity' && (
          <div className="bg-darkCard border border-darkBorder rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">Activity Log</h3>
            <div className="relative ml-2 pl-5 space-y-4 max-h-[600px] overflow-y-auto"
              style={{ borderLeft: '1px solid', borderImage: 'linear-gradient(to bottom, #00D2FF40, #222C3D, transparent) 1' }}>
              {(!detail.events || detail.events.length === 0) ? (
                <p className="text-gray-500 text-sm">No events</p>
              ) : detail.events.map((ev, i) => {
                const typeLabel: Record<string, { label: string; dot: string }> = {
                  ENROLLMENT:       { label: 'Device Enrolled',       dot: 'bg-green-400' },
                  SYNC:             { label: 'Policy Sync',            dot: 'bg-accentCyan' },
                  COMMAND_QUEUED:   { label: 'Command Sent',           dot: 'bg-blue-400' },
                  COMPLIANCE_REPORT:{ label: 'Compliance Reported',    dot: 'bg-purple-400' },
                  COMMAND_EXECUTED: { label: 'Command Executed',       dot: 'bg-green-400' },
                };
                const meta = typeLabel[ev.event_type] ?? { label: ev.event_type.replace(/_/g, ' '), dot: 'bg-gray-400' };
                // Parse command from details JSON for COMMAND_QUEUED
                let cmdLabel = '';
                if (ev.event_type === 'COMMAND_QUEUED') {
                  try {
                    const d = JSON.parse(ev.details);
                    const cmd = (d.command ?? '').replace(':', ' — ');
                    cmdLabel = cmd ? ` · ${cmd}` : '';
                  } catch { /* ignore */ }
                }
                return (
                  <div key={i} className="relative">
                    <div className={`absolute -left-[27px] top-1.5 w-2.5 h-2.5 rounded-full ${meta.dot} border border-darkBg`} />
                    <p className="text-xs text-gray-500">{new Date(ev.created_at).toLocaleString()}</p>
                    <p className="text-sm font-semibold text-white mt-0.5">{meta.label}{cmdLabel}</p>
                    {ev.event_type !== 'SYNC' && (
                      <pre className="text-xs font-mono text-gray-500 mt-0.5 bg-darkBg/60 p-1.5 rounded border border-darkBorder overflow-x-auto whitespace-pre-wrap">{ev.details}</pre>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Toast */}
        <ToastContainer toasts={toasts} onRemove={remove} />
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Device Hosts</h1>
          <p className="text-gray-400 text-sm mt-1">{data.total} devices total</p>
        </div>
      </div>

      <ToastContainer toasts={toasts} onRemove={remove} />

      <div className="flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-3.5 pointer-events-none" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by serial or model…"
            className="w-full bg-darkCard border border-darkBorder rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accentCyan focus:ring-2 focus:ring-accentCyan/15 transition-all"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-darkCard border border-darkBorder rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-2 focus:ring-accentCyan/15 transition-all"
        >
          <option value="">All Statuses</option>
          <option value="ENROLLED">Enrolled</option>
          <option value="PENDING">Pending</option>
          <option value="UNENROLLED">Unenrolled</option>
        </select>

        {/* Label filter */}
        <div className="relative">
          <select
            value={selectedLabel}
            onChange={e => { setSelectedLabel(e.target.value); setPage(1); }}
            className="bg-darkCard border border-darkBorder rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-2 focus:ring-accentCyan/15 transition-all appearance-none pr-8"
          >
            <option value="">All Labels</option>
            {labels.map(l => <option key={l.id} value={l.id}>{l.name} ({l.device_count})</option>)}
          </select>
          <Tag className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-3.5 pointer-events-none" />
        </div>

        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-3 border border-darkBorder text-gray-300 rounded-xl text-sm hover:bg-darkBg hover:border-gray-600 hover:scale-[1.02] transition-all duration-200"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && dp.bulkActions && (
        <div className="flex items-center gap-3 p-3 bg-accentBlue/10 border border-accentBlue/30 rounded-xl text-sm">
          <span className="text-white font-semibold">{selected.size} selected</span>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => bulkAction('SYNC')} className="px-3 py-1.5 bg-accentCyan/10 border border-accentCyan/30 text-accentCyan rounded-lg hover:bg-accentCyan/20">Sync All</button>
            <button onClick={() => bulkAction('LOCK')} className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg hover:bg-amber-500/20">Lock All</button>
            <button onClick={() => bulkAction('REBOOT')} className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-lg hover:bg-blue-500/20">Reboot All</button>
            {dp.execWipeFull && <button onClick={() => bulkAction('WIPE')} className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20">Wipe All</button>}
            {dp.assignTeam && <button onClick={() => setShowBulkTeam(true)} className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-lg hover:bg-purple-500/20">Assign Team</button>}
            {dp.assignPolicy && <button onClick={() => setShowBulkPolicy(true)} className="px-3 py-1.5 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg hover:bg-green-500/20">Push Policy</button>}
          </div>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Device table */}
      <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-darkBorder bg-darkBg/30 text-gray-400 text-xs font-semibold uppercase tracking-wider">
              <th className="p-3 w-10">
                {dp.bulkActions && (
                  <input
                    type="checkbox"
                    checked={selected.size === (data.data ?? []).length && (data.data ?? []).length > 0}
                    onChange={selectAll}
                    className="rounded"
                  />
                )}
              </th>
              <th className="p-3">Device</th>
              <th className="p-3">Serial</th>
              <th className="p-3">OS</th>
              <th className="p-3">Battery</th>
              <th className="p-3">Last Seen</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-darkBorder text-sm text-gray-300">
            {(data.data ?? []).length === 0 && !loading && (
              <tr><td colSpan={8} className="p-8 text-center text-gray-500">No devices found</td></tr>
            )}
            {(data.data ?? []).map((d, idx) => (
              <tr key={d.id}
                className={`hover:bg-darkBg/40 transition-colors animate-fade-in-up ${selected.has(d.id) ? 'bg-accentBlue/5' : ''}`}
                style={{ animationDelay: `${idx * 30}ms` }}>
                <td className="p-3">
                  {dp.bulkActions
                    ? <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} className="rounded" />
                    : null}
                </td>
                <td className="p-3 font-semibold text-white">{d.model}</td>
                <td className="p-3 font-mono text-xs">{d.serial_number}</td>
                <td className="p-3">{d.os_version}</td>
                <td className="p-3">{d.battery_level != null ? `${d.battery_level}%` : '—'}</td>
                <td className="p-3 text-xs text-gray-400">{new Date(d.last_seen).toLocaleString()}</td>
                <td className="p-3"><StatusBadge status={d.enrollment_status} small /></td>
                <td className="p-3 text-right">
                  <button onClick={() => loadDetail(d.id)} className="text-xs text-accentCyan hover:underline font-semibold">Manage →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Page {page} of {totalPages} ({data.total} total)</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 border border-darkBorder rounded-lg text-gray-400 hover:bg-darkBg disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 border border-darkBorder rounded-lg text-gray-400 hover:bg-darkBg disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bulk assign team modal */}
      {showBulkTeam && (
        <Modal title={`Assign ${selected.size} Devices to Team`} onClose={() => setShowBulkTeam(false)}>
          <div className="space-y-4">
            <select
              value={bulkTeamId}
              onChange={e => setBulkTeamId(e.target.value)}
              className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan"
            >
              <option value="">Select team…</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button
              onClick={bulkAssignTeam}
              disabled={!bulkTeamId}
              className="w-full py-3 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-lg disabled:opacity-40"
            >
              Assign
            </button>
          </div>
        </Modal>
      )}

      {/* Bulk push policy modal */}
      {showBulkPolicy && (
        <Modal title={`Push Policy to ${selected.size} Devices`} onClose={() => setShowBulkPolicy(false)}>
          <div className="space-y-4">
            <select
              value={bulkPolicyId}
              onChange={e => setBulkPolicyId(e.target.value)}
              className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan"
            >
              <option value="">Select policy…</option>
              {policies.map(p => <option key={p.id} value={p.id}>{p.name} (v{p.version})</option>)}
            </select>
            <button
              onClick={bulkAssignPolicy}
              disabled={!bulkPolicyId}
              className="w-full py-3 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-lg disabled:opacity-40"
            >
              Push Policy
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
