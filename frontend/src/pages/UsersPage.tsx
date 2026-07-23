import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Shield } from 'lucide-react';
import { api } from '../hooks/useApi';
import type { User } from '../types';
import Modal from '../components/Modal';

const ROLES = ['SUPER_ADMIN', 'ORG_ADMIN', 'TEAM_ADMIN', 'SUPPORT', 'AUDITOR'];

const ROLE_COLOR: Record<string, string> = {
  SUPER_ADMIN: 'text-red-400 border-red-500/20 bg-red-500/10',
  ORG_ADMIN: 'text-amber-400 border-amber-500/20 bg-amber-500/10',
  TEAM_ADMIN: 'text-blue-400 border-blue-500/20 bg-blue-500/10',
  SUPPORT: 'text-green-400 border-green-500/20 bg-green-500/10',
  AUDITOR: 'text-gray-400 border-gray-500/20 bg-gray-500/10',
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('SUPPORT');
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
    if (!confirm('Delete this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      flash('User deleted');
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const canManage = me?.role === 'SUPER_ADMIN' || me?.role === 'ORG_ADMIN';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users & Access</h1>
          <p className="text-gray-400 text-sm mt-1">Manage team members and their roles</p>
        </div>
        {canManage && (
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-3 rounded-lg hover:opacity-90">
            <Plus className="w-4 h-4" /> Invite User
          </button>
        )}
      </div>

      {feedback && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-darkCard border border-green-500/30 text-green-400 text-sm font-medium px-4 py-3 rounded-xl shadow-2xl max-w-sm">
          <span>✓ {feedback}</span>
        </div>
      )}
      {error && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-darkCard border border-red-500/30 text-red-400 text-sm font-medium px-4 py-3 rounded-xl shadow-2xl max-w-sm">
          <span>✕ {error}</span>
        </div>
      )}

      <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-darkBorder bg-darkBg/30 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Member Since</th>
              {canManage && <th className="p-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-darkBorder text-gray-300">
            {users.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-500">No users found</td></tr>}
            {users.map(u => (
              <tr key={u.id} className={`hover:bg-darkBg/30 ${u.id === me?.id ? 'bg-accentBlue/5' : ''}`}>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-accentBlue/20 flex items-center justify-center text-xs font-bold text-white">
                      {u.email[0].toUpperCase()}
                    </div>
                    <span className="text-white">{u.email}</span>
                    {u.id === me?.id && <span className="text-[10px] text-gray-400 border border-darkBorder px-1.5 py-0.5 rounded">You</span>}
                  </div>
                </td>
                <td className="p-3">
                  {canManage && u.id !== me?.id ? (
                    <select value={u.role} onChange={e => updateRole(u.id, e.target.value)}
                      className="bg-darkBg border border-darkBorder rounded-lg px-2 py-1 text-xs text-white focus:outline-none">
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className={`text-xs font-semibold border px-2 py-0.5 rounded flex items-center gap-1 w-fit ${ROLE_COLOR[u.role] || 'text-gray-400'}`}>
                      <Shield className="w-3 h-3" />{u.role}
                    </span>
                  )}
                </td>
                <td className="p-3 text-xs text-gray-400">{new Date(u.created_at).toLocaleDateString()}</td>
                {canManage && (
                  <td className="p-3 text-right">
                    {u.id !== me?.id && (
                      <button onClick={() => del(u.id)} className="p-1.5 border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="Invite User" onClose={() => setShowModal(false)}>
          <form onSubmit={create} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Initial Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
                className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Role</label>
              <select value={role} onChange={e => setRole(e.target.value)}
                className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-darkBorder text-sm text-gray-400 rounded-lg hover:bg-darkBg">Cancel</button>
              <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-lg text-sm">Create User</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
