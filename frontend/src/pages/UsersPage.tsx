import React, { useEffect, useState, useMemo } from 'react';
import {
  Plus, Trash2, Shield, Search, X,
  Crown, Users, Eye, Headphones, CheckCircle2, XCircle,
} from 'lucide-react';
import { api } from '../hooks/useApi';
import type { User } from '../types';
import Modal from '../components/Modal';

const ROLES = ['SUPER_ADMIN', 'ORG_ADMIN', 'TEAM_ADMIN', 'SUPPORT', 'AUDITOR'] as const;
type Role = typeof ROLES[number];

// All gradient classes written out statically so Tailwind includes them
const ROLE_CFG: Record<Role, {
  label: string; color: string; bg: string; border: string;
  avatarGrad: string; icon: React.ReactNode; description: string;
}> = {
  SUPER_ADMIN: {
    label: 'Super Admin', color: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/30',
    avatarGrad: 'from-red-500 to-rose-700',
    icon: <Crown className="w-3 h-3" />, description: 'Full platform access',
  },
  ORG_ADMIN: {
    label: 'Org Admin',   color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30',
    avatarGrad: 'from-amber-500 to-orange-700',
    icon: <Shield className="w-3 h-3" />, description: 'Manage org settings & users',
  },
  TEAM_ADMIN: {
    label: 'Team Admin',  color: 'text-blue-400',  bg: 'bg-blue-500/10',  border: 'border-blue-500/30',
    avatarGrad: 'from-blue-500 to-indigo-700',
    icon: <Users className="w-3 h-3" />, description: 'Manage assigned teams',
  },
  SUPPORT: {
    label: 'Support',     color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30',
    avatarGrad: 'from-green-500 to-emerald-700',
    icon: <Headphones className="w-3 h-3" />, description: 'View devices & run commands',
  },
  AUDITOR: {
    label: 'Auditor',     color: 'text-gray-400',  bg: 'bg-gray-500/10',  border: 'border-gray-500/30',
    avatarGrad: 'from-gray-500 to-slate-700',
    icon: <Eye className="w-3 h-3" />, description: 'Read-only audit access',
  },
};

function roleCfg(role: string) {
  return ROLE_CFG[role as Role] ?? {
    label: role, color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/30',
    avatarGrad: 'from-gray-500 to-slate-700',
    icon: <Shield className="w-3 h-3" />, description: '',
  };
}

