import { useEffect, useState } from 'react';
import {
  Smartphone, CheckCircle, XCircle, Clock, Wifi, WifiOff,
  Sparkles, TrendingUp, ChevronRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, AreaChart, Area, CartesianGrid,
} from 'recharts';
import { api } from '../hooks/useApi';
import type { ComplianceSummary, OSDistEntry, EnrollmentTrendEntry, Device, DevicesPage } from '../types';

const BAR_COLORS = ['#00D2FF', '#0072FF', '#6B21A8', '#1D4ED8', '#047857', '#92400E'];
const PIE_COLORS = { COMPLIANT: '#22C55E', NON_COMPLIANT: '#EF4444', PENDING: '#F59E0B' };

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: number | string;
  sub?: string; color: string;
}) {
  return (
    <div className="bg-darkCard border border-darkBorder rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
          <p className={`text-3xl font-bold mt-2 ${color}`}>{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        <div className="p-2 rounded-xl bg-white/5">{icon}</div>
      </div>
    </div>
  );
}

function HostsCard({ total, online, offline, newToday }: {
  total: number; online: number; offline: number; newToday: number;
}) {
  return (
    <div className="bg-darkCard border border-darkBorder rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-white">Android Devices</h2>
          <span className="bg-accentBlue/20 text-accentCyan text-xs font-bold px-2 py-0.5 rounded-full">{total}</span>
        </div>
        <span className="text-xs text-accentCyan flex items-center gap-1 cursor-pointer hover:underline">
          View all devices <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-green-500/15 flex items-center justify-center">
            <Wifi className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{online}</p>
            <p className="text-xs text-gray-400">Online hosts</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gray-500/15 flex items-center justify-center">
            <WifiOff className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{offline}</p>
            <p className="text-xs text-gray-400">Offline hosts</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-accentCyan/15 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-accentCyan" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{newToday}</p>
            <p className="text-xs text-gray-400">New hosts</p>
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
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

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
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">All Teams</p>
          <h1 className="text-2xl font-bold text-white">Fleet Overview</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 bg-darkCard border border-darkBorder px-3 py-2 rounded-lg">
          <TrendingUp className="w-3.5 h-3.5 text-accentCyan" />
          Live data
        </div>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}

      {/* Hosts card */}
      <HostsCard
        total={summary.total_devices}
        online={online}
        offline={offline}
        newToday={newToday}
      />

      {/* Compliance metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Smartphone className="w-6 h-6 text-accentCyan" />}
          label="Total Enrolled" value={summary.total_devices}
          sub="Android devices" color="text-white"
        />
        <StatCard
          icon={<CheckCircle className="w-6 h-6 text-green-400" />}
          label="Compliant" value={summary.compliant_count}
          sub={`${compliancePct}% of fleet`} color="text-green-400"
        />
        <StatCard
          icon={<XCircle className="w-6 h-6 text-red-500" />}
          label="Violations" value={summary.non_compliant_count}
          sub="Non-compliant devices" color="text-red-500"
        />
        <StatCard
          icon={<Clock className="w-6 h-6 text-amber-500" />}
          label="Pending" value={summary.pending_count}
          sub="Awaiting evaluation" color="text-amber-500"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* OS Distribution — takes 3/5 width */}
        <div className="lg:col-span-3 bg-darkCard border border-darkBorder p-5 rounded-2xl">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Android OS Versions</h3>
          {osDist.length === 0 ? (
            <div className="h-52 flex items-center justify-center">
              <p className="text-gray-500 text-sm">No enrolled devices yet</p>
            </div>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={osDist} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" horizontal={false} />
                  <XAxis type="number" stroke="#4B5563" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                  <YAxis type="category" dataKey="os_version" stroke="#4B5563" tick={{ fontSize: 11, fill: '#9CA3AF' }} width={90} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#151B26', borderColor: '#222C3D', fontSize: 12, borderRadius: 8 }}
                    formatter={(val: number) => [`${val} device${val !== 1 ? 's' : ''}`, 'Count']}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {osDist.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Compliance donut — takes 2/5 width */}
        <div className="lg:col-span-2 bg-darkCard border border-darkBorder p-5 rounded-2xl flex flex-col">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Compliance Status</h3>
          <div className="flex-1 flex items-center justify-center relative">
            {pieData.length === 0 ? (
              <p className="text-gray-500 text-sm">No compliance data</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={72}
                      paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#151B26', borderColor: '#222C3D', fontSize: 12, borderRadius: 8 }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center -mt-4">
                    <p className="text-2xl font-bold text-white">{compliancePct}%</p>
                    <p className="text-[10px] text-gray-400">compliant</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Enrollment Trend */}
      <div className="bg-darkCard border border-darkBorder p-5 rounded-2xl">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Enrollment Trend — Last 30 Days
        </h3>
        {trend.length === 0 ? (
          <div className="h-40 flex items-center justify-center">
            <p className="text-gray-500 text-sm">No enrollment data yet</p>
          </div>
        ) : (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="enrollGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00D2FF" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00D2FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
                <XAxis dataKey="date" stroke="#4B5563" tick={{ fontSize: 9, fill: '#9CA3AF' }}
                  tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
                <YAxis stroke="#4B5563" tick={{ fontSize: 10, fill: '#9CA3AF' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#151B26', borderColor: '#222C3D', fontSize: 12, borderRadius: 8 }}
                  formatter={(val: number) => [`${val} enrollment${val !== 1 ? 's' : ''}`, '']}
                  labelFormatter={l => `Date: ${l}`}
                />
                <Area type="monotone" dataKey="count" stroke="#00D2FF" strokeWidth={2}
                  fill="url(#enrollGrad)" name="Enrollments" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
