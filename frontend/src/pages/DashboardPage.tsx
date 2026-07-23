import { useEffect, useState } from 'react';
import { Smartphone, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { api } from '../hooks/useApi';
import type { ComplianceSummary, OSDistEntry, EnrollmentTrendEntry } from '../types';

const COLORS = ['#10B981', '#F59E0B', '#EF4444'];

export default function DashboardPage() {
  const [summary, setSummary] = useState<ComplianceSummary>({ total_devices: 0, compliant_count: 0, pending_count: 0, non_compliant_count: 0 });
  const [osDist, setOsDist] = useState<OSDistEntry[]>([]);
  const [trend, setTrend] = useState<EnrollmentTrendEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<ComplianceSummary>('/compliance/summary'),
      api.get<OSDistEntry[]>('/reports/os-distribution'),
      api.get<EnrollmentTrendEntry[]>('/reports/enrollment-trend'),
    ]).then(([s, os, tr]) => {
      setSummary(s);
      setOsDist(os ?? []);
      setTrend(tr ?? []);
    }).catch(e => setError(e.message));
  }, []);

  const pieData = [
    { name: 'Compliant', value: summary.compliant_count },
    { name: 'Pending', value: summary.pending_count },
    { name: 'Non-Compliant', value: summary.non_compliant_count },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Overview Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Real-time device state and compliance distribution</p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: 'Enrolled Hosts', value: summary.total_devices, icon: <Smartphone className="w-9 h-9 text-accentCyan" />, color: 'text-white' },
          { label: 'Compliant', value: summary.compliant_count, icon: <CheckCircle2 className="w-9 h-9 text-green-400" />, color: 'text-green-400' },
          { label: 'Violations', value: summary.non_compliant_count, icon: <XCircle className="w-9 h-9 text-red-500" />, color: 'text-red-500' },
          { label: 'Pending', value: summary.pending_count, icon: <AlertTriangle className="w-9 h-9 text-amber-500" />, color: 'text-amber-500' },
        ].map(c => (
          <div key={c.label} className="bg-darkCard border border-darkBorder p-5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{c.label}</p>
              <p className={`text-3xl font-bold mt-2 ${c.color}`}>{c.value}</p>
            </div>
            {c.icon}
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* OS Distribution */}
        <div className="bg-darkCard border border-darkBorder p-5 rounded-2xl">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">OS Distribution</h3>
          {osDist.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No data yet</p>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={osDist} layout="vertical">
                  <XAxis type="number" stroke="#6B7280" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="os_version" stroke="#6B7280" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip contentStyle={{ backgroundColor: '#151B26', borderColor: '#222C3D', fontSize: 12 }} />
                  <Bar dataKey="count" fill="#0072FF" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Compliance Pie */}
        <div className="bg-darkCard border border-darkBorder p-5 rounded-2xl flex flex-col">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Compliance Distribution</h3>
          <div className="flex-1 flex items-center justify-center h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#151B26', borderColor: '#222C3D', fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Enrollment Trend */}
        <div className="bg-darkCard border border-darkBorder p-5 rounded-2xl">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Enrollment Trend (30d)</h3>
          {trend.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No data yet</p>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <XAxis dataKey="date" stroke="#6B7280" tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} />
                  <YAxis stroke="#6B7280" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#151B26', borderColor: '#222C3D', fontSize: 12 }} />
                  <Line type="monotone" dataKey="count" stroke="#00D2FF" strokeWidth={2} dot={false} name="Enrollments" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
