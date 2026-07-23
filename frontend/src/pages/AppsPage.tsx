import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2, Send, QrCode, Key } from 'lucide-react';
import { api } from '../hooks/useApi';
import type { Application, AppDeployment, Team, EnrollmentToken } from '../types';
import Modal from '../components/Modal';

interface QRResponse {
  qr_data: string;
  payload: {
    server_url: string;
    token: string;
    label: string;
  };
}

export default function AppsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [deployments, setDeployments] = useState<AppDeployment[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tokens, setTokens] = useState<EnrollmentToken[]>([]);

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

  // Token create state
  const [showCreateToken, setShowCreateToken] = useState(false);
  const [tokenLabel, setTokenLabel] = useState('');
  const [tokenMaxUses, setTokenMaxUses] = useState(0);
  const [tokenExpiresAt, setTokenExpiresAt] = useState('');

  // QR modal state
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

  // ---- Enrollment tokens --------------------------------------------------

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
    setQrToken(token);
    setQrData(null);
    setQrLoading(true);
    try {
      const data = await api.get<QRResponse>(`/enrollment-tokens/${token.id}/qr`);
      setQrData(data);
    } catch (e: unknown) {
      flash((e as Error).message, true);
      setQrToken(null);
    } finally {
      setQrLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Applications</h1>
          <p className="text-gray-400 text-sm mt-1">Manage and silently deploy APKs to managed devices</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold text-sm px-5 py-3 rounded-lg hover:opacity-90">
          <Plus className="w-4 h-4" /> Register App
        </button>
      </div>

      {feedback && <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">{feedback}</div>}
      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}

      {/* App list */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Registered Applications</h2>
        <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-darkBorder bg-darkBg/30 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <th className="p-3">Package Name</th>
                <th className="p-3">Version</th>
                <th className="p-3">APK URL</th>
                <th className="p-3">Registered</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-darkBorder text-gray-300">
              {apps.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-gray-500">No applications registered</td></tr>}
              {apps.map(a => (
                <tr key={a.id} className="hover:bg-darkBg/30">
                  <td className="p-3 font-mono text-xs font-semibold text-white">{a.package_name}</td>
                  <td className="p-3">{a.version_name} (build {a.version_code})</td>
                  <td className="p-3 text-xs text-gray-400 max-w-xs truncate">{a.apk_url}</td>
                  <td className="p-3 text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right flex gap-2 justify-end">
                    <button onClick={() => { setSelectedApp(a); setDeployTeamId(''); setInstallType('FORCE_INSTALL'); setShowDeploy(true); }}
                      className="flex items-center gap-1 px-3 py-1.5 border border-accentCyan/30 text-xs text-accentCyan rounded-lg hover:bg-accentCyan/10">
                      <Send className="w-3 h-3" /> Deploy
                    </button>
                    <button onClick={() => del(a.id)} className="p-1.5 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deployments */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Active Deployments</h2>
        <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-darkBorder bg-darkBg/30 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <th className="p-3">Package</th>
                <th className="p-3">Version</th>
                <th className="p-3">Target</th>
                <th className="p-3">Install Type</th>
                <th className="p-3">Deployed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-darkBorder text-gray-300">
              {deployments.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-gray-500">No deployments yet</td></tr>}
              {deployments.map(d => (
                <tr key={d.id} className="hover:bg-darkBg/30">
                  <td className="p-3 font-mono text-xs text-white">{d.package_name}</td>
                  <td className="p-3 text-xs">{d.version_name}</td>
                  <td className="p-3 text-xs text-gray-400">
                    {d.team_id ? `Team: ${d.team_id.slice(0, 8)}…` : d.device_id ? `Device: ${d.device_id.slice(0, 8)}…` : 'Global'}
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold ${d.install_type === 'FORCE_INSTALL' ? 'bg-red-500/10 text-red-400' : d.install_type === 'AVAILABLE' ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'}`}>
                      {d.install_type}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-gray-400">{new Date(d.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enrollment Tokens */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Enrollment Tokens</h2>
          <button onClick={() => setShowCreateToken(true)}
            className="flex items-center gap-2 border border-accentCyan/30 text-accentCyan text-xs font-semibold px-4 py-2 rounded-lg hover:bg-accentCyan/10">
            <Key className="w-3.5 h-3.5" /> New Token
          </button>
        </div>
        <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-darkBorder bg-darkBg/30 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <th className="p-3">Label</th>
                <th className="p-3">Token</th>
                <th className="p-3">Uses</th>
                <th className="p-3">Expires</th>
                <th className="p-3">Created</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-darkBorder text-gray-300">
              {tokens.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-gray-500">No enrollment tokens</td></tr>}
              {tokens.map(t => (
                <tr key={t.id} className="hover:bg-darkBg/30">
                  <td className="p-3 font-semibold text-white text-xs">{t.label || '(no label)'}</td>
                  <td className="p-3 font-mono text-xs text-gray-400">{t.token.slice(0, 16)}…</td>
                  <td className="p-3 text-xs">{t.use_count}{t.max_uses > 0 ? ` / ${t.max_uses}` : ' / ∞'}</td>
                  <td className="p-3 text-xs text-gray-400">{t.expires_at ? new Date(t.expires_at).toLocaleDateString() : 'Never'}</td>
                  <td className="p-3 text-xs text-gray-400">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right flex gap-2 justify-end">
                    <button onClick={() => openQR(t)}
                      className="flex items-center gap-1 px-3 py-1.5 border border-purple-500/30 text-xs text-purple-400 rounded-lg hover:bg-purple-500/10">
                      <QrCode className="w-3.5 h-3.5" /> QR
                    </button>
                    <button onClick={() => revokeToken(t.id)}
                      className="p-1.5 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register app modal */}
      {showAdd && (
        <Modal title="Register Application" onClose={() => setShowAdd(false)}>
          <form onSubmit={addApp} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Package Name</label>
              <input value={pkg} onChange={e => setPkg(e.target.value)} required placeholder="com.company.app"
                className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-accentCyan" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Version Code</label>
                <input type="number" value={versionCode} onChange={e => setVersionCode(Number(e.target.value))} required min={1}
                  className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Version Name</label>
                <input value={versionName} onChange={e => setVersionName(e.target.value)} placeholder="1.0.0"
                  className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">APK URL (MinIO/S3)</label>
              <input value={apkUrl} onChange={e => setApkUrl(e.target.value)} required placeholder="https://storage.example.com/apps/app.apk"
                className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="px-5 py-2.5 border border-darkBorder text-sm text-gray-400 rounded-lg hover:bg-darkBg">Cancel</button>
              <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-lg text-sm">Register</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Deploy modal */}
      {showDeploy && selectedApp && (
        <Modal title={`Deploy ${selectedApp.package_name}`} onClose={() => setShowDeploy(false)}>
          <form onSubmit={deploy} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Assign to Team</label>
              <select value={deployTeamId} onChange={e => setDeployTeamId(e.target.value)}
                className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan">
                <option value="">Global (all devices)</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Install Type</label>
              <select value={installType} onChange={e => setInstallType(e.target.value)}
                className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan">
                <option value="FORCE_INSTALL">Force Install (silent)</option>
                <option value="AVAILABLE">Available (user installs)</option>
                <option value="BLOCKED">Blocked (uninstall if present)</option>
              </select>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowDeploy(false)} className="px-5 py-2.5 border border-darkBorder text-sm text-gray-400 rounded-lg hover:bg-darkBg">Cancel</button>
              <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-lg text-sm">Deploy</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Create enrollment token modal */}
      {showCreateToken && (
        <Modal title="Create Enrollment Token" onClose={() => setShowCreateToken(false)}>
          <form onSubmit={createToken} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Label</label>
              <input value={tokenLabel} onChange={e => setTokenLabel(e.target.value)} placeholder="e.g. Field Devices — Q3"
                className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Max Uses (0 = unlimited)</label>
                <input type="number" value={tokenMaxUses} onChange={e => setTokenMaxUses(Number(e.target.value))} min={0}
                  className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase mb-1.5 block">Expires At (optional)</label>
                <input type="datetime-local" value={tokenExpiresAt} onChange={e => setTokenExpiresAt(e.target.value)}
                  className="w-full bg-darkBg border border-darkBorder rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-accentCyan" />
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowCreateToken(false)} className="px-5 py-2.5 border border-darkBorder text-sm text-gray-400 rounded-lg hover:bg-darkBg">Cancel</button>
              <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue text-white font-semibold rounded-lg text-sm">Create Token</button>
            </div>
          </form>
        </Modal>
      )}

      {/* QR code modal */}
      {qrToken && (
        <Modal title={`Enrollment QR — ${qrToken.label || qrToken.token.slice(0, 16)}`} onClose={() => { setQrToken(null); setQrData(null); }}>
          <div className="space-y-4">
            {qrLoading && <p className="text-gray-400 text-sm text-center py-8">Generating QR code…</p>}
            {qrData && (
              <>
                <div className="flex justify-center">
                  <div className="p-3 bg-white rounded-xl inline-block">
                    <img
                      src={`data:image/png;base64,${qrData.qr_data}`}
                      alt="Enrollment QR Code"
                      className="w-56 h-56"
                    />
                  </div>
                </div>
                <div className="bg-darkBg/60 border border-darkBorder rounded-lg p-3 space-y-1 text-xs">
                  <p className="text-gray-400 font-semibold uppercase tracking-wider mb-2">QR Payload</p>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Server URL</span>
                    <span className="text-white font-mono">{qrData.payload.server_url}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Token</span>
                    <span className="text-white font-mono">{qrData.payload.token.slice(0, 20)}…</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Label</span>
                    <span className="text-white">{qrData.payload.label || '(none)'}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 text-center">
                  Scan with the Watchpost Agent app to auto-fill enrollment details
                </p>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
