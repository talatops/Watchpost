import { useEffect, useState, useMemo, type FormEvent } from 'react';
import {
  Plus, Trash2, Send, QrCode, Key, Package, Search, X,
  Zap, Shield, Globe, Download, CheckCircle2, XCircle,
} from 'lucide-react';
import { api } from '../hooks/useApi';
import type { Application, AppDeployment, Team, EnrollmentToken } from '../types';
import Modal from '../components/Modal';

interface QRResponse {
  qr_data: string;
  payload: { server_url: string; token: string; label: string };
}

// Deterministic colour from package name string
const APP_PALETTES = [
  { bg: 'from-cyan-500/20 to-blue-600/20',    border: 'border-cyan-500/30',    icon: 'text-cyan-400',    iconBg: 'bg-cyan-500/10'    },
  { bg: 'from-violet-500/20 to-purple-600/20', border: 'border-violet-500/30',  icon: 'text-violet-400',  iconBg: 'bg-violet-500/10'  },
  { bg: 'from-emerald-500/20 to-teal-600/20',  border: 'border-emerald-500/30', icon: 'text-emerald-400', iconBg: 'bg-emerald-500/10' },
  { bg: 'from-amber-500/20 to-orange-600/20',  border: 'border-amber-500/30',   icon: 'text-amber-400',   iconBg: 'bg-amber-500/10'   },
  { bg: 'from-rose-500/20 to-pink-600/20',     border: 'border-rose-500/30',    icon: 'text-rose-400',    iconBg: 'bg-rose-500/10'    },
  { bg: 'from-sky-500/20 to-indigo-600/20',    border: 'border-sky-500/30',     icon: 'text-sky-400',     iconBg: 'bg-sky-500/10'     },
];

function palFor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return APP_PALETTES[Math.abs(h) % APP_PALETTES.length];
}

// Derive a short display name from a package name
function shortName(pkg: string) {
  const parts = pkg.split('.');
  const last = parts[parts.length - 1];
  return last.charAt(0).toUpperCase() + last.slice(1);
}

// Two-letter monogram from package name
function monogram(pkg: string) {
  const parts = pkg.split('.').filter(Boolean);
  if (parts.length >= 2) return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
  return pkg.slice(0, 2).toUpperCase();
}

const INSTALL_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  FORCE_INSTALL: { label: 'Force Install', icon: <Zap className="w-3 h-3" />,       cls: 'bg-red-500/10 border-red-500/30 text-red-400'     },
  AVAILABLE:     { label: 'Available',     icon: <Download className="w-3 h-3" />,   cls: 'bg-green-500/10 border-green-500/30 text-green-400' },
  BLOCKED:       { label: 'Blocked',       icon: <XCircle className="w-3 h-3" />,    cls: 'bg-gray-500/10 border-gray-500/30 text-gray-400'   },
};

