import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Users, Smartphone, ChevronLeft,
  UserPlus, Search, Shield, Activity, TrendingUp,
} from 'lucide-react';
import { api } from '../hooks/useApi';
import type { Team, TeamMember, Device, User } from '../types';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';

type TeamTab = 'devices' | 'members';

// Colour palette rotating through teams
const TEAM_PALETTES = [
  { bg: 'from-cyan-500/20 to-blue-600/20', border: 'border-cyan-500/30', icon: 'text-cyan-400', dot: 'bg-cyan-400', glow: 'shadow-cyan-500/20' },
  { bg: 'from-violet-500/20 to-purple-600/20', border: 'border-violet-500/30', icon: 'text-violet-400', dot: 'bg-violet-400', glow: 'shadow-violet-500/20' },
  { bg: 'from-emerald-500/20 to-teal-600/20', border: 'border-emerald-500/30', icon: 'text-emerald-400', dot: 'bg-emerald-400', glow: 'shadow-emerald-500/20' },
  { bg: 'from-amber-500/20 to-orange-600/20', border: 'border-amber-500/30', icon: 'text-amber-400', dot: 'bg-amber-400', glow: 'shadow-amber-500/20' },
  { bg: 'from-rose-500/20 to-pink-600/20', border: 'border-rose-500/30', icon: 'text-rose-400', dot: 'bg-rose-400', glow: 'shadow-rose-500/20' },
  { bg: 'from-sky-500/20 to-indigo-600/20', border: 'border-sky-500/30', icon: 'text-sky-400', dot: 'bg-sky-400', glow: 'shadow-sky-500/20' },
];

const ROLE_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  SUPER_ADMIN:  { color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    label: 'Super Admin' },
  ORG_ADMIN:    { color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  label: 'Org Admin' },
  TEAM_ADMIN:   { color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   label: 'Team Admin' },
  SUPPORT:      { color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30',  label: 'Support' },
  AUDITOR:      { color: 'text-gray-400',   bg: 'bg-gray-500/10',   border: 'border-gray-500/30',   label: 'Auditor' },
};

const AVATAR_GRADIENTS = [
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-sky-500 to-indigo-600',
];

