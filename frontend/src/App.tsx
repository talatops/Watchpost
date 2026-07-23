import React, { useState, useEffect } from 'react';
import {
  Smartphone, Settings, FileText, LogOut,
  LayoutDashboard, Users, Tag, Zap, BarChart2, Package,
  Database, AlertTriangle, ChevronRight,
} from 'lucide-react';
import { api } from './hooks/useApi';
import type { User } from './types';

import DashboardPage from './pages/DashboardPage';
import DevicesPage from './pages/DevicesPage';
import PoliciesPage from './pages/PoliciesPage';
import TeamsPage from './pages/TeamsPage';
import LabelsPage from './pages/LabelsPage';
import AppsPage from './pages/AppsPage';
import QueryPage from './pages/QueryPage';
import WebhooksPage from './pages/WebhooksPage';
import ReportsPage from './pages/ReportsPage';
import AuditsPage from './pages/AuditsPage';
import UsersPage from './pages/UsersPage';

type Page =
  | 'dashboard' | 'devices' | 'policies' | 'teams'
  | 'labels' | 'apps' | 'queries' | 'webhooks'
  | 'reports' | 'audits' | 'users';

interface NavItem {
  id: Page;
  label: string;
  icon: React.ReactNode;
  group?: string;
}

const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, group: 'Overview' },
  { id: 'devices', label: 'Devices', icon: <Smartphone className="w-4 h-4" />, group: 'Fleet' },
  { id: 'teams', label: 'Teams', icon: <Users className="w-4 h-4" />, group: 'Fleet' },
  { id: 'labels', label: 'Labels', icon: <Tag className="w-4 h-4" />, group: 'Fleet' },
  { id: 'policies', label: 'Policies', icon: <Settings className="w-4 h-4" />, group: 'Compliance' },
  { id: 'queries', label: 'Queries', icon: <Database className="w-4 h-4" />, group: 'Compliance' },
  { id: 'reports', label: 'Reports', icon: <BarChart2 className="w-4 h-4" />, group: 'Compliance' },
  { id: 'apps', label: 'Applications', icon: <Package className="w-4 h-4" />, group: 'Deploy' },
  { id: 'webhooks', label: 'Webhooks', icon: <Zap className="w-4 h-4" />, group: 'Integrations' },
  { id: 'audits', label: 'Audit Logs', icon: <FileText className="w-4 h-4" />, group: 'Security' },
  { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" />, group: 'Security' },
];

// Decode JWT payload (no signature validation — just for UI display)
function decodeToken(token: string): { email?: string; role?: string } {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload;
  } catch {
    return {};
  }
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('mdm_token'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [me, setMe] = useState<User | null>(null);

  useEffect(() => {
    if (token) {
      api.get<User>('/users/me').then(u => setMe(u)).catch(() => {
        // Token might be expired; if /users/me fails with 401, log out
      });
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const data = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
      localStorage.setItem('mdm_token', data.token);
      setToken(data.token);
      setMe(data.user);
    } catch (err: unknown) {
      setAuthError((err as Error).message);
    }
  };

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    localStorage.removeItem('mdm_token');
    setToken(null);
    setMe(null);
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-darkBg px-4">
        <div className="w-full max-w-md bg-darkCard border border-darkBorder p-8 rounded-2xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-accentCyan to-accentBlue" />
          <div className="flex flex-col items-center mb-8">
            <img
              src="/watchpost-logo.svg"
              alt="Watchpost"
              className="w-40 h-40"
            />
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {authError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {authError}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="you@example.com" autoComplete="email"
                className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-accentCyan transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="••••••••" autoComplete="current-password"
                className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-accentCyan transition-colors" />
            </div>
            <button type="submit" className="w-full py-3 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-lg hover:opacity-90 transition-opacity">
              Sign In
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-gray-500">Contact your administrator for access credentials.</p>
        </div>
      </div>
    );
  }

  // Derive display info from token or /users/me
  const displayEmail = me?.email || decodeToken(token).email || 'Admin';
  const displayRole = me?.role || decodeToken(token).role || '';
  const initials = displayEmail.slice(0, 2).toUpperCase();

  // Group nav items
  const groups = [...new Set(NAV.map(n => n.group))];

  return (
    <div className="h-screen bg-darkBg flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-darkCard border-r border-darkBorder flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="p-5 border-b border-darkBorder flex items-center gap-3">
          <img src="/watchpost-icon.svg" alt="Watchpost" className="w-7 h-7" />
          <span className="font-bold text-white tracking-wide">Watchpost</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {groups.map(group => (
            <div key={group}>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest px-3 mb-1">{group}</p>
              {NAV.filter(n => n.group === group).map(item => (
                <button
                  key={item.id}
                  onClick={() => setActivePage(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activePage === item.id
                      ? 'bg-gradient-to-r from-accentCyan/10 to-accentBlue/10 border-l-2 border-accentCyan text-white'
                      : 'text-gray-400 hover:text-white hover:bg-darkBg'
                  }`}
                >
                  {item.icon}
                  {item.label}
                  {activePage === item.id && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* User profile */}
        <div className="p-3 border-t border-darkBorder">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-darkBg border border-darkBorder mb-2">
            <div className="w-8 h-8 rounded-full bg-accentBlue flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
              {initials}
            </div>
            <div className="overflow-hidden min-w-0">
              <p className="text-xs font-semibold text-white truncate">{displayEmail}</p>
              <p className="text-[10px] text-gray-400 truncate">{displayRole}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/10 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-8">
        {activePage === 'dashboard' && <DashboardPage />}
        {activePage === 'devices' && <DevicesPage />}
        {activePage === 'policies' && <PoliciesPage />}
        {activePage === 'teams' && <TeamsPage />}
        {activePage === 'labels' && <LabelsPage />}
        {activePage === 'apps' && <AppsPage />}
        {activePage === 'queries' && <QueryPage />}
        {activePage === 'webhooks' && <WebhooksPage />}
        {activePage === 'reports' && <ReportsPage />}
        {activePage === 'audits' && <AuditsPage />}
        {activePage === 'users' && <UsersPage />}
      </main>
    </div>
  );
}
