import { motion } from "framer-motion";
import {
  Users, Building2, Mail, DollarSign, Clock, TrendingUp, Target,
  Calendar, Phone, FileText, Send, UserPlus, CheckCircle, MousePointer,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
} from "recharts";
import MetricCard from "../components/MetricCard";
import { metrics, chartData, activityFeed, tasks, clients } from "../data/mockData";

const iconMap = {
  mail: Mail, "user-plus": UserPlus, phone: Phone, "file-text": FileText,
  send: Send, calendar: Calendar, "check-circle": CheckCircle, "mouse-pointer": MousePointer,
};

const typeColors = {
  email: "text-info", lead: "text-success", call: "text-accent", offer: "text-primary-light",
  showing: "text-warning", closed: "text-success",
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-light border border-white/10 rounded-xl px-4 py-3 shadow-xl">
      <p className="text-white font-semibold mb-2">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-white">Good morning, Louis</h1>
          <p className="text-slate-400 mt-1">Here's what's happening with your business today</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">March 23, 2026</span>
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-sm text-success font-medium">All systems active</span>
        </div>
      </motion.div>

      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard icon={Users} label="Active Clients" value={metrics.activeClients} change="12%" changeType="up" delay={0.1} />
        <MetricCard icon={Building2} label="Active Listings" value={metrics.activeListings} change="2" changeType="up" delay={0.15} />
        <MetricCard icon={Mail} label="Emails Sent" value={metrics.emailsSentThisMonth} change="18%" changeType="up" delay={0.2} />
        <MetricCard icon={DollarSign} label="Revenue (MTD)" value={metrics.totalRevenue} change="37%" changeType="up" delay={0.25} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Pipeline Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="col-span-2 bg-surface rounded-2xl p-6 border border-white/5"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Pipeline Activity</h2>
            <div className="flex gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary-light" />Leads</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent" />Showings</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-success" />Closed</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData.monthly}>
              <defs>
                <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorShowings" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorClosed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
              <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="leads" name="Leads" stroke="#818cf8" fill="url(#colorLeads)" strokeWidth={2} />
              <Area type="monotone" dataKey="showings" name="Showings" stroke="#f59e0b" fill="url(#colorShowings)" strokeWidth={2} />
              <Area type="monotone" dataKey="closed" name="Closed" stroke="#10b981" fill="url(#colorClosed)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Lead Sources */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-surface rounded-2xl p-6 border border-white/5"
        >
          <h2 className="text-lg font-semibold text-white mb-4">Lead Sources</h2>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={chartData.sources} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                {chartData.sources.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {chartData.sources.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="text-slate-300">{s.name}</span>
                </div>
                <span className="text-white font-medium">{s.value}%</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Activity Feed */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="col-span-1 bg-surface rounded-2xl p-6 border border-white/5"
        >
          <h2 className="text-lg font-semibold text-white mb-4">Activity Feed</h2>
          <div className="space-y-4 max-h-[320px] overflow-y-auto pr-2">
            {activityFeed.map((item, i) => {
              const Icon = iconMap[item.icon] || Mail;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.05 }}
                  className="flex gap-3 group"
                >
                  <div className={`w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 ${typeColors[item.type]}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-200 truncate">{item.message}</p>
                    <p className="text-xs text-slate-500">{item.detail}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{item.time}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Today's Tasks */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="bg-surface rounded-2xl p-6 border border-white/5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Today's Tasks</h2>
            <span className="text-xs bg-primary/15 text-primary-light px-2 py-1 rounded-full">
              {tasks.filter(t => !t.done).length} remaining
            </span>
          </div>
          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2">
            {tasks.map((task, i) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.45 + i * 0.05 }}
                className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${
                  task.done ? "bg-white/[0.02] opacity-50" : "bg-white/5 hover:bg-white/[0.08]"
                }`}
              >
                <div className={`w-5 h-5 rounded-md border-2 mt-0.5 flex items-center justify-center shrink-0 ${
                  task.done ? "border-success bg-success/20" : "border-slate-600"
                }`}>
                  {task.done && <CheckCircle className="w-3 h-3 text-success" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${task.done ? "line-through text-slate-500" : "text-slate-200"}`}>{task.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{task.time}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                  task.priority === "high" ? "bg-danger/10 text-danger" :
                  task.priority === "medium" ? "bg-warning/10 text-warning" :
                  "bg-slate-500/10 text-slate-400"
                }`}>
                  {task.priority}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Revenue Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-surface rounded-2xl p-6 border border-white/5"
        >
          <h2 className="text-lg font-semibold text-white mb-2">Commission Revenue</h2>
          <p className="text-3xl font-bold text-white mb-1">{metrics.totalRevenue}</p>
          <p className="text-sm text-success mb-4">+37% from last month</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData.revenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
              <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `$${v/1000}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Revenue" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    </div>
  );
}