function avatarGradient(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [activeTab, setActiveTab] = useState<TeamTab>('devices');
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null);

  // Team devices state
  const [teamDevices, setTeamDevices] = useState<Device[]>([]);
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [deviceSearch, setDeviceSearch] = useState('');

  // Team members state
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);

  // Team CRUD state
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [name, setName] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  // Row highlight state
  const [hoveredDevice, setHoveredDevice] = useState<string | null>(null);
  const [hoveredMember, setHoveredMember] = useState<string | null>(null);

  const flash = (msg: string, isErr = false) => {
    isErr ? setError(msg) : setFeedback(msg);
    setTimeout(() => isErr ? setError('') : setFeedback(''), 4000);
  };

  const loadTeams = () =>
    api.get<Team[]>('/teams').then(t => setTeams(t || [])).catch(e => flash(e.message, true));

  useEffect(() => { loadTeams(); }, []);

  const openTeam = useCallback(async (t: Team) => {
    setSelectedTeam(t);
    setActiveTab('devices');
    setFeedback(''); setError('');
    try {
      const [devPage, membersData, usersData] = await Promise.all([
        api.get<{ data: Device[]; total: number }>(`/devices?page_size=200`),
        api.get<TeamMember[]>(`/teams/${t.id}/members`),
        api.get<User[]>('/users'),
      ]);
      const all = devPage?.data ?? [];
      setTeamDevices(all.filter(d => d.team_id === t.id));
      setAllDevices(all);
      setMembers(membersData || []);
      setAllUsers(usersData || []);
    } catch (e: unknown) { flash((e as Error).message, true); }
  }, []);

  const refreshTeamDevices = async (t: Team) => {
    const devPage = await api.get<{ data: Device[] }>(`/devices?page_size=200`);
    const all = devPage?.data ?? [];
    setTeamDevices(all.filter(d => d.team_id === t.id));
    setAllDevices(all);
  };

  const assignDevice = async (deviceId: string) => {
    if (!selectedTeam) return;
    try {
      await api.post(`/teams/${selectedTeam.id}/devices`, { device_ids: [deviceId] });
      flash('Device assigned to team');
      setShowAddDevice(false); setDeviceSearch('');
      await refreshTeamDevices(selectedTeam);
      loadTeams();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const unassignDevice = async (deviceId: string) => {
    try {
      await api.post('/devices/bulk/assign-team', { device_ids: [deviceId], team_id: null });
      flash('Device unassigned');
      if (selectedTeam) await refreshTeamDevices(selectedTeam);
      loadTeams();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const addMember = async (userId: string) => {
    if (!selectedTeam) return;
    try {
      await api.post(`/teams/${selectedTeam.id}/members`, { user_id: userId });
      flash('Member added');
      setShowAddMember(false);
      const m = await api.get<TeamMember[]>(`/teams/${selectedTeam.id}/members`);
      setMembers(m || []);
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const removeMember = async (userId: string) => {
    if (!selectedTeam) return;
    try {
      await api.delete(`/teams/${selectedTeam.id}/members/${userId}`);
      flash('Member removed');
      const m = await api.get<TeamMember[]>(`/teams/${selectedTeam.id}/members`);
      setMembers(m || []);
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const openNew = () => { setEditing(null); setName(''); setShowModal(true); };
  const openEdit = (t: Team, ev: React.MouseEvent) => {
    ev.stopPropagation();
    setEditing(t); setName(t.name); setShowModal(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/teams/${editing.id}`, { name });
        flash('Team updated');
        if (selectedTeam?.id === editing.id) setSelectedTeam({ ...selectedTeam, name });
      } else {
        await api.post('/teams', { name });
        flash('Team created');
      }
      setShowModal(false);
      loadTeams();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const del = async (id: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (!confirm('Delete this team? Devices will become unassigned.')) return;
    try {
      await api.delete(`/teams/${id}`);
      flash('Team deleted');
      if (selectedTeam?.id === id) setSelectedTeam(null);
      loadTeams();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const availableDevices = allDevices.filter(d =>
    d.team_id !== selectedTeam?.id &&
    (deviceSearch === '' ||
      d.serial_number.toLowerCase().includes(deviceSearch.toLowerCase()) ||
      d.model.toLowerCase().includes(deviceSearch.toLowerCase()))
  );
  const availableUsers = allUsers.filter(u => !members.find(m => m.id === u.id));

  // Stats derived from current team data
  const enrolledCount  = teamDevices.filter(d => d.enrollment_status?.toUpperCase() === 'ENROLLED').length;
  const offlineCount   = teamDevices.filter(d => {
    const last = new Date(d.last_seen).getTime();
    return Date.now() - last > 24 * 60 * 60 * 1000;
  }).length;

  // ── Toast ─────────────────────────────────────────────────────────────────
  const Toast = () => (
    <>
      {feedback && (
        <div className="fixed bottom-5 right-5 z-50 animate-slide-down flex items-center gap-3 bg-darkCard border border-green-500/30 text-green-400 text-sm font-medium px-4 py-3 rounded-xl shadow-2xl max-w-sm">
          <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
            <span className="text-green-400 text-xs">✓</span>
          </div>
          {feedback}
        </div>
      )}
      {error && (
        <div className="fixed bottom-5 right-5 z-50 animate-slide-down flex items-center gap-3 bg-darkCard border border-red-500/30 text-red-400 text-sm font-medium px-4 py-3 rounded-xl shadow-2xl max-w-sm">
          <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
            <span className="text-red-400 text-xs">✕</span>
          </div>
          {error}
        </div>
      )}
    </>
  );

  // ── Team detail view ──────────────────────────────────────────────────────
  if (selectedTeam) {
    const teamIdx = teams.findIndex(t => t.id === selectedTeam.id);
    const pal = TEAM_PALETTES[teamIdx % TEAM_PALETTES.length] ?? TEAM_PALETTES[0];

    return (
      <div className="space-y-5 animate-fade-in">
        <Toast />

        {/* Back button */}
        <button onClick={() => setSelectedTeam(null)}
          className="group flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Teams
        </button>

        {/* Team header with stats */}
        <div className={`bg-darkCard border ${pal.border} rounded-2xl p-6 relative overflow-hidden`}
          style={{ boxShadow: `0 4px 32px 0 var(--tw-shadow-color)` }}>
          <div className={`absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r ${pal.bg.replace('/20', '')}`} />
          {/* Subtle background glow */}
          <div className={`absolute -top-8 -right-8 w-40 h-40 rounded-full bg-gradient-to-br ${pal.bg} blur-2xl pointer-events-none`} />

          <div className="relative flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${pal.bg} border ${pal.border} flex items-center justify-center flex-shrink-0`}>
                <Users className={`w-7 h-7 ${pal.icon}`} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedTeam.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Created {new Date(selectedTeam.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <button onClick={e => openEdit(selectedTeam, e)}
              className="flex items-center gap-2 px-4 py-2 border border-darkBorder text-sm text-gray-300 rounded-xl hover:bg-darkBg hover:border-gray-500 transition-all">
              <Pencil className="w-3.5 h-3.5" /> Rename
            </button>
          </div>

          {/* Metric cards */}
          <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            {[
              { label: 'Total Devices',   value: selectedTeam.device_count, icon: <Smartphone className="w-4 h-4" />, color: pal.icon },
              { label: 'Enrolled',        value: enrolledCount,             icon: <Activity className="w-4 h-4" />,   color: 'text-green-400' },
              { label: 'Offline (24h)',   value: offlineCount,              icon: <TrendingUp className="w-4 h-4" />, color: 'text-amber-400' },
              { label: 'Members',         value: members.length,            icon: <Users className="w-4 h-4" />,      color: 'text-blue-400' },
            ].map(stat => (
              <div key={stat.label}
                className="bg-darkBg/60 border border-darkBorder rounded-xl p-3 flex flex-col gap-1.5">
                <div className={`flex items-center gap-1.5 text-xs font-medium ${stat.color} opacity-80`}>
                  {stat.icon}{stat.label}
                </div>
                <p className="text-2xl font-bold text-white tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-darkBorder">
          {([
            ['devices', 'Devices', <Smartphone className="w-4 h-4" />, teamDevices.length],
            ['members', 'Members', <Users className="w-4 h-4" />, members.length],
          ] as const).map(([id, label, icon, count]) => (
            <button key={id} onClick={() => setActiveTab(id as TeamTab)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all ${
                activeTab === id
                  ? 'border-b-2 border-accentCyan text-white'
                  : 'text-gray-400 hover:text-white'
              }`}>
              {icon}{label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === id
                  ? 'bg-accentCyan/20 text-accentCyan'
                  : 'bg-darkBorder text-gray-500'
              }`}>{count}</span>
            </button>
          ))}
        </div>

        {/* ── Devices tab ── */}
        {activeTab === 'devices' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-400">
                {teamDevices.length} device{teamDevices.length !== 1 ? 's' : ''} in this team
              </p>
              <button onClick={() => setShowAddDevice(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-accentBlue/20">
                <Plus className="w-4 h-4" /> Add Device
              </button>
            </div>

            <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-darkBorder bg-darkBg/40 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="p-3 pl-5">Device</th>
                    <th className="p-3">Serial</th>
                    <th className="p-3">OS</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right pr-5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-darkBorder">
                  {teamDevices.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-12 text-center">
                        <Smartphone className="w-8 h-8 text-gray-700 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">No devices in this team yet</p>
                        <p className="text-gray-600 text-xs mt-1">Click "Add Device" to assign devices</p>
                      </td>
                    </tr>
                  )}
                  {teamDevices.map(d => {
                    const s = d.enrollment_status?.toUpperCase();
                    const rowAccent = s === 'ENROLLED' ? 'bg-green-500' : s === 'UNENROLLED' || s === 'FAILED' ? 'bg-red-500' : 'bg-amber-500';
                    const isHovered = hoveredDevice === d.id;
                    return (
                      <tr key={d.id}
                        onMouseEnter={() => setHoveredDevice(d.id)}
                        onMouseLeave={() => setHoveredDevice(null)}
                        className={`relative transition-all duration-150 ${isHovered ? 'bg-darkBg/50' : ''}`}
                        style={{ boxShadow: isHovered ? 'inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -1px 0 rgba(255,255,255,0.03)' : undefined }}>
                        {/* Left accent bar */}
                        <td className="p-0 w-0">
                          <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${rowAccent} transition-opacity duration-150 ${isHovered ? 'opacity-100' : 'opacity-0'}`} />
                        </td>
                        <td className="p-3 pl-5 font-semibold text-white">{d.model}</td>
                        <td className="p-3 font-mono text-xs text-gray-400">{d.serial_number}</td>
                        <td className="p-3 text-xs text-gray-400">{d.os_version}</td>
                        <td className="p-3"><StatusBadge status={d.enrollment_status} small /></td>
                        <td className="p-3 pr-5 text-right">
                          <button onClick={() => unassignDevice(d.id)}
                            className={`text-xs px-3 py-1.5 border border-red-500/20 text-red-400 rounded-lg transition-all ${isHovered ? 'bg-red-500/10 border-red-500/40' : 'hover:bg-red-500/10'}`}>
                            Unassign
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Members tab ── */}
        {activeTab === 'members' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-400">
                {members.length} member{members.length !== 1 ? 's' : ''} in this team
              </p>
              <button onClick={() => setShowAddMember(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-accentBlue/20">
                <UserPlus className="w-4 h-4" /> Add Member
              </button>
            </div>

            <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-darkBorder bg-darkBg/40 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="p-3 pl-5">Member</th>
                    <th className="p-3">Role</th>
                    <th className="p-3 text-right pr-5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-darkBorder">
                  {members.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-12 text-center">
                        <Users className="w-8 h-8 text-gray-700 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">No members in this team yet</p>
                        <p className="text-gray-600 text-xs mt-1">Click "Add Member" to get started</p>
                      </td>
                    </tr>
                  )}
                  {members.map(m => {
                    const rc = ROLE_CONFIG[m.role] ?? { color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/30', label: m.role };
                    const grad = avatarGradient(m.email);
                    const isHovered = hoveredMember === m.id;
                    return (
                      <tr key={m.id}
                        onMouseEnter={() => setHoveredMember(m.id)}
                        onMouseLeave={() => setHoveredMember(null)}
                        className={`relative transition-all duration-150 ${isHovered ? 'bg-darkBg/50' : ''}`}>
                        {/* Left accent bar */}
                        <td className="p-0 w-0">
                          <div className={`absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b ${grad} transition-opacity duration-150 ${isHovered ? 'opacity-100' : 'opacity-0'}`} />
                        </td>
                        <td className="p-3 pl-5">
                          <div className="flex items-center gap-3">
                            {/* Gradient avatar */}
                            <div className={`relative w-9 h-9 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-sm font-bold text-white flex-shrink-0 transition-all duration-150 ${isHovered ? 'scale-110 shadow-lg' : ''}`}
                              style={{ boxShadow: isHovered ? `0 0 12px rgba(0,210,255,0.25)` : undefined }}>
                              {m.email[0].toUpperCase()}
                            </div>
                            <span className="text-white font-medium">{m.email}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${rc.color} ${rc.bg} ${rc.border}`}>
                            <Shield className="w-3 h-3" />{rc.label}
                          </span>
                        </td>
                        <td className="p-3 pr-5 text-right">
                          <button onClick={() => removeMember(m.id)}
                            className={`text-xs px-3 py-1.5 border border-red-500/20 text-red-400 rounded-lg transition-all ${isHovered ? 'bg-red-500/10 border-red-500/40' : 'hover:bg-red-500/10'}`}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Add Device modal ── */}
        {showAddDevice && (
          <Modal title="Add Device to Team" onClose={() => { setShowAddDevice(false); setDeviceSearch(''); }} wide>
            <div className="space-y-4">
              {/* Animated search bar */}
              <div className="relative group">
                <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-3.5 group-focus-within:text-accentCyan transition-colors" />
                <input value={deviceSearch} onChange={e => setDeviceSearch(e.target.value)}
                  placeholder="Search by serial or model…" autoFocus
                  className="w-full bg-darkBg border border-darkBorder rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-darkBorder rounded-xl border border-darkBorder">
                {availableDevices.length === 0 && (
                  <div className="p-8 text-center">
                    <Smartphone className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No available devices</p>
                  </div>
                )}
                {availableDevices.map((d, i) => {
                  const s = d.enrollment_status?.toUpperCase();
                  const accent = s === 'ENROLLED' ? 'bg-green-500' : s === 'UNENROLLED' || s === 'FAILED' ? 'bg-red-500' : 'bg-amber-500';
                  return (
                    <button key={d.id} onClick={() => assignDevice(d.id)}
                      style={{ animationDelay: `${i * 30}ms` }}
                      className="w-full flex items-center justify-between p-3.5 hover:bg-darkBg/70 text-left group animate-fade-in transition-all">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${accent} flex-shrink-0`} />
                        <div>
                          <p className="text-white text-sm font-semibold group-hover:text-accentCyan transition-colors">{d.model}</p>
                          <p className="text-xs text-gray-400 font-mono">{d.serial_number}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={d.enrollment_status} small />
                        <Plus className="w-3.5 h-3.5 text-gray-600 group-hover:text-accentCyan transition-colors" />
                      </div>
                    </button>
                  );
                })}
              </div>
              {availableDevices.length > 0 && (
                <p className="text-xs text-gray-600 text-center">{availableDevices.length} available device{availableDevices.length !== 1 ? 's' : ''} · click to assign</p>
              )}
            </div>
          </Modal>
        )}

        {/* ── Add Member modal ── */}
        {showAddMember && (
          <Modal title="Add Member to Team" onClose={() => setShowAddMember(false)}>
            <div className="space-y-3">
              <div className="max-h-72 overflow-y-auto divide-y divide-darkBorder rounded-xl border border-darkBorder">
                {availableUsers.length === 0 && (
                  <div className="p-8 text-center">
                    <Users className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">All users are already members</p>
                  </div>
                )}
                {availableUsers.map((u, i) => {
                  const rc = ROLE_CONFIG[u.role] ?? { color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/30', label: u.role };
                  const grad = avatarGradient(u.email);
                  return (
                    <button key={u.id} onClick={() => addMember(u.id)}
                      style={{ animationDelay: `${i * 30}ms` }}
                      className="w-full flex items-center justify-between p-3.5 hover:bg-darkBg/70 text-left group animate-fade-in transition-all">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-sm font-bold text-white flex-shrink-0 group-hover:scale-110 transition-transform`}>
                          {u.email[0].toUpperCase()}
                        </div>
                        <span className="text-white text-sm font-medium group-hover:text-accentCyan transition-colors">{u.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${rc.color} ${rc.bg} ${rc.border}`}>
                          <Shield className="w-2.5 h-2.5" />{rc.label}
                        </span>
                        <Plus className="w-3.5 h-3.5 text-gray-600 group-hover:text-accentCyan transition-colors" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </Modal>
        )}

        {/* ── Team rename modal ── */}
        {showModal && (
          <Modal title="Rename Team" onClose={() => setShowModal(false)}>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Team Name</label>
                <input value={name} onChange={e => setName(e.target.value)} required autoFocus
                  className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-darkBorder text-sm text-gray-400 rounded-xl hover:bg-darkBg transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity">Save</button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    );
  }

  // ── Team list view ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Teams</h1>
          <p className="text-gray-400 text-sm mt-1">Organize devices and users into groups</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-3 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-accentBlue/20">
          <Plus className="w-4 h-4" /> New Team
        </button>
      </div>

      <Toast />

      {/* Summary row */}
      {teams.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accentCyan animate-pulse2" />
            {teams.length} team{teams.length !== 1 ? 's' : ''}
          </span>
          <span>·</span>
          <span>{teams.reduce((s, t) => s + t.device_count, 0)} total devices</span>
        </div>
      )}

      {/* Team cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.length === 0 && (
          <div className="col-span-3 text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-darkCard border border-darkBorder flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-gray-700" />
            </div>
            <p className="text-gray-400 font-medium">No teams yet</p>
            <p className="text-gray-600 text-sm mt-1">Create your first team to organize devices and users</p>
          </div>
        )}

        {teams.map((t, idx) => {
          const pal = TEAM_PALETTES[idx % TEAM_PALETTES.length];
          const isHov = hoveredTeam === t.id;
          return (
            <div key={t.id}
              onClick={() => openTeam(t)}
              onMouseEnter={() => setHoveredTeam(t.id)}
              onMouseLeave={() => setHoveredTeam(null)}
              style={{
                animationDelay: `${idx * 60}ms`,
                transform: isHov ? 'translateY(-3px) perspective(800px) rotateX(1deg)' : 'translateY(0) perspective(800px) rotateX(0)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                boxShadow: isHov ? `0 12px 32px -8px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,210,255,0.15)` : '0 2px 12px -4px rgba(0,0,0,0.3)',
              }}
              className={`bg-darkCard border ${isHov ? pal.border : 'border-darkBorder'} rounded-2xl p-5 flex flex-col gap-4 cursor-pointer animate-fade-in-up relative overflow-hidden`}>

              {/* Gradient background glow on hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${pal.bg} rounded-2xl pointer-events-none transition-opacity duration-200 ${isHov ? 'opacity-100' : 'opacity-0'}`} />

              <div className="relative flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {/* Colour-coded icon */}
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${pal.bg} border ${pal.border} flex items-center justify-center transition-transform duration-200 ${isHov ? 'scale-110' : ''}`}>
                    <Users className={`w-5 h-5 ${pal.icon}`} />
                  </div>
                  <div>
                    <p className="font-bold text-white leading-tight">{t.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Created {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Actions (stop propagation) */}
                <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                  <button onClick={e => openEdit(t, e)}
                    className="p-1.5 border border-darkBorder rounded-lg text-gray-500 hover:text-white hover:bg-darkBg hover:border-gray-600 transition-all">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={e => del(t.id, e)}
                    className="p-1.5 border border-red-500/20 rounded-lg text-red-500/60 hover:text-red-400 hover:bg-red-500/10 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Counter badges */}
              <div className="relative flex items-center gap-2">
                <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-darkBg/60 border border-darkBorder`}>
                  <Smartphone className={`w-3.5 h-3.5 ${pal.icon}`} />
                  <span className="text-white tabular-nums">{t.device_count}</span>
                  <span className="text-gray-500">device{t.device_count !== 1 ? 's' : ''}</span>
                </div>
                {/* Live dot */}
                <div className={`w-2 h-2 rounded-full ${pal.dot} animate-pulse2 ml-auto`} />
                <span className={`text-xs font-semibold ${pal.icon} ${isHov ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}>
                  Manage →
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Team modal */}
      {showModal && (
        <Modal title={editing ? 'Rename Team' : 'Create Team'} onClose={() => setShowModal(false)}>
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Team Name</label>
              <input value={name} onChange={e => setName(e.target.value)} required autoFocus
                placeholder="e.g., Engineering, Sales EMEA…"
                className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowModal(false)}
                className="px-5 py-2.5 border border-darkBorder text-sm text-gray-400 rounded-xl hover:bg-darkBg transition-colors">
                Cancel
              </button>
              <button type="submit"
                className="px-5 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity">
                {editing ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
