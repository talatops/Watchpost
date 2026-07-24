import React, { useState, useEffect } from 'react';
import {
  Smartphone, Settings, FileText, LogOut,
  LayoutDashboard, Users, Tag, Zap, BarChart2, Package,
  Database, AlertTriangle,
} from 'lucide-react';
import { api } from './hooks/useApi';
import type { User } from './types';
import { UserContext } from './context/UserContext';
import { usePermissions } from './hooks/usePermissions';

import DashboardPage  from './pages/DashboardPage';
import DevicesPage    from './pages/DevicesPage';
import PoliciesPage   from './pages/PoliciesPage';
import TeamsPage      from './pages/TeamsPage';
import LabelsPage     from './pages/LabelsPage';
import AppsPage       from './pages/AppsPage';
import QueryPage      from './pages/QueryPage';
import WebhooksPage   from './pages/WebhooksPage';
import ReportsPage    from './pages/ReportsPage';
import AuditsPage     from './pages/AuditsPage';
import UsersPage      from './pages/UsersPage';

type Page =
  | 'dashboard' | 'devices' | 'policies' | 'teams'
  | 'labels' | 'apps' | 'queries' | 'webhooks'
  | 'reports' | 'audits' | 'users';

interface NavItem {
  id: Page;
  label: string;
  icon: React.ReactNode;
  group: string;
  /** key into permissions.nav — undefined means always visible */
  permKey?: keyof ReturnType<typeof usePermissions>['nav'];
}

const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard',    icon: <LayoutDashboard className="w-4 h-4" />, group: 'Overview' },
  { id: 'devices',   label: 'Devices',      icon: <Smartphone      className="w-4 h-4" />, group: 'Fleet' },
  { id: 'teams',     label: 'Teams',        icon: <Users           className="w-4 h-4" />, group: 'Fleet' },
  { id: 'labels',    label: 'Labels',       icon: <Tag             className="w-4 h-4" />, group: 'Fleet',        permKey: 'labels'   },
  { id: 'policies',  label: 'Policies',     icon: <Settings        className="w-4 h-4" />, group: 'Compliance' },
  { id: 'queries',   label: 'Queries',      icon: <Database        className="w-4 h-4" />, group: 'Compliance' },
  { id: 'reports',   label: 'Reports',      icon: <BarChart2       className="w-4 h-4" />, group: 'Compliance' },
  { id: 'apps',      label: 'Applications', icon: <Package         className="w-4 h-4" />, group: 'Deploy',       permKey: 'apps'     },
  { id: 'webhooks',  label: 'Webhooks',     icon: <Zap             className="w-4 h-4" />, group: 'Integrations', permKey: 'webhooks' },
  { id: 'audits',    label: 'Audit Logs',   icon: <FileText        className="w-4 h-4" />, group: 'Security' },
  { id: 'users',     label: 'Users',        icon: <Users           className="w-4 h-4" />, group: 'Security',     permKey: 'users'    },
];

const ROLE_BADGE: Record<string, string> = {
  SUPER_ADMIN: 'text-red-400',
  ORG_ADMIN:   'text-amber-400',
  TEAM_ADMIN:  'text-blue-400',
  SUPPORT:     'text-green-400',
  AUDITOR:     'text-gray-400',
};

function decodeToken(token: string): { email?: string; role?: string } {
  try { return JSON.parse(atob(token.split('.')[1])); }
  catch { return {}; }
}

