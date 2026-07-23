import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { api } from '../hooks/useApi';
import type { Team } from '../types';
import Modal from '../components/Modal';

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [name, setName] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const flash = (msg: string, isErr = false) => {
    isErr ? setError(msg) : setFeedback(msg);
    setTimeout(() => isErr ? setError('') : setFeedback(''), 4000);
  };

  const load = () => api.get<Team[]>('/teams').then(t => setTeams(t || [])).catch(e => flash(e.message, true));
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setName(''); setShowModal(true); };
  const openEdit = (t: Team) => { setEditing(t); setName(t.name); setShowModal(true); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/teams/${editing.id}`, { name });
        flash('Team updated');
      } else {
        await api.post('/teams', { name });
        flash('Team created');
      }
      setShowModal(false);
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this team? Devices will become unassigned.')) return;
    try {
      await api.delete(`/teams/${id}`);
      flash('Team deleted');
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Teams</h1>
          <p className="text-gray-400 text-sm mt-1">Organize devices into organizational units</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-3 rounded-lg hover:opacity-90">
          <Plus className="w-4 h-4" /> New Team
        </button>
      </div>

      {feedback && <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">{feedback}</div>}
      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.length === 0 && <p className="text-gray-500 text-sm col-span-3">No teams yet. Create one to group devices.</p>}
        {teams.map(t => (
          <div key={t.id} className="bg-darkCard border border-darkBorder rounded-2xl p-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accentBlue/10 border border-accentBlue/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-accentCyan" />
              </div>
              <div>
                <p className="font-bold text-white">{t.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t.device_count} device{t.device_count !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(t)} className="p-1.5 border border-darkBorder rounded-lg text-gray-400 hover:text-white hover:bg-darkBg">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => del(t.id)} className="p-1.5 border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/10">
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
