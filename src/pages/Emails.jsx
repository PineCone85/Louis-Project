import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, Send, Eye, MousePointer, Clock, Play, Pause,
  ChevronRight, Users, BarChart3, Zap, FileText,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { emailTemplates, campaigns, chartData } from "../data/mockData";

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

export default function Emails() {
  const [activeTab, setActiveTab] = useState("templates");
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-white">Email Hub</h1>
          <p className="text-slate-400 mt-1">Manage templates, campaigns, and track performance</p>
        </div>
        <button className="px-4 py-2.5 bg-primary rounded-xl text-white text-sm font-medium hover:bg-primary-dark transition-colors flex items-center gap-2">
          <Zap className="w-4 h-4" /> New Campaign
        </button>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-4 gap-3"
      >
        {[
          { icon: Send, label: "Sent This Month", value: "205", color: "text-primary-light" },
          { icon: Eye, label: "Avg Open Rate", value: "74%", color: "text-success" },
          { icon: MousePointer, label: "Avg Click Rate", value: "42%", color: "text-accent" },
          { icon: Users, label: "Active Campaigns", value: "3", color: "text-info" },
        ].map((stat, i) => (
          <div key={i} className="bg-surface rounded-xl p-4 border border-white/5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-slate-400">{stat.label}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Tabs */}
      <div className="flex bg-surface rounded-xl border border-white/5 p-1 w-fit">
        {["templates", "campaigns", "analytics"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === tab ? "bg-primary/15 text-primary-light" : "text-slate-400 hover:text-white"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Templates Tab */}
        {activeTab === "templates" && (
          <motion.div
            key="templates"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-2 gap-4"
          >
            {/* Template List */}
            <div className="space-y-3">
              {emailTemplates.map((tmpl, i) => (
                <motion.div
                  key={tmpl.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setSelectedTemplate(tmpl)}
                  className={`bg-surface rounded-xl p-5 border cursor-pointer transition-all ${
                    selectedTemplate?.id === tmpl.id
                      ? "border-primary/40 bg-primary/5"
                      : "border-white/5 hover:border-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-white font-semibold">{tmpl.name}</h3>
                      <p className="text-sm text-slate-400 mt-0.5">{tmpl.subject}</p>
                    </div>
                    <span className="text-xs bg-white/5 text-slate-400 px-2 py-1 rounded-full">{tmpl.category}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {tmpl.openRate}% open</span>
                    <span className="flex items-center gap-1"><MousePointer className="w-3 h-3" /> {tmpl.clickRate}% click</span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Template Preview */}
            <div className="bg-surface rounded-2xl border border-white/5 p-6">
              {selectedTemplate ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Preview</h3>
                    <button className="px-3 py-1.5 bg-primary rounded-lg text-white text-sm hover:bg-primary-dark transition-colors">
                      Use Template
                    </button>
                  </div>
                  <div className="bg-white/[0.03] rounded-xl p-5 border border-white/5">
                    <div className="border-b border-white/5 pb-3 mb-4">
                      <p className="text-xs text-slate-500 mb-1">Subject</p>
                      <p className="text-white font-medium">{selectedTemplate.subject}</p>
                    </div>
                    <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                      {selectedTemplate.body}
                    </pre>
                  </div>
                  <div className="mt-4 flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                        <Eye className="w-5 h-5 text-success" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-white">{selectedTemplate.openRate}%</p>
                        <p className="text-xs text-slate-400">Open Rate</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                        <MousePointer className="w-5 h-5 text-accent" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-white">{selectedTemplate.clickRate}%</p>
                        <p className="text-xs text-slate-400">Click Rate</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                  <FileText className="w-12 h-12 mb-3 opacity-30" />
                  <p>Select a template to preview</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Campaigns Tab */}
        {activeTab === "campaigns" && (
          <motion.div
            key="campaigns"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {campaigns.map((campaign, i) => (
              <motion.div
                key={campaign.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-surface rounded-2xl border border-white/5 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      campaign.status === "active" ? "bg-success/10" : "bg-slate-500/10"
                    }`}>
                      {campaign.status === "active" ? (
                        <Play className="w-5 h-5 text-success" />
                      ) : (
                        <Pause className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-lg">{campaign.name}</h3>
                      <p className="text-sm text-slate-400">
                        {campaign.enrolled} enrolled · {campaign.completed} completed · {campaign.openRate}% open rate
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                    campaign.status === "active" ? "bg-success/10 text-success" : "bg-slate-500/10 text-slate-400"
                  }`}>
                    {campaign.status}
                  </span>
                </div>

                {/* Campaign Steps */}
                <div className="flex items-center gap-2">
                  {campaign.steps.map((step, si) => (
                    <div key={si} className="flex items-center gap-2 flex-1">
                      <div className={`flex-1 rounded-xl p-3 border transition-all ${
                        step.status === "sent"
                          ? "bg-success/5 border-success/20"
                          : "bg-white/[0.02] border-white/5"
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                            step.status === "sent"
                              ? "bg-success text-white"
                              : "bg-white/10 text-slate-400"
                          }`}>
                            {si + 1}
                          </div>
                          <span className="text-xs text-slate-400">Day {step.day}</span>
                        </div>
                        <p className="text-sm text-slate-300 truncate">{step.template}</p>
                      </div>
                      {si < campaign.steps.length - 1 && (
                        <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Analytics Tab */}
        {activeTab === "analytics" && (
          <motion.div
            key="analytics"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-surface rounded-2xl border border-white/5 p-6"
          >
            <h3 className="text-lg font-semibold text-white mb-4">Email Performance (Last 4 Weeks)</h3>
            <div className="flex gap-4 text-xs text-slate-400 mb-4">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary-light" />Sent</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-success" />Opened</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent" />Clicked</span>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData.emailPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                <XAxis dataKey="week" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="sent" name="Sent" fill="#818cf8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="opened" name="Opened" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="clicked" name="Clicked" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