export default function App() {
  const [token,      setToken]      = useState<string | null>(localStorage.getItem('mdm_token'));
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [authError,  setAuthError]  = useState('');
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [me,         setMe]         = useState<User | null>(null);

  useEffect(() => {
    if (token) api.get<User>('/users/me').then(u => setMe(u)).catch(() => {});
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const data = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
      localStorage.setItem('mdm_token', data.token);
      setToken(data.token);
      setMe(data.user);
    } catch (err: unknown) { setAuthError((err as Error).message); }
  };

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch { /**/ }
    localStorage.removeItem('mdm_token');
    setToken(null); setMe(null);
  };

  // ── Login screen ───────────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-darkBg px-4 relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-accentCyan/5 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-accentBlue/5 blur-3xl pointer-events-none" />
        <div className="w-full max-w-md bg-darkCard border border-darkBorder p-8 rounded-2xl shadow-2xl relative overflow-hidden animate-modal-in">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-accentCyan to-accentBlue" />
          <div className="flex flex-col items-center mb-8">
            <img src="/watchpost-logo.svg" alt="Watchpost" className="w-40 h-40" />
          </div>
          <form onSubmit={handleLogin} className="space-y-5">
            {authError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2 animate-shake">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {authError}
              </div>
            )}
            <div>
              <label className="form-label">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="you@example.com" autoComplete="email" className="input-base" />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="••••••••" autoComplete="current-password" className="input-base" />
            </div>
            <button type="submit" className="btn-primary w-full py-3 text-base justify-center">
              Sign In
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-gray-600">Contact your administrator for access credentials.</p>
        </div>
      </div>
    );
  }

  // ── Authenticated layout ───────────────────────────────────────────────
  const displayEmail = me?.email || decodeToken(token).email || 'Admin';
  const displayRole  = me?.role  || decodeToken(token).role  || '';
  const initials     = displayEmail.slice(0, 2).toUpperCase();

  // Build permissions from the known role
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const perms = usePermissions(displayRole);

  // Filter nav: keep item if no permKey, or if perms.nav[permKey] is true
  const visibleNav = NAV.filter(item =>
    item.permKey === undefined || perms.nav[item.permKey] === true
  );

  // Guard: if active page is no longer visible, redirect to dashboard
  const activeIsVisible = visibleNav.some(n => n.id === activePage);
  const safePage = activeIsVisible ? activePage : 'dashboard';

  const groups = [...new Set(visibleNav.map(n => n.group))];

  const contextValue = { me, role: displayRole };

  return (
    <UserContext.Provider value={contextValue}>
      <div className="h-screen bg-darkBg flex overflow-hidden">

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <aside className="w-60 bg-darkCard border-r border-darkBorder flex flex-col flex-shrink-0">
          {/* Logo */}
          <div className="p-5 border-b border-darkBorder flex items-center gap-3">
            <img src="/watchpost-icon.svg" alt="Watchpost" className="w-7 h-7" />
            <span className="font-bold text-white tracking-wide">Watchpost</span>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-4">
            {groups.map(group => (
              <div key={group}>
                <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest px-3 mb-1">
                  {group}
                </p>
                {visibleNav.filter(n => n.group === group).map(item => {
                  const active = safePage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActivePage(item.id)}
                      className={[
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                        active
                          ? 'bg-gradient-to-r from-accentCyan/10 to-accentBlue/10 border border-accentCyan/20 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent',
                      ].join(' ')}
                    >
                      <span className={active ? 'text-accentCyan' : ''}>{item.icon}</span>
                      {item.label}
                      {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accentCyan" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* User profile */}
          <div className="p-3 border-t border-darkBorder space-y-2">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-darkBg border border-darkBorder">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accentCyan to-accentBlue flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
                {initials}
              </div>
              <div className="overflow-hidden min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">{displayEmail}</p>
                <p className={`text-[10px] font-semibold truncate ${ROLE_BADGE[displayRole] ?? 'text-gray-500'}`}>
                  {displayRole || 'Unknown'}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-2 border border-red-500/20 text-red-400 rounded-xl text-xs font-medium hover:bg-red-500/10 hover:border-red-500/40 transition-all duration-150"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-8">
          {safePage === 'dashboard' && <DashboardPage />}
          {safePage === 'devices'   && <DevicesPage />}
          {safePage === 'policies'  && <PoliciesPage />}
          {safePage === 'teams'     && <TeamsPage />}
          {safePage === 'labels'    && <LabelsPage />}
          {safePage === 'apps'      && <AppsPage />}
          {safePage === 'queries'   && <QueryPage />}
          {safePage === 'webhooks'  && <WebhooksPage />}
          {safePage === 'reports'   && <ReportsPage />}
          {safePage === 'audits'    && <AuditsPage />}
          {safePage === 'users'     && <UsersPage />}
        </main>
      </div>
    </UserContext.Provider>
  );
}