export default function AppsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [deployments, setDeployments] = useState<AppDeployment[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tokens, setTokens] = useState<EnrollmentToken[]>([]);

  // UI state
  const [appSearch, setAppSearch] = useState('');
  const [hoveredApp, setHoveredApp] = useState<string | null>(null);

  // App add/deploy state
  const [showAdd, setShowAdd] = useState(false);
  const [showDeploy, setShowDeploy] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [pkg, setPkg] = useState('');
  const [versionCode, setVersionCode] = useState(1);
  const [versionName, setVersionName] = useState('');
  const [apkUrl, setApkUrl] = useState('');
  const [deployTeamId, setDeployTeamId] = useState('');
  const [installType, setInstallType] = useState('FORCE_INSTALL');

  // Token state
  const [showCreateToken, setShowCreateToken] = useState(false);
  const [tokenLabel, setTokenLabel] = useState('');
  const [tokenMaxUses, setTokenMaxUses] = useState(0);
  const [tokenExpiresAt, setTokenExpiresAt] = useState('');
  const [qrToken, setQrToken] = useState<EnrollmentToken | null>(null);
  const [qrData, setQrData] = useState<QRResponse | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const flash = (msg: string, isErr = false) => {
    isErr ? setError(msg) : setFeedback(msg);
    setTimeout(() => isErr ? setError('') : setFeedback(''), 4000);
  };

  const load = () => Promise.all([
    api.get<Application[]>('/apps').then(a => setApps(a || [])),
    api.get<AppDeployment[]>('/apps/deployments').then(d => setDeployments(d || [])),
    api.get<Team[]>('/teams').then(t => setTeams(t || [])),
    api.get<EnrollmentToken[]>('/enrollment-tokens').then(t => setTokens(t || [])),
  ]).catch(e => flash(e.message, true));

  useEffect(() => { load(); }, []);

  const filteredApps = useMemo(() => apps.filter(a =>
    appSearch === '' ||
    a.package_name.toLowerCase().includes(appSearch.toLowerCase()) ||
    a.version_name?.toLowerCase().includes(appSearch.toLowerCase())
  ), [apps, appSearch]);

  const addApp = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/apps', { package_name: pkg, version_code: versionCode, version_name: versionName, apk_url: apkUrl });
      flash('Application registered');
      setShowAdd(false);
      setPkg(''); setVersionCode(1); setVersionName(''); setApkUrl('');
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const deploy = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;
    try {
      const body: Record<string, unknown> = { application_id: selectedApp.id, install_type: installType };
      if (deployTeamId) body.team_id = deployTeamId;
      await api.post('/apps/deploy', body);
      flash('Deployment created');
      setShowDeploy(false);
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const del = async (id: string) => {
    if (!confirm('Remove this application?')) return;
    try {
      await api.delete(`/apps/${id}`);
      flash('Application removed');
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const createToken = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const body: Record<string, unknown> = { label: tokenLabel, max_uses: tokenMaxUses };
      if (tokenExpiresAt) body.expires_at = tokenExpiresAt;
      await api.post('/enrollment-tokens', body);
      flash('Enrollment token created');
      setShowCreateToken(false);
      setTokenLabel(''); setTokenMaxUses(0); setTokenExpiresAt('');
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const revokeToken = async (id: string) => {
    if (!confirm('Revoke this enrollment token?')) return;
    try {
      await api.delete(`/enrollment-tokens/${id}`);
      flash('Token revoked');
      load();
    } catch (e: unknown) { flash((e as Error).message, true); }
  };

  const openQR = async (token: EnrollmentToken) => {
    setQrToken(token); setQrData(null); setQrLoading(true);
    try {
      const data = await api.get<QRResponse>(`/enrollment-tokens/${token.id}/qr`);
      setQrData(data);
    } catch (e: unknown) {
      flash((e as Error).message, true);
      setQrToken(null);
    } finally { setQrLoading(false); }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Applications</h1>
          <p className="text-gray-400 text-sm mt-1">Manage and silently deploy APKs to managed devices</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-accentBlue/20">
          <Plus className="w-4 h-4" /> Register App
        </button>
      </div>

      {/* Toast */}
      {feedback && (
        <div className="fixed bottom-5 right-5 z-50 animate-slide-down flex items-center gap-3 bg-darkCard border border-green-500/30 text-green-400 text-sm font-medium px-4 py-3 rounded-xl shadow-2xl">
          <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center text-xs">✓</div>
          {feedback}
        </div>
      )}
      {error && (
        <div className="fixed bottom-5 right-5 z-50 animate-slide-down flex items-center gap-3 bg-darkCard border border-red-500/30 text-red-400 text-sm font-medium px-4 py-3 rounded-xl shadow-2xl">
          <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center text-xs">✕</div>
          {error}
        </div>
      )}

      {/* ── Registered Apps ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Registered Applications</h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-accentCyan/10 border border-accentCyan/20 text-accentCyan">
              {apps.length}
            </span>
          </div>
          {/* Search */}
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5 pointer-events-none" />
            <input value={appSearch} onChange={e => setAppSearch(e.target.value)}
              placeholder="Search apps…"
              className="w-full bg-darkCard border border-darkBorder rounded-xl pl-9 pr-8 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accentCyan transition-all" />
            {appSearch && (
              <button onClick={() => setAppSearch('')} className="absolute right-2.5 top-2.5 text-gray-500 hover:text-white transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* App Store card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredApps.length === 0 && (
            <div className="col-span-4 py-14 text-center">
              <Package className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">{apps.length === 0 ? 'No apps registered yet' : 'No apps match your search'}</p>
            </div>
          )}
          {filteredApps.map((a, idx) => {
            const pal = palFor(a.package_name);
            const isHov = hoveredApp === a.id;
            const appDeployCount = deployments.filter(d => d.application_id === a.id).length;
            return (
              <div key={a.id}
                onMouseEnter={() => setHoveredApp(a.id)}
                onMouseLeave={() => setHoveredApp(null)}
                style={{
                  animationDelay: `${idx * 50}ms`,
                  transform: isHov ? 'translateY(-4px)' : 'translateY(0)',
                  boxShadow: isHov ? '0 16px 40px -12px rgba(0,0,0,0.6)' : '0 2px 12px -4px rgba(0,0,0,0.3)',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                }}
                className={`animate-fade-in-up bg-darkCard border ${isHov ? pal.border : 'border-darkBorder'} rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden`}>

                {/* Hover tint */}
                <div className={`absolute inset-0 bg-gradient-to-br ${pal.bg} rounded-2xl pointer-events-none transition-opacity duration-200 ${isHov ? 'opacity-100' : 'opacity-0'}`} />

                {/* App icon + name */}
                <div className="relative flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-2xl ${pal.iconBg} border ${pal.border} flex items-center justify-center flex-shrink-0 text-sm font-black ${pal.icon}`}>
                    {monogram(a.package_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white text-sm truncate">{shortName(a.package_name)}</p>
                    <p className="text-[10px] text-gray-500 font-mono truncate">{a.package_name}</p>
                  </div>
                </div>

                {/* Version + deploy count */}
                <div className="relative flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-darkBg border border-darkBorder text-gray-400">
                    v{a.version_name || a.version_code} (build {a.version_code})
                  </span>
                  {appDeployCount > 0 && (
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg ${pal.iconBg} border ${pal.border} ${pal.icon}`}>
                      {appDeployCount} deployment{appDeployCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Registered date */}
                <p className="relative text-[10px] text-gray-600">
                  Added {new Date(a.created_at).toLocaleDateString()}
                </p>

                {/* Actions — revealed on hover */}
                <div className={`relative flex gap-2 transition-all duration-200 ${isHov ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
                  <button onClick={() => { setSelectedApp(a); setDeployTeamId(''); setInstallType('FORCE_INSTALL'); setShowDeploy(true); }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-accentCyan/30 text-xs font-semibold text-accentCyan rounded-xl hover:bg-accentCyan/10 transition-colors">
                    <Send className="w-3 h-3" /> Deploy
                  </button>
                  <button onClick={() => del(a.id)}
                    className="p-2 border border-red-500/20 text-red-400 rounded-xl hover:bg-red-500/10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Active Deployments ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Active Deployments</h2>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-darkBorder text-gray-400">{deployments.length}</span>
        </div>
        <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-darkBorder bg-darkBg/40 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="p-3 pl-5">App</th>
                <th className="p-3">Version</th>
                <th className="p-3">Target</th>
                <th className="p-3">Install Type</th>
                <th className="p-3">Deployed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-darkBorder">
              {deployments.length === 0 && (
                <tr><td colSpan={5} className="p-10 text-center">
                  <Send className="w-7 h-7 text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No deployments yet</p>
                </td></tr>
              )}
              {deployments.map(d => {
                const itCfg = INSTALL_TYPE_CONFIG[d.install_type] ?? INSTALL_TYPE_CONFIG['AVAILABLE'];
                const pal = palFor(d.package_name);
                return (
                  <tr key={d.id} className="hover:bg-darkBg/40 transition-colors group">
                    <td className="p-3 pl-5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg ${pal.iconBg} border ${pal.border} flex items-center justify-center text-[9px] font-black ${pal.icon} flex-shrink-0`}>
                          {monogram(d.package_name)}
                        </div>
                        <span className="font-mono text-xs text-white font-semibold">{d.package_name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-gray-400">{d.version_name}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg bg-darkBg border border-darkBorder text-gray-400">
                        {d.team_id ? <><Shield className="w-3 h-3" /> {teams.find(t => t.id === d.team_id)?.name ?? d.team_id.slice(0, 8) + '…'}</> :
                          d.device_id ? <><Package className="w-3 h-3" /> Device</> :
                          <><Globe className="w-3 h-3" /> Global</>}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${itCfg.cls}`}>
                        {itCfg.icon}{itCfg.label}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-500">{new Date(d.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Enrollment Tokens ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Enrollment Tokens</h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-darkBorder text-gray-400">{tokens.length}</span>
          </div>
          <button onClick={() => setShowCreateToken(true)}
            className="flex items-center gap-2 border border-accentCyan/30 text-accentCyan text-xs font-semibold px-4 py-2 rounded-xl hover:bg-accentCyan/10 transition-colors">
            <Key className="w-3.5 h-3.5" /> New Token
          </button>
        </div>
        <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-darkBorder bg-darkBg/40 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                <th className="p-3 pl-5">Label</th>
                <th className="p-3">Token</th>
                <th className="p-3">Uses</th>
                <th className="p-3">Expires</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right pr-5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-darkBorder">
              {tokens.length === 0 && (
                <tr><td colSpan={6} className="p-10 text-center">
                  <Key className="w-7 h-7 text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No enrollment tokens</p>
                </td></tr>
              )}
              {tokens.map(t => {
                const isExpired = t.expires_at ? new Date(t.expires_at) < new Date() : false;
                const isMaxed = t.max_uses > 0 && t.use_count >= t.max_uses;
                const usePct = t.max_uses > 0 ? Math.min((t.use_count / t.max_uses) * 100, 100) : null;
                return (
                  <tr key={t.id} className="hover:bg-darkBg/40 transition-colors">
                    <td className="p-3 pl-5 font-semibold text-white text-xs">{t.label || '(no label)'}</td>
                    <td className="p-3 font-mono text-xs text-gray-400">{t.token.slice(0, 16)}…</td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1 min-w-[80px]">
                        <span className="text-xs text-gray-400 tabular-nums">
                          {t.use_count}{t.max_uses > 0 ? ` / ${t.max_uses}` : ' / ∞'}
                        </span>
                        {usePct !== null && (
                          <div className="h-1.5 bg-darkBg rounded-full overflow-hidden w-20">
                            <div
                              className={`h-full rounded-full transition-all ${usePct >= 100 ? 'bg-red-500' : usePct >= 75 ? 'bg-amber-500' : 'bg-accentCyan'}`}
                              style={{ width: `${usePct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-gray-400">{t.expires_at ? new Date(t.expires_at).toLocaleDateString() : 'Never'}</td>
                    <td className="p-3">
                      {isExpired || isMaxed ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-gray-500/10 border border-gray-500/30 text-gray-400">
                          <XCircle className="w-3 h-3" /> {isExpired ? 'Expired' : 'Exhausted'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-400">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      )}
                    </td>
                    <td className="p-3 pr-5 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openQR(t)}
                          className="flex items-center gap-1 px-3 py-1.5 border border-violet-500/30 text-xs text-violet-400 rounded-xl hover:bg-violet-500/10 transition-colors">
                          <QrCode className="w-3.5 h-3.5" /> QR
                        </button>
                        <button onClick={() => revokeToken(t.id)}
                          className="p-1.5 border border-red-500/20 text-red-400 rounded-xl hover:bg-red-500/10 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Register App modal ── */}
      {showAdd && (
        <Modal title="Register Application" onClose={() => setShowAdd(false)}>
          <form onSubmit={addApp} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Package Name</label>
              <input value={pkg} onChange={e => setPkg(e.target.value)} required autoFocus placeholder="com.company.app"
                className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
              {pkg && (
                <div className="mt-2 flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg ${palFor(pkg).iconBg} border ${palFor(pkg).border} flex items-center justify-center text-[9px] font-black ${palFor(pkg).icon}`}>
                    {monogram(pkg)}
                  </div>
                  <span className="text-xs text-gray-400">{shortName(pkg)}</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Version Code</label>
                <input type="number" value={versionCode} onChange={e => setVersionCode(Number(e.target.value))} required min={1}
                  className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Version Name</label>
                <input value={versionName} onChange={e => setVersionName(e.target.value)} placeholder="1.0.0"
                  className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">APK URL</label>
              <input value={apkUrl} onChange={e => setApkUrl(e.target.value)} required placeholder="https://storage.example.com/app.apk"
                className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="px-5 py-2.5 border border-darkBorder text-sm text-gray-400 rounded-xl hover:bg-darkBg transition-colors">Cancel</button>
              <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity">Register</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Deploy modal ── */}
      {showDeploy && selectedApp && (
        <Modal title={`Deploy ${shortName(selectedApp.package_name)}`} onClose={() => setShowDeploy(false)}>
          <form onSubmit={deploy} className="space-y-4">
            {/* App identity */}
            <div className="flex items-center gap-3 p-3 bg-darkBg/60 border border-darkBorder rounded-xl">
              <div className={`w-10 h-10 rounded-xl ${palFor(selectedApp.package_name).iconBg} border ${palFor(selectedApp.package_name).border} flex items-center justify-center text-xs font-black ${palFor(selectedApp.package_name).icon}`}>
                {monogram(selectedApp.package_name)}
              </div>
              <div>
                <p className="text-sm font-bold text-white">{shortName(selectedApp.package_name)}</p>
                <p className="text-[10px] text-gray-500 font-mono">{selectedApp.package_name} · v{selectedApp.version_name}</p>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Target Team</label>
              <select value={deployTeamId} onChange={e => setDeployTeamId(e.target.value)}
                className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan transition-all">
                <option value="">Global (all devices)</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">Install Type</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(INSTALL_TYPE_CONFIG).map(([val, cfg]) => (
                  <button key={val} type="button" onClick={() => setInstallType(val)}
                    className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-semibold transition-all ${
                      installType === val ? cfg.cls : 'border-darkBorder text-gray-500 hover:border-gray-600'
                    }`}>
                    {cfg.icon}{cfg.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowDeploy(false)} className="px-5 py-2.5 border border-darkBorder text-sm text-gray-400 rounded-xl hover:bg-darkBg transition-colors">Cancel</button>
              <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity">Deploy</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Create Token modal ── */}
      {showCreateToken && (
        <Modal title="Create Enrollment Token" onClose={() => setShowCreateToken(false)}>
          <form onSubmit={createToken} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Label</label>
              <input value={tokenLabel} onChange={e => setTokenLabel(e.target.value)} autoFocus placeholder="e.g. Field Devices — Q3"
                className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Max Uses <span className="normal-case font-normal text-gray-600">(0 = unlimited)</span></label>
                <input type="number" value={tokenMaxUses} onChange={e => setTokenMaxUses(Number(e.target.value))} min={0}
                  className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Expires At <span className="normal-case font-normal text-gray-600">(optional)</span></label>
                <input type="datetime-local" value={tokenExpiresAt} onChange={e => setTokenExpiresAt(e.target.value)}
                  className="w-full bg-darkBg border border-darkBorder rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan focus:ring-1 focus:ring-accentCyan/20 transition-all" />
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowCreateToken(false)} className="px-5 py-2.5 border border-darkBorder text-sm text-gray-400 rounded-xl hover:bg-darkBg transition-colors">Cancel</button>
              <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity">Create Token</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── QR Code modal ── */}
      {qrToken && (
        <Modal title={`Enrollment QR — ${qrToken.label || qrToken.token.slice(0, 16)}`} onClose={() => { setQrToken(null); setQrData(null); }}>
          <div className="space-y-4">
            {qrLoading && (
              <div className="py-12 flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-accentCyan/30 border-t-accentCyan rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">Generating QR code…</p>
              </div>
            )}
            {qrData && (
              <>
                <div className="flex justify-center">
                  <div className="p-4 bg-white rounded-2xl shadow-2xl">
                    <img src={`data:image/png;base64,${qrData.qr_data}`} alt="Enrollment QR Code" className="w-56 h-56" />
                  </div>
                </div>
                <div className="bg-darkBg/60 border border-darkBorder rounded-xl p-3 space-y-2 text-xs">
                  <p className="text-gray-500 font-semibold uppercase tracking-wider text-[10px] mb-2">QR Payload</p>
                  {[['Server URL', qrData.payload.server_url], ['Token', qrData.payload.token.slice(0, 20) + '…'], ['Label', qrData.payload.label || '(none)']].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <span className="text-gray-500">{k}</span>
                      <span className="text-white font-mono text-right truncate">{v}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-600 text-center">Scan with the Agent app to auto-fill enrollment details</p>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
