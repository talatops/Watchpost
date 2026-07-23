import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Users, Smartphone, ChevronLeft,
  UserPlus, Search, Shield,
} from 'lucide-react';
import { api } from '../hooks/useApi';
import type { Team, TeamMember, Device, User } from '../types';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';

type TeamTab = 'devices' | 'members';

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [activeTab, setActiveTab] = useState<TeamTab>('devices');

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
      // Remove team assignment by assigning to null via bulk action with empty team
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

  const ROLE_COLOR: Record<string, string> = {
    SUPER_ADMIN: 'text-red-400', ORG_ADMIN: 'text-amber-400',
    TEAM_ADMIN: 'text-blue-400', SUPPORT: 'text-green-400', AUDITOR: 'text-gray-400',
  };

  const availableDevices = allDevices.filter(d =>
    d.team_id !== selectedTeam?.id &&
    (deviceSearch === '' ||
      d.serial_number.toLowerCase().includes(deviceSearch.toLowerCase()) ||
      d.model.toLowerCase().includes(deviceSearch.toLowerCase()))
  );
  const availableUsers = allUsers.filter(u => !members.find(m => m.id === u.id));

  // ── Team detail view ──────────────────────────────────────────────────────
  if (selectedTeam) {
    return (
      <div className="space-y-5">
        <button onClick={() => setSelectedTeam(null)}
          className="text-sm text-gray-400 hover:text-white flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Back to Teams
        </button>
        {feedback && <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">{feedback}</div>}
        {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}

        {/* Team header */}
        <div className="bg-darkCard border border-darkBorder rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-accentCyan to-accentBlue" />
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-accentBlue/10 border border-accentBlue/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-accentCyan" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{selectedTeam.name}</h2>
                <p className="text-xs text-gray-400">{selectedTeam.device_count} device{selectedTeam.device_count !== 1 ? 's' : ''} · {members.length} member{members.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <button onClick={e => openEdit(selectedTeam, e)}
              className="flex items-center gap-2 px-4 py-2 border border-darkBorder text-sm text-gray-300 rounded-lg hover:bg-darkBg">
              <Pencil className="w-3.5 h-3.5" /> Rename
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-darkBorder">
          {([['devices', 'Devices', <Smartphone className="w-4 h-4" />], ['members', 'Members', <Users className="w-4 h-4" />]] as const).map(([id, label, icon]) => (
            <button key={id} onClick={() => setActiveTab(id as TeamTab)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${activeTab === id ? 'border-b-2 border-accentCyan text-white' : 'text-gray-400 hover:text-white'}`}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* Devices tab */}
        {activeTab === 'devices' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-400">{teamDevices.length} device{teamDevices.length !== 1 ? 's' : ''} in this team</p>
              <button onClick={() => setShowAddDevice(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:opacity-90">
                <Plus className="w-4 h-4" /> Add Device
              </button>
            </div>
            <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-darkBorder bg-darkBg/30 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="p-3">Device</th>
                    <th className="p-3">Serial</th>
                    <th className="p-3">OS</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-darkBorder text-gray-300">
                  {teamDevices.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-500">No devices in this team yet</td></tr>
                  )}
                  {teamDevices.map(d => (
                    <tr key={d.id} className="hover:bg-darkBg/30">
                      <td className="p-3 font-semibold text-white">{d.model}</td>
                      <td className="p-3 font-mono text-xs">{d.serial_number}</td>
                      <td className="p-3 text-xs">{d.os_version}</td>
                      <td className="p-3"><StatusBadge status={d.enrollment_status} small /></td>
                      <td className="p-3 text-right">
                        <button onClick={() => unassignDevice(d.id)}
                          className="text-xs px-3 py-1 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/10">
                          Unassign
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Members tab */}
        {activeTab === 'members' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-400">{members.length} member{members.length !== 1 ? 's' : ''} in this team</p>
              <button onClick={() => setShowAddMember(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:opacity-90">
                <UserPlus className="w-4 h-4" /> Add Member
              </button>
            </div>
            <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-darkBorder bg-darkBg/30 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="p-3">Email</th>
                    <th className="p-3">Role</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-darkBorder text-gray-300">
                  {members.length === 0 && (
                    <tr><td colSpan={3} className="p-8 text-center text-gray-500">No members in this team yet</td></tr>
                  )}
                  {members.map(m => (
                    <tr key={m.id} className="hover:bg-darkBg/30">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-accentBlue/20 flex items-center justify-center text-xs font-bold text-white">{m.email[0].toUpperCase()}</div>
                          <span className="text-white">{m.email}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`flex items-center gap-1 text-xs font-semibold ${ROLE_COLOR[m.role] || 'text-gray-400'}`}>
                          <Shield className="w-3 h-3" />{m.role}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button onClick={() => removeMember(m.id)}
                          className="text-xs px-3 py-1 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/10">
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Add Device modal */}
        {showAddDevice && (
          <Modal title="Add Device to Team" onClose={() => { setShowAddDevice(false); setDeviceSearch(''); }} wide>
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-3.5" />
                <input value={deviceSearch} onChange={e => setDeviceSearch(e.target.value)}
                  placeholder="Search by serial or model…"
                  className="w-full bg-darkBg border border-darkBorder rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accentCyan" />
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-darkBorder rounded-xl border border-darkBorder">
                {availableDevices.length === 0 && <p className="p-6 text-center text-gray-500 text-sm">No available devices</p>}
                {availableDevices.map(d => (
                  <button key={d.id} onClick={() => assignDevice(d.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-darkBg/60 text-left">
                    <div>
                      <p className="text-white text-sm font-semibold">{d.model}</p>
                      <p className="text-xs text-gray-400 font-mono">{d.serial_number}</p>
                    </div>
                    <StatusBadge status={d.enrollment_status} small />
                  </button>
                ))}
              </div>
            </div>
          </Modal>
        )}

        {/* Add Member modal */}
        {showAddMember && (
          <Modal title="Add Member to Team" onClose={() => setShowAddMember(false)}>
            <div className="space-y-3">
              <div className="max-h-64 overflow-y-auto divide-y divide-darkBorder rounded-xl border border-darkBorder">
                {availableUsers.length === 0 && <p className="p-6 text-center text-gray-500 text-sm">All users are already members</p>}
                {availableUsers.map(u => (
                  <button key={u.id} onClick={() => addMember(u.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-darkBg/60 text-left">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-accentBlue/20 flex items-center justify-center text-xs font-bold text-white">{u.email[0].toUpperCase()}</div>
                      <span className="text-white text-sm">{u.email}</span>
                    </div>
                    <span className={`text-xs font-semibold ${ROLE_COLOR[u.role] || 'text-gray-400'}`}>{u.role}</span>
                  </button>
                ))}
              </div>
            </div>
          </Modal>
        )}

        {/* Team rename modal */}
        {showModal && (
          <Modal title="Rename Team" onClose={() => setShowModal(false)}>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Team Name</label>
                <input value={name} onChange={e => setName(e.target.value)} required autoFocus
                  className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-darkBorder text-sm text-gray-400 rounded-lg hover:bg-darkBg">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-lg text-sm">Save</button>
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
          <p className="text-gray-400 text-sm mt-1">Organize devices and users into organizational units</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-3 rounded-lg hover:opacity-90">
          <Plus className="w-4 h-4" /> New Team
        </button>
      </div>

      {feedback && <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">{feedback}</div>}
      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.length === 0 && <p className="text-gray-500 text-sm col-span-3">No teams yet.</p>}
        {teams.map(t => (
          <div key={t.id}
            className="bg-darkCard border border-darkBorder rounded-2xl p-5 flex items-start justify-between hover:border-accentCyan/40 transition-colors cursor-pointer"
            onClick={() => openTeam(t)}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accentBlue/10 border border-accentBlue/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-accentCyan" />
              </div>
              <div>
                <p className="font-bold text-white">{t.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t.device_count} device{t.device_count !== 1 ? 's' : ''}</p>
                <p className="text-xs text-accentCyan mt-1">Click to manage →</p>
              </div>
            </div>
            <div className="flex gap-2" onClick={e => e.stopPropagation()}>
              <button onClick={e => { e.stopPropagation(); openEdit(t, e); }} className="p-1.5 border border-darkBorder rounded-lg text-gray-400 hover:text-white hover:bg-darkBg">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={e => { e.stopPropagation(); del(t.id, e); }} className="p-1.5 border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/10">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title={editing ? 'Rename Team' : 'Create Team'} onClose={() => setShowModal(false)}>
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Team Name</label>
              <input value={name} onChange={e => setName(e.target.value)} required autoFocus
                placeholder="e.g., Engineering, Sales EMEA…"
                className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
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
