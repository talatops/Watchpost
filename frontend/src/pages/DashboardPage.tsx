import { useEffect, useState, useRef } from 'react';
import {
  Smartphone, CheckCircle, XCircle, Clock, Wifi, WifiOff,
  Sparkles, TrendingUp, ChevronRight, ArrowUpRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, AreaChart, Area, CartesianGrid,
} from 'recharts';
import { api } from '../hooks/useApi';
import type { ComplianceSummary, OSDistEntry, EnrollmentTrendEntry, Device, DevicesPage } from '../types';

const BAR_COLORS = ['#00D2FF', '#0072FF', '#6B21A8', '#1D4ED8', '#047857', '#92400E'];
const PIE_COLORS = { COMPLIANT: '#22C55E', NON_COMPLIANT: '#EF4444', PENDING: '#F59E0B' };

/** Animates a number from 0 to `target` over `duration` ms */
function useCounter(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const frame = useRef<number>(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);
  return value;
}

interface StatCardProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: number;
  sub?: string;
  color: string;
  delay?: number;
}

function StatCard({ icon, iconBg, label, value, sub, color, delay = 0 }: StatCardProps) {
  const displayed = useCounter(value);
  return (
    <div
      className="group bg-darkCard border border-darkBorder rounded-2xl p-5 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/30 transition-all duration-200 cursor-default animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
          <p className={`text-3xl font-bold mt-2 tabular-nums ${color}`}>{displayed}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        <div className={`p-3 rounded-xl ${iconBg} group-hover:scale-110 transition-transform duration-200`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function HostsCard({ total, online, offline, newToday }: {
  total: number; online: number; offline: number; newToday: number;
}) {
  const onlineCount  = useCounter(online);
  const offlineCount = useCounter(offline);
  const newCount     = useCounter(newToday);

  return (
    <div className="relative bg-darkCard border border-darkBorder rounded-2xl p-6 overflow-hidden animate-fade-in-up">
      {/* Subtle glassmorphism gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-accentCyan/5 via-transparent to-accentBlue/5 pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accentCyan via-accentBlue to-transparent" />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-accentCyan/10 border border-accentCyan/20">
            <Smartphone className="w-5 h-5 text-accentCyan" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Android Devices</h2>
            <p className="text-xs text-gray-500">Fleet overview</p>
          </div>
          <span className="ml-1 bg-accentBlue/20 text-accentCyan text-xs font-bold px-2.5 py-0.5 rounded-full border border-accentBlue/30">
            {total}
          </span>
        </div>
        <button className="text-xs text-accentCyan flex items-center gap-1 hover:gap-2 transition-all duration-150 hover:underline">
          View all <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Online */}
        <div className="flex items-center gap-3 group">
          <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Wifi className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <p className="text-2xl font-bold text-white tabular-nums">{onlineCount}</p>
            </div>
            <p className="text-xs text-gray-400">Online hosts</p>
          </div>
        </div>

        {/* Offline */}
        <div className="flex items-center gap-3 group">
          <div className="w-12 h-12 rounded-2xl bg-gray-500/10 border border-gray-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
            <WifiOff className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-gray-500" />
              <p className="text-2xl font-bold text-white tabular-nums">{offlineCount}</p>
            </div>
            <p className="text-xs text-gray-400">Offline hosts</p>
          </div>
        </div>

        {/* New */}
        <div className="flex items-center gap-3 group">
          <div className="w-12 h-12 rounded-2xl bg-accentCyan/10 border border-accentCyan/20 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Sparkles className="w-5 h-5 text-accentCyan" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5 text-accentCyan" />
              <p className="text-2xl font-bold text-white tabular-nums">{newCount}</p>
            </div>
            <p className="text-xs text-gray-400">New hosts (24h)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<ComplianceSummary>({
    total_devices: 0, compliant_count: 0, pending_count: 0, non_compliant_count: 0,
  });
  const [osDist, setOsDist] = useState<OSDistEntry[]>([]);
  const [trend, setTrend] = useState<EnrollmentTrendEntry[]>([]);
  const [online, setOnline] = useState(0);
  const [offline, setOffline] = useState(0);
  const [newToday, setNewToday] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const oneDayAgo  = new Date(Date.now() - 24 * 60 * 60 * 1000);

    Promise.all([
      api.get<ComplianceSummary>('/compliance/summary'),
      api.get<OSDistEntry[]>('/reports/os-distribution'),
      api.get<EnrollmentTrendEntry[]>('/reports/enrollment-trend'),
      api.get<DevicesPage>('/devices?page_size=200'),
    ]).then(([s, os, tr, devPage]) => {
      setSummary(s ?? { total_devices: 0, compliant_count: 0, pending_count: 0, non_compliant_count: 0 });
      setOsDist(os ?? []);
      setTrend(tr ?? []);
      const devices: Device[] = devPage?.data ?? [];
      setOnline(devices.filter(d => new Date(d.last_seen) > fiveMinAgo).length);
      setOffline(devices.filter(d => new Date(d.last_seen) <= fiveMinAgo).length);
      setNewToday(devices.filter(d => new Date(d.created_at) > oneDayAgo).length);
    }).catch(e => setError(e.message));
  }, []);

  const pieData = [
    { name: 'Compliant', value: summary.compliant_count, color: PIE_COLORS.COMPLIANT },
    { name: 'Violations', value: summary.non_compliant_count, color: PIE_COLORS.NON_COMPLIANT },
    { name: 'Pending', value: summary.pending_count, color: PIE_COLORS.PENDING },
  ].filter(d => d.value > 0);

  const compliancePct = summary.total_devices > 0
    ? Math.round((summary.compliant_count / summary.total_devices) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">All Teams</p>
          <h1 className="text-2xl font-bold text-white">Fleet Overview</h1>
        </div>
        <div className="flex items-center gap-2 text-xs bg-darkCard border border-darkBorder px-3 py-2 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <TrendingUp className="w-3.5 h-3.5 text-accentCyan" />
          <span className="text-gray-400">Live data</span>
        </div>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm animate-fade-in">{error}</div>}

      {/* Hosts card */}
      <HostsCard total={summary.total_devices} online={online} offline={offline} newToday={newToday} />

      {/* Compliance stat cards — staggered entrance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Smartphone className="w-5 h-5 text-accentCyan" />}
          iconBg="bg-accentCyan/10 border border-accentCyan/20"
          label="Total Enrolled" value={summary.total_devices}
          sub="Android devices" color="text-white" delay={0}
        />
        <StatCard
          icon={<CheckCircle className="w-5 h-5 text-green-400" />}
          iconBg="bg-green-500/10 border border-green-500/20"
          label="Compliant" value={summary.compliant_count}
          sub={`${compliancePct}% of fleet`} color="text-green-400" delay={80}
        />
        <StatCard
          icon={<XCircle className="w-5 h-5 text-red-400" />}
          iconBg="bg-red-500/10 border border-red-500/20"
          label="Violations" value={summary.non_compliant_count}
          sub="Non-compliant" color="text-red-400" delay={160}
        />
        <StatCard
          icon={<Clock className="w-5 h-5 text-amber-400" />}
          iconBg="bg-amber-500/10 border border-amber-500/20"
          label="Pending" value={summary.pending_count}
          sub="Awaiting eval" color="text-amber-400" delay={240}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* OS Distribution */}
        <div className="lg:col-span-3 bg-darkCard border border-darkBorder p-5 rounded-2xl hover:border-darkBorder/80 transition-colors animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Android OS Versions</h3>
            <span className="text-xs text-gray-500">{osDist.length} version{osDist.length !== 1 ? 's' : ''}</span>
          </div>
          {osDist.length === 0 ? (
            <div className="h-52 flex flex-col items-center justify-center gap-2">
              <Smartphone className="w-10 h-10 text-gray-700" />
              <p className="text-gray-500 text-sm">No enrolled devices yet</p>
            </div>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={osDist} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" horizontal={false} />
                  <XAxis type="number" stroke="#374151" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis type="category" dataKey="os_version" stroke="#374151" tick={{ fontSize: 11, fill: '#9CA3AF' }} width={90} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0F1117', borderColor: '#222C3D', fontSize: 12, borderRadius: 10 }}
                    formatter={(val: number) => [`${val} device${val !== 1 ? 's' : ''}`, '']}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={28}>
                    {osDist.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Compliance donut */}
        <div className="lg:col-span-2 bg-darkCard border border-darkBorder p-5 rounded-2xl flex flex-col animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Compliance Status</h3>
          <div className="flex-1 flex items-center justify-center relative">
            {pieData.length === 0 ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle className="w-10 h-10 text-gray-700" />
                <p className="text-gray-500 text-sm">No data yet</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={75}
                      paddingAngle={4} dataKey="value" startAngle={90} endAngle={-270}
                      strokeWidth={0}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0F1117', borderColor: '#222C3D', fontSize: 12, borderRadius: 10 }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Centered % label */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingBottom: '24px' }}>
                  <div className="text-center">
                    <p className="text-2xl font-extrabold text-white tabular-nums">{compliancePct}%</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">compliant</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Enrollment Trend */}
      <div className="bg-darkCard border border-darkBorder p-5 rounded-2xl animate-fade-in-up" style={{ animationDelay: '300ms' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Enrollment Trend
          </h3>
          <span className="text-xs text-gray-500">Last 30 days</span>
        </div>
        {trend.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center gap-2">
            <TrendingUp className="w-10 h-10 text-gray-700" />
            <p className="text-gray-500 text-sm">No enrollment data yet</p>
          </div>
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="enrollGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00D2FF" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#00D2FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
                <XAxis dataKey="date" stroke="#374151" tick={{ fontSize: 9, fill: '#6B7280' }}
                  tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
                <YAxis stroke="#374151" tick={{ fontSize: 10, fill: '#6B7280' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F1117', borderColor: '#222C3D', fontSize: 12, borderRadius: 10 }}
                  formatter={(val: number) => [`${val} enrollment${val !== 1 ? 's' : ''}`, '']}
                  labelFormatter={l => `Date: ${l}`}
                  cursor={{ stroke: 'rgba(0,210,255,0.3)', strokeWidth: 1 }}
                />
                <Area type="monotone" dataKey="count" stroke="#00D2FF" strokeWidth={2.5}
                  fill="url(#enrollGrad)" dot={false} activeDot={{ r: 4, fill: '#00D2FF', stroke: '#0B0E14', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