function UserAvatar({ email, role, size = 'md', hovered = false }: {
  email: string; role: string; size?: 'sm' | 'md' | 'lg'; hovered?: boolean;
}) {
  const cfg = roleCfg(role);
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-14 h-14 text-xl' : 'w-10 h-10 text-sm';
  return (
    <div
      className={`${sz} rounded-full bg-gradient-to-br ${cfg.avatarGrad} flex items-center justify-center font-bold text-white flex-shrink-0 transition-all duration-200 ${hovered ? 'scale-110 shadow-lg' : ''}`}
      style={{ boxShadow: hovered ? `0 0 16px rgba(0,210,255,0.2)` : undefined }}>
      {email[0]?.toUpperCase()}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const cfg = roleCfg(role);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('SUPPORT');
  const [search, setSearch] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const flash = (msg: string, isErr = false) => {
    isErr ? setError(msg) : setFeedback(msg);
    setTimeout(() => isErr ? setError('') : setFeedback(''), 4000);
  };

  const load = () => Promise.all([
    api.get<User[]>('/users').then(u => setUsers(u || [])),
    api.get<User>('/users/me').then(u => setMe(u)),
  ]).catch(e => flash(e.message, true));

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/users', { email, password, role });
      flash('User created');
      setShowModal(false); setEmail(''); setPassword(''); setRole('SUPPORT');
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const updateRole = async (id: string, newRole: string) => {
    try {
      await api.put(`/users/${id}`, { role: newRole });
      flash('Role updated');
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    try {
      await api.delete(`/users/${id}`);
      flash('User deleted');
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const canManage = me?.role === 'SUPER_ADMIN' || me?.role === 'ORG_ADMIN';

  const filtered = useMemo(() => users.filter(u =>
    search === '' ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  ), [users, search]);

  // Role distribution counts
  const roleCounts = useMemo(() => ROLES.reduce((acc, r) => {
    acc[r] = users.filter(u => u.role === r).length;
    return acc;
  }, {} as Record<Role, number>), [users]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users & Access</h1>
          <p className="text-gray-400 text-sm mt-1">Manage team members and their platform roles</p>
        </div>
        {canManage && (
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-accentBlue/20">
            <Plus className="w-4 h-4" /> Invite User
          </button>
        )}
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

      {/* Role breakdown chips */}
      {users.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-600">{users.length} user{users.length !== 1 ? 's' : ''}:</span>
          {ROLES.filter(r => roleCounts[r] > 0).map(r => {
            const cfg = roleCfg(r);
            return (
              <span key={r} className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                {cfg.icon}{cfg.label}
                <span className="ml-0.5 opacity-75">×{roleCounts[r]}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-3 pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by email or role…"
          className="w-full bg-darkCard border border-darkBorder rounded-xl pl-10 pr-9 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* User cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 && (
          <div className="col-span-3 py-14 text-center">
            <Users className="w-10 h-10 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">{users.length === 0 ? 'No users found' : 'No users match your search'}</p>
          </div>
        )}

        {filtered.map((u, idx) => {
          const cfg = roleCfg(u.role);
          const isHov = hoveredId === u.id;
          const isMe = u.id === me?.id;
          return (
            <div key={u.id}
              onMouseEnter={() => setHoveredId(u.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                animationDelay: `${idx * 50}ms`,
                transform: isHov ? 'translateY(-2px)' : 'translateY(0)',
                boxShadow: isHov ? '0 8px 32px -8px rgba(0,0,0,0.5)' : '0 2px 12px -4px rgba(0,0,0,0.3)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
              className={`animate-fade-in-up bg-darkCard border ${isMe ? cfg.border : isHov ? 'border-gray-600/50' : 'border-darkBorder'} rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden`}>

              {/* Top accent */}
              {isMe && <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${cfg.avatarGrad}`} />}

              {/* Avatar + name row */}
              <div className="flex items-start justify-between gap-3 pt-0.5">
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar email={u.email} role={u.role} hovered={isHov} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-bold text-white truncate">{u.email}</p>
                      {isMe && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-accentCyan/30 text-accentCyan bg-accentCyan/10 flex-shrink-0">
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      Since {new Date(u.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Delete button */}
                {canManage && !isMe && (
                  <button onClick={() => del(u.id)}
                    className={`flex-shrink-0 p-1.5 border border-red-500/20 rounded-xl text-red-500/50 hover:text-red-400 hover:bg-red-500/10 transition-all ${isHov ? 'opacity-100' : 'opacity-0'}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Role section */}
              <div className="space-y-2">
                {canManage && !isMe ? (
                  <>
                    <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Role</p>
                    <div className="grid grid-cols-1 gap-1">
                      <select value={u.role} onChange={e => updateRole(u.id, e.target.value)}
                        className={`w-full bg-darkBg border ${cfg.border} rounded-xl px-3 py-2 text-xs font-semibold ${cfg.color} focus:outline-none focus:ring-1 focus:ring-accentCyan/20 transition-all cursor-pointer`}>
                        {ROLES.map(r => (
                          <option key={r} value={r} className="text-white bg-darkBg">
                            {roleCfg(r).label}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-gray-600 px-1">{cfg.description}</p>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <RoleBadge role={u.role} />
                    <p className="text-[10px] text-gray-600">{cfg.description}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Invite User modal */}
      {showModal && (
        <Modal title="Invite User" onClose={() => setShowModal(false)}>
          <form onSubmit={create} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
                placeholder="user@company.com"
                className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
              {/* Live avatar preview */}
              {email && (
                <div className="mt-2 flex items-center gap-2">
                  <UserAvatar email={email} role={role} size="sm" />
                  <span className="text-xs text-gray-500">{email}</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Initial Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
                placeholder="Min. 8 characters"
                className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">Role</label>
              <div className="grid grid-cols-1 gap-2">
                {ROLES.map(r => {
                  const cfg = roleCfg(r);
                  const sel = role === r;
                  return (
                    <button key={r} type="button" onClick={() => setRole(r)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                        sel ? `${cfg.bg} ${cfg.border}` : 'border-darkBorder hover:border-gray-600'
                      }`}>
                      <UserAvatar email={email || 'U'} role={r} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold ${sel ? cfg.color : 'text-gray-300'}`}>{cfg.label}</p>
                        <p className="text-[10px] text-gray-600">{cfg.description}</p>
                      </div>
                      {sel && <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${cfg.color}`} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowModal(false)}
                className="px-5 py-2.5 border border-darkBorder text-sm text-gray-400 rounded-xl hover:bg-darkBg transition-colors">
                Cancel
              </button>
              <button type="submit"
                className="px-5 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity">
                Create User
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
